package database

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/gocql/gocql"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func testCassandra(ctx context.Context, dsn string) error {
	session, err := cassandraSession(dsn)
	if err != nil {
		return err
	}
	defer session.Close()
	var version string
	return session.Query("SELECT release_version FROM system.local").WithContext(ctx).Scan(&version)
}

func queryCassandra(ctx context.Context, dsn, query string, maxRows int) (Result, error) {
	session, err := cassandraSession(dsn)
	if err != nil {
		return Result{}, err
	}
	defer session.Close()

	start := time.Now()
	iter := session.Query(query).WithContext(ctx).PageSize(maxRows).Iter()
	columns := iter.Columns()
	result := Result{Columns: make([]Column, len(columns))}
	for i, column := range columns {
		result.Columns[i] = Column{Name: column.Name, Type: column.TypeInfo.Type().String()}
	}
	for {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if !iter.Scan(pointers...) {
			break
		}
		for i, value := range values {
			values[i] = normalize(value)
		}
		result.Rows = append(result.Rows, values)
		if len(result.Rows) >= maxRows {
			result.Truncated = true
			break
		}
	}
	if err := iter.Close(); err != nil {
		return Result{}, err
	}
	result.RowCount = len(result.Rows)
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}

func cassandraSchema(ctx context.Context, dsn string) ([]Table, error) {
	session, err := cassandraSession(dsn)
	if err != nil {
		return nil, err
	}
	defer session.Close()

	iter := session.Query(`
		SELECT keyspace_name, table_name, column_name, type
		FROM system_schema.columns`).WithContext(ctx).Iter()
	var tables []Table
	index := map[string]int{}
	var keyspace, table, column, typ string
	for iter.Scan(&keyspace, &table, &column, &typ) {
		switch keyspace {
		case "system", "system_schema", "system_auth", "system_distributed", "system_traces":
			continue
		}
		key := keyspace + "." + table
		i, ok := index[key]
		if !ok {
			tables = append(tables, Table{Schema: keyspace, Name: table})
			i = len(tables) - 1
			index[key] = i
		}
		tables[i].Columns = append(tables[i].Columns, TableColumn{Name: column, Type: typ})
	}
	if err := iter.Close(); err != nil {
		return nil, err
	}
	return tables, nil
}

func cassandraSession(dsn string) (*gocql.Session, error) {
	parsed, err := url.Parse(dsn)
	if err != nil {
		return nil, err
	}
	if parsed.Scheme != "cassandra" {
		return nil, errors.New("cassandra DSN must start with cassandra://")
	}
	host := parsed.Host
	if !strings.Contains(host, ":") {
		host += ":9042"
	}
	cluster := gocql.NewCluster(host)
	cluster.Keyspace = strings.TrimPrefix(parsed.Path, "/")
	cluster.Timeout = 10 * time.Second
	cluster.ConnectTimeout = 10 * time.Second
	cluster.Consistency = gocql.Quorum
	return cluster.CreateSession()
}

func isReadOnlyCassandra(query string) bool {
	lower := strings.ToLower(strings.TrimSpace(query))
	for _, prefix := range []string{"select", "describe", "use", "show"} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

type esRequest struct {
	Index string          `json:"index"`
	Body  json.RawMessage `json:"body"`
}

func testElasticsearch(ctx context.Context, dsn string) error {
	request, err := esHTTPRequest(ctx, dsn, http.MethodGet, "/_cluster/health", nil)
	if err != nil {
		return err
	}
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("elasticsearch returned %s", response.Status)
	}
	return nil
}

