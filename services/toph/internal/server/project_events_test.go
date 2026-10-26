package server

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestProjectEventsWebSocket(t *testing.T) {
	client, root := newTestServer(t)
	client.login()

	var project struct {
		ID string `json:"id"`
	}
	res := client.request(http.MethodPost, "/api/projects", map[string]string{
		"name": "Events", "root": root,
	}, &project)
	if res.StatusCode != http.StatusCreated || project.ID == "" {
		t.Fatalf("create project: status %d", res.StatusCode)
	}

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(client.base, "http") + "/api/events/ws"
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPClient: client.client})
	if err != nil {
		t.Fatalf("dial events socket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	res = client.request(http.MethodPut, "/api/projects/"+project.ID+"/file", map[string]string{
		"path": "live.txt", "content": "hello\n",
	}, nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("write file: status %d", res.StatusCode)
	}

	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read event: %v", err)
	}
	var event projectEvent
	if err := json.Unmarshal(data, &event); err != nil {
		t.Fatalf("decode event: %v", err)
	}
	if event.Type != "files" || event.ProjectID != project.ID {
		t.Fatalf("unexpected event: %+v", event)
	}
}

func TestProjectFileWatcher(t *testing.T) {
	client, root := newTestServer(t)
	client.login()

	var project struct {
		ID string `json:"id"`
	}
	res := client.request(http.MethodPost, "/api/projects", map[string]string{
		"name": "Watcher", "root": root,
	}, &project)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create project: status %d", res.StatusCode)
	}

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	wsURL := "ws" + strings.TrimPrefix(client.base, "http") + "/api/events/ws"
	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{HTTPClient: client.client})
	if err != nil {
		t.Fatalf("dial events socket: %v", err)
	}
	defer conn.Close(websocket.StatusNormalClosure, "done")

	externalPath := filepath.Join(root, "external.txt")
	if err := os.WriteFile(externalPath, []byte("changed outside the API\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			t.Fatalf("read watcher event: %v", err)
		}
		var event projectEvent
		if err := json.Unmarshal(data, &event); err != nil {
			continue
		}
		if event.Type == "files" && event.ProjectID == project.ID && strings.HasSuffix(event.Path, "external.txt") {
			return
		}
	}
}
