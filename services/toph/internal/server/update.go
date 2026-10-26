package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const updateCacheTTL = 2 * time.Minute

var releaseVersionPattern = regexp.MustCompile(`^v?([0-9]+)\.([0-9]+)\.([0-9]+)$`)

type updateState struct {
	Status    string `json:"status"`
	Version   string `json:"version"`
	UpdatedAt string `json:"updatedAt"`
}

type releaseAsset struct {
	Name   string `json:"name"`
	URL    string `json:"browser_download_url"`
	Size   int64  `json:"size"`
	Digest string `json:"digest"`
}

type updateAsset struct {
	Kind   string `json:"kind"`
	Name   string `json:"name"`
	URL    string `json:"url"`
	SHA256 string `json:"sha256,omitempty"`
	Size   int64  `json:"size,omitempty"`
}

type updateStatusResponse struct {
	CurrentVersion string        `json:"currentVersion"`
	LatestVersion  string        `json:"latestVersion"`
	APKURL         string        `json:"apkUrl,omitempty"`
	Installers     []updateAsset `json:"installers,omitempty"`
	Available      bool          `json:"available"`
	Supported      bool          `json:"supported"`
	Busy           bool          `json:"busy"`
	Error          string        `json:"error,omitempty"`
}

func parseReleaseVersion(value string) ([3]int, bool) {
	match := releaseVersionPattern.FindStringSubmatch(strings.TrimSpace(value))
	if match == nil {
		return [3]int{}, false
	}
	var version [3]int
	for index := range version {
		number, err := strconv.Atoi(match[index+1])
		if err != nil {
			return [3]int{}, false
		}
		version[index] = number
	}
	return version, true
}

func newerRelease(latest, current string) bool {
	next, ok := parseReleaseVersion(latest)
	if !ok {
		return false
	}
	now, ok := parseReleaseVersion(current)
	if !ok {
		return false
	}
	for index := range next {
		if next[index] != now[index] {
			return next[index] > now[index]
		}
	}
	return false
}

