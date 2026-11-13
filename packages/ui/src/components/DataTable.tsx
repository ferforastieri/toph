"use client";

import { type ReactNode, useMemo, useState } from "react";
import { cx } from "../cx";
import { Chip } from "./Chip";
import { Pagination } from "./Pagination";
import { Table, type TableColumn } from "./Table";
import { SearchField } from "./Toolbar";

/**
 * A table wired for reading a lot of rows: a search box, an optional toolbar
 * slot, selection across pages and pagination. The rows are filtered by
 * `searchText`, so the caller says which fields the search reads.
 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  searchText,
  label,
  searchLabel = "Buscar",
  searchPlaceholder = "Buscar…",
  pageSize = 8,
  toolbar,
  empty = "Nada por aqui.",
  className,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  /** What the search reads for a row. */
  searchText: (row: T) => string;
  label: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  /** Extra controls at the end of the search row (filters, export). */
  toolbar?: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? rows.filter((row) => searchText(row).toLowerCase().includes(term)) : rows;
  }, [query, rows, searchText]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);

  return (
    <div className={cx("ac-dtable", className)}>
      <div className="ac-dtable__bar">
        <SearchField
          size="sm"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          onClear={() => {
            setQuery("");
            setPage(1);
          }}
          clearLabel="Limpar busca"
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
        />
        <Chip>{filtered.length}</Chip>
        {toolbar ? <div className="ac-dtable__tools">{toolbar}</div> : null}
      </div>

      <Table
        columns={columns}
        rows={slice}
        getKey={getKey}
        label={label}
        selected={selected}
        onSelectedChange={setSelected}
        empty={empty}
      />

      <div className="ac-dtable__foot">
        <span className="ac-dtable__count">
          {selected.length > 0 ? `${selected.length} selecionadas` : `${filtered.length} linhas`}
        </span>
        <Pagination page={current} pageCount={pageCount} onPageChange={setPage} />
      </div>
    </div>
  );
}
