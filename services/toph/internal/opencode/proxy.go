package opencode

import (
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
)

// Proxy forwards Toph's OpenCode routes to the configured OpenCode server.
// The browser and the Android client never talk to OpenCode directly.
type Proxy struct {
	mu   sync.RWMutex
	base *url.URL
	auth string
}

func New(rawURL, auth string) (*Proxy, error) {
	proxy := &Proxy{}
	if err := proxy.SetConfig(rawURL, auth); err != nil {
		return nil, err
	}
	return proxy, nil
}

func (p *Proxy) SetConfig(rawURL, auth string) error {
	base, err := url.Parse(strings.TrimRight(rawURL, "/"))
	if err != nil {
		return err
	}
	if base.Scheme != "http" && base.Scheme != "https" {
		return &url.Error{Op: "parse", URL: rawURL, Err: errInvalidScheme{}}
	}
	p.mu.Lock()
	p.base = base
	p.auth = auth
	p.mu.Unlock()
	return nil
}

type errInvalidScheme struct{}

func (errInvalidScheme) Error() string { return "scheme must be http or https" }

func (p *Proxy) Handler(prefix string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p.mu.RLock()
		base := p.base
		auth := p.auth
		p.mu.RUnlock()
		if base == nil {
			http.Error(w, `{"error":"opencode is not configured"}`, http.StatusBadGateway)
			return
		}
		proxy := newReverseProxy(base, auth)
		originalPath := r.URL.Path
		rest := strings.TrimPrefix(originalPath, prefix)
		if rest == "" {
			rest = "/"
		}
		if !strings.HasPrefix(rest, "/") {
			rest = "/" + rest
		}
		r.URL.Path = rest
		r.URL.RawPath = ""
		proxy.ServeHTTP(w, r)
	})
}

func newReverseProxy(base *url.URL, auth string) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(base)
	proxy.FlushInterval = -1
	originalDirector := proxy.Director
	proxy.Director = func(r *http.Request) {
		originalDirector(r)
		r.Host = base.Host
		r.Header.Del("Cookie")
		r.Header.Del("Authorization")
		r.Header.Del("X-Toph-CSRF")
		if auth != "" {
			r.Header.Set("Authorization", auth)
		}
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Warn("opencode proxy error", "path", r.URL.Path, "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":"opencode unavailable"}`))
	}
	return proxy
}
