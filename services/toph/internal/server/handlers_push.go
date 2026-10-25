package server

import (
	"net/http"
	"strings"
)

type pushTokenRequest struct {
	Token    string `json:"token"`
	Platform string `json:"platform"`
}

func (s *Server) registerPushToken(w http.ResponseWriter, r *http.Request) {
	var input pushTokenRequest
	if !decodeJSON(w, r, &input) {
		return
	}
	token := strings.TrimSpace(input.Token)
	if token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}
	platform := strings.TrimSpace(input.Platform)
	if platform == "" {
		platform = "android"
	}
	if err := s.push.Register(r.Context(), token, platform); err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "registered"})
}
