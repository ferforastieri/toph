package workspace

import (
	"context"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Repo is a Git repository discovered inside one of the configured roots.
type Repo struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Root     string `json:"root"`
	Relative string `json:"relative"`
}

// FindRepos walks the configured roots looking for Git repositories. It never
// follows symlinks and skips dependency/build directories.
func (s *Service) FindRepos(ctx context.Context, query string, limit int) ([]Repo, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	needle := strings.ToLower(strings.TrimSpace(query))
	seen := map[string]bool{}
	repos := make([]Repo, 0)
	roots := s.Roots()

	for _, root := range roots {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		_ = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if err := ctx.Err(); err != nil {
				return err
			}
			if !entry.IsDir() {
				return nil
			}
			if path != root && ignoredDirs[entry.Name()] {
				return filepath.SkipDir
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return nil
			}
			if rel != "." && strings.Count(rel, string(os.PathSeparator)) >= 6 {
				return filepath.SkipDir
			}
			if path == root {
				return nil
			}
			if _, err := os.Stat(filepath.Join(path, ".git")); err != nil {
				return nil
			}
			if seen[path] {
				return filepath.SkipDir
			}
			name := filepath.Base(path)
			display := filepath.ToSlash(rel)
			haystack := strings.ToLower(name + " " + display + " " + path)
			if needle == "" || strings.Contains(haystack, needle) {
				seen[path] = true
				repos = append(repos, Repo{
					Name:     name,
					Path:     path,
					Root:     root,
					Relative: display,
				})
			}
			return filepath.SkipDir
		})
	}

	sort.Slice(repos, func(i, j int) bool {
		if repos[i].Relative == repos[j].Relative {
			return repos[i].Path < repos[j].Path
		}
		return repos[i].Relative < repos[j].Relative
	})
	if len(repos) > limit {
		repos = repos[:limit]
	}
	return repos, nil
}
