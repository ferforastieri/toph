package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// Config is the runtime configuration for a Toph installation.
type Config struct {
	Addr           string
	DataDir        string
	WorkspaceRoots []string
	AdminPassword  string
	SecureCookies  bool
	OpenCodeURL    string
	OpenCodeAuth   string
	WebDir         string
	MasterKeyFile  string
}

func Load() (Config, error) {
	dataDir := env("TOPH_DATA_DIR", "./data")
	absData, err := filepath.Abs(dataDir)
	if err != nil {
		return Config{}, err
	}
	if err := os.MkdirAll(absData, 0o700); err != nil {
		return Config{}, err
	}

	roots := splitRoots(env("TOPH_WORKSPACES", "/workspaces"))
	if len(roots) == 0 {
		return Config{}, errors.New("TOPH_WORKSPACES must contain at least one directory")
	}

	cfg := Config{
		Addr:           env("TOPH_ADDR", "127.0.0.1:8787"),
		DataDir:        absData,
		WorkspaceRoots: roots,
		AdminPassword:  os.Getenv("TOPH_ADMIN_PASSWORD"),
		SecureCookies:  envBool("TOPH_SECURE_COOKIES", false),
		OpenCodeURL:    strings.TrimRight(env("TOPH_OPENCODE_URL", "http://127.0.0.1:3005"), "/"),
		OpenCodeAuth:   os.Getenv("TOPH_OPENCODE_AUTH"),
		WebDir:         os.Getenv("TOPH_WEB_DIR"),
		MasterKeyFile:  filepath.Join(absData, "master.key"),
	}
	return cfg, nil
}

func splitRoots(raw string) []string {
	var roots []string
	for _, part := range strings.Split(raw, string(os.PathListSeparator)) {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if abs, err := filepath.Abs(part); err == nil {
			roots = append(roots, filepath.Clean(abs))
		}
	}
	return roots
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}
