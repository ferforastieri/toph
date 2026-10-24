package opencode

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProxyRewritesPathAndAuth(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/info" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Fatalf("unexpected auth: %q", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	proxy, err := New(target.URL, "Bearer secret")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/opencode/api/info", nil)
	rec := httptest.NewRecorder()
	proxy.Handler("/api/opencode").ServeHTTP(rec, req)

	res := rec.Result()
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK || string(body) != `{"ok":true}` {
		t.Fatalf("unexpected response: %d %s", res.StatusCode, body)
	}
}
