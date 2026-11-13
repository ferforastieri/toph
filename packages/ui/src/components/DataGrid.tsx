"use client";

import { type ReactNode, useState } from "react";
import { cx } from "../cx";
import { Icon } from "../icons/Icon";
import { Button } from "./Button";

export interface GridColumn {
  key: string;
  title: string;
  type?: "text" | "number";
  align?: "start" | "end";
  width?: number;
}

export type GridRow = Record<string, string>;

/**
 * An editable grid: every cell is a field, a press adds a row, the trash
 * removes it, and the footer sums what the caller asks. The rows are the
 * caller's (`rows` + `onChange`) or the grid's own when omitted.
 */
export function DataGrid({
  columns,
  rows,
  onChange,
  label,
  addLabel = "Adicionar linha",
  summary,
  className,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  onChange?: (rows: GridRow[]) => void;
  label: string;
  addLabel?: string;
  /** A footer line, e.g. the totals of a column. */
  summary?: (rows: GridRow[]) => ReactNode;
  className?: string;
}) {
  const [own, setOwn] = useState<GridRow[]>(rows);
  const current = onChange ? rows : own;

  function commit(next: GridRow[]) {
    if (onChange) onChange(next);
    else setOwn(next);
  }

  function edit(index: number, key: string, value: string) {
    commit(current.map((row, position) => (position === index ? { ...row, [key]: value } : row)));
  }

  function add() {
    commit([...current, Object.fromEntries(columns.map((column) => [column.key, ""]))]);
  }

  function remove(index: number) {
    commit(current.filter((_, position) => position !== index));
  }

  return (
    <div className={cx("ac-grid", className)}>
      <div className="ac-tablewrap">
        <table className="ac-table ac-grid__table" aria-label={label}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={{ textAlign: column.align === "end" ? "end" : "start" }}>
                  {column.title}
                </th>
              ))}
              <th className="ac-grid__actions" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {current.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key} style={{ width: column.width }}>
                    <input
                      className="ac-grid__cell"
                      value={row[column.key] ?? ""}
                      inputMode={column.type === "number" ? "decimal" : undefined}
                      aria-label={`${column.title}, linha ${index + 1}`}
                      style={{ textAlign: column.align === "end" ? "end" : "start" }}
                      onChange={(event) => edit(index, column.key, event.target.value)}
                    />
                  </td>
                ))}
                <td className="ac-grid__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    iconOnly
                    aria-label={`Remover linha ${index + 1}`}
                    onClick={() => remove(index)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ac-grid__foot">
        <Button variant="ghost" size="sm" icon="plus" onClick={add}>
          {addLabel}
        </Button>
        {summary ? <span className="ac-grid__sum">{summary(current)}</span> : null}
        <span className="ac-grid__count">
          <Icon name="table" size={14} />
          {current.length} {current.length === 1 ? "linha" : "linhas"}
        </span>
      </div>
    </div>
  );
}
