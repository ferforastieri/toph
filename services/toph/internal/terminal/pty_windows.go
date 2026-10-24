//go:build windows

package terminal

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"

	"github.com/charmbracelet/x/conpty"
	"golang.org/x/sys/windows"
)

func defaultShell() string {
	systemRoot := os.Getenv("SystemRoot")
	if systemRoot == "" {
		systemRoot = `C:\Windows`
	}
	return filepath.Join(systemRoot, "System32", "cmd.exe")
}

func shellArgs(string) []string { return nil }

type windowsPTY struct {
	pty    *conpty.ConPty
	handle windows.Handle
	pid    int
	once   sync.Once
}

func startPTY(shell string, args []string, dir string, env []string, cols, rows uint16) (terminalPTY, error) {
	cp, err := conpty.New(int(cols), int(rows), 0)
	if err != nil {
		return nil, fmt.Errorf("create conpty: %w", err)
	}
	pid, handle, err := cp.Spawn(shell, args, &syscall.ProcAttr{Dir: dir, Env: env})
	if err != nil {
		_ = cp.Close()
		return nil, fmt.Errorf("spawn shell: %w", err)
	}
	return &windowsPTY{pty: cp, handle: windows.Handle(handle), pid: pid}, nil
}

func (p *windowsPTY) Read(data []byte) (int, error)  { return p.pty.Read(data) }
func (p *windowsPTY) Write(data []byte) (int, error) { return p.pty.Write(data) }
func (p *windowsPTY) Close() error                   { return p.pty.Close() }
func (p *windowsPTY) Resize(cols, rows uint16) error {
	return p.pty.Resize(int(cols), int(rows))
}
func (p *windowsPTY) Kill() {
	p.once.Do(func() {
		// taskkill /T also terminates child processes started from the shell.
		_ = exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(p.pid)).Run()
		_ = windows.TerminateProcess(p.handle, 1)
		_ = windows.CloseHandle(p.handle)
		_ = p.pty.Close()
	})
}
