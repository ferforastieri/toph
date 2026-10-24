package server

import (
	"net/http/httptest"
	"net/netip"
	"testing"
)

func TestClientIPResolverIgnoresSpoofedForwardedForByDefault(t *testing.T) {
	resolver := newClientIPResolver(nil)
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "198.51.100.10:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.50")
	if got := resolver.resolve(req); got != "198.51.100.10" {
		t.Fatalf("expected remote address, got %q", got)
	}
}

func TestClientIPResolverTrustsConfiguredProxy(t *testing.T) {
	resolver := newClientIPResolver([]netip.Prefix{netip.MustParsePrefix("192.0.2.0/24")})
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "192.0.2.10:1234"
	req.Header.Set("X-Forwarded-For", "203.0.113.50, 192.0.2.10")
	if got := resolver.resolve(req); got != "203.0.113.50" {
		t.Fatalf("expected forwarded client, got %q", got)
	}
	req.Header.Del("X-Forwarded-For")
	req.Header.Set("X-Real-IP", "203.0.113.51")
	if got := resolver.resolve(req); got != "203.0.113.51" {
		t.Fatalf("expected real-ip client, got %q", got)
	}
}
