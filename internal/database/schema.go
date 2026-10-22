package database

import (
	"context"
	"database/sql"
	"fmt"
)

func postgresSchema(ctx context.Context, db *sql.DB) ([]Table, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT table_schema, table_name
		FROM information_schema.tables
		WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
		ORDER BY table_schema, table_name
		LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []Table
	for rows.Next() {
		var table Table
		if err := rows.Scan(&table.Schema, &table.Name); err != nil {
			return nil, err
		}
		tables = append(tables, table)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range tables {
		cols, err := db.QueryContext(ctx, `
			SELECT column_name, data_type, is_nullable = 'YES',
			       COALESCE((SELECT TRUE FROM information_schema.table_constraints tc
			                 JOIN information_schema.key_column_usage kcu
			                   ON tc.constraint_name = kcu.constraint_name
			                  AND tc.table_schema = kcu.table_schema
			                 WHERE tc.constraint_type = 'PRIMARY KEY'
			                   AND tc.table_schema = $1 AND tc.table_name = $2
			                   AND kcu.column_name = c.column_name LIMIT 1), FALSE)
			FROM information_schema.columns c
			WHERE table_schema = $1 AND table_name = $2
			ORDER BY ordinal_position`, tables[i].Schema, tables[i].Name)
		if err != nil {
			return nil, err
		}
		for cols.Next() {
			var col TableColumn
			if err := cols.Scan(&col.Name, &col.Type, &col.Nullable, &col.Primary); err != nil {
				cols.Close()
				return nil, err
			}
			tables[i].Columns = append(tables[i].Columns, col)
		}
		if err := cols.Err(); err != nil {
			cols.Close()
			return nil, err
		}
		cols.Close()
	}
	return tables, nil
}

func sqliteSchema(ctx context.Context, db *sql.DB) ([]Table, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT name FROM sqlite_master
		WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
		ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	tables := make([]Table, 0, len(names))
	for _, name := range names {
		table := Table{Schema: "main", Name: name}
		colRows, err := db.QueryContext(ctx, fmt.Sprintf(`PRAGMA table_info(%q)`, name))
		if err != nil {
			return nil, err
		}
		for colRows.Next() {
			var cid int
			var colName, colType string
			var notNull, pk int
			var defaultValue any
			if err := colRows.Scan(&cid, &colName, &colType, &notNull, &defaultValue, &pk); err != nil {
				colRows.Close()
				return nil, err
			}
			table.Columns = append(table.Columns, TableColumn{
				Name: colName, Type: colType, Nullable: notNull == 0, Primary: pk > 0,
			})
		}
		if err := colRows.Err(); err != nil {
			colRows.Close()
			return nil, err
		}
		colRows.Close()
		tables = append(tables, table)
	}
	return tables, nil
}

func mysqlSchema(ctx context.Context, db *sql.DB) ([]Table, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT table_schema, table_name
		FROM information_schema.tables
		WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
		ORDER BY table_schema, table_name
		LIMIT 500`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []Table
	for rows.Next() {
		var table Table
		if err := rows.Scan(&table.Schema, &table.Name); err != nil {
			return nil, err
		}
		tables = append(tables, table)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range tables {
		cols, err := db.QueryContext(ctx, `
			SELECT column_name, column_type, is_nullable = 'YES', column_key = 'PRI'
			FROM information_schema.columns
			WHERE table_schema = ? AND table_name = ?
			ORDER BY ordinal_position`, tables[i].Schema, tables[i].Name)
		if err != nil {
			return nil, err
		}
		for cols.Next() {
			var col TableColumn
			if err := cols.Scan(&col.Name, &col.Type, &col.Nullable, &col.Primary); err != nil {
				cols.Close()
				return nil, err
			}
			tables[i].Columns = append(tables[i].Columns, col)
		}
		if err := cols.Err(); err != nil {
			cols.Close()
			return nil, err
		}
		cols.Close()
	}
	return tables, nil
}
