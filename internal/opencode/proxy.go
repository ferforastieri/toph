package opencode

import (
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Proxy forwards Toph's /api/opencode/* routes to an OpenCode server. The
// browser and the Android client never talk to OpenCode directly.
type Proxy struct {
	base *url.URL
	auth string
}

func New(rawURL, auth string) (*Proxy, error) {
	base, err := url.Parse(strings.TrimRight(rawURL, "/"))
	if err != nil {
		return nil, err
	}
	return &Proxy{base: base, auth: auth}, nil
}

func (p *Proxy) Handler(prefix string) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(p.base)
	proxy.FlushInterval = -1
	originalDirector := proxy.Director
	proxy.Director = func(r *http.Request) {
		originalDirector(r)
		originalPath := r.URL.Path
		rest := strings.TrimPrefix(originalPath, prefix)
		if rest == "" {
			rest = "/"
		}
		if !strings.HasPrefix(rest, "/") {
			rest = "/" + rest
		}
		r.URL.Path = p.base.Path + rest
		r.URL.RawPath = ""
		r.Host = p.base.Host
		if p.auth != "" {
			r.Header.Set("Authorization", p.auth)
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
