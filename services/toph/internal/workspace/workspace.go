package workspace

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const maxReadSize = 5 << 20

var (
	ErrForbidden = errors.New("path outside project")
	ErrTooLarge  = errors.New("file too large")
	ErrBinary    = errors.New("binary file")
	ErrConflict  = errors.New("file changed on disk")
)

var ignoredDirs = map[string]bool{
	".git": true, "node_modules": true, ".next": true, "dist": true,
	"build": true, ".cache": true, "vendor": true, ".gradle": true,
	".idea": true, ".vscode": true, "target": true, "bin": true,
}

type Service struct {
	mu    sync.RWMutex
	roots []string
}

type Entry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Dir     bool   `json:"dir"`
	Size    int64  `json:"size"`
	ModTime string `json:"modTime"`
}

type File struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Hash    string `json:"hash"`
	ModTime string `json:"modTime"`
	Size    int64  `json:"size"`
}

type Match struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Column  int    `json:"column"`
	Preview string `json:"preview"`
}

func New(roots []string) (*Service, error) {
	resolved, err := resolveRoots(roots)
	if err != nil {
		return nil, err
	}
	return &Service{roots: resolved}, nil
}

func (s *Service) Roots() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]string(nil), s.roots...)
}

func (s *Service) SetRoots(roots []string) error {
	resolved, err := resolveRoots(roots)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.roots = resolved
	s.mu.Unlock()
	return nil
}

func (s *Service) AddRoot(root string) (string, error) {
	resolved, err := resolveRoot(root)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.roots {
		if existing == resolved {
			return resolved, nil
		}
	}
	s.roots = append(s.roots, resolved)
	return resolved, nil
}

func (s *Service) RemoveRoot(root string) error {
	resolved, err := resolveRoot(root)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, existing := range s.roots {
		if existing == resolved {
			s.roots = append(s.roots[:i], s.roots[i+1:]...)
			return nil
		}
	}
	return ErrForbidden
}

func resolveRoots(roots []string) ([]string, error) {
	resolved := make([]string, 0, len(roots))
	for _, root := range roots {
		real, err := resolveRoot(root)
		if err != nil {
			return nil, err
		}
		resolved = append(resolved, real)
	}
	return resolved, nil
}

func resolveRoot(root string) (string, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", fmt.Errorf("workspace root %q: %w", root, err)
	}
	info, err := os.Stat(real)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("workspace root %q is not a directory", root)
	}
	return filepath.Clean(real), nil
}

func (s *Service) ValidateRoot(root string) (string, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", err
	}
	real = filepath.Clean(real)
	s.mu.RLock()
	roots := append([]string(nil), s.roots...)
	s.mu.RUnlock()
	for _, allowed := range roots {
		if real == allowed || strings.HasPrefix(real, allowed+string(os.PathSeparator)) {
			info, err := os.Stat(real)
			if err != nil {
				return "", err
			}
			if !info.IsDir() {
				return "", fmt.Errorf("%q is not a directory", root)
			}
			return real, nil
		}
	}
	return "", ErrForbidden
}

func (s *Service) List(root, rel string) ([]Entry, error) {
	dir, err := s.resolve(root, rel, true)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(dir)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%q is not a directory", rel)
	}
	items, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(items))
	for _, item := range items {
		if ignoredDirs[item.Name()] {
			continue
		}
		info, err := item.Info()
		if err != nil {
			continue
		}
		entryRel, err := filepath.Rel(root, filepath.Join(dir, item.Name()))
		if err != nil {
			continue
		}
		out = append(out, Entry{
			Name:    item.Name(),
			Path:    filepath.ToSlash(entryRel),
			Dir:     item.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime().UTC().Format(time.RFC3339Nano),
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Dir != out[j].Dir {
			return out[i].Dir
		}
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}

func (s *Service) Read(root, rel string) (File, error) {
	path, err := s.resolve(root, rel, true)
	if err != nil {
		return File{}, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return File{}, err
	}
	if info.IsDir() {
		return File{}, fmt.Errorf("%q is a directory", rel)
	}
	if info.Size() > maxReadSize {
		return File{}, ErrTooLarge
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return File{}, err
	}
	if isBinary(data) {
		return File{}, ErrBinary
	}
	entryRel, _ := filepath.Rel(root, path)
	return File{
		Path:    filepath.ToSlash(entryRel),
		Content: string(data),
		Hash:    hashBytes(data),
		ModTime: info.ModTime().UTC().Format(time.RFC3339Nano),
		Size:    info.Size(),
	}, nil
}

func (s *Service) Write(root, rel, content, baseHash string) (File, error) {
	path, err := s.resolve(root, rel, false)
	if err != nil {
		return File{}, err
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return File{}, fmt.Errorf("%q is a directory", rel)
		}
		if baseHash != "" {
			current, err := os.ReadFile(path)
			if err != nil {
				return File{}, err
			}
			if hashBytes(current) != baseHash {
				return File{}, ErrConflict
			}
		}
	}

	dir := filepath.Dir(path)
	parent, err := s.resolve(root, relDir(root, dir), true)
	if err != nil {
		return File{}, err
	}
	if parent != dir {
		return File{}, ErrForbidden
	}

	mode := os.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	}
	tmp, err := os.CreateTemp(dir, ".toph-*")
	if err != nil {
		return File{}, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return File{}, err
	}
	if err := tmp.Chmod(mode); err != nil {
		tmp.Close()
		return File{}, err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return File{}, err
	}
	if err := tmp.Close(); err != nil {
		return File{}, err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return File{}, err
	}
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return s.Read(root, rel)
}

