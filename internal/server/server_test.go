package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/ferforastieri/toph/internal/auth"
	"github.com/ferforastieri/toph/internal/config"
	"github.com/ferforastieri/toph/internal/database"
	"github.com/ferforastieri/toph/internal/opencode"
	"github.com/ferforastieri/toph/internal/store"
	"github.com/ferforastieri/toph/internal/terminal"
	"github.com/ferforastieri/toph/internal/workspace"
)

type testClient struct {
	t      *testing.T
	base   string
	client *http.Client
	csrf   string
}

func newTestServer(t *testing.T) (*testClient, string) {
	t.Helper()
	dir := t.TempDir()
	root := filepath.Join(dir, "workspace")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("# hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	st, err := store.Open(filepath.Join(dir, "toph.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	authManager := auth.New(st, false)
	if _, _, err := authManager.Bootstrap(t.Context(), "secret"); err != nil {
		t.Fatal(err)
	}
	ws, err := workspace.New([]string{root})
	if err != nil {
		t.Fatal(err)
	}
	db, err := database.New(st, filepath.Join(dir, "master.key"))
	if err != nil {
		t.Fatal(err)
	}
	oc, err := opencode.New("http://127.0.0.1:1", "")
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		DataDir: dir, WorkspaceRoots: []string{root},
		OpenCodeURL: "http://127.0.0.1:1",
	}
	app := New(cfg, st, authManager, ws, terminal.NewManager("/bin/sh"), db, oc)
	ts := httptest.NewServer(app.Handler())
	t.Cleanup(ts.Close)
	jar, _ := cookiejar.New(nil)
	return &testClient{t: t, base: ts.URL, client: &http.Client{Jar: jar}}, root
}

func (c *testClient) request(method, path string, body any, out any) *http.Response {
	c.t.Helper()
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			c.t.Fatal(err)
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, c.base+path, reader)
	if err != nil {
		c.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.csrf != "" {
		req.Header.Set(csrfHeader, c.csrf)
	}
	res, err := c.client.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	if out != nil {
		defer res.Body.Close()
		if err := json.NewDecoder(res.Body).Decode(out); err != nil {
			c.t.Fatalf("decode %s %s: %v", method, path, err)
		}
	}
	return res
}

func (c *testClient) login() {
	c.t.Helper()
	var login loginResponse
	res := c.request(http.MethodPost, "/api/auth/login", loginRequest{Username: "admin", Password: "secret", Kind: "web"}, &login)
	if res.StatusCode != http.StatusOK {
		c.t.Fatalf("login status %d", res.StatusCode)
	}
	c.csrf = login.CSRFToken
}

func TestAuthProjectsAndFiles(t *testing.T) {
	c, root := newTestServer(t)

	res := c.request(http.MethodGet, "/api/projects", nil, nil)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", res.StatusCode)
	}

	c.login()
	var project store.Project
	res = c.request(http.MethodPost, "/api/projects", projectRequest{Name: "Demo", Root: root}, &project)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create project status %d", res.StatusCode)
	}
	var projects []store.Project
	c.request(http.MethodGet, "/api/projects", nil, &projects)
	if len(projects) != 1 {
		t.Fatalf("expected one project, got %d", len(projects))
	}
	project = projects[0]

	var entries []workspace.Entry
	res = c.request(http.MethodGet, "/api/projects/"+project.ID+"/tree?path=.", nil, &entries)
	if res.StatusCode != http.StatusOK || len(entries) != 1 {
		t.Fatalf("unexpected tree: %d %+v", res.StatusCode, entries)
	}

	var file workspace.File
	c.request(http.MethodGet, "/api/projects/"+project.ID+"/file?path=README.md", nil, &file)
	if file.Content != "# hello\n" {
		t.Fatalf("unexpected file: %+v", file)
	}

	var updated workspace.File
	res = c.request(http.MethodPut, "/api/projects/"+project.ID+"/file",
		writeFileRequest{Path: "main.go", Content: "package main\n", BaseHash: ""}, &updated)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("write status %d", res.StatusCode)
	}
	read, err := os.ReadFile(filepath.Join(root, "main.go"))
	if err != nil || string(read) != "package main\n" {
		t.Fatalf("unexpected disk content: %q %v", read, err)
	}

	var matches []workspace.Match
	c.request(http.MethodPost, "/api/projects/"+project.ID+"/search", searchRequest{Query: "package"}, &matches)
	if len(matches) != 1 || matches[0].Path != "main.go" {
		t.Fatalf("unexpected search: %+v", matches)
	}
}

func TestCSRFRequiredForCookieMutations(t *testing.T) {
	c, _ := newTestServer(t)
	c.login()
	saved := c.csrf
	c.csrf = ""
	res := c.request(http.MethodPost, "/api/projects", projectRequest{Name: "Nope", Root: "/tmp"}, nil)
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected csrf failure, got %d", res.StatusCode)
	}
	c.csrf = saved
}

func TestDatabaseAPI(t *testing.T) {
	c, _ := newTestServer(t)
	c.login()

	dbPath := filepath.Join(t.TempDir(), "app.db")
	var profile store.DBProfile
	res := c.request(http.MethodPost, "/api/db/profiles",
		database.ProfileInput{Name: "App", Driver: "sqlite", DSN: dbPath}, &profile)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create profile status %d", res.StatusCode)
	}
	var result database.Result
	c.request(http.MethodPost, "/api/db/profiles/"+profile.ID+"/query",
		queryRequest{SQL: "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)"}, &result)
	c.request(http.MethodPost, "/api/db/profiles/"+profile.ID+"/query",
		queryRequest{SQL: "INSERT INTO items (name) VALUES ('toph')"}, &result)
	c.request(http.MethodPost, "/api/db/profiles/"+profile.ID+"/query",
		queryRequest{SQL: "SELECT id, name FROM items"}, &result)
	if result.RowCount != 1 || result.Rows[0][1] != "toph" {
		t.Fatalf("unexpected result: %+v", result)
	}
	var updated map[string]int64
	res = c.request(http.MethodPut, "/api/db/profiles/"+profile.ID+"/row",
		database.RowChange{
			Table: "items", Key: map[string]any{"id": 1},
			Values: map[string]any{"name": "toph2"},
		}, &updated)
	if res.StatusCode != http.StatusOK || updated["rowsAffected"] != 1 {
		t.Fatalf("unexpected row update: %d %+v", res.StatusCode, updated)
	}
	var tables []database.Table
	c.request(http.MethodGet, "/api/db/profiles/"+profile.ID+"/schema", nil, &tables)
	if len(tables) != 1 || tables[0].Name != "items" {
		t.Fatalf("unexpected schema: %+v", tables)
	}
}

func TestWebTargets(t *testing.T) {
	c, _ := newTestServer(t)
	c.login()
	var target store.WebTarget
	res := c.request(http.MethodPost, "/api/web-targets",
		webTargetRequest{Name: "Grafana", URL: "http://grafana.local"}, &target)
	if res.StatusCode != http.StatusCreated || target.URL != "http://grafana.local" {
		t.Fatalf("unexpected target: %d %+v", res.StatusCode, target)
	}
	var targets []store.WebTarget
	c.request(http.MethodGet, "/api/web-targets", nil, &targets)
	if len(targets) != 1 {
		t.Fatalf("expected one target, got %d", len(targets))
	}
}
