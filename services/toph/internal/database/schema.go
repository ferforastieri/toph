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

func sqlServerSchema(ctx context.Context, db *sql.DB) ([]Table, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable,
		       CASE WHEN kcu.column_name IS NULL THEN 0 ELSE 1 END
		FROM information_schema.columns c
		LEFT JOIN information_schema.table_constraints tc
		  ON tc.table_schema = c.table_schema AND tc.table_name = c.table_name
		 AND tc.constraint_type = 'PRIMARY KEY'
		LEFT JOIN information_schema.key_column_usage kcu
		  ON kcu.constraint_name = tc.constraint_name
		 AND kcu.table_schema = tc.table_schema
		 AND kcu.table_name = tc.table_name
		 AND kcu.column_name = c.column_name
		WHERE c.table_schema NOT IN ('sys', 'INFORMATION_SCHEMA')
		ORDER BY c.table_schema, c.table_name, c.ordinal_position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFlatSchema(rows)
}

func oracleSchema(ctx context.Context, db *sql.DB) ([]Table, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT c.owner, c.table_name, c.column_name, c.data_type, c.nullable,
		       CASE WHEN cc.column_name IS NULL THEN 0 ELSE 1 END
		FROM all_tab_columns c
		LEFT JOIN all_constraints ac
		  ON ac.owner = c.owner AND ac.table_name = c.table_name AND ac.constraint_type = 'P'
		LEFT JOIN all_cons_columns cc
		  ON cc.owner = ac.owner AND cc.constraint_name = ac.constraint_name
		 AND cc.column_name = c.column_name
		WHERE c.owner NOT IN (
		  'SYS','SYSTEM','XDB','MDSYS','CTXSYS','ORDDATA','ORDSYS','LBACSYS',
		  'DBSNMP','OUTLN','APPQOSSYS','GSMADMIN_INTERNAL','AUDSYS','DVSYS',
		  'DVF','OJVMSYS','WMSYS','REMOTE_SCHEDULER_AGENT','SYSBACKUP','SYSDG',
		  'SYSKM','SYSRAC','SYS$UMF'
		)
		ORDER BY c.owner, c.table_name, c.column_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanFlatSchema(rows)
}

func clickHouseSchema(ctx context.Context, db *sql.DB) ([]Table, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT database, table, name, type
		FROM system.columns
		WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
		ORDER BY database, table, position`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tables []Table
	index := map[string]int{}
	for rows.Next() {
		var database, table, name, typ string
		if err := rows.Scan(&database, &table, &name, &typ); err != nil {
			return nil, err
		}
		key := database + "." + table
		i, ok := index[key]
		if !ok {
			tables = append(tables, Table{Schema: database, Name: table})
			i = len(tables) - 1
			index[key] = i
		}
		tables[i].Columns = append(tables[i].Columns, TableColumn{
			Name: name, Type: typ, Nullable: len(typ) >= 9 && typ[:9] == "Nullable(",
		})
	}
	return tables, rows.Err()
}

func scanFlatSchema(rows *sql.Rows) ([]Table, error) {
	var tables []Table
	index := map[string]int{}
	for rows.Next() {
		var schema, table, name, typ, nullable string
		var primary int
		if err := rows.Scan(&schema, &table, &name, &typ, &nullable, &primary); err != nil {
			return nil, err
		}
		key := schema + "." + table
		i, ok := index[key]
		if !ok {
			tables = append(tables, Table{Schema: schema, Name: table})
			i = len(tables) - 1
			index[key] = i
		}
		tables[i].Columns = append(tables[i].Columns, TableColumn{
			Name: name, Type: typ, Nullable: nullable == "YES" || nullable == "Y", Primary: primary != 0,
		})
	}
	return tables, rows.Err()
}
