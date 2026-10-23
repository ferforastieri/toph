package ai

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ferforastieri/toph/internal/store"
)

const settingKey = "ai_config"
const defaultTimeout = 90 * time.Second

var (
	ErrUnsupportedProvider = errors.New("unsupported AI provider")
	ErrOpenCodeAgent       = errors.New("OpenCode uses its own agent API")
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Config struct {
	Provider     string  `json:"provider"`
	BaseURL      string  `json:"baseUrl"`
	APIKey       string  `json:"-"`
	APIKeyEnc    string  `json:"apiKeyEnc,omitempty"`
	Model        string  `json:"model"`
	MaxTokens    int     `json:"maxTokens"`
	Temperature  float64 `json:"temperature"`
	Autocomplete bool    `json:"autocomplete"`
	SystemPrompt string  `json:"systemPrompt"`
}

type PublicConfig struct {
	Provider     string  `json:"provider"`
	BaseURL      string  `json:"baseUrl"`
	Model        string  `json:"model"`
	MaxTokens    int     `json:"maxTokens"`
	Temperature  float64 `json:"temperature"`
	Autocomplete bool    `json:"autocomplete"`
	SystemPrompt string  `json:"systemPrompt"`
	HasKey       bool    `json:"hasKey"`
}

type Input struct {
	Provider     string  `json:"provider"`
	BaseURL      string  `json:"baseUrl"`
	APIKey       string  `json:"apiKey"`
	ClearKey     bool    `json:"clearKey"`
	Model        string  `json:"model"`
	MaxTokens    int     `json:"maxTokens"`
	Temperature  float64 `json:"temperature"`
	Autocomplete bool    `json:"autocomplete"`
	SystemPrompt string  `json:"systemPrompt"`
}

type CompleteInput struct {
	Path     string `json:"path"`
	Language string `json:"language"`
	Prefix   string `json:"prefix"`
	Suffix   string `json:"suffix"`
}

type Service struct {
	store *store.Store
	key   []byte
	http  *http.Client
}

func New(st *store.Store, keyFile string) (*Service, error) {
	key, err := loadKey(keyFile)
	if err != nil {
		return nil, err
	}
	return &Service{
		store: st,
		key:   key,
		http:  &http.Client{Timeout: defaultTimeout},
	}, nil
}

func (s *Service) Load(ctx context.Context) (Config, error) {
	raw, err := s.store.Setting(ctx, settingKey)
	if errors.Is(err, store.ErrNotFound) {
		return Config{
			Provider:  "opencode",
			BaseURL:   strings.TrimRight(os.Getenv("TOPH_OPENCODE_URL"), "/"),
			APIKey:    os.Getenv("TOPH_OPENCODE_AUTH"),
			MaxTokens: 1024,
		}, nil
	}
	if err != nil {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return Config{}, err
	}
	if cfg.APIKeyEnc != "" {
		key, err := decrypt(s.key, cfg.APIKeyEnc)
		if err != nil {
			return Config{}, err
		}
		cfg.APIKey = key
	}
	cfg.normalize()
	return cfg, nil
}

func (s *Service) Public(ctx context.Context) (PublicConfig, error) {
	cfg, err := s.Load(ctx)
	if err != nil {
		return PublicConfig{}, err
	}
	return PublicConfig{
		Provider: cfg.Provider, BaseURL: cfg.BaseURL, Model: cfg.Model,
		MaxTokens: cfg.MaxTokens, Temperature: cfg.Temperature,
		Autocomplete: cfg.Autocomplete, SystemPrompt: cfg.SystemPrompt,
		HasKey: cfg.APIKey != "",
	}, nil
}

func (s *Service) Save(ctx context.Context, input Input) (PublicConfig, error) {
	input.Provider = strings.ToLower(strings.TrimSpace(input.Provider))
	if !supportedProvider(input.Provider) {
		return PublicConfig{}, ErrUnsupportedProvider
	}
	input.BaseURL = strings.TrimRight(strings.TrimSpace(input.BaseURL), "/")
	if input.BaseURL != "" {
		u, err := url.Parse(input.BaseURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return PublicConfig{}, errors.New("base URL must be http or https")
		}
	}
	if input.MaxTokens <= 0 {
		input.MaxTokens = 1024
	}
	if input.MaxTokens > 8192 {
		input.MaxTokens = 8192
	}
	if input.Temperature < 0 {
		input.Temperature = 0
	}
	if input.Temperature > 2 {
		input.Temperature = 2
	}
	old, _ := s.Load(ctx)
	apiKey := old.APIKey
	if input.ClearKey {
		apiKey = ""
	} else if strings.TrimSpace(input.APIKey) != "" {
		apiKey = strings.TrimSpace(input.APIKey)
	}
	encrypted, err := encrypt(s.key, apiKey)
	if err != nil {
		return PublicConfig{}, err
	}
	cfg := Config{
		Provider: input.Provider, BaseURL: input.BaseURL, APIKey: apiKey,
		APIKeyEnc: encrypted, Model: strings.TrimSpace(input.Model),
		MaxTokens: input.MaxTokens, Temperature: input.Temperature,
		Autocomplete: input.Autocomplete, SystemPrompt: input.SystemPrompt,
	}
	cfg.normalize()
	data, err := json.Marshal(cfg)
	if err != nil {
		return PublicConfig{}, err
	}
	if err := s.store.SetSetting(ctx, settingKey, string(data)); err != nil {
		return PublicConfig{}, err
	}
	return s.Public(ctx)
}

func (s *Service) Test(ctx context.Context) error {
	cfg, err := s.Load(ctx)
	if err != nil {
		return err
	}
	if cfg.Provider == "" {
		return errors.New("AI provider is not configured")
	}
	switch cfg.Provider {
	case "opencode":
		return s.check(ctx, cfg.BaseURL+"/api/info", nil)
	case "claude", "anthropic":
		return s.check(ctx, endpoint(cfg.BaseURL, "/models"), map[string]string{
			"x-api-key": cfg.APIKey, "anthropic-version": "2023-06-01",
		})
	case "ollama":
		return s.check(ctx, strings.TrimRight(cfg.BaseURL, "/")+"/api/tags", nil)
	default:
		return s.check(ctx, endpoint(cfg.BaseURL, "/models"), map[string]string{
			"Authorization": "Bearer " + cfg.APIKey,
		})
	}
}

func (s *Service) Chat(ctx context.Context, messages []Message) (string, error) {
	cfg, err := s.Load(ctx)
	if err != nil {
		return "", err
	}
	if cfg.Provider == "opencode" {
		return "", ErrOpenCodeAgent
	}
	if len(messages) == 0 {
		return "", errors.New("messages are required")
	}
	switch cfg.Provider {
	case "claude", "anthropic":
		return s.chatAnthropic(ctx, cfg, messages)
	case "ollama":
		return s.chatOllama(ctx, cfg, messages)
	default:
		return s.chatOpenAI(ctx, cfg, messages)
	}
}

func (s *Service) Complete(ctx context.Context, input CompleteInput) (string, error) {
	prefix := tail(input.Prefix, 6000)
	suffix := head(input.Suffix, 1500)
	prompt := fmt.Sprintf("File: %s\nLanguage: %s\n\nComplete the code at the cursor. Return only the text to insert, without markdown fences or explanation.\n\n<before>\n%s\n</before>\n<cursor>\n<after>\n%s\n</after>", input.Path, input.Language, prefix, suffix)
	cfg, err := s.Load(ctx)
	if err != nil {
		return "", err
	}
	if cfg.Provider == "opencode" {
		return "", ErrOpenCodeAgent
	}
	messages := []Message{{Role: "user", Content: prompt}}
	if cfg.SystemPrompt != "" {
		messages = append([]Message{{Role: "system", Content: cfg.SystemPrompt}}, messages...)
	}
	text, err := s.Chat(ctx, messages)
	if err != nil {
		return "", err
	}
	return cleanCompletion(text), nil
}

func (s *Service) chatOpenAI(ctx context.Context, cfg Config, messages []Message) (string, error) {
	body := map[string]any{
		"model": cfg.Model, "messages": messages,
		"max_tokens": cfg.MaxTokens, "temperature": cfg.Temperature,
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	headers := map[string]string{"Authorization": "Bearer " + cfg.APIKey}
	if err := s.postJSON(ctx, endpoint(cfg.BaseURL, "/chat/completions"), headers, body, &out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", errors.New("AI returned no choices")
	}
	return out.Choices[0].Message.Content, nil
}

func (s *Service) chatAnthropic(ctx context.Context, cfg Config, messages []Message) (string, error) {
	system := ""
	var chat []Message
	for _, message := range messages {
		if message.Role == "system" {
			system += message.Content + "\n"
		} else {
			chat = append(chat, message)
		}
	}
	body := map[string]any{
		"model": cfg.Model, "max_tokens": cfg.MaxTokens,
		"temperature": cfg.Temperature, "messages": chat,
	}
	if system != "" {
		body["system"] = strings.TrimSpace(system)
	}
	var out struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	headers := map[string]string{
		"x-api-key": cfg.APIKey, "anthropic-version": "2023-06-01",
	}
	if err := s.postJSON(ctx, endpoint(cfg.BaseURL, "/messages"), headers, body, &out); err != nil {
		return "", err
	}
	var parts []string
	for _, part := range out.Content {
		if part.Type == "text" {
			parts = append(parts, part.Text)
		}
	}
	return strings.Join(parts, "\n"), nil
}

func (s *Service) chatOllama(ctx context.Context, cfg Config, messages []Message) (string, error) {
	body := map[string]any{
		"model": cfg.Model, "messages": messages, "stream": false,
		"options": map[string]any{"temperature": cfg.Temperature, "num_predict": cfg.MaxTokens},
	}
	var out struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := s.postJSON(ctx, strings.TrimRight(cfg.BaseURL, "/")+"/api/chat", nil, body, &out); err != nil {
		return "", err
	}
	return out.Message.Content, nil
}

func (s *Service) check(ctx context.Context, rawURL string, headers map[string]string) error {
	if rawURL == "" {
		return errors.New("base URL is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	for key, value := range headers {
		if value != "" {
			req.Header.Set(key, value)
		}
	}
	res, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("provider returned %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func (s *Service) postJSON(ctx context.Context, rawURL string, headers map[string]string, body, out any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		if value != "" {
			req.Header.Set(key, value)
		}
	}
	res, err := s.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		response, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("provider returned %d: %s", res.StatusCode, strings.TrimSpace(string(response)))
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 8<<20)).Decode(out); err != nil {
		return err
	}
	return nil
}

