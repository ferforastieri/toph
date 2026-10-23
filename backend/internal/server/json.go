package server

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/ferforastieri/toph/internal/database"
	"github.com/ferforastieri/toph/internal/store"
	"github.com/ferforastieri/toph/internal/workspace"
)

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, value any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 8<<20)
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(value); err != nil {
		if errors.Is(err, io.EOF) {
			writeError(w, http.StatusBadRequest, "empty body")
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

func apiError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound), errors.Is(err, database.ErrProfileNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, store.ErrConflict):
		writeError(w, http.StatusConflict, "already exists")
	case errors.Is(err, workspace.ErrForbidden):
		writeError(w, http.StatusForbidden, "path outside project")
	case errors.Is(err, workspace.ErrConflict):
		writeError(w, http.StatusConflict, "file changed on disk")
	case errors.Is(err, workspace.ErrTooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "file too large")
	case errors.Is(err, workspace.ErrBinary):
		writeError(w, http.StatusUnsupportedMediaType, "binary file")
	case errors.Is(err, database.ErrUnsupportedDriver):
		writeError(w, http.StatusBadRequest, "unsupported database driver")
	default:
		writeError(w, http.StatusBadRequest, err.Error())
	}
}

func newID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}
