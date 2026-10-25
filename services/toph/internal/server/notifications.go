package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type notificationEvent struct {
	Type      string `json:"type"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"createdAt"`
}

type notificationHub struct {
	mu      sync.Mutex
	clients map[chan notificationEvent]struct{}
}

func newNotificationHub() *notificationHub {
	return &notificationHub{clients: make(map[chan notificationEvent]struct{})}
}

func (h *notificationHub) subscribe() (chan notificationEvent, func()) {
	channel := make(chan notificationEvent, 8)
	h.mu.Lock()
	h.clients[channel] = struct{}{}
	h.mu.Unlock()
	return channel, func() {
		h.mu.Lock()
		delete(h.clients, channel)
		h.mu.Unlock()
	}
}

func (h *notificationHub) broadcast(event notificationEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for channel := range h.clients {
		select {
		case channel <- event:
		default:
		}
	}
}

func (s *Server) emitAIResponse() {
	event := notificationEvent{
		Type:      "ai.done",
		Title:     "Resposta da IA",
		Body:      "A IA terminou de responder.",
		CreatedAt: time.Now().UnixMilli(),
	}
	s.notifications.broadcast(event)
	if s.push.Enabled() {
		go s.push.NotifyAI(context.Background())
	}
}

func (s *Server) notificationStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is not supported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprint(w, "event: ready\ndata: {}\n\n")
	flusher.Flush()

	channel, unsubscribe := s.notifications.subscribe()
	defer unsubscribe()
	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event := <-channel:
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			_, _ = fmt.Fprintf(w, "event: ai.done\ndata: %s\n\n", payload)
			flusher.Flush()
		case <-heartbeat.C:
			_, _ = fmt.Fprint(w, ": keep-alive\n\n")
			flusher.Flush()
		}
	}
}
