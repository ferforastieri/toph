package store

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type Store struct {
	db *sql.DB
}

type User struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
	CreatedAt    string `json:"createdAt"`
}

type Session struct {
	ID         string `json:"id"`
	UserID     int64  `json:"userId"`
	Kind       string `json:"kind"`
	CreatedAt  string `json:"createdAt"`
	ExpiresAt  string `json:"expiresAt"`
	LastSeenAt string `json:"lastSeenAt"`
}

type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Root      string `json:"root"`
	Color     string `json:"color"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type DBProfile struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Driver       string `json:"driver"`
	DSNEncrypted string `json:"-"`
	ReadOnly     bool   `json:"readOnly"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

type WebTarget struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	URL       string `json:"url"`
	Icon      string `json:"icon"`
	CreatedAt string `json:"createdAt"`
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	for _, pragma := range []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
	} {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, err
		}
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }

func (s *Store) CreateUser(ctx context.Context, username, passwordHash string) (User, error) {
	created := now()
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)`,
		username, passwordHash, created,
	)
	if err != nil {
		return User{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return User{}, err
	}
	return User{ID: id, Username: username, PasswordHash: passwordHash, CreatedAt: created}, nil
}

func (s *Store) UserByUsername(ctx context.Context, username string) (User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, password_hash, created_at FROM users WHERE username = ?`, username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (s *Store) UserCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func (s *Store) CreateSession(ctx context.Context, id string, userID int64, tokenHash, kind string, expiresAt time.Time) (Session, error) {
	created := now()
	expiry := expiresAt.UTC().Format(time.RFC3339Nano)
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions (id, user_id, token_hash, kind, created_at, expires_at, last_seen_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, userID, tokenHash, kind, created, expiry, created,
	)
	if err != nil {
		return Session{}, err
	}
	return Session{ID: id, UserID: userID, Kind: kind, CreatedAt: created, ExpiresAt: expiry, LastSeenAt: created}, nil
}

func (s *Store) SessionByTokenHash(ctx context.Context, tokenHash string) (Session, User, error) {
	var sess Session
	var u User
	err := s.db.QueryRowContext(ctx, `
		SELECT s.id, s.user_id, s.kind, s.created_at, s.expires_at, s.last_seen_at,
		       u.id, u.username, u.password_hash, u.created_at
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ?`, tokenHash,
	).Scan(&sess.ID, &sess.UserID, &sess.Kind, &sess.CreatedAt, &sess.ExpiresAt, &sess.LastSeenAt,
		&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, User{}, ErrNotFound
	}
	if err != nil {
		return Session{}, User{}, err
	}
	expires, err := time.Parse(time.RFC3339Nano, sess.ExpiresAt)
	if err != nil || time.Now().After(expires) {
		return Session{}, User{}, ErrNotFound
	}
	return sess, u, nil
}

func (s *Store) TouchSession(ctx context.Context, sessionID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET last_seen_at = ? WHERE id = ?`, now(), sessionID)
	return err
}

func (s *Store) DeleteSession(ctx context.Context, sessionID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, sessionID)
	return err
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`, now())
	return err
}

func (s *Store) ListProjects(ctx context.Context) ([]Project, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, root, color, created_at, updated_at FROM projects ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Root, &p.Color, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) Project(ctx context.Context, id string) (Project, error) {
	var p Project
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, root, color, created_at, updated_at FROM projects WHERE id = ?`, id,
	).Scan(&p.ID, &p.Name, &p.Root, &p.Color, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Project{}, ErrNotFound
	}
	return p, err
}

func (s *Store) CreateProject(ctx context.Context, p Project) (Project, error) {
	created := now()
	if p.Color == "" {
		p.Color = "#A8C66C"
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO projects (id, name, root, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Root, p.Color, created, created,
	)
	if err != nil {
		if isUnique(err) {
			return Project{}, ErrConflict
		}
		return Project{}, err
	}
	p.CreatedAt, p.UpdatedAt = created, created
	return p, nil
}

func (s *Store) UpdateProject(ctx context.Context, p Project) (Project, error) {
	updated := now()
	res, err := s.db.ExecContext(ctx,
		`UPDATE projects SET name = ?, root = ?, color = ?, updated_at = ? WHERE id = ?`,
		p.Name, p.Root, p.Color, updated, p.ID,
	)
	if err != nil {
		if isUnique(err) {
			return Project{}, ErrConflict
		}
		return Project{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Project{}, ErrNotFound
	}
	p.UpdatedAt = updated
	return p, nil
}

func (s *Store) DeleteProject(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) WorkspaceLayout(ctx context.Context, userID int64, projectID string) (string, error) {
	var layout string
	err := s.db.QueryRowContext(ctx,
		`SELECT layout FROM workspaces WHERE user_id = ? AND project_id = ?`, userID, projectID,
	).Scan(&layout)
	if errors.Is(err, sql.ErrNoRows) {
		return "{}", nil
	}
	return layout, err
}

func (s *Store) SaveWorkspaceLayout(ctx context.Context, userID int64, projectID, layout string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO workspaces (user_id, project_id, layout, updated_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(user_id, project_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`,
		userID, projectID, layout, now(),
	)
	return err
}

func (s *Store) ListDBProfiles(ctx context.Context) ([]DBProfile, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, driver, dsn_encrypted, read_only, created_at, updated_at FROM db_profiles ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DBProfile
	for rows.Next() {
		var p DBProfile
		if err := rows.Scan(&p.ID, &p.Name, &p.Driver, &p.DSNEncrypted, &p.ReadOnly, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) DBProfile(ctx context.Context, id string) (DBProfile, error) {
	var p DBProfile
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, driver, dsn_encrypted, read_only, created_at, updated_at FROM db_profiles WHERE id = ?`, id,
	).Scan(&p.ID, &p.Name, &p.Driver, &p.DSNEncrypted, &p.ReadOnly, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return DBProfile{}, ErrNotFound
	}
	return p, err
}

func (s *Store) CreateDBProfile(ctx context.Context, p DBProfile) (DBProfile, error) {
	created := now()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO db_profiles (id, name, driver, dsn_encrypted, read_only, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Driver, p.DSNEncrypted, p.ReadOnly, created, created,
	)
	if err != nil {
		return DBProfile{}, err
	}
	p.CreatedAt, p.UpdatedAt = created, created
	return p, nil
}

func (s *Store) DeleteDBProfile(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM db_profiles WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ListWebTargets(ctx context.Context) ([]WebTarget, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, url, icon, created_at FROM web_targets ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WebTarget
	for rows.Next() {
		var t WebTarget
		if err := rows.Scan(&t.ID, &t.Name, &t.URL, &t.Icon, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) CreateWebTarget(ctx context.Context, t WebTarget) (WebTarget, error) {
	created := now()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO web_targets (id, name, url, icon, created_at) VALUES (?, ?, ?, ?, ?)`,
		t.ID, t.Name, t.URL, t.Icon, created,
	)
	if err != nil {
		return WebTarget{}, err
	}
	t.CreatedAt = created
	return t, nil
}

func (s *Store) DeleteWebTarget(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM web_targets WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Setting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = ?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return value, err
}

func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
	return err
}

func isUnique(err error) bool {
	return err != nil && (strings.Contains(err.Error(), "UNIQUE constraint") ||
		strings.Contains(err.Error(), "constraint failed"))
}