func queryElasticsearch(ctx context.Context, dsn, query string, maxRows int) (Result, error) {
	var req esRequest
	if err := json.Unmarshal([]byte(query), &req); err != nil {
		return Result{}, errors.New(`elasticsearch query must be JSON: {"index":"logs-*","body":{...}}`)
	}
	body := []byte(req.Body)
	if len(body) == 0 {
		body = []byte(`{"query":{"match_all":{}},"size":100}`)
	}
	path := "/_search"
	if req.Index != "" {
		path = "/" + url.PathEscape(req.Index) + "/_search"
	}
	request, err := esHTTPRequest(ctx, dsn, http.MethodPost, path, body)
	if err != nil {
		return Result{}, err
	}
	start := time.Now()
	response, err := (&http.Client{Timeout: 30 * time.Second}).Do(request)
	if err != nil {
		return Result{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return Result{}, fmt.Errorf("elasticsearch returned %s: %s", response.Status, strings.TrimSpace(string(payload)))
	}
	var payload struct {
		Hits struct {
			Hits []struct {
				Index  string          `json:"_index"`
				ID     string          `json:"_id"`
				Source json.RawMessage `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return Result{}, err
	}
	result := Result{Columns: []Column{
		{Name: "_index", Type: "string"},
		{Name: "_id", Type: "string"},
		{Name: "_source", Type: "json"},
	}}
	for _, hit := range payload.Hits.Hits {
		if len(result.Rows) >= maxRows {
			result.Truncated = true
			break
		}
		result.Rows = append(result.Rows, []any{hit.Index, hit.ID, string(hit.Source)})
	}
	result.RowCount = len(result.Rows)
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}

func elasticsearchSchema(ctx context.Context, dsn string) ([]Table, error) {
	request, err := esHTTPRequest(ctx, dsn, http.MethodGet, "/_cat/indices?format=json&h=index", nil)
	if err != nil {
		return nil, err
	}
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("elasticsearch returned %s", response.Status)
	}
	var indices []map[string]any
	if err := json.NewDecoder(response.Body).Decode(&indices); err != nil {
		return nil, err
	}
	tables := make([]Table, 0, len(indices))
	for _, item := range indices {
		name, _ := item["index"].(string)
		if name == "" {
			continue
		}
		tables = append(tables, Table{
			Schema: "elasticsearch",
			Name:   name,
			Columns: []TableColumn{
				{Name: "_id", Type: "string"},
				{Name: "_source", Type: "json"},
			},
		})
	}
	sort.Slice(tables, func(i, j int) bool { return tables[i].Name < tables[j].Name })
	return tables, nil
}

func esHTTPRequest(ctx context.Context, dsn, method, path string, body []byte) (*http.Request, error) {
	base, err := url.Parse(dsn)
	if err != nil {
		return nil, err
	}
	if base.Scheme != "http" && base.Scheme != "https" {
		return nil, errors.New("elasticsearch DSN must start with http:// or https://")
	}
	base.Path = strings.TrimRight(base.Path, "/") + path
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, method, base.String(), reader)
	if err != nil {
		return nil, err
	}
	if base.User != nil {
		password, _ := base.User.Password()
		request.SetBasicAuth(base.User.Username(), password)
		base.User = nil
	}
	request.Header.Set("Content-Type", "application/json")
	return request, nil
}

func testNeo4j(ctx context.Context, dsn string) error {
	driver, err := neo4jDriver(dsn)
	if err != nil {
		return err
	}
	defer driver.Close(ctx)
	return driver.VerifyConnectivity(ctx)
}

func queryNeo4j(ctx context.Context, dsn, query string, maxRows int) (Result, error) {
	driver, err := neo4jDriver(dsn)
	if err != nil {
		return Result{}, err
	}
	defer driver.Close(ctx)
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	start := time.Now()
	response, err := session.Run(ctx, query, nil)
	if err != nil {
		return Result{}, err
	}
	keys, err := response.Keys()
	if err != nil {
		return Result{}, err
	}
	result := Result{Columns: make([]Column, len(keys))}
	for i, key := range keys {
		result.Columns[i] = Column{Name: key}
	}
	for response.Next(ctx) {
		if len(result.Rows) >= maxRows {
			result.Truncated = true
			break
		}
		values := response.Record().Values
		row := make([]any, len(values))
		for i, value := range values {
			row[i] = normalize(value)
		}
		result.Rows = append(result.Rows, row)
	}
	if err := response.Err(); err != nil {
		return Result{}, err
	}
	result.RowCount = len(result.Rows)
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}

func neo4jSchema(ctx context.Context, dsn string) ([]Table, error) {
	driver, err := neo4jDriver(dsn)
	if err != nil {
		return nil, err
	}
	defer driver.Close(ctx)
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)
	response, err := session.Run(ctx, "CALL db.labels() YIELD label RETURN label ORDER BY label", nil)
	if err != nil {
		return nil, err
	}
	var tables []Table
	for response.Next(ctx) {
		label, _ := response.Record().Get("label")
		tables = append(tables, Table{
			Schema: "neo4j",
			Name:   fmt.Sprint(label),
			Columns: []TableColumn{
				{Name: "node", Type: "node"},
			},
		})
	}
	return tables, response.Err()
}

func neo4jDriver(dsn string) (neo4j.DriverWithContext, error) {
	parsed, err := url.Parse(dsn)
	if err != nil {
		return nil, err
	}
	auth := neo4j.NoAuth()
	if parsed.User != nil {
		password, _ := parsed.User.Password()
		auth = neo4j.BasicAuth(parsed.User.Username(), password, "")
	}
	clean := *parsed
	clean.User = nil
	return neo4j.NewDriverWithContext(clean.String(), auth)
}

func isReadOnlyNeo4j(query string) bool {
	lower := strings.ToLower(strings.TrimSpace(query))
	for _, prefix := range []string{"match", "return", "call", "with", "unwind", "show"} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}
