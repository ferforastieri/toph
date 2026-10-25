package opencode

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestMonitorNotifiesOnIdle(t *testing.T) {
	events := make(chan struct{}, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/event" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher, _ := w.(http.Flusher)
		_, _ = fmt.Fprint(w, "data: {\"type\":\"session.execution.started\"}\n\n")
		flusher.Flush()
		_, _ = fmt.Fprint(w, "data: {\"type\":\"session.idle\"}\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))
	defer server.Close()

	proxy, err := New("http://127.0.0.1:1", "")
	if err != nil {
		t.Fatal(err)
	}
	defer proxy.SetIdleHandler(nil)
	proxy.SetIdleHandler(func() {
		select {
		case events <- struct{}{}:
		default:
		}
	})
	if err := proxy.SetConfig(server.URL, "Bearer test"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-events:
	case <-time.After(3 * time.Second):
		t.Fatal("expected an idle notification")
	}
}
