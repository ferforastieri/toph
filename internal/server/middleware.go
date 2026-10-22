package server

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/ferforastieri/toph/internal/store"
)

type contextKey string

const (
	sessionKey contextKey = "session"
	userKey    contextKey = "user"
	projectKey contextKey = "project"
)

const (
	sessionCookie = "toph_session"
	csrfCookie    = "toph_csrf"
	csrfHeader    = "X-Toph-CSRF"
)

func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, fromCookie := sessionToken(r)
		session, user, err := s.auth.Authenticate(r.Context(), raw)
		if err != nil {
			if fromCookie {
				clearAuthCookies(w, s.auth.SecureCookies())
			}
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if fromCookie && isUnsafe(r.Method) {
			csrf := cookieValue(r, csrfCookie)
			if csrf == "" || r.Header.Get(csrfHeader) != csrf {
				writeError(w, http.StatusForbidden, "invalid csrf token")
				return
			}
		}
		ctx := context.WithValue(r.Context(), sessionKey, session)
		ctx = context.WithValue(ctx, userKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) withProject(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		project, err := s.store.Project(r.Context(), chi.URLParam(r, "projectID"))
		if err != nil {
			apiError(w, err)
			return
		}
		ctx := context.WithValue(r.Context(), projectKey, project)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func sessionToken(r *http.Request) (string, bool) {
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), false
	}
	if token := r.URL.Query().Get("token"); token != "" {
		return token, false
	}
	if cookie, err := r.Cookie(sessionCookie); err == nil && cookie.Value != "" {
		return cookie.Value, true
	}
	return "", false
}

func cookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func isUnsafe(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}

func currentUser(r *http.Request) store.User {
	user, _ := r.Context().Value(userKey).(store.User)
	return user
}

func currentSession(r *http.Request) store.Session {
	session, _ := r.Context().Value(sessionKey).(store.Session)
	return session
}

func currentProject(r *http.Request) store.Project {
	project, _ := r.Context().Value(projectKey).(store.Project)
	return project
}
