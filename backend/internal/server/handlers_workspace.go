package server

import (
	"net/http"

	"github.com/ferforastieri/toph/internal/workspace"
)

func (s *Server) tree(w http.ResponseWriter, r *http.Request) {
	project := currentProject(r)
	entries, err := s.workspace.List(project.Root, r.URL.Query().Get("path"))
	if err != nil {
		apiError(w, err)
		return
	}
	if entries == nil {
		entries = []workspace.Entry{}
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) readFile(w http.ResponseWriter, r *http.Request) {
	project := currentProject(r)
	file, err := s.workspace.Read(project.Root, r.URL.Query().Get("path"))
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}

type writeFileRequest struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	BaseHash string `json:"baseHash"`
}

func (s *Server) writeFile(w http.ResponseWriter, r *http.Request) {
	var req writeFileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	project := currentProject(r)
	file, err := s.workspace.Write(project.Root, req.Path, req.Content, req.BaseHash)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, file)
}

type searchRequest struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	var req searchRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	project := currentProject(r)
	matches, err := s.workspace.Search(r.Context(), project.Root, req.Query, req.Limit)
	if err != nil {
		apiError(w, err)
		return
	}
	if matches == nil {
		matches = []workspace.Match{}
	}
	writeJSON(w, http.StatusOK, matches)
}

func (s *Server) gitStatus(w http.ResponseWriter, r *http.Request) {
	project := currentProject(r)
	status, err := s.workspace.GitStatus(r.Context(), project.Root)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

type gitPathsRequest struct {
	Paths []string `json:"paths"`
}

type gitCommitRequest struct {
	Message string `json:"message"`
}

func (s *Server) gitStage(w http.ResponseWriter, r *http.Request) {
	var req gitPathsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.workspace.GitStage(r.Context(), currentProject(r).Root, req.Paths); err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) gitUnstage(w http.ResponseWriter, r *http.Request) {
	var req gitPathsRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if err := s.workspace.GitUnstage(r.Context(), currentProject(r).Root, req.Paths); err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) gitCommit(w http.ResponseWriter, r *http.Request) {
	var req gitCommitRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	output, err := s.workspace.GitCommit(r.Context(), currentProject(r).Root, req.Message)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"output": output})
}

func (s *Server) gitDiff(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	staged := r.URL.Query().Get("staged") == "true"
	diff, err := s.workspace.GitDiff(r.Context(), currentProject(r).Root, path, staged)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"diff": diff})
}

func (s *Server) gitBlame(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		writeError(w, http.StatusBadRequest, "path is required")
		return
	}
	lines, err := s.workspace.GitBlame(r.Context(), currentProject(r).Root, path)
	if err != nil {
		apiError(w, err)
		return
	}
	if lines == nil {
		lines = []workspace.GitBlameLine{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"lines": lines})
}
