package workspace

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type GitBlameLine struct {
	Line       int    `json:"line"`
	Commit     string `json:"commit"`
	Author     string `json:"author"`
	AuthorTime string `json:"authorTime"`
	Summary    string `json:"summary"`
}

func (s *Service) gitPath(root, rel string, mustExist bool) (string, error) {
	if filepath.IsAbs(rel) {
		return "", ErrForbidden
	}
	cleaned := filepath.Clean(rel)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(os.PathSeparator)) {
		return "", ErrForbidden
	}
	if mustExist {
		if _, err := os.Stat(filepath.Join(root, cleaned)); err != nil {
			return "", err
		}
	}
	return filepath.ToSlash(cleaned), nil
}

func (s *Service) GitStage(ctx context.Context, root string, paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no paths provided")
	}
	args := []string{"-C", root, "add", "--"}
	for _, path := range paths {
		rel, err := s.gitPath(root, path, false)
		if err != nil {
			return err
		}
		args = append(args, rel)
	}
	return runGit(ctx, args...)
}

func (s *Service) GitUnstage(ctx context.Context, root string, paths []string) error {
	if len(paths) == 0 {
		return fmt.Errorf("no paths provided")
	}
	args := []string{"-C", root, "reset", "HEAD", "--"}
	for _, path := range paths {
		rel, err := s.gitPath(root, path, false)
		if err != nil {
			return err
		}
		args = append(args, rel)
	}
	return runGit(ctx, args...)
}

func (s *Service) GitCommit(ctx context.Context, root, message string) (string, error) {
	message = strings.TrimSpace(message)
	if message == "" {
		return "", fmt.Errorf("commit message is required")
	}
	cmd := exec.CommandContext(ctx, "git", "-C", root, "commit", "-m", message)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func (s *Service) GitDiff(ctx context.Context, root, path string, staged bool) (string, error) {
	rel, err := s.gitPath(root, path, false)
	if err != nil {
		return "", err
	}
	args := []string{"-C", root, "diff", "--no-color"}
	if staged {
		args = append(args, "--cached")
	}
	args = append(args, "--", rel)
	cmd := exec.CommandContext(ctx, "git", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		var exit *exec.ExitError
		if !errors.As(err, &exit) || exit.ExitCode() != 1 {
			return "", fmt.Errorf("%s", strings.TrimSpace(string(out)))
		}
	}
	if len(out) == 0 && !staged {
		// Untracked files have no normal diff. Show their content instead.
		data, readErr := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
		if readErr == nil {
			return "--- /dev/null\n+++ b/" + rel + "\n" + string(data), nil
		}
	}
	return string(out), nil
}

func (s *Service) GitBlame(ctx context.Context, root, path string) ([]GitBlameLine, error) {
	rel, err := s.gitPath(root, path, true)
	if err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, "git", "-C", root, "blame", "--line-porcelain", "--", rel)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	lines := make([]GitBlameLine, 0)
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	var current GitBlameLine
	var lineNo int
	for scanner.Scan() {
		text := scanner.Text()
		if strings.HasPrefix(text, "\t") {
			current.Line = lineNo
			if current.Author == "" {
				current.Author = "Unknown"
			}
			lines = append(lines, current)
			continue
		}
		fields := strings.Fields(text)
		if len(fields) >= 3 && len(fields[0]) >= 7 && isHex(fields[0]) {
			current = GitBlameLine{Commit: fields[0]}
			lineNo, _ = strconv.Atoi(fields[2])
			continue
		}
		switch {
		case strings.HasPrefix(text, "author "):
			current.Author = strings.TrimPrefix(text, "author ")
		case strings.HasPrefix(text, "author-time "):
			seconds, _ := strconv.ParseInt(strings.TrimPrefix(text, "author-time "), 10, 64)
			if seconds > 0 {
				current.AuthorTime = time.Unix(seconds, 0).UTC().Format(time.RFC3339)
			}
		case strings.HasPrefix(text, "summary "):
			current.Summary = strings.TrimPrefix(text, "summary ")
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return lines, nil
}

func runGit(ctx context.Context, args ...string) error {
	cmd := exec.CommandContext(ctx, "git", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return nil
}

func isHex(value string) bool {
	for _, char := range value {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f')) {
			return false
		}
	}
	return true
}

// GitFileVersions returns the two sides of a source-control diff. For staged
// changes the original is HEAD and the modified side is the index. For working
// tree changes the original is the index (or empty for an untracked file) and
// the modified side is the file on disk.
func (s *Service) GitFileVersions(ctx context.Context, root, path string, staged bool) (string, string, error) {
	rel, err := s.gitPath(root, path, false)
	if err != nil {
		return "", "", err
	}
	original := ""
	if staged {
		original = gitShow(ctx, root, "HEAD:"+rel)
	} else {
		original = gitShow(ctx, root, ":"+rel)
	}
	modified := ""
	if staged {
		modified = gitShow(ctx, root, ":"+rel)
	} else {
		data, readErr := os.ReadFile(filepath.Join(root, filepath.FromSlash(rel)))
		if readErr == nil {
			modified = string(data)
		}
	}
	return original, modified, nil
}

func gitShow(ctx context.Context, root, spec string) string {
	out, err := exec.CommandContext(ctx, "git", "-C", root, "show", spec).Output()
	if err != nil {
		return ""
	}
	return string(out)
}

func (s *Service) GitCreateBranch(ctx context.Context, root, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", fmt.Errorf("branch name is required")
	}
	check := exec.CommandContext(ctx, "git", "-C", root, "check-ref-format", "--branch", name)
	if out, err := check.CombinedOutput(); err != nil {
		return "", fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	cmd := exec.CommandContext(ctx, "git", "-C", root, "switch", "-c", name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("%s", strings.TrimSpace(string(out)))
	}
	return name, nil
}

func (s *Service) GitDiscard(ctx context.Context, root string, paths []string, staged bool) error {
	if len(paths) == 0 {
		return fmt.Errorf("no paths provided")
	}
	for _, path := range paths {
		rel, err := s.gitPath(root, path, false)
		if err != nil {
			return err
		}
		tracked := exec.CommandContext(ctx, "git", "-C", root, "ls-files", "--error-unmatch", "--", rel).Run() == nil
		if !tracked {
			if err := os.RemoveAll(filepath.Join(root, filepath.FromSlash(rel))); err != nil {
				return err
			}
			continue
		}
		args := []string{"-C", root, "restore"}
		if staged {
			args = append(args, "--staged", "--worktree")
		} else {
			args = append(args, "--worktree")
		}
		args = append(args, "--", rel)
		cmd := exec.CommandContext(ctx, "git", args...)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("%s", strings.TrimSpace(string(out)))
		}
	}
	return nil
}
