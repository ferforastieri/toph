package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Config is the runtime configuration for a Toph installation.
type Config struct {
	Addr            string
	DataDir         string
	WorkspaceRoots  []string
	AdminPassword   string
	SecureCookies   bool
	TrustedProxies  []netip.Prefix
	OpenCodeURL     string
	OpenCodeAuth    string
	WebDir          string
	FirebaseFile    string
	FirebaseProject string
	MasterKeyFile   string
	BuildID         string
	UpdateRepo      string
	UpdateHelper    string
	UpdatePathUnit  string
	UpdateRequest   string
	UpdateState     string
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
		Addr:            env("TOPH_ADDR", "127.0.0.1:8787"),
		DataDir:         absData,
		WorkspaceRoots:  roots,
		AdminPassword:   os.Getenv("TOPH_ADMIN_PASSWORD"),
		SecureCookies:   envBool("TOPH_SECURE_COOKIES", false),
		TrustedProxies:  trustedProxies(),
		OpenCodeURL:     strings.TrimRight(env("TOPH_OPENCODE_URL", "http://127.0.0.1:3005"), "/"),
		OpenCodeAuth:    os.Getenv("TOPH_OPENCODE_AUTH"),
		WebDir:          os.Getenv("TOPH_WEB_DIR"),
		FirebaseFile:    os.Getenv("TOPH_FIREBASE_CREDENTIALS_FILE"),
		FirebaseProject: os.Getenv("TOPH_FIREBASE_PROJECT_ID"),
		MasterKeyFile:   filepath.Join(absData, "master.key"),
		BuildID:         buildID(),
		UpdateRepo:      env("TOPH_UPDATE_REPO", "ferforastieri/toph"),
		UpdateHelper:    env("TOPH_UPDATE_HELPER", "/usr/local/lib/toph/update.sh"),
		UpdatePathUnit:  env("TOPH_UPDATE_PATH_UNIT", "/etc/systemd/system/toph-update.path"),
		UpdateRequest:   filepath.Join(absData, "update.request"),
		UpdateState:     filepath.Join(absData, "update-state.json"),
	}
	return cfg, nil
}

func buildID() string {
	if value := strings.TrimSpace(os.Getenv("TOPH_BUILD_ID")); value != "" {
		return value
	}
	return fmt.Sprintf("dev-%d", time.Now().UnixNano())
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

func trustedProxies() []netip.Prefix {
	raw := strings.TrimSpace(os.Getenv("TOPH_TRUSTED_PROXIES"))
	if raw == "" {
		return nil
	}
	var prefixes []netip.Prefix
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if strings.Contains(part, "/") {
			prefix, err := netip.ParsePrefix(part)
			if err == nil {
				prefixes = append(prefixes, prefix.Masked())
			}
			continue
		}
		if addr, err := netip.ParseAddr(part); err == nil {
			prefixes = append(prefixes, netip.PrefixFrom(addr, addr.BitLen()))
		}
	}
	return prefixes
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
