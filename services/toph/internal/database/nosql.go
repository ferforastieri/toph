package database

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type mongoRequest struct {
	Database   string           `json:"database"`
	Collection string           `json:"collection"`
	Filter     map[string]any   `json:"filter"`
	Pipeline   []map[string]any `json:"pipeline"`
	Limit      int64            `json:"limit"`
}

func testMongo(ctx context.Context, dsn string) error {
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(dsn).SetConnectTimeout(10*time.Second))
	if err != nil {
		return err
	}
	defer client.Disconnect(context.Background())
	return client.Ping(ctx, nil)
}

func queryMongo(ctx context.Context, dsn, query string, maxRows int) (Result, error) {
	var req mongoRequest
	if err := json.Unmarshal([]byte(query), &req); err != nil {
		return Result{}, errors.New("mongodb query must be JSON: {database, collection, filter, pipeline, limit}")
	}
	if req.Database == "" || req.Collection == "" {
		return Result{}, errors.New("mongodb query requires database and collection")
	}
	limit := req.Limit
	if limit <= 0 || int(limit) > maxRows {
		limit = int64(maxRows)
	}

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(dsn).SetConnectTimeout(10*time.Second))
	if err != nil {
		return Result{}, err
	}
	defer client.Disconnect(context.Background())

	collection := client.Database(req.Database).Collection(req.Collection)
	start := time.Now()
	var cursor *mongo.Cursor
	if len(req.Pipeline) > 0 {
		pipeline := make(mongo.Pipeline, 0, len(req.Pipeline))
		for _, stage := range req.Pipeline {
			raw, err := bson.Marshal(stage)
			if err != nil {
				return Result{}, err
			}
			var doc bson.D
			if err := bson.Unmarshal(raw, &doc); err != nil {
				return Result{}, err
			}
			pipeline = append(pipeline, doc)
		}
		cursor, err = collection.Aggregate(ctx, pipeline)
	} else {
		filter := req.Filter
		if filter == nil {
			filter = map[string]any{}
		}
		cursor, err = collection.Find(ctx, filter, options.Find().SetLimit(limit))
	}
	if err != nil {
		return Result{}, err
	}
	defer cursor.Close(ctx)

	result := Result{Columns: []Column{{Name: "document", Type: "json"}}}
	for cursor.Next(ctx) {
		if len(result.Rows) >= int(limit) {
			result.Truncated = true
			break
		}
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return Result{}, err
		}
		encoded, err := bson.MarshalExtJSON(doc, false, false)
		if err != nil {
			return Result{}, err
		}
		result.Rows = append(result.Rows, []any{string(encoded)})
	}
	if err := cursor.Err(); err != nil {
		return Result{}, err
	}
	result.RowCount = len(result.Rows)
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}

func mongoSchema(ctx context.Context, dsn string) ([]Table, error) {
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(dsn).SetConnectTimeout(10*time.Second))
	if err != nil {
		return nil, err
	}
	defer client.Disconnect(context.Background())

	databases, err := client.ListDatabaseNames(ctx, bson.M{})
	if err != nil {
		return nil, err
	}
	sort.Strings(databases)
	var tables []Table
	for _, database := range databases {
		if database == "admin" || database == "config" || database == "local" {
			continue
		}
		db := client.Database(database)
		collections, err := db.ListCollectionNames(ctx, bson.M{})
		if err != nil {
			continue
		}
		sort.Strings(collections)
		for _, collection := range collections {
			table := Table{Schema: database, Name: collection}
			var sample bson.M
			if err := db.Collection(collection).FindOne(ctx, bson.M{}).Decode(&sample); err == nil {
				keys := make([]string, 0, len(sample))
				for key := range sample {
					keys = append(keys, key)
				}
				sort.Strings(keys)
				for _, key := range keys {
					table.Columns = append(table.Columns, TableColumn{
						Name: key, Type: fmt.Sprintf("%T", sample[key]),
					})
				}
			}
			tables = append(tables, table)
			if len(tables) >= 500 {
				return tables, nil
			}
		}
	}
	return tables, nil
}

func testRedis(ctx context.Context, dsn string) error {
	client, err := redisClient(dsn)
	if err != nil {
		return err
	}
	defer client.Close()
	return client.Ping(ctx).Err()
}