func (s *Server) latestRelease(ctx context.Context) (string, error) {
	s.updateMu.Lock()
	defer s.updateMu.Unlock()

	if !s.updateChecked.IsZero() && time.Since(s.updateChecked) < updateCacheTTL {
		if s.updateLatest != "" {
			if s.updateErr != "" {
				return s.updateLatest, errors.New(s.updateErr)
			}
			return s.updateLatest, nil
		}
		if s.updateErr != "" {
			return "", errors.New(s.updateErr)
		}
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", s.cfg.UpdateRepo)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "toph-update-check/"+Version)
	client := &http.Client{Timeout: 8 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		s.updateChecked = time.Now()
		s.updateErr = "Não foi possível consultar as releases do Toph."
		if s.updateLatest != "" {
			return s.updateLatest, errors.New(s.updateErr)
		}
		return "", errors.New(s.updateErr)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		s.updateChecked = time.Now()
		s.updateErr = fmt.Sprintf("GitHub respondeu HTTP %d ao consultar releases.", response.StatusCode)
		if s.updateLatest != "" {
			return s.updateLatest, errors.New(s.updateErr)
		}
		return "", errors.New(s.updateErr)
	}
	var release struct {
		TagName    string         `json:"tag_name"`
		Draft      bool           `json:"draft"`
		Prerelease bool           `json:"prerelease"`
		Assets     []releaseAsset `json:"assets"`
	}
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil {
		s.updateChecked = time.Now()
		s.updateErr = "Resposta inválida ao consultar releases."
		return "", errors.New(s.updateErr)
	}
	if release.Draft || release.Prerelease {
		s.updateChecked = time.Now()
		s.updateErr = "A release mais recente não está publicada."
		return "", errors.New(s.updateErr)
	}
	if _, ok := parseReleaseVersion(release.TagName); !ok {
		s.updateChecked = time.Now()
		s.updateErr = "A release mais recente tem uma versão inválida."
		return "", errors.New(s.updateErr)
	}
	s.updateLatest = release.TagName
	s.updateAssets = installerAssets(release.Assets)
	s.updateChecked = time.Now()
	s.updateErr = ""
	return s.updateLatest, nil
}

func installerAssets(assets []releaseAsset) []updateAsset {
	var result []updateAsset
	for _, asset := range assets {
		kind := ""
		switch {
		case strings.HasSuffix(asset.Name, "-setup.exe"):
			kind = "windows-nsis"
		case strings.HasSuffix(asset.Name, ".msi"):
			kind = "windows-msi"
		case strings.HasSuffix(asset.Name, ".AppImage"):
			kind = "linux-appimage"
		case strings.HasSuffix(asset.Name, ".deb"):
			kind = "linux-deb"
		case strings.HasSuffix(asset.Name, ".rpm"):
			kind = "linux-rpm"
		}
		if kind == "" {
			continue
		}
		result = append(result, updateAsset{
			Kind:   kind,
			Name:   asset.Name,
			URL:    asset.URL,
			SHA256: strings.TrimPrefix(asset.Digest, "sha256:"),
			Size:   asset.Size,
		})
	}
	return result
}

func (s *Server) currentInstallers() []updateAsset {
	s.updateMu.Lock()
	defer s.updateMu.Unlock()
	return append([]updateAsset(nil), s.updateAssets...)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func (s *Server) readUpdateState() (updateState, bool) {
	raw, err := os.ReadFile(s.cfg.UpdateState)
	if err != nil {
		return updateState{}, false
	}
	var state updateState
	if err := json.Unmarshal(raw, &state); err != nil {
		return updateState{}, false
	}
	return state, true
}

func (s *Server) updateStatus(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	latest, latestErr := s.latestRelease(ctx)
	state, hasState := s.readUpdateState()
	supported := fileExists(s.cfg.UpdateHelper) && fileExists(s.cfg.UpdatePathUnit)
	busy := fileExists(s.cfg.UpdateRequest) || (hasState && state.Status == "running")
	installers := s.currentInstallers()
	message := ""
	if latestErr != nil {
		message = latestErr.Error()
	}
	if hasState && state.Status == "error" {
		message = "A última atualização não foi concluída."
	}
	apkURL := ""
	if latest != "" {
		apkURL = fmt.Sprintf(
			"https://github.com/%s/releases/download/%s/toph-%s.apk",
			s.cfg.UpdateRepo,
			latest,
			latest,
		)
	}
	writeJSON(w, http.StatusOK, updateStatusResponse{
		CurrentVersion: strings.TrimPrefix(Version, "v"),
		LatestVersion:  strings.TrimPrefix(latest, "v"),
		APKURL:         apkURL,
		Installers:     installers,
		Available:      latest != "" && newerRelease(latest, Version),
		Supported:      supported,
		Busy:           busy,
		Error:          message,
	})
}

func (s *Server) startUpdate(w http.ResponseWriter, r *http.Request) {
	if !fileExists(s.cfg.UpdateHelper) || !fileExists(s.cfg.UpdatePathUnit) {
		writeError(w, http.StatusServiceUnavailable, "self-update is not installed on this server")
		return
	}
	state, hasState := s.readUpdateState()
	if fileExists(s.cfg.UpdateRequest) || (hasState && state.Status == "running") {
		writeError(w, http.StatusConflict, "an update is already in progress")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	latest, err := s.latestRelease(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !newerRelease(latest, Version) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "current", "version": strings.TrimPrefix(Version, "v")})
		return
	}
	if err := os.MkdirAll(filepath.Dir(s.cfg.UpdateRequest), 0o700); err != nil {
		writeError(w, http.StatusInternalServerError, "could not prepare the update request")
		return
	}
	temporary := s.cfg.UpdateRequest + ".tmp"
	if err := os.WriteFile(temporary, []byte(latest+"\n"), 0o600); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write the update request")
		return
	}
	if err := os.Rename(temporary, s.cfg.UpdateRequest); err != nil {
		_ = os.Remove(temporary)
		writeError(w, http.StatusInternalServerError, "could not schedule the update")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{
		"status":  "started",
		"version": strings.TrimPrefix(latest, "v"),
	})
}
