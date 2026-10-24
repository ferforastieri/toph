//go:build !windows

package terminal

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"

	"github.com/creack/pty"
)

func defaultShell() string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/sh"
	}
	return shell
}

func shellArgs(string) []string { return []string{"-l"} }

type unixPTY struct {
	file *os.File
	cmd  *exec.Cmd
}

func startPTY(shell string, args []string, dir string, env []string, cols, rows uint16) (terminalPTY, error) {
	cmd := exec.Command(shell, args...)
	cmd.Dir = dir
	cmd.Env = env
	file, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, err
	}
	return &unixPTY{file: file, cmd: cmd}, nil
}

func (p *unixPTY) Read(data []byte) (int, error)  { return p.file.Read(data) }
func (p *unixPTY) Write(data []byte) (int, error) { return p.file.Write(data) }
func (p *unixPTY) Close() error                   { return p.file.Close() }
func (p *unixPTY) Resize(cols, rows uint16) error {
	return pty.Setsize(p.file, &pty.Winsize{Cols: cols, Rows: rows})
}
func (p *unixPTY) Kill() {
	if p.cmd.Process != nil {
		// pty.Start makes the shell a session leader. Interactive job control
		// gives foreground jobs their own process group, so kill the whole
		// session rather than only the shell's group.
		killSession(p.cmd.Process.Pid)
		_ = syscall.Kill(-p.cmd.Process.Pid, syscall.SIGKILL)
		_ = p.cmd.Process.Kill()
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
