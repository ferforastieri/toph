package workspace

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func newService(t *testing.T) (*Service, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "main.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "src"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "src", "app.ts"), []byte("const value = 42\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	svc, err := New([]string{root})
	if err != nil {
		t.Fatal(err)
	}
	return svc, root
}

func TestListAndRead(t *testing.T) {
	svc, root := newService(t)
	entries, err := svc.List(root, ".")
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(entries))
	}
	if !entries[0].Dir {
		t.Fatal("expected directory first")
	}
	file, err := svc.Read(root, "main.go")
	if err != nil {
		t.Fatal(err)
	}
	if file.Content != "package main\n" || file.Hash == "" {
		t.Fatalf("unexpected file: %+v", file)
	}
}

func TestPathEscapeIsRejected(t *testing.T) {
	svc, root := newService(t)
	for _, path := range []string{"../etc/passwd", "/etc/passwd", "src/../../etc/passwd"} {
		if _, err := svc.Read(root, path); !errors.Is(err, ErrForbidden) {
			t.Fatalf("expected forbidden for %q, got %v", path, err)
		}
	}
}

func TestSymlinkEscapeIsRejected(t *testing.T) {
	svc, root := newService(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret"), []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "secret"), filepath.Join(root, "link")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, err := svc.Read(root, "link"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("expected forbidden symlink escape, got %v", err)
	}
}

func TestWriteConflictAndAtomicSave(t *testing.T) {
	svc, root := newService(t)
	file, err := svc.Read(root, "main.go")
	if err != nil {
		t.Fatal(err)
	}
	updated, err := svc.Write(root, "main.go", "package main\n\nfunc main() {}\n", file.Hash)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Hash == file.Hash {
		t.Fatal("expected hash to change")
	}
	if _, err := svc.Write(root, "main.go", "stale", file.Hash); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected conflict, got %v", err)
	}
	read, err := svc.Read(root, "main.go")
	if err != nil {
		t.Fatal(err)
	}
	if read.Content != "package main\n\nfunc main() {}\n" {
		t.Fatalf("unexpected content: %q", read.Content)
	}
}

func TestSearchFallback(t *testing.T) {
	svc, root := newService(t)
	matches, err := svc.Search(context.Background(), root, "value", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 1 || matches[0].Path != "src/app.ts" {
		t.Fatalf("unexpected matches: %+v", matches)
	}
}
