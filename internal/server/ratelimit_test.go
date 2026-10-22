package server

import (
	"testing"
	"time"
)

func TestLoginLimiter(t *testing.T) {
	limiter := newLoginLimiter(2, time.Minute)
	if !limiter.allow("127.0.0.1") || !limiter.allow("127.0.0.1") {
		t.Fatal("expected first two attempts to pass")
	}
	if limiter.allow("127.0.0.1") {
		t.Fatal("expected third attempt to be blocked")
	}
	limiter.reset("127.0.0.1")
	if !limiter.allow("127.0.0.1") {
		t.Fatal("expected reset to allow a new attempt")
	}
	if key := clientKey("192.0.2.1:1234"); key != "192.0.2.1" {
		t.Fatalf("unexpected key: %q", key)
	}
}
