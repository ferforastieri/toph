package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/ferforastieri/toph/internal/auth"
	"github.com/ferforastieri/toph/internal/config"
	"github.com/ferforastieri/toph/internal/database"
	"github.com/ferforastieri/toph/internal/opencode"
	"github.com/ferforastieri/toph/internal/server"
	"github.com/ferforastieri/toph/internal/store"
	"github.com/ferforastieri/toph/internal/terminal"
	"github.com/ferforastieri/toph/internal/workspace"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))
	if err := run(); err != nil {
		slog.Error("toph stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	st, err := store.Open(filepath.Join(cfg.DataDir, "toph.db"))
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}
	defer st.Close()

	authManager := auth.New(st, cfg.SecureCookies)
	password, generated, err := authManager.Bootstrap(context.Background(), cfg.AdminPassword)
	if err != nil {
		return fmt.Errorf("bootstrap admin: %w", err)
	}
	if generated {
		fmt.Fprintf(os.Stderr, "\n  Toph initial admin password: %s\n  Set TOPH_ADMIN_PASSWORD before the next start if you want a fixed password.\n\n", password)
	}

	ws, err := workspace.New(cfg.WorkspaceRoots)
	if err != nil {
		return fmt.Errorf("workspace roots: %w", err)
	}
	terminals := terminal.NewManager("")
	defer terminals.CloseAll()

	db, err := database.New(st, cfg.MasterKeyFile)
	if err != nil {
		return fmt.Errorf("database service: %w", err)
	}
	oc, err := opencode.New(cfg.OpenCodeURL, cfg.OpenCodeAuth)
	if err != nil {
		return fmt.Errorf("opencode proxy: %w", err)
	}

	app := server.New(cfg, st, authManager, ws, terminals, db, oc)
	if err := app.EnsureDefaultProject(context.Background()); err != nil {
		slog.Warn("could not seed default project", "error", err)
	}

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           app.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    1 << 20,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		slog.Info("toph listening", "addr", cfg.Addr, "data", cfg.DataDir)
		errCh <- httpServer.ListenAndServe()
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdownCtx)
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
