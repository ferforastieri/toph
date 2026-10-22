package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/ferforastieri/toph/internal/database"
	"github.com/ferforastieri/toph/internal/store"
)

type queryRequest struct {
	SQL     string `json:"sql"`
	MaxRows int    `json:"maxRows"`
}

func (s *Server) listDBProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := s.store.ListDBProfiles(r.Context())
	if err != nil {
		apiError(w, err)
		return
	}
	if profiles == nil {
		profiles = []store.DBProfile{}
	}
	writeJSON(w, http.StatusOK, profiles)
}

func (s *Server) createDBProfile(w http.ResponseWriter, r *http.Request) {
	var req database.ProfileInput
	if !decodeJSON(w, r, &req) {
		return
	}
	profile, err := s.db.Create(r.Context(), req)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, profile)
}

func (s *Server) deleteDBProfile(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Delete(r.Context(), chi.URLParam(r, "profileID")); err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) testDBProfile(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Test(r.Context(), chi.URLParam(r, "profileID")); err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) queryDB(w http.ResponseWriter, r *http.Request) {
	var req queryRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	result, err := s.db.Query(r.Context(), chi.URLParam(r, "profileID"), req.SQL, req.MaxRows)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) insertDBRow(w http.ResponseWriter, r *http.Request) {
	var change database.RowChange
	if !decodeJSON(w, r, &change) {
		return
	}
	affected, err := s.db.InsertRow(r.Context(), chi.URLParam(r, "profileID"), change)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"rowsAffected": affected})
}

func (s *Server) updateDBRow(w http.ResponseWriter, r *http.Request) {
	var change database.RowChange
	if !decodeJSON(w, r, &change) {
		return
	}
	affected, err := s.db.UpdateRow(r.Context(), chi.URLParam(r, "profileID"), change)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"rowsAffected": affected})
}

func (s *Server) deleteDBRow(w http.ResponseWriter, r *http.Request) {
	var change database.RowChange
	if !decodeJSON(w, r, &change) {
		return
	}
	affected, err := s.db.DeleteRow(r.Context(), chi.URLParam(r, "profileID"), change)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"rowsAffected": affected})
}

func (s *Server) dbSchema(w http.ResponseWriter, r *http.Request) {
	tables, err := s.db.Schema(r.Context(), chi.URLParam(r, "profileID"))
	if err != nil {
		apiError(w, err)
		return
	}
	if tables == nil {
		tables = []database.Table{}
	}
	writeJSON(w, http.StatusOK, tables)
}