func queryRedis(ctx context.Context, dsn, query string, maxRows int) (Result, error) {
	args, err := parseRedisCommand(query)
	if err != nil {
		return Result{}, err
	}
	if len(args) == 0 {
		return Result{}, errors.New("redis command is required")
	}
	client, err := redisClient(dsn)
	if err != nil {
		return Result{}, err
	}
	defer client.Close()

	start := time.Now()
	command := make([]interface{}, len(args))
	for i, arg := range args {
		command[i] = arg
	}
	reply, err := client.Do(ctx, command...).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return Result{}, err
	}
	result, err := redisResult(reply, maxRows)
	if err != nil {
		return Result{}, err
	}
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}

func redisSchema(ctx context.Context, dsn string) ([]Table, error) {
	client, err := redisClient(dsn)
	if err != nil {
		return nil, err
	}
	defer client.Close()
	if _, _, err := client.Scan(ctx, 0, "*", 1).Result(); err != nil {
		return nil, err
	}
	return []Table{{
		Schema: "redis",
		Name:   "keys",
		Columns: []TableColumn{
			{Name: "key", Type: "string"},
		},
	}}, nil
}

func redisClient(dsn string) (*redis.Client, error) {
	if !strings.Contains(dsn, "://") {
		dsn = "redis://" + dsn
	}
	opts, err := redis.ParseURL(dsn)
	if err != nil {
		return nil, err
	}
	return redis.NewClient(opts), nil
}

func redisResult(reply any, maxRows int) (Result, error) {
	switch value := reply.(type) {
	case []any:
		if len(value) > maxRows {
			value = value[:maxRows]
		}
		if len(value) > 0 {
			if _, ok := value[0].([]any); ok {
				result := Result{Columns: []Column{{Name: "key"}, {Name: "value"}}}
				for _, item := range value {
					if pair, ok := item.([]any); ok && len(pair) >= 2 {
						result.Rows = append(result.Rows, []any{fmt.Sprint(pair[0]), fmt.Sprint(pair[1])})
					}
				}
				result.RowCount = len(result.Rows)
				return result, nil
			}
		}
		result := Result{Columns: []Column{{Name: "value"}}}
		for _, item := range value {
			result.Rows = append(result.Rows, []any{fmt.Sprint(item)})
		}
		result.RowCount = len(result.Rows)
		return result, nil
	case map[string]string:
		result := Result{Columns: []Column{{Name: "key"}, {Name: "value"}}}
		keys := make([]string, 0, len(value))
		for key := range value {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for i, key := range keys {
			if i >= maxRows {
				break
			}
			result.Rows = append(result.Rows, []any{key, value[key]})
		}
		result.RowCount = len(result.Rows)
		return result, nil
	case map[any]any:
		result := Result{Columns: []Column{{Name: "key"}, {Name: "value"}}}
		count := 0
		for key, item := range value {
			if count >= maxRows {
				break
			}
			result.Rows = append(result.Rows, []any{fmt.Sprint(key), fmt.Sprint(item)})
			count++
		}
		result.RowCount = len(result.Rows)
		return result, nil
	default:
		return Result{
			Columns:  []Column{{Name: "value"}},
			Rows:     [][]any{{fmt.Sprint(reply)}},
			RowCount: 1,
		}, nil
	}
}

func isReadOnlyRedis(query string) bool {
	args, err := parseRedisCommand(query)
	if err != nil || len(args) == 0 {
		return false
	}
	switch strings.ToUpper(args[0]) {
	case "GET", "MGET", "KEYS", "SCAN", "HGET", "HGETALL", "HMGET", "HLEN",
		"LRANGE", "LLEN", "SMEMBERS", "SCARD", "ZRANGE", "ZCARD", "TYPE",
		"TTL", "PTTL", "EXISTS", "INFO", "PING", "STRLEN":
		return true
	default:
		return false
	}
}

func parseRedisCommand(input string) ([]string, error) {
	var args []string
	var current strings.Builder
	var quote rune
	escaped := false
	flush := func() {
		if current.Len() > 0 {
			args = append(args, current.String())
			current.Reset()
		}
	}
	for _, r := range input {
		if escaped {
			current.WriteRune(r)
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
			} else {
				current.WriteRune(r)
			}
			continue
		}
		switch r {
		case '\'', '"':
			quote = r
		case ' ', '\t', '\n', '\r':
			flush()
		default:
			current.WriteRune(r)
		}
	}
	if escaped {
		current.WriteRune('\\')
	}
	if quote != 0 {
		return nil, errors.New("unterminated quote")
	}
	flush()
	return args, nil
}
