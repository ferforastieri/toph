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
