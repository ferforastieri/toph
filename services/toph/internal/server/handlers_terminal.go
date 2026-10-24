package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) createTerminal(w http.ResponseWriter, r *http.Request) {
	project := currentProject(r)
	session, err := s.terminals.Create(project.ID, project.Root)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{
		"id": session.ID, "projectId": project.ID,
	})
}

func (s *Server) closeProjectTerminals(w http.ResponseWriter, r *http.Request) {
	project := currentProject(r)
	closed := s.terminals.CloseProject(project.ID)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "closed": closed})
}

func (s *Server) terminalWS(w http.ResponseWriter, r *http.Request) {
	session, ok := s.terminals.Get(chi.URLParam(r, "terminalID"))
	if !ok {
		writeError(w, http.StatusNotFound, "terminal not found")
		return
	}
	if err := session.Serve(w, r); err != nil {
		// The WebSocket may already be closed; do not try to write JSON here.
		return
	}
}
