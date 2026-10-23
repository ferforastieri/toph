package terminal

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/coder/websocket"
	"github.com/creack/pty"
)

const ringSize = 128 << 10

type Manager struct {
	mu       sync.Mutex
	sessions map[string]*Session
	shell    string
}

type Session struct {
	ID        string
	ProjectID string
	cmd       *exec.Cmd
	pty       *os.File

	mu      sync.Mutex
	buffer  []byte
	clients map[chan []byte]struct{}
	closed  bool
	done    chan struct{}
}

type resizeMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

func NewManager(shell string) *Manager {
	if shell == "" {
		shell = os.Getenv("SHELL")
	}
	if shell == "" {
		shell = "/bin/bash"
	}
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/sh"
	}
	return &Manager{sessions: make(map[string]*Session), shell: shell}
}

func (m *Manager) Create(projectID, dir string) (*Session, error) {
	cmd := exec.Command(m.shell, "-l")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")

	file, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}
	if err := pty.Setsize(file, &pty.Winsize{Rows: 24, Cols: 80}); err != nil {
		_ = cmd.Process.Kill()
		file.Close()
		return nil, err
	}

	s := &Session{
		ID:        newID(),
		ProjectID: projectID,
		cmd:       cmd,
		pty:       file,
		clients:   make(map[chan []byte]struct{}),
		done:      make(chan struct{}),
	}
	go s.readLoop()
	go func() {
		<-s.done
		m.mu.Lock()
		delete(m.sessions, s.ID)
		m.mu.Unlock()
	}()

	m.mu.Lock()
	m.sessions[s.ID] = s
	m.mu.Unlock()
	return s, nil
}

func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[id]
	return s, ok
}

func (m *Manager) Close(id string) {
	if s, ok := m.Get(id); ok {
		s.Close()
	}
}

// CloseProject stops every terminal session attached to a project. Killing the
// process group also stops child processes such as dev servers started from the
// terminal.
func (m *Manager) CloseProject(projectID string) int {
	m.mu.Lock()
	sessions := make([]*Session, 0)
	for _, s := range m.sessions {
		if s.ProjectID == projectID {
			sessions = append(sessions, s)
		}
	}
	m.mu.Unlock()
	for _, s := range sessions {
		s.Close()
	}
	return len(sessions)
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.mu.Unlock()
	for _, s := range sessions {
		s.Close()
	}
}

func (s *Session) readLoop() {
	defer close(s.done)
	buf := make([]byte, 32<<10)
	for {
		n, err := s.pty.Read(buf)
		if n > 0 {
			s.broadcast(buf[:n])
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				// The process exited or the PTY was closed.
			}
			s.markClosed()
			return
		}
	}
}

func (s *Session) broadcast(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.buffer = append(s.buffer, data...)
	if len(s.buffer) > ringSize {
		s.buffer = append([]byte(nil), s.buffer[len(s.buffer)-ringSize:]...)
	}
	for ch := range s.clients {
		select {
		case ch <- append([]byte(nil), data...):
		default:
		}
	}
}

func (s *Session) closeClientsLocked() {
	for ch := range s.clients {
		close(ch)
		delete(s.clients, ch)
	}
}

func (s *Session) markClosed() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return
	}
	s.closed = true
	s.closeClientsLocked()
}

func (s *Session) Subscribe() ([]byte, chan []byte, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	initial := append([]byte(nil), s.buffer...)
	ch := make(chan []byte, 64)
	if !s.closed {
		s.clients[ch] = struct{}{}
	}
	unsubscribe := func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if _, ok := s.clients[ch]; ok {
			delete(s.clients, ch)
			close(ch)
		}
	}
	return initial, ch, unsubscribe
}

func (s *Session) Write(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	_, err := s.pty.Write(data)
	return err
}

func (s *Session) Resize(cols, rows uint16) error {
	if cols == 0 || rows == 0 {
		return nil
	}
	return pty.Setsize(s.pty, &pty.Winsize{Cols: cols, Rows: rows})
}

func (s *Session) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.closeClientsLocked()
	s.mu.Unlock()
	if s.cmd.Process != nil {
		// pty.Start makes the shell a session leader. Interactive job control
		// gives foreground jobs their own process group, so kill the whole
		// session rather than only the shell's group.
		killSession(s.cmd.Process.Pid)
		_ = syscall.Kill(-s.cmd.Process.Pid, syscall.SIGKILL)
		_ = s.cmd.Process.Kill()
	}
	_ = s.pty.Close()
	// Do not let a stuck PTY reader hold the HTTP request open forever.
	select {
	case <-s.done:
	case <-time.After(2 * time.Second):
	}
}

// Serve upgrades an HTTP request to a terminal WebSocket. Binary frames are
// terminal input; text frames are JSON control messages such as resize.
func (s *Session) Serve(w http.ResponseWriter, r *http.Request) error {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return err
	}
	defer conn.Close(websocket.StatusNormalClosure, "closed")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	initial, output, unsubscribe := s.Subscribe()
	defer unsubscribe()

	var writeMu sync.Mutex
	write := func(data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.Write(ctx, websocket.MessageBinary, data)
	}
	if len(initial) > 0 {
		if err := write(initial); err != nil {
			return err
		}
	}

	go func() {
		for {
			select {
			case data, ok := <-output:
				if !ok {
					cancel()
					return
				}
				if err := write(data); err != nil {
					cancel()
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	for {
		typ, data, err := conn.Read(ctx)
		if err != nil {
			return nil
		}
		switch typ {
		case websocket.MessageBinary:
			if err := s.Write(data); err != nil {
				return err
			}
		case websocket.MessageText:
			var msg resizeMessage
			if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "resize" {
				_ = s.Resize(msg.Cols, msg.Rows)
			}
		}
	}
}

func killSession(sessionID int) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return
	}
	for _, entry := range entries {
		pid, err := strconv.Atoi(entry.Name())
		if err != nil || pid <= 1 {
			continue
		}
		data, err := os.ReadFile("/proc/" + entry.Name() + "/stat")
		if err != nil {
			continue
		}
		text := string(data)
		end := strings.LastIndex(text, ")")
		if end < 0 {
			continue
		}
		fields := strings.Fields(text[end+1:])
		if len(fields) < 4 {
			continue
		}
		sid, err := strconv.Atoi(fields[3])
		if err != nil {
			continue
		}
		if sid == sessionID {
			_ = syscall.Kill(pid, syscall.SIGKILL)
		}
	}
}

func newID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "terminal"
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}
