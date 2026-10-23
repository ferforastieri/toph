package ai

import (
	"context"
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
