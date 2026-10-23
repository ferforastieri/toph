package terminal

import (
	"strings"
	"testing"
	"time"
)

func TestPTYRoundTrip(t *testing.T) {
	manager := NewManager("/bin/sh")
	session, err := manager.Create("project", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()

	_, output, unsubscribe := session.Subscribe()
	defer unsubscribe()

	if err := session.Write([]byte("printf 'toph-ok\\n'\n")); err != nil {
		t.Fatal(err)
	}

	deadline := time.After(3 * time.Second)
	var seen strings.Builder
	for {
		select {
		case data, ok := <-output:
			if !ok {
				t.Fatalf("terminal closed before output; seen %q", seen.String())
			}
			seen.Write(data)
			if strings.Contains(seen.String(), "toph-ok") {
				return
			}
		case <-deadline:
			t.Fatalf("timed out waiting for output; seen %q", seen.String())
		}
	}
}

func TestResize(t *testing.T) {
	manager := NewManager("/bin/sh")
	session, err := manager.Create("project", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	if err := session.Resize(120, 40); err != nil {
		t.Fatal(err)
	}
}
