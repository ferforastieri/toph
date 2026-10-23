package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/ferforastieri/toph/internal/ai"
	"github.com/ferforastieri/toph/internal/auth"
	"github.com/ferforastieri/toph/internal/config"
	"github.com/ferforastieri/toph/internal/database"
	"github.com/ferforastieri/toph/internal/opencode"
	"github.com/ferforastieri/toph/internal/store"
	"github.com/ferforastieri/toph/internal/terminal"
	"github.com/ferforastieri/toph/internal/workspace"
)

const Version = "0.4.2"

type Server struct {
	cfg          config.Config
	store        *store.Store
	auth         *auth.Manager
	workspace    *workspace.Service
	terminals    *terminal.Manager
	db           *database.Service
	opencode     *opencode.Proxy
	ai           *ai.Service
	web          http.Handler
	clientIP     clientIPResolver
	loginLimiter *loginLimiter
	apiLimiter   *loginLimiter
}

func New(
	cfg config.Config,
	st *store.Store,
	authManager *auth.Manager,
	ws *workspace.Service,
	terminals *terminal.Manager,
	db *database.Service,
	oc *opencode.Proxy,
	aiService *ai.Service,
) *Server {
	s := &Server{
		cfg: cfg, store: st, auth: authManager, workspace: ws,
		terminals: terminals, db: db, opencode: oc, ai: aiService,
		clientIP:     newClientIPResolver(cfg.TrustedProxies),
		loginLimiter: newLoginLimiter(10, 5*time.Minute),
		apiLimiter:   newLoginLimiter(300, time.Minute),
	}
	s.web = s.staticHandler()
	return s
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(s.recoverer)
	r.Use(s.securityHeaders)
	r.Use(s.accessLog)
	r.Use(s.apiRateLimit)

	r.Get("/api/health", s.health)
	r.Get("/api/version", s.version)
	r.Post("/api/auth/login", s.login)

	r.Group(func(r chi.Router) {
		r.Use(s.authenticate)
		r.Get("/api/auth/me", s.me)
		r.Post("/api/auth/logout", s.logout)

		r.Route("/api/projects", func(r chi.Router) {
			r.Get("/", s.listProjects)
			r.Post("/", s.createProject)
			r.Route("/{projectID}", func(r chi.Router) {
				r.Use(s.withProject)
				r.Get("/", s.getProject)
				r.Put("/", s.updateProject)
				r.Delete("/", s.deleteProject)
				r.Get("/tree", s.tree)
				r.Get("/file", s.readFile)
				r.Put("/file", s.writeFile)
				r.Post("/search", s.search)
				r.Get("/git/status", s.gitStatus)
				r.Get("/workspace", s.getWorkspace)
				r.Put("/workspace", s.saveWorkspace)
				r.Post("/terminals", s.createTerminal)
			})
		})

		r.Get("/api/terminals/{terminalID}/ws", s.terminalWS)

		r.Get("/api/workspaces/roots", s.listWorkspaceRoots)
		r.Post("/api/workspaces/roots", s.addWorkspaceRoot)
		r.Delete("/api/workspaces/roots", s.removeWorkspaceRoot)

		r.Get("/api/ai/config", s.getAIConfig)
		r.Put("/api/ai/config", s.saveAIConfig)
		r.Post("/api/ai/test", s.testAI)
		r.Post("/api/ai/chat", s.chatAI)
		r.Post("/api/ai/complete", s.completeAI)

		r.Route("/api/db/profiles", func(r chi.Router) {
			r.Get("/", s.listDBProfiles)
			r.Post("/", s.createDBProfile)
			r.Delete("/{profileID}", s.deleteDBProfile)
			r.Post("/{profileID}/test", s.testDBProfile)
			r.Post("/{profileID}/query", s.queryDB)
			r.Get("/{profileID}/schema", s.dbSchema)
			r.Post("/{profileID}/row", s.insertDBRow)
			r.Put("/{profileID}/row", s.updateDBRow)
			r.Delete("/{profileID}/row", s.deleteDBRow)
		})

		r.Route("/api/web-targets", func(r chi.Router) {
			r.Get("/", s.listWebTargets)
			r.Post("/", s.createWebTarget)
			r.Delete("/{targetID}", s.deleteWebTarget)
		})

		r.Handle("/api/opencode/*", s.opencode.Handler("/api/opencode"))
	})

	r.Handle("/*", s.web)
	return r
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "name": "toph", "version": Version, "buildId": s.cfg.BuildID,
	})
}

func (s *Server) version(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"name": "toph", "version": Version, "buildId": s.cfg.BuildID,
	})
}

func (s *Server) accessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"ip", s.clientIP.resolve(r),
			"status", ww.Status(),
			"bytes", ww.BytesWritten(),
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

func (s *Server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic", "error", rec, "path", r.URL.Path)
				writeError(w, http.StatusInternalServerError, "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
		w.Header().Set("X-Permitted-Cross-Domain-Policies", "none")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) EnsureDefaultProject(ctx context.Context) error {
	projects, err := s.store.ListProjects(ctx)
	if err != nil || len(projects) > 0 || len(s.cfg.WorkspaceRoots) == 0 {
		return err
	}
	root, err := s.workspace.ValidateRoot(s.cfg.WorkspaceRoots[0])
	if err != nil {
		return nil
	}
	_, err = s.store.CreateProject(ctx, store.Project{
		ID:   newID(),
		Name: baseName(root),
		Root: root,
	})
	return err
}

func baseName(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' {
			if i == len(path)-1 {
				return "workspace"
			}
			return path[i+1:]
		}
	}
	return path
}
