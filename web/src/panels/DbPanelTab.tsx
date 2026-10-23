import { useEffect, useState } from "react";
import { Check, Pencil, Play, Square, Timer, Rows3, Trash2, X } from "lucide-react";
import { api, type DBProfile, type QueryResult } from "../api";
import { useApp, type Tab } from "../store";
import CodeEditor from "../components/CodeEditor";
import { Button } from "../ui/Button";
import { useConfirm } from "../ui/Confirm";

interface Props {
  tab: Tab;
}

export default function DbPanelTab({ tab }: Props) {
  const updateTab = useApp((state) => state.updateTab);
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [sql, setSql] = useState(tab.sql ?? "");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ rowIndex: number; values: Record<string, string> } | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const canEdit = Boolean(
    tab.table &&
      tab.table.primary.length > 0 &&
      profile &&
      !profile.readOnly &&
      !["mongodb", "redis", "elasticsearch", "neo4j", "cassandra"].includes(profile.driver),
  );

  useEffect(() => {
    if (!tab.profileId) return;
    let cancelled = false;
    api
      .dbProfiles()
      .then((profiles) => {
        if (!cancelled) {
          setProfile(profiles.find((item) => item.id === tab.profileId) ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load connection.");
      });
    return () => {
      cancelled = true;
    };
  }, [tab.profileId]);

  useEffect(() => {
    setSql(tab.sql ?? "");
  }, [tab.id, tab.sql]);

  async function run() {
    if (!tab.profileId || !sql.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await api.queryDB(tab.profileId, sql, 500);
      setResult(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
  }

  function updateSql(value: string) {
    setSql(value);
    updateTab(tab.id, { sql: value });
  }

  function startEdit(rowIndex: number) {
    if (!result || !tab.table) return;
    const row = result.rows[rowIndex];
    if (!row) return;
    const values: Record<string, string> = {};
    result.columns.forEach((column, index) => {
      values[column.name] = editableValue(row[index]);
    });
    setEditing({ rowIndex, values });
  }

  function keyForRow(rowIndex: number): Record<string, unknown> | null {
    if (!result || !tab.table) return null;
    const row = result.rows[rowIndex];
    if (!row) return null;
    const key: Record<string, unknown> = {};
    for (const column of tab.table.primary) {
      const index = result.columns.findIndex((item) => item.name === column);
      if (index < 0) return null;
      key[column] = coerceValue(editableValue(row[index]));
    }
    return key;
  }

  async function saveEdit() {
    if (!editing || !tab.profileId || !tab.table) return;
    const key = keyForRow(editing.rowIndex);
    if (!key) return;
    const values: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(editing.values)) {
      if (!tab.table.primary.includes(column)) {
        values[column] = coerceValue(value);
      }
    }
    setMutationBusy(true);
    try {
      await api.updateRow(tab.profileId, {
        schema: tab.table.schema,
        table: tab.table.name,
        key,
        values,
      });
      setEditing(null);
      notify("success", "Row updated.");
      await run();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not update row.");
    } finally {
      setMutationBusy(false);
    }
  }

  async function deleteRow(rowIndex: number) {
    if (!tab.profileId || !tab.table) return;
    const key = keyForRow(rowIndex);
    if (!key) return;
    const ok = await confirm({
      title: "Delete row?",
      message: "Delete the selected row from the database?",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setMutationBusy(true);
    try {
      await api.deleteRow(tab.profileId, {
        schema: tab.table.schema,
        table: tab.table.name,
        key,
      });
      notify("success", "Row deleted.");
      await run();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not delete row.");
    } finally {
      setMutationBusy(false);
    }
  }

  return (
    <div className="db-tab">
      <div className="db-tab-toolbar">
        <div className="db-tab-title">
          <span className="db-dot" />
          <strong>{profile?.name ?? "Database"}</strong>
          {profile && <span className="driver-badge">{profile.driver}</span>}
          {profile?.readOnly && <span className="readonly-badge">read-only</span>}
        </div>
        <div className="db-tab-actions">
          <span className="kbd-hint">
            {profile?.driver === "mongodb" || profile?.driver === "elasticsearch"
              ? "JSON query"
              : profile?.driver === "redis"
                ? "Redis command"
                : profile?.driver === "neo4j"
                  ? "Cypher"
                  : profile?.driver === "cassandra"
                    ? "CQL"
                    : "Ctrl/Cmd + Enter"}
          </span>
          <Button className="primary small" onClick={() => void run()} disabled={busy || !sql.trim()}>
            {busy ? <Timer size={14} className="spin" /> : <Play size={14} />}
            {busy ? "Running" : "Run"}
          </Button>
          {busy && (
            <Button className="ghost small" disabled title="Query cancellation is coming next">
              <Square size={13} /> Stop
            </Button>
          )}
        </div>
      </div>

      <div className="sql-editor">
        <CodeEditor
          path={`sql:${tab.id}`}
          value={sql}
          language={
            profile?.driver === "mongodb" || profile?.driver === "elasticsearch"
              ? "json"
              : profile?.driver === "neo4j"
                ? "cypher"
                : "sql"
          }
          onChange={updateSql}
          onRun={() => void run()}
        />
      </div>

      <div className="db-results">
        {error && <div className="db-error">{error}</div>}
        {!error && !result && (
          <div className="empty-hint compact">
            <Rows3 size={20} />
            <p>Run a query to see results here.</p>
          </div>
        )}
        {result && (
          <>
            <div className="result-meta">
              <span>{result.rowCount} rows</span>
              <span>{result.durationMs} ms</span>
              {result.truncated && <span className="truncated">truncated at 500 rows</span>}
            </div>
            {result.columns.length === 0 ? (
              <div className="empty-hint compact">
                <p>Statement executed.</p>
              </div>
            ) : (
              <div className="result-grid-wrap">
                <table className="result-grid">
                  <thead>
                    <tr>
                      {result.columns.map((column, index) => (
                        <th key={`${column.name}:${index}`}>
                          <span>{column.name}</span>
                          {column.type && <small>{column.type}</small>}
                        </th>
                      ))}
                      {canEdit && <th className="row-actions">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((value, columnIndex) => (
                          <td key={columnIndex} title={formatValue(value)}>
                            {value === null ? (
                              <span className="null">NULL</span>
                            ) : (
                              formatValue(value)
                            )}
                          </td>
                        ))}
                        {canEdit && (
                          <td className="row-actions">
                            <Button className="icon-button" title="Edit row" onClick={() => startEdit(rowIndex)}>
                              <Pencil size={13} />
                            </Button>
                            <Button
                              className="icon-button danger"
                              title="Delete row"
                              onClick={() => void deleteRow(rowIndex)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {editing && tab.table && (
        <div className="row-editor-backdrop" onClick={() => setEditing(null)}>
          <div className="row-editor" onClick={(event) => event.stopPropagation()}>
            <div className="row-editor-header">
              <div>
                <strong>Edit {tab.table.name}</strong>
                <span>Primary key: {tab.table.primary.join(", ")}</span>
              </div>
              <Button className="icon-button" onClick={() => setEditing(null)}>
                <X size={15} />
              </Button>
            </div>
            <div className="row-editor-fields">
              {result?.columns.map((column) => (
                <label key={column.name}>
                  <span>
                    {column.name}
                    {tab.table?.primary.includes(column.name) && <em>PK</em>}
                  </span>
                  <input
                    value={editing.values[column.name] ?? ""}
                    disabled={tab.table?.primary.includes(column.name)}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        values: { ...editing.values, [column.name]: event.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="row-editor-actions">
              <Button className="ghost small" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button className="primary small" disabled={mutationBusy} onClick={() => void saveEdit()}>
                <Check size={14} /> {mutationBusy ? "Saving..." : "Save row"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function editableValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function coerceValue(value: string): unknown {
  if (value === "") return "";
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "NULL";
  return JSON.stringify(value);
}
