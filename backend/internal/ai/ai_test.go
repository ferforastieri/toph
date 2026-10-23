package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ferforastieri/toph/internal/store"
)

func TestConfigEncryptsAPIKey(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "toph.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	service, err := New(st, filepath.Join(dir, "master.key"))
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	public, err := service.Save(ctx, Input{
		Provider: "claude", BaseURL: "https://api.anthropic.com", APIKey: "super-secret",
		Model: "claude-sonnet-4", MaxTokens: 512, Temperature: 0.1, Autocomplete: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !public.HasKey {
		t.Fatal("expected stored key")
	}
	loaded, err := service.Load(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.APIKey != "super-secret" {
		t.Fatalf("unexpected key: %q", loaded.APIKey)
	}
	raw, err := st.Setting(ctx, settingKey)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(raw, "super-secret") {
		t.Fatal("API key was stored in plaintext")
	}
}

func TestOpenCodeCompletionUsesGenerateEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/experimental/generate" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test" {
			t.Fatalf("unexpected authorization %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"text":"return 1"}`))
	}))
	defer server.Close()

	dir := t.TempDir()
	st, err := store.Open(filepath.Join(dir, "toph.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	service, err := New(st, filepath.Join(dir, "master.key"))
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := service.Save(ctx, Input{
		Provider: "opencode", BaseURL: server.URL, APIKey: "Bearer test", Model: "default",
		MaxTokens: 256, Temperature: 0.1, Autocomplete: true,
	}); err != nil {
		t.Fatal(err)
	}
	completion, err := service.Complete(ctx, CompleteInput{
		Path: "main.go", Language: "go", Prefix: "func main() {", Suffix: "\n}",
	})
	if err != nil {
		t.Fatal(err)
	}
	if completion != "return 1" {
		t.Fatalf("unexpected completion %q", completion)
	}
}
