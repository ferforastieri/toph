package opencode

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// restartMonitor replaces the background event listener whenever the OpenCode
// connection changes. The listener is intentionally best-effort; a disconnected
// OpenCode instance must never affect the rest of Toph.
func (p *Proxy) restartMonitor() {
	p.monitorMu.Lock()
	if p.monitorStop != nil {
		p.monitorStop()
		p.monitorStop = nil
	}
	enabled := p.onIdle != nil
	p.monitorMu.Unlock()
	if !enabled {
		return
	}

	base, auth := p.config()
	if base == "" {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	p.monitorMu.Lock()
	p.monitorStop = cancel
	p.monitorMu.Unlock()
	go p.monitorLoop(ctx, base, auth)
}

func (p *Proxy) monitorLoop(ctx context.Context, base, auth string) {
	client := &http.Client{}
	for {
		if ctx.Err() != nil {
			return
		}
		if err := p.consumeEvents(ctx, client, base, auth); err != nil && !errors.Is(err, context.Canceled) {
			slog.Debug("opencode event monitor disconnected", "error", err)
		}
		timer := time.NewTimer(5 * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (p *Proxy) consumeEvents(ctx context.Context, client *http.Client, base, auth string) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/api/event", nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "text/event-stream")
	if auth != "" {
		request.Header.Set("Authorization", auth)
	}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 512))
		return errors.New("opencode events returned " + response.Status + ": " + strings.TrimSpace(string(body)))
	}

	var busy bool
	var lastIdleNotification time.Time
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 4096), 2<<20)
	var dataLines []string
	flush := func() {
		if len(dataLines) == 0 {
			return
		}
		raw := strings.Join(dataLines, "\n")
		dataLines = nil
		var event struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if json.Unmarshal([]byte(raw), &event) != nil || event.Type == "" {
			return
		}
		switch event.Type {
		case "session.execution.started":
			busy = true
		case "session.status":
			var data struct {
				Status struct {
					Type string `json:"type"`
				} `json:"status"`
			}
			if json.Unmarshal(event.Data, &data) == nil {
				switch data.Status.Type {
				case "busy":
					busy = true
				case "idle":
					if busy {
						busy = false
						if time.Since(lastIdleNotification) > 3*time.Second {
							lastIdleNotification = time.Now()
							p.notifyIdle()
						}
					}
				}
			}
		case "session.execution.succeeded", "session.execution.interrupted", "session.execution.failed", "session.idle":
			if busy {
				busy = false
				if time.Since(lastIdleNotification) > 3*time.Second {
					lastIdleNotification = time.Now()
					p.notifyIdle()
				}
			}
		}
	}

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			flush()
			continue
		}
		if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	flush()
	return scanner.Err()
}

func (p *Proxy) notifyIdle() {
	p.monitorMu.Lock()
	handler := p.onIdle
	p.monitorMu.Unlock()
	if handler != nil {
		handler()
	}
}
