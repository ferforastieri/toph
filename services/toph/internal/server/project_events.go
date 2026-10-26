package server

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type projectEvent struct {
	Type      string `json:"type"`
	ProjectID string `json:"projectId"`
	Path      string `json:"path,omitempty"`
	At        int64  `json:"at"`
}

type projectEventHub struct {
	mu      sync.Mutex
	clients map[chan projectEvent]struct{}
}

func newProjectEventHub() *projectEventHub {
	return &projectEventHub{clients: make(map[chan projectEvent]struct{})}
}

func (h *projectEventHub) subscribe() (chan projectEvent, func()) {
	channel := make(chan projectEvent, 16)
	h.mu.Lock()
	h.clients[channel] = struct{}{}
	h.mu.Unlock()
	return channel, func() {
		h.mu.Lock()
		delete(h.clients, channel)
		h.mu.Unlock()
	}
}

func (h *projectEventHub) broadcast(event projectEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for channel := range h.clients {
		select {
		case channel <- event:
		default:
		}
	}
}

func (s *Server) publishProject(projectID, kind, path string) {
	if projectID == "" {
		return
	}
	s.events.broadcast(projectEvent{
		Type:      kind,
		ProjectID: projectID,
		Path:      path,
		At:        time.Now().UnixMilli(),
	})
}

func (s *Server) publishGit(projectID, path string) {
	s.publishProject(projectID, "git", path)
	s.publishProject(projectID, "files", path)
}

func (s *Server) publishProjectRoot(ctx context.Context, root, kind, path string) {
	if root == "" {
		return
	}
	project, err := s.store.ProjectByRoot(ctx, root)
	if err == nil {
		s.publishProject(project.ID, kind, path)
		return
	}
	// Older profiles may store a root with a different path spelling.
	projects, listErr := s.store.ListProjects(ctx)
	if listErr != nil {
		return
	}
	for _, candidate := range projects {
		if filepath.Clean(candidate.Root) == filepath.Clean(root) {
			s.publishProject(candidate.ID, kind, path)
			return
		}
	}
}

func (s *Server) projectEventsWS(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close(websocket.StatusNormalClosure, "closed")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	channel, unsubscribe := s.events.subscribe()
	defer unsubscribe()

	// The read loop exists only to notice a closed browser connection.
	go func() {
		for {
			if _, _, err := conn.Read(ctx); err != nil {
				cancel()
				return
			}
		}
	}()

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case event := <-channel:
			payload, err := json.Marshal(event)
			if err != nil {
				continue
			}
			if err := conn.Write(ctx, websocket.MessageText, payload); err != nil {
				return
			}
		case <-heartbeat.C:
			if err := conn.Ping(ctx); err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
