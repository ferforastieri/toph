package server

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ferforastieri/toph/internal/store"
)

type projectRequest struct {
	Name  string `json:"name"`
	Root  string `json:"root"`
	Color string `json:"color"`
}

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.store.ListProjects(r.Context())
	if err != nil {
		apiError(w, err)
		return
	}
	if projects == nil {
		projects = []store.Project{}
	}
	writeJSON(w, http.StatusOK, projects)
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	var req projectRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	root, err := s.workspace.ValidateRoot(req.Root)
	if err != nil {
		apiError(w, err)
		return
	}
	project, err := s.store.CreateProject(r.Context(), store.Project{
		ID: newID(), Name: req.Name, Root: root, Color: req.Color,
	})
	if err != nil {
		apiError(w, err)
		return
	}
	s.watcher.Watch(project)
	writeJSON(w, http.StatusCreated, project)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, currentProject(r))
}

func (s *Server) updateProject(w http.ResponseWriter, r *http.Request) {
	var req projectRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	project := currentProject(r)
	previousRoot := project.Root
	if req.Root != "" && req.Root != project.Root {
		root, err := s.workspace.ValidateRoot(req.Root)
		if err != nil {
			apiError(w, err)
			return
		}
		project.Root = root
	}
	if req.Name != "" {
		project.Name = req.Name
	}
	if req.Color != "" {
		project.Color = req.Color
	}
	updated, err := s.store.UpdateProject(r.Context(), project)
	if err != nil {
		apiError(w, err)
		return
	}
	if updated.Root != previousRoot {
		s.watcher.Unwatch(project.ID)
		s.watcher.Watch(updated)
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if err := s.store.DeleteProject(r.Context(), projectID); err != nil {
		apiError(w, err)
		return
	}
	s.watcher.Unwatch(projectID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) getWorkspace(w http.ResponseWriter, r *http.Request) {
	project := currentProject(r)
	layout, err := s.store.WorkspaceLayout(r.Context(), currentUser(r).ID, project.ID)
	if err != nil {
		apiError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write([]byte(layout))
}

func (s *Server) saveWorkspace(w http.ResponseWriter, r *http.Request) {
	var layout json.RawMessage
	if !decodeJSON(w, r, &layout) {
		return
	}
	if len(layout) == 0 {
		layout = json.RawMessage("{}")
	}
	if !json.Valid(layout) {
		writeError(w, http.StatusBadRequest, "invalid layout")
		return
	}
	if err := s.store.SaveWorkspaceLayout(r.Context(), currentUser(r).ID, currentProject(r).ID, string(layout)); err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
