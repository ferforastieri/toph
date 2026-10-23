package server

import (
	"net/http"
	"time"

	"github.com/ferforastieri/toph/internal/auth"
)

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Kind     string `json:"kind"`
}

type loginResponse struct {
	Token     string `json:"token"`
	CSRFToken string `json:"csrfToken"`
	ExpiresAt string `json:"expiresAt"`
	User      any    `json:"user"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	key := s.clientIP.resolve(r)
	if !s.loginLimiter.allow(key) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "too many login attempts")
		return
	}
	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Username == "" {
		req.Username = "admin"
	}
	if req.Kind == "" {
		req.Kind = "web"
	}
	if req.Kind != "web" && req.Kind != "mobile" {
		writeError(w, http.StatusBadRequest, "invalid client kind")
		return
	}
	result, err := s.auth.Login(r.Context(), req.Username, req.Password, req.Kind)
	if err != nil {
		if err == auth.ErrInvalidCredentials {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create session")
		return
	}
	s.loginLimiter.reset(key)
	if req.Kind == "web" {
		setAuthCookies(w, result.Token, result.CSRFToken, s.auth.SecureCookies())
	}
	response := loginResponse{
		CSRFToken: result.CSRFToken,
		ExpiresAt: result.Session.ExpiresAt,
		User:      result.User,
	}
	if req.Kind == "mobile" {
		response.Token = result.Token
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"user":    currentUser(r),
		"session": currentSession(r),
	})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	session := currentSession(r)
	if session.ID != "" {
		_ = s.auth.Logout(r.Context(), session.ID)
	}
	clearAuthCookies(w, s.auth.SecureCookies())
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func setAuthCookies(w http.ResponseWriter, token, csrf string, secure bool) {
	maxAge := int((30 * 24 * time.Hour).Seconds())
	sameSite := http.SameSiteStrictMode
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: secure, SameSite: sameSite,
	})
	http.SetCookie(w, &http.Cookie{
		Name: csrfCookie, Value: csrf, Path: "/", MaxAge: maxAge,
		HttpOnly: false, Secure: secure, SameSite: sameSite,
	})
}

func clearAuthCookies(w http.ResponseWriter, secure bool) {
	for _, name := range []string{sessionCookie, csrfCookie} {
		http.SetCookie(w, &http.Cookie{
			Name: name, Value: "", Path: "/", MaxAge: -1,
			HttpOnly: name == sessionCookie, Secure: secure, SameSite: http.SameSiteStrictMode,
		})
	}
}
