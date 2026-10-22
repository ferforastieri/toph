import { useEffect, useState } from "react";
import { Play, Square, Timer, Rows3 } from "lucide-react";
import { api, type DBProfile, type QueryResult } from "../api";
import { useApp, type Tab } from "../store";
import CodeEditor from "../components/CodeEditor";

interface Props {
  tab: Tab;
}

export default function DbPanelTab({ tab }: Props) {
  const updateTab = useApp((state) => state.updateTab);
  const notify = useApp((state) => state.notify);
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [sql, setSql] = useState(tab.sql ?? "");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
            {profile?.driver === "mongodb"
              ? "JSON query"
              : profile?.driver === "redis"
                ? "Redis command"
                : "Ctrl/Cmd + Enter"}
          </span>
          <button className="primary small" onClick={() => void run()} disabled={busy || !sql.trim()}>
            {busy ? <Timer size={14} className="spin" /> : <Play size={14} />}
            {busy ? "Running" : "Run"}
          </button>
          {busy && (
            <button className="ghost small" disabled title="Query cancellation is coming next">
              <Square size={13} /> Stop
            </button>
          )}
        </div>
      </div>

      <div className="sql-editor">
        <CodeEditor
          path={`sql:${tab.id}`}
          value={sql}
          language={profile?.driver === "mongodb" ? "json" : "sql"}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "NULL";
  return JSON.stringify(value);
}
