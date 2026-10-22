package database

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ferforastieri/toph/internal/store"
	_ "github.com/go-sql-driver/mysql"
	_ "github.com/jackc/pgx/v5/stdlib"
	_ "github.com/microsoft/go-mssqldb"
	_ "github.com/sijms/go-ora/v2"
	_ "modernc.org/sqlite"
)

const queryTimeout = 30 * time.Second

var (
	ErrUnsupportedDriver = errors.New("unsupported driver")
	ErrProfileNotFound   = errors.New("profile not found")
)

type Service struct {
	store *store.Store
	key   []byte
}

type ProfileInput struct {
	Name     string `json:"name"`
	Driver   string `json:"driver"`
	DSN      string `json:"dsn"`
	ReadOnly bool   `json:"readOnly"`
}

type Column struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type Result struct {
	Columns    []Column `json:"columns"`
	Rows       [][]any  `json:"rows"`
	RowCount   int      `json:"rowCount"`
	Truncated  bool     `json:"truncated"`
	DurationMS int64    `json:"durationMs"`
}

type TableColumn struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Nullable bool   `json:"nullable"`
	Primary  bool   `json:"primary"`
}

type Table struct {
	Schema  string        `json:"schema"`
	Name    string        `json:"name"`
	Columns []TableColumn `json:"columns"`
}

func New(st *store.Store, keyFile string) (*Service, error) {
	key, err := loadOrCreateKey(keyFile)
	if err != nil {
		return nil, err
	}
	return &Service{store: st, key: key}, nil
}

func loadOrCreateKey(path string) ([]byte, error) {
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

func (s *Service) Create(ctx context.Context, input ProfileInput) (store.DBProfile, error) {
	input.Driver = strings.ToLower(strings.TrimSpace(input.Driver))
	if !supported(input.Driver) {
		return store.DBProfile{}, ErrUnsupportedDriver
	}
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.DSN) == "" {
		return store.DBProfile{}, errors.New("name and dsn are required")
	}
	encrypted, err := s.encrypt(input.DSN)
	if err != nil {
		return store.DBProfile{}, err
	}
	return s.store.CreateDBProfile(ctx, store.DBProfile{
		ID:           newID(),
		Name:         input.Name,
		Driver:       input.Driver,
		DSNEncrypted: encrypted,
		ReadOnly:     input.ReadOnly,
	})
}

func (s *Service) Delete(ctx context.Context, id string) error {
	return s.store.DeleteDBProfile(ctx, id)
}

func (s *Service) Test(ctx context.Context, id string) error {
	db, _, err := s.open(ctx, id)
	if err != nil {
		return err
	}
	defer db.Close()
	return db.PingContext(ctx)
}

func (s *Service) Query(ctx context.Context, id, query string, maxRows int) (Result, error) {
	if strings.TrimSpace(query) == "" {
		return Result{}, errors.New("query is required")
	}
	if maxRows <= 0 {
		maxRows = 500
	}
	if maxRows > 5000 {
		maxRows = 5000
	}
	db, profile, err := s.open(ctx, id)
	if err != nil {
		return Result{}, err
	}
	defer db.Close()

	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	if profile.ReadOnly && !isReadOnlyQuery(query) {
		return Result{}, errors.New("profile is read-only")
	}
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return Result{}, err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return Result{}, err
	}
	types, _ := rows.ColumnTypes()
	result := Result{Columns: make([]Column, len(cols))}
	for i, name := range cols {
		typ := ""
		if i < len(types) {
			typ = types[i].DatabaseTypeName()
		}
		result.Columns[i] = Column{Name: name, Type: typ}
	}

	for rows.Next() {
		if len(result.Rows) >= maxRows {
			result.Truncated = true
			break
		}
		values := make([]any, len(cols))
		pointers := make([]any, len(cols))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return Result{}, err
		}
		for i, value := range values {
			values[i] = normalize(value)
		}
		result.Rows = append(result.Rows, values)
	}
	if err := rows.Err(); err != nil {
		return Result{}, err
	}
	result.RowCount = len(result.Rows)
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}

func (s *Service) Schema(ctx context.Context, id string) ([]Table, error) {
	db, profile, err := s.open(ctx, id)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	switch profile.Driver {
	case "postgres":
		return postgresSchema(ctx, db)
	case "sqlite":
		return sqliteSchema(ctx, db)
	case "mysql":
		return mysqlSchema(ctx, db)
	case "sqlserver":
		return sqlServerSchema(ctx, db)
	case "oracle":
		return oracleSchema(ctx, db)
	case "clickhouse":
		return clickHouseSchema(ctx, db)
	default:
		return nil, ErrUnsupportedDriver
	}
}

func (s *Service) open(ctx context.Context, id string) (*sql.DB, store.DBProfile, error) {
	profile, err := s.store.DBProfile(ctx, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, store.DBProfile{}, ErrProfileNotFound
		}
		return nil, store.DBProfile{}, err
	}
	dsn, err := s.decrypt(profile.DSNEncrypted)
	if err != nil {
		return nil, store.DBProfile{}, err
	}
	if profile.Driver == "sqlite" && profile.ReadOnly {
		dsn = sqliteReadOnly(dsn)
	}
	if profile.Driver == "postgres" && profile.ReadOnly {
		dsn = postgresReadOnly(dsn)
	}
	db, err := sql.Open(driverName(profile.Driver), dsn)
	if err != nil {
		return nil, store.DBProfile{}, err
	}
	db.SetMaxOpenConns(2)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(5 * time.Minute)
	return db, profile, nil
}

func (s *Service) encrypt(plain string) (string, error) {
	block, err := aes.NewCipher(s.key)
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
	sealed := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.RawStdEncoding.EncodeToString(sealed), nil
}

func (s *Service) decrypt(encoded string) (string, error) {
	data, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(s.key)
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

func supported(driver string) bool {
	switch driver {
	case "postgres", "mysql", "sqlite", "sqlserver", "oracle", "clickhouse":
		return true
	default:
		return false
	}
}

func driverName(driver string) string {
	switch driver {
	case "postgres":
		return "pgx"
	case "sqlserver":
		return "sqlserver"
	case "oracle":
		return "oracle"
	case "clickhouse":
		return "clickhouse"
	default:
		return driver
	}
}

func sqliteReadOnly(dsn string) string {
	if strings.HasPrefix(dsn, "file:") {
		if strings.Contains(dsn, "?") {
			return dsn + "&mode=ro"
		}
		return dsn + "?mode=ro"
	}
	return "file:" + dsn + "?mode=ro"
}

func isReadOnlyQuery(query string) bool {
	lower := strings.ToLower(strings.TrimSpace(query))
	for _, prefix := range []string{"select", "with", "explain", "show", "pragma", "values"} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

func postgresReadOnly(dsn string) string {
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		separator := "?"
		if strings.Contains(dsn, "?") {
			separator = "&"
		}
		return dsn + separator + "default_transaction_read_only=on"
	}
	return dsn + " default_transaction_read_only=on"
}

func normalize(value any) any {
	switch v := value.(type) {
	case nil:
		return nil
	case []byte:
		if isPrintable(v) {
			return string(v)
		}
		return "0x" + fmt.Sprintf("%x", v)
	case time.Time:
		return v.UTC().Format(time.RFC3339Nano)
	default:
		return v
	}
}

func isPrintable(data []byte) bool {
	for _, b := range data {
		if b == 0 {
			return false
		}
	}
	return true
}

func newID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}
