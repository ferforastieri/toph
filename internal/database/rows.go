package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

var identifierPattern = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_$]*$`)

type RowChange struct {
	Schema string         `json:"schema"`
	Table  string         `json:"table"`
	Key    map[string]any `json:"key"`
	Values map[string]any `json:"values"`
}

func (s *Service) InsertRow(ctx context.Context, profileID string, change RowChange) (int64, error) {
	db, driver, err := s.sqlForRowChange(ctx, profileID)
	if err != nil {
		return 0, err
	}
	defer db.Close()
	if err := validateRowChange(change, false); err != nil {
		return 0, err
	}
	columns := sortedKeys(change.Values)
	args := make([]any, 0, len(columns))
	placeholders := make([]string, 0, len(columns))
	for i, column := range columns {
		args = append(args, change.Values[column])
		placeholders = append(placeholders, placeholder(driver, i+1))
	}
	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		qualified(driver, change.Schema, change.Table),
		strings.Join(quoteColumns(driver, columns), ", "),
		strings.Join(placeholders, ", "),
	)
	result, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *Service) UpdateRow(ctx context.Context, profileID string, change RowChange) (int64, error) {
	db, driver, err := s.sqlForRowChange(ctx, profileID)
	if err != nil {
		return 0, err
	}
	defer db.Close()
	if err := validateRowChange(change, true); err != nil {
		return 0, err
	}
	if len(change.Values) == 0 {
		return 0, errors.New("no values to update")
	}
	columns := sortedKeys(change.Values)
	keys := sortedKeys(change.Key)
	args := make([]any, 0, len(columns)+len(keys))
	sets := make([]string, 0, len(columns))
	for i, column := range columns {
		sets = append(sets, quoteIdent(driver, column)+" = "+placeholder(driver, i+1))
		args = append(args, change.Values[column])
	}
	where := make([]string, 0, len(keys))
	for i, column := range keys {
		where = append(where, quoteIdent(driver, column)+" = "+placeholder(driver, len(columns)+i+1))
		args = append(args, change.Key[column])
	}
	query := fmt.Sprintf(
		"UPDATE %s SET %s WHERE %s",
		qualified(driver, change.Schema, change.Table),
		strings.Join(sets, ", "),
		strings.Join(where, " AND "),
	)
	result, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *Service) DeleteRow(ctx context.Context, profileID string, change RowChange) (int64, error) {
	db, driver, err := s.sqlForRowChange(ctx, profileID)
	if err != nil {
		return 0, err
	}
	defer db.Close()
	if err := validateRowChange(change, true); err != nil {
		return 0, err
	}
	keys := sortedKeys(change.Key)
	args := make([]any, 0, len(keys))
	where := make([]string, 0, len(keys))
	for i, column := range keys {
		where = append(where, quoteIdent(driver, column)+" = "+placeholder(driver, i+1))
		args = append(args, change.Key[column])
	}
	query := fmt.Sprintf(
		"DELETE FROM %s WHERE %s",
		qualified(driver, change.Schema, change.Table),
		strings.Join(where, " AND "),
	)
	result, err := db.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (s *Service) sqlForRowChange(ctx context.Context, profileID string) (*sql.DB, string, error) {
	profile, dsn, err := s.profileAndDSN(ctx, profileID)
	if err != nil {
		return nil, "", err
	}
	if profile.ReadOnly {
		return nil, "", errors.New("profile is read-only")
	}
	switch profile.Driver {
	case "postgres", "mysql", "sqlite", "sqlserver", "oracle", "clickhouse":
		db, err := openSQL(profile, dsn)
		if err != nil {
			return nil, "", err
		}
		return db, profile.Driver, nil
	default:
		return nil, "", errors.New("row editing is available for SQL profiles only")
	}
}

func validateRowChange(change RowChange, requireKey bool) error {
	if !identifierPattern.MatchString(change.Table) {
		return errors.New("invalid table name")
	}
	if change.Schema != "" && !identifierPattern.MatchString(change.Schema) {
		return errors.New("invalid schema name")
	}
	if len(change.Values) == 0 && !requireKey {
		return errors.New("no values")
	}
	for column := range change.Values {
		if !identifierPattern.MatchString(column) {
			return fmt.Errorf("invalid column name: %s", column)
		}
	}
	for column := range change.Key {
		if !identifierPattern.MatchString(column) {
			return fmt.Errorf("invalid key column: %s", column)
		}
	}
	if requireKey && len(change.Key) == 0 {
		return errors.New("row key is required")
	}
	return nil
}

func sortedKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func quoteColumns(driver string, columns []string) []string {
	out := make([]string, len(columns))
	for i, column := range columns {
		out[i] = quoteIdent(driver, column)
	}
	return out
}

func quoteIdent(driver, value string) string {
	switch driver {
	case "mysql":
		return "`" + strings.ReplaceAll(value, "`", "``") + "`"
	case "sqlserver":
		return "[" + strings.ReplaceAll(value, "]", "]]") + "]"
	default:
		return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
	}
}

func qualified(driver, schema, table string) string {
	if schema == "" {
		return quoteIdent(driver, table)
	}
	return quoteIdent(driver, schema) + "." + quoteIdent(driver, table)
}

func placeholder(driver string, index int) string {
	switch driver {
	case "postgres":
		return fmt.Sprintf("$%d", index)
	case "oracle":
		return fmt.Sprintf(":%d", index)
	default:
		return "?"
	}
}
