package server

import (
	"net/http"
	"net/url"

	"github.com/go-chi/chi/v5"

	"github.com/ferforastieri/toph/internal/store"
)

type webTargetRequest struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Icon string `json:"icon"`
}

func (s *Server) listWebTargets(w http.ResponseWriter, r *http.Request) {
	targets, err := s.store.ListWebTargets(r.Context())
	if err != nil {
		apiError(w, err)
		return
	}
	if targets == nil {
		targets = []store.WebTarget{}
	}
	writeJSON(w, http.StatusOK, targets)
}

func (s *Server) createWebTarget(w http.ResponseWriter, r *http.Request) {
	var req webTargetRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	parsed, err := url.Parse(req.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		writeError(w, http.StatusBadRequest, "url must be http or https")
		return
	}
	target, err := s.store.CreateWebTarget(r.Context(), store.WebTarget{
		ID: newID(), Name: req.Name, URL: parsed.String(), Icon: req.Icon,
	})
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, target)
}

func (s *Server) deleteWebTarget(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteWebTarget(r.Context(), chi.URLParam(r, "targetID")); err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
