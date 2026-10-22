package server

import (
	"io/fs"
	"net/http"
	"os"
	"strings"

	"github.com/ferforastieri/toph/internal/webui"
)

func (s *Server) staticHandler() http.Handler {
	var fsys fs.FS
	if s.cfg.WebDir != "" {
		fsys = os.DirFS(s.cfg.WebDir)
	} else {
		fsys = webui.FS()
	}
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/docs" || r.URL.Path == "/docs/" {
			http.Redirect(w, r, "/docs.html", http.StatusMovedPermanently)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}
		if _, err := fs.Stat(fsys, "index.html"); err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(webui.Placeholder))
			return
		}
		if info, err := fs.Stat(fsys, path); err == nil && !info.IsDir() {
			if strings.HasPrefix(path, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else if path == "index.html" {
				w.Header().Set("Cache-Control", "no-cache")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		if strings.Contains(path, ".") {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