func endpoint(base, path string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, "/v1") {
		return base + path
	}
	return base + "/v1" + path
}

func supportedProvider(value string) bool {
	switch value {
	case "opencode", "openai", "codex", "custom", "claude", "anthropic", "ollama":
		return true
	default:
		return false
	}
}

func (c *Config) normalize() {
	c.Provider = strings.ToLower(strings.TrimSpace(c.Provider))
	if c.Provider == "" {
		c.Provider = "opencode"
	}
	c.BaseURL = strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	c.Model = strings.TrimSpace(c.Model)
	if c.MaxTokens <= 0 {
		c.MaxTokens = 1024
	}
	if c.Temperature < 0 {
		c.Temperature = 0
	}
}

func tail(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[len(value)-limit:]
}

func head(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}

func cleanCompletion(value string) string {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "```") {
		lines := strings.Split(value, "\n")
		if len(lines) > 0 && strings.HasPrefix(strings.TrimSpace(lines[0]), "```") {
			lines = lines[1:]
		}
		if len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "```" {
			lines = lines[:len(lines)-1]
		}
		value = strings.Join(lines, "\n")
	}
	return value
}

func loadKey(path string) ([]byte, error) {
	if data, err := os.ReadFile(path); err == nil {
		if len(data) != 32 {
			return nil, fmt.Errorf("master key %q must be 32 bytes", path)
		}
		return data, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := os.WriteFile(path, key, 0o600); err != nil {
		return nil, err
	}
	return key, nil
}

func encrypt(key []byte, value string) (string, error) {
	if value == "" {
		return "", nil
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(value), nil)), nil
}

func decrypt(key []byte, value string) (string, error) {
	if value == "" {
		return "", nil
	}
	data, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted value")
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
