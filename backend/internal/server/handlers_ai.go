package server

import (
	"net/http"

	"github.com/ferforastieri/toph/internal/ai"
)

type chatRequest struct {
	Messages []ai.Message `json:"messages"`
}

func (s *Server) getAIConfig(w http.ResponseWriter, r *http.Request) {
	config, err := s.ai.Public(r.Context())
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, config)
}

func (s *Server) saveAIConfig(w http.ResponseWriter, r *http.Request) {
	var input ai.Input
	if !decodeJSON(w, r, &input) {
		return
	}
	config, err := s.ai.Save(r.Context(), input)
	if err != nil {
		apiError(w, err)
		return
	}
	if config.Provider == "opencode" && config.BaseURL != "" {
		raw, err := s.ai.Load(r.Context())
		if err == nil {
			if err := s.opencode.SetConfig(raw.BaseURL, raw.APIKey); err != nil {
				apiError(w, err)
				return
			}
		}
	}
	writeJSON(w, http.StatusOK, config)
}

func (s *Server) testAI(w http.ResponseWriter, r *http.Request) {
	if err := s.ai.Test(r.Context()); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) chatAI(w http.ResponseWriter, r *http.Request) {
	var request chatRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	text, err := s.ai.Chat(r.Context(), request.Messages)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"text": text})
}

func (s *Server) completeAI(w http.ResponseWriter, r *http.Request) {
	var input ai.CompleteInput
	if !decodeJSON(w, r, &input) {
		return
	}
	if len(input.Prefix) > 12000 || len(input.Suffix) > 4000 {
		writeError(w, http.StatusRequestEntityTooLarge, "context too large")
		return
	}
	completion, err := s.ai.Complete(r.Context(), input)
	if err != nil {
		apiError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"completion": completion})
}
