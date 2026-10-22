package database

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/ferforastieri/toph/internal/store"
)

func newService(t *testing.T) (*Service, *store.Store) {
	t.Helper()
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "toph.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	svc, err := New(st, filepath.Join(dir, "master.key"))
	if err != nil {
		t.Fatal(err)
	}
	return svc, st
}

func TestEncryptDecrypt(t *testing.T) {
	svc, _ := newService(t)
	encrypted, err := svc.encrypt("postgres://user:pass@localhost/db")
	if err != nil {
		t.Fatal(err)
	}
	if encrypted == "postgres://user:pass@localhost/db" {
		t.Fatal("expected encrypted value")
	}
	plain, err := svc.decrypt(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	if plain != "postgres://user:pass@localhost/db" {
		t.Fatalf("unexpected plaintext: %q", plain)
	}
}

func TestSQLiteQueryAndSchema(t *testing.T) {
	svc, _ := newService(t)
	dbPath := filepath.Join(t.TempDir(), "sample.db")
	if err := os.WriteFile(dbPath, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	profile, err := svc.Create(context.Background(), ProfileInput{
		Name: "sample", Driver: "sqlite", DSN: dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Query(context.Background(), profile.ID,
		`CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT)`, 10); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Query(context.Background(), profile.ID,
		`INSERT INTO notes (title, body) VALUES ('hello', 'world')`, 10); err != nil {
		t.Fatal(err)
	}
	result, err := svc.Query(context.Background(), profile.ID, `SELECT id, title, body FROM notes`, 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.RowCount != 1 || len(result.Columns) != 3 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if result.Rows[0][1] != "hello" || result.Rows[0][2] != "world" {
		t.Fatalf("unexpected row: %+v", result.Rows[0])
	}
	tables, err := svc.Schema(context.Background(), profile.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(tables) != 1 || tables[0].Name != "notes" || len(tables[0].Columns) != 3 {
		t.Fatalf("unexpected schema: %+v", tables)
	}
}

func TestQueryTruncates(t *testing.T) {
	svc, _ := newService(t)
	dbPath := filepath.Join(t.TempDir(), "sample.db")
	profile, err := svc.Create(context.Background(), ProfileInput{
		Name: "sample", Driver: "sqlite", DSN: dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Query(context.Background(), profile.ID, `CREATE TABLE n (v INTEGER)`, 10); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		if _, err := svc.Query(context.Background(), profile.ID, `INSERT INTO n (v) VALUES (1)`, 10); err != nil {
			t.Fatal(err)
		}
	}
	result, err := svc.Query(context.Background(), profile.ID, `SELECT v FROM n`, 3)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Truncated || result.RowCount != 3 {
		t.Fatalf("expected truncated result, got %+v", result)
	}
}

func TestReadOnlyProfileRejectsWrites(t *testing.T) {
	svc, _ := newService(t)
	dbPath := filepath.Join(t.TempDir(), "sample.db")
	writable, err := svc.Create(context.Background(), ProfileInput{
		Name: "writable", Driver: "sqlite", DSN: dbPath,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Query(context.Background(), writable.ID,
		`CREATE TABLE notes (id INTEGER PRIMARY KEY, title TEXT)`, 10); err != nil {
		t.Fatal(err)
	}
	readOnly, err := svc.Create(context.Background(), ProfileInput{
		Name: "readonly", Driver: "sqlite", DSN: dbPath, ReadOnly: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Query(context.Background(), readOnly.ID,
		`SELECT * FROM notes`, 10); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Query(context.Background(), readOnly.ID,
		`INSERT INTO notes (title) VALUES ('nope')`, 10); err == nil {
		t.Fatal("expected read-only write to fail")
	}
}

func TestSupportedDrivers(t *testing.T) {
	for _, driver := range []string{"postgres", "mysql", "sqlite", "sqlserver", "oracle", "clickhouse", "mongodb", "redis"} {
		if !supported(driver) {
			t.Fatalf("expected %s to be supported", driver)
		}
	}
	if supported("cassandra") {
		t.Fatal("unexpected unsupported driver")
	}
	if driverName("postgres") != "pgx" || driverName("sqlserver") != "sqlserver" {
		t.Fatal("unexpected driver mapping")
	}
}

func TestRedisCommandParsingAndReadOnly(t *testing.T) {
	args, err := parseRedisCommand(`GET "hello world"`)
	if err != nil {
		t.Fatal(err)
	}
	if len(args) != 2 || args[0] != "GET" || args[1] != "hello world" {
		t.Fatalf("unexpected args: %#v", args)
	}
	if !isReadOnlyRedis("HGETALL user:1") {
		t.Fatal("expected HGETALL to be read-only")
	}
	if isReadOnlyRedis("SET user:1 name") {
		t.Fatal("expected SET to be rejected")
	}
	if _, err := parseRedisCommand(`GET "unterminated`); err == nil {
		t.Fatal("expected unterminated quote error")
	}
}

func TestRedisResultShapes(t *testing.T) {
	result, err := redisResult(map[string]string{"a": "1", "b": "2"}, 10)
	if err != nil || result.RowCount != 2 || len(result.Columns) != 2 {
		t.Fatalf("unexpected map result: %+v %v", result, err)
	}
	result, err = redisResult([]any{"one", "two"}, 1)
	if err != nil || result.RowCount != 1 || result.Rows[0][0] != "one" {
		t.Fatalf("unexpected list result: %+v %v", result, err)
	}
}
