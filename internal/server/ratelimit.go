package server

import (
	"net"
	"sync"
	"time"
)

type loginEntry struct {
	count int
	reset time.Time
}

type loginLimiter struct {
	mu      sync.Mutex
	entries map[string]*loginEntry
	max     int
	window  time.Duration
}

func newLoginLimiter(max int, window time.Duration) *loginLimiter {
	return &loginLimiter{
		entries: make(map[string]*loginEntry),
		max:     max,
		window:  window,
	}
}

func (l *loginLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	entry, ok := l.entries[key]
	if !ok || now.After(entry.reset) {
		l.entries[key] = &loginEntry{count: 1, reset: now.Add(l.window)}
		return true
	}
	if entry.count >= l.max {
		return false
	}
	entry.count++
	return true
}

func (l *loginLimiter) reset(key string) {
	l.mu.Lock()
	delete(l.entries, key)
	l.mu.Unlock()
}

func clientKey(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}