func (s *Service) Search(ctx context.Context, root, query string, maxResults int) ([]Match, error) {
	if strings.TrimSpace(query) == "" {
		return nil, nil
	}
	if maxResults <= 0 || maxResults > 500 {
		maxResults = 100
	}
	if _, err := exec.LookPath("rg"); err == nil {
		return s.searchRipgrep(ctx, root, query, maxResults)
	}
	return s.searchFallback(ctx, root, query, maxResults)
}

func (s *Service) searchRipgrep(ctx context.Context, root, query string, maxResults int) ([]Match, error) {
	cmd := exec.CommandContext(ctx, "rg", "-n", "--no-heading", "--color", "never",
		"--hidden",
		"--glob", "!.git/**", "--glob", "!**/.git/**",
		"--glob", "!node_modules/**", "--glob", "!**/node_modules/**",
		"--glob", "!dist/**", "--glob", "!**/dist/**",
		"--glob", "!build/**", "--glob", "!**/build/**",
		"--glob", "!target/**", "--glob", "!**/target/**",
		"--max-count", "20", "--", query)
	cmd.Dir = root
	out, err := cmd.Output()
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && exit.ExitCode() == 1 {
			return nil, nil
		}
		return nil, err
	}
	var matches []Match
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() && len(matches) < maxResults {
		line := scanner.Text()
		parts := strings.SplitN(line, ":", 3)
		if len(parts) < 3 {
			continue
		}
		var lineNo int
		fmt.Sscanf(parts[1], "%d", &lineNo)
		matches = append(matches, Match{Path: filepath.ToSlash(parts[0]), Line: lineNo, Preview: strings.TrimSpace(parts[2])})
	}
	return matches, scanner.Err()
}

func (s *Service) searchFallback(ctx context.Context, root, query string, maxResults int) ([]Match, error) {
	needle := strings.ToLower(query)
	var matches []Match
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if d.IsDir() {
			if ignoredDirs[d.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() > 1<<20 {
			return nil
		}
		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		defer file.Close()
		scanner := bufio.NewScanner(file)
		lineNo := 0
		for scanner.Scan() {
			lineNo++
			if strings.Contains(strings.ToLower(scanner.Text()), needle) {
				rel, _ := filepath.Rel(root, path)
				matches = append(matches, Match{
					Path:    filepath.ToSlash(rel),
					Line:    lineNo,
					Preview: strings.TrimSpace(scanner.Text()),
				})
				if len(matches) >= maxResults {
					return io.EOF
				}
			}
		}
		return nil
	})
	if errors.Is(err, io.EOF) {
		err = nil
	}
	return matches, err
}

func (s *Service) GitStatus(ctx context.Context, root string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", "-C", root, "status", "--porcelain=v1", "-b")
	out, err := cmd.Output()
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return "", nil
		}
		return "", nil
	}
	return string(out), nil
}

func (s *Service) resolve(root, rel string, mustExist bool) (string, error) {
	if filepath.IsAbs(rel) {
		return "", ErrForbidden
	}
	rootReal, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	rootReal = filepath.Clean(rootReal)
	cleanRel := filepath.Clean(rel)
	if cleanRel == "." {
		cleanRel = ""
	}
	if cleanRel == ".." || strings.HasPrefix(cleanRel, ".."+string(os.PathSeparator)) {
		return "", ErrForbidden
	}
	path := filepath.Join(rootReal, cleanRel)
	if path != rootReal && !strings.HasPrefix(path, rootReal+string(os.PathSeparator)) {
		return "", ErrForbidden
	}
	if mustExist {
		real, err := filepath.EvalSymlinks(path)
		if err != nil {
			return "", err
		}
		if real != rootReal && !strings.HasPrefix(real, rootReal+string(os.PathSeparator)) {
			return "", ErrForbidden
		}
		return real, nil
	}
	return path, nil
}

func relDir(root, dir string) string {
	rel, err := filepath.Rel(root, dir)
	if err != nil {
		return "."
	}
	return rel
}

func isBinary(data []byte) bool {
	limit := len(data)
	if limit > 8192 {
		limit = 8192
	}
	for _, b := range data[:limit] {
		if b == 0 {
			return true
		}
	}
	return false
}

func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// Files returns project-relative file paths for the quick-open palette.
func (s *Service) Files(ctx context.Context, root, query string, limit int) ([]string, error) {
	if limit <= 0 || limit > 200 {
		limit = 80
	}
	needle := strings.ToLower(strings.TrimSpace(query))
	cmd := exec.CommandContext(ctx, "rg", "--files", "--hidden",
		"--glob", "!.git/**", "--glob", "!**/.git/**",
		"--glob", "!node_modules/**", "--glob", "!**/node_modules/**",
		"--glob", "!dist/**", "--glob", "!**/dist/**",
		"--glob", "!build/**", "--glob", "!**/build/**",
		"--glob", "!target/**", "--glob", "!**/target/**")
	cmd.Dir = root
	out, err := cmd.Output()
	files := make([]string, 0, limit)
	if err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			path := strings.TrimSpace(line)
			if path == "" {
				continue
			}
			if needle != "" && !strings.Contains(strings.ToLower(path), needle) {
				continue
			}
			files = append(files, filepath.ToSlash(path))
			if len(files) >= limit {
				break
			}
		}
	}
	if len(files) > 0 {
		return files, nil
	}
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if entry.IsDir() {
			if path != root && ignoredDirs[entry.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if needle != "" && !strings.Contains(strings.ToLower(rel), needle) {
			return nil
		}
		files = append(files, rel)
		if len(files) >= limit {
			return io.EOF
		}
		return nil
	})
	return files, nil
}
