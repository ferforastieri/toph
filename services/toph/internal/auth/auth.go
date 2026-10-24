package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ferforastieri/toph/internal/store"
	"golang.org/x/crypto/argon2"
)

const (
	argonMemory      = 64 * 1024
	argonIterations  = 3
	argonParallelism = 2
	argonSaltLength  = 16
	argonKeyLength   = 32
)

var ErrInvalidCredentials = errors.New("invalid credentials")

type Manager struct {
	store         *store.Store
	sessionTTL    time.Duration
	secureCookies bool
	dummyHash     string
}

type LoginResult struct {
	Token     string
	Session   store.Session
	User      store.User
	CSRFToken string
}

func New(st *store.Store, secureCookies bool) *Manager {
	dummyHash, _ := HashPassword("toph-invalid-password-placeholder")
	return &Manager{
		store:         st,
		sessionTTL:    30 * 24 * time.Hour,
		secureCookies: secureCookies,
		dummyHash:     dummyHash,
	}
}

func (m *Manager) SecureCookies() bool { return m.secureCookies }

// Bootstrap creates the initial admin account. It returns a generated password
// only when TOPH_ADMIN_PASSWORD was empty and a new account was created.
func (m *Manager) Bootstrap(ctx context.Context, configuredPassword string) (string, bool, error) {
	count, err := m.store.UserCount(ctx)
	if err != nil {
		return "", false, err
	}
	if count > 0 {
		return "", false, nil
	}

	password := configuredPassword
	generated := false
	if password == "" {
		password, err = randomSecret(18)
		if err != nil {
			return "", false, err
		}
		generated = true
	}
	hash, err := HashPassword(password)
	if err != nil {
		return "", false, err
	}
	if _, err := m.store.CreateUser(ctx, "admin", hash); err != nil {
		return "", false, err
	}
	return password, generated, nil
}

func (m *Manager) Login(ctx context.Context, username, password, kind string) (LoginResult, error) {
	user, err := m.store.UserByUsername(ctx, username)
	if err != nil {
		_ = VerifyPassword(m.dummyHash, password)
		return LoginResult{}, ErrInvalidCredentials
	}
	if !VerifyPassword(user.PasswordHash, password) {
		return LoginResult{}, ErrInvalidCredentials
	}
	raw, hash, err := newToken()
	if err != nil {
		return LoginResult{}, err
	}
	sessionID, err := randomSecret(16)
	if err != nil {
		return LoginResult{}, err
	}
	expires := time.Now().Add(m.sessionTTL)
	session, err := m.store.CreateSession(ctx, sessionID, user.ID, hash, kind, expires)
	if err != nil {
		return LoginResult{}, err
	}
	csrf, err := randomSecret(24)
	if err != nil {
		return LoginResult{}, err
	}
	return LoginResult{Token: raw, Session: session, User: user, CSRFToken: csrf}, nil
}

func (m *Manager) Authenticate(ctx context.Context, raw string) (store.Session, store.User, error) {
	if raw == "" {
		return store.Session{}, store.User{}, ErrInvalidCredentials
	}
	session, user, err := m.store.SessionByTokenHash(ctx, tokenHash(raw))
	if err != nil {
		return store.Session{}, store.User{}, ErrInvalidCredentials
	}
	_ = m.store.TouchSession(ctx, session.ID)
	return session, user, nil
}

func (m *Manager) Logout(ctx context.Context, sessionID string) error {
	return m.store.DeleteSession(ctx, sessionID)
}

func HashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, argonIterations, argonMemory, argonParallelism, argonKeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s",
		argonMemory, argonIterations, argonParallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func VerifyPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var memory uint32
	var iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expected)))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

func tokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func newToken() (string, string, error) {
	raw, err := randomSecret(32)
	if err != nil {
		return "", "", err
	}
	return raw, tokenHash(raw), nil
}

func randomSecret(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func ParseTTL(value string, fallback time.Duration) time.Duration {
	if value == "" {
		return fallback
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}
