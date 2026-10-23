package server

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/ferforastieri/toph/internal/workspace"
)

const workspaceRootsSetting = "workspace_roots"

type workspaceRootRequest struct {
	Path string `json:"path"`
}

func (s *Server) LoadWorkspaceRoots(ctx context.Context) error {
	raw, err := s.store.Setting(ctx, workspaceRootsSetting)
	if err != nil {
		return nil
	}
	var roots []string
	if json.Unmarshal([]byte(raw), &roots) != nil || len(roots) == 0 {
		return nil
	}
	return s.workspace.SetRoots(roots)
}

func (s *Server) listRepos(w http.ResponseWriter, r *http.Request) {
	repos, err := s.workspace.FindRepos(r.Context(), r.URL.Query().Get("q"), 50)
	if err != nil {
		apiError(w, err)
		return
	}
	if repos == nil {
		repos = []workspace.Repo{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"repos": repos})
}

func (s *Server) listWorkspaceRoots(w http.ResponseWriter, r *http.Request) {
	roots := s.workspace.Roots()
	if roots == nil {
		roots = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"roots": roots})
}

func (s *Server) addWorkspaceRoot(w http.ResponseWriter, r *http.Request) {
	var req workspaceRootRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if _, err := s.workspace.AddRoot(req.Path); err != nil {
		apiError(w, err)
		return
	}
	if err := s.persistWorkspaceRoots(r); err != nil {
		apiError(w, err)
		return
	}
	s.listWorkspaceRoots(w, r)
}

func (s *Server) removeWorkspaceRoot(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	if err := s.workspace.RemoveRoot(path); err != nil {
		apiError(w, err)
		return
	}
	if err := s.persistWorkspaceRoots(r); err != nil {
		apiError(w, err)
		return
	}
	s.listWorkspaceRoots(w, r)
}

func (s *Server) persistWorkspaceRoots(r *http.Request) error {
	raw, err := json.Marshal(s.workspace.Roots())
	if err != nil {
		return err
	}
	return s.store.SetSetting(r.Context(), workspaceRootsSetting, string(raw))
}
