"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { cx } from "../cx";
import { Icon } from "../icons/Icon";
import { Checkbox } from "./Checkbox";

export interface TableColumn<T> {
  key: string;
  title: ReactNode;
  align?: "start" | "end";
  sortable?: boolean;
  /** What the cell shows; without it, the row's own value under `key`. */
  render?: (row: T) => ReactNode;
  /** What sorting compares; without it, the row's own value under `key`. */
  value?: (row: T) => string | number;
}

const compare = (a: string | number, b: string | number) =>
  typeof a === "number" && typeof b === "number"
    ? a - b
    : String(a).localeCompare(String(b), "pt-BR", { numeric: true });

/**
 * A table of rows that sorts in place, with an optional selection column
 * (`selected` + `onSelectedChange`) and a sticky header. It is the reading
 * table; for filters and pagination wired together, see `DataTable`.
 */
export function Table<T>({
  columns,
  rows,
  getKey,
  label,
  selected,
  onSelectedChange,
  empty = "Nada por aqui.",
  className,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  /** Names the table for screen readers. */
  label: string;
  selected?: string[];
  onSelectedChange?: (keys: string[]) => void;
  empty?: ReactNode;
  className?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const chosen = new Set(selected ?? []);

  const sorted = sort
    ? [...rows].sort((a, b) => {
        const column = columns.find((item) => item.key === sort.key);
        if (!column) return 0;
        const value = (row: T) =>
          column.value?.(row) ?? ((row as Record<string, unknown>)[column.key] as string | number | undefined) ?? "";
        return compare(value(a), value(b)) * sort.dir;
      })
    : rows;

  const all = rows.length > 0 && rows.every((row) => chosen.has(getKey(row)));
  const some = rows.some((row) => chosen.has(getKey(row)));

  function toggle(key: string) {
    if (!onSelectedChange) return;
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange([...next]);
  }

  return (
    <div className="ac-tablewrap">
      <table className={cx("ac-table", className)} aria-label={label}>
        <thead>
          <tr>
            {onSelectedChange ? (
              <th className="ac-table__check">
                <Checkbox
                  checked={all ? true : some ? "indeterminate" : false}
                  onCheckedChange={(checked) => onSelectedChange(checked ? rows.map(getKey) : [])}
                  aria-label="Selecionar todas as linhas"
                />
              </th>
            ) : null}

            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  style={{ textAlign: column.align === "end" ? "end" : "start" } as CSSProperties}
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="ac-table__sort"
                      data-dir={active ? (sort.dir === 1 ? "asc" : "desc") : undefined}
                      onClick={() =>
                        setSort((current) =>
                          current?.key !== column.key
                            ? { key: column.key, dir: 1 }
                            : current.dir === 1
                              ? { key: column.key, dir: -1 }
                              : null,
                        )
                      }
                    >
                      {column.title}
                      <Icon name="chevronDown" size={14} />
                    </button>
                  ) : (
                    column.title
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td className="ac-table__empty" colSpan={columns.length + (onSelectedChange ? 1 : 0)}>
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((row) => {
              const key = getKey(row);
              return (
                <tr key={key} data-selected={chosen.has(key) || undefined}>
                  {onSelectedChange ? (
                    <td className="ac-table__check">
                      <Checkbox
                        checked={chosen.has(key)}
                        onCheckedChange={() => toggle(key)}
                        aria-label="Selecionar a linha"
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{ textAlign: column.align === "end" ? "end" : "start" } as CSSProperties}
                    >
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[column.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
