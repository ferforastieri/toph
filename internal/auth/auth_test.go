package auth

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/ferforastieri/toph/internal/store"
)

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword(hash, "correct horse battery staple") {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword(hash, "wrong") {
		t.Fatal("expected wrong password to fail")
	}
	if VerifyPassword("garbage", "anything") {
		t.Fatal("expected invalid hash to fail")
	}
}

func TestLoginAndAuthenticate(t *testing.T) {
	st, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	m := New(st, false)
	password, generated, err := m.Bootstrap(context.Background(), "secret")
	if err != nil {
		t.Fatal(err)
	}
	if generated || password != "secret" {
		t.Fatalf("unexpected bootstrap result: %q %v", password, generated)
	}

	result, err := m.Login(context.Background(), "admin", "secret", "web")
	if err != nil {
		t.Fatal(err)
	}
	if result.Token == "" || result.CSRFToken == "" {
		t.Fatal("expected token and csrf token")
	}
	session, user, err := m.Authenticate(context.Background(), result.Token)
	if err != nil {
		t.Fatal(err)
	}
	if session.ID == "" || user.Username != "admin" {
		t.Fatalf("unexpected session/user: %+v %+v", session, user)
	}
	if _, _, err := m.Authenticate(context.Background(), "wrong"); err == nil {
		t.Fatal("expected invalid token to fail")
	}
}
