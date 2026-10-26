package server

import (
	"context"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"github.com/ferforastieri/toph/internal/store"
)

var ignoredWatchDirs = map[string]bool{
	".git": true, "node_modules": true, "dist": true, "build": true,
	"target": true, ".cache": true, ".next": true, "coverage": true,
}

type projectWatcher struct {
	hub      *projectEventHub
	mu       sync.Mutex
	watchers map[string]*fsnotify.Watcher
	timers   map[string]*time.Timer
}

func newProjectWatcher(hub *projectEventHub) *projectWatcher {
	return &projectWatcher{
		hub:      hub,
		watchers: make(map[string]*fsnotify.Watcher),
		timers:   make(map[string]*time.Timer),
	}
}

func (w *projectWatcher) Watch(project store.Project) {
	w.mu.Lock()
	if _, exists := w.watchers[project.ID]; exists {
		w.mu.Unlock()
		return
	}
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		w.mu.Unlock()
		slog.Warn("file watcher unavailable", "project", project.ID, "error", err)
		return
	}
	w.watchers[project.ID] = watcher
	w.mu.Unlock()
	// Watch the root synchronously so a file written right after project
	// creation is never missed; the recursive walk continues in the background.
	_ = watcher.Add(project.Root)
	go w.start(project, watcher)
}

func (w *projectWatcher) start(project store.Project, watcher *fsnotify.Watcher) {
	if err := addWatchTree(watcher, project.Root); err != nil {
		slog.Warn("could not watch project", "project", project.ID, "error", err)
	}
	// Work-tree watchers skip .git, but HEAD/index/refs changes still need to
	// update Git status (commits, checkouts and rebases from a terminal).
	gitDir := filepath.Join(project.Root, ".git")
	_ = watcher.Add(gitDir)
	_ = addWatchTree(watcher, filepath.Join(gitDir, "refs"))
	w.run(project.ID, project.Root, watcher)
}

func (w *projectWatcher) Unwatch(projectID string) {
	w.mu.Lock()
	watcher := w.watchers[projectID]
	delete(w.watchers, projectID)
	if timer := w.timers[projectID]; timer != nil {
		timer.Stop()
		delete(w.timers, projectID)
	}
	w.mu.Unlock()
	if watcher != nil {
		_ = watcher.Close()
	}
}

func (w *projectWatcher) run(projectID, root string, watcher *fsnotify.Watcher) {
	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}
			if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
				name := filepath.Base(event.Name)
				if name == ".git" {
					_ = watcher.Add(event.Name)
					_ = addWatchTree(watcher, filepath.Join(event.Name, "refs"))
				} else if !ignoredWatchDirs[name] {
					_ = addWatchTree(watcher, event.Name)
				}
			}
			w.schedule(projectID, root, event.Name)
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			slog.Debug("file watcher error", "project", projectID, "error", err)
		}
	}
}

func (w *projectWatcher) schedule(projectID, root, path string) {
	if relative, err := filepath.Rel(root, path); err == nil {
		path = filepath.ToSlash(relative)
	}
	w.mu.Lock()
	if timer := w.timers[projectID]; timer != nil {
		timer.Stop()
	}
	w.timers[projectID] = time.AfterFunc(250*time.Millisecond, func() {
		w.mu.Lock()
		delete(w.timers, projectID)
		w.mu.Unlock()
		kind := "files"
		if path == ".git" || strings.HasPrefix(path, ".git/") {
			kind = "git"
		}
		w.hub.broadcast(projectEvent{
			Type:      kind,
			ProjectID: projectID,
			Path:      path,
			At:        time.Now().UnixMilli(),
		})
	})
	w.mu.Unlock()
}

func addWatchTree(watcher *fsnotify.Watcher, root string) error {
	return filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !entry.IsDir() {
			return nil
		}
		if path != root && ignoredWatchDirs[entry.Name()] {
			return filepath.SkipDir
		}
		if err := watcher.Add(path); err != nil {
			return nil
		}
		return nil
	})
}

func (s *Server) StartProjectWatchers(ctx context.Context) {
	projects, err := s.store.ListProjects(ctx)
	if err != nil {
		slog.Warn("could not list projects for file watching", "error", err)
		return
	}
	for _, project := range projects {
		s.watcher.Watch(project)
	}
}
