import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Play,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  Wifi,
} from "lucide-react";
import { api, type DBProfile, type SchemaTable } from "../api";
import { quoteIdentifier } from "../lib";
import { useApp } from "../store";

interface Props {
  onOpenQuery: (profileId: string, sql: string) => void;
}

export default function DatabasesPanel({ onOpenQuery }: Props) {
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, SchemaTable[] | undefined>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notify = useApp((state) => state.notify);

  async function load() {
    setBusy(true);
    try {
      setProfiles(await api.dbProfiles());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connections.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(profile: DBProfile) {
    const next = !expanded[profile.id];
    setExpanded((value) => ({ ...value, [profile.id]: next }));
    if (next && schemas[profile.id] === undefined) {
      try {
        const tables = await api.dbSchema(profile.id);
        setSchemas((value) => ({ ...value, [profile.id]: tables }));
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Could not read schema.");
      }
    }
  }

  return (
    <div className="panel">
      <div className="panel-heading">
        <span>Databases</span>
        <div className="panel-actions">
          <button className="icon-button" title="Refresh" onClick={() => void load()}>
            <RefreshCw size={14} />
          </button>
          <button className="icon-button" title="New connection" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} />
          </button>
        </div>
      </div>

      {showForm && (
        <ConnectionForm
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {busy && <div className="panel-muted">Loading...</div>}
      {error && <div className="panel-error">{error}</div>}

      {profiles.map((profile) => (
        <div className="db-profile" key={profile.id}>
          <div className="db-profile-row">
            <button className="db-profile-name" onClick={() => void toggle(profile)}>
              {expanded[profile.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Database size={15} className="db-icon" />
              <span>{profile.name}</span>
              <span className={`driver-badge ${profile.driver}`}>{profile.driver}</span>
              {profile.readOnly && <span className="readonly-badge">read-only</span>}
            </button>
            <div className="db-profile-actions">
              <button
                className="icon-button"
                title="New query"
                onClick={() => onOpenQuery(profile.id, "")}
              >
                <Play size={13} />
              </button>
              <button
                className="icon-button"
                title="Test connection"
                onClick={() => {
                  api
                    .testDBProfile(profile.id)
                    .then(() => notify("success", `${profile.name} is reachable.`))
                    .catch((err) =>
                      notify("error", err instanceof Error ? err.message : "Connection failed."),
                    );
                }}
              >
                <Wifi size={13} />
              </button>
              <button
                className="icon-button danger"
                title="Delete connection"
                onClick={() => {
                  if (!window.confirm(`Delete connection "${profile.name}"?`)) return;
                  api
                    .deleteDBProfile(profile.id)
                    .then(() => void load())
                    .catch((err) =>
                      notify("error", err instanceof Error ? err.message : "Could not delete."),
                    );
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          {expanded[profile.id] && (
            <div className="db-schema">
              {schemas[profile.id] === undefined && <div className="panel-muted">Reading schema...</div>}
              {schemas[profile.id]?.length === 0 && <div className="panel-muted">No tables.</div>}
              {schemas[profile.id]?.map((table) => (
                <button
                  key={`${table.schema}.${table.name}`}
                  className="db-table"
                  onClick={() => onOpenQuery(profile.id, defaultQuery(profile.driver, table))}
                  title={`${table.schema}.${table.name}`}
                >
                  <Table2 size={14} />
                  <span>{table.name}</span>
                  <span className="db-column-count">{table.columns.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {!busy && profiles.length === 0 && !showForm && (
        <div className="empty-hint">
          <Database size={22} />
          <p>No database connections yet.</p>
          <button className="ghost" onClick={() => setShowForm(true)}>
            Add connection
          </button>
        </div>
      )}
    </div>
  );
}

function defaultQuery(driver: string, table: SchemaTable): string {
  if (driver === "mongodb") {
    return JSON.stringify(
      { database: table.schema, collection: table.name, filter: {}, limit: 100 },
      null,
      2,
    );
  }
  if (driver === "redis") {
    return "SCAN 0 COUNT 100";
  }
  return `SELECT * FROM ${quoteIdentifier(driver, table.schema, table.name)} LIMIT 100;`;
}

function ConnectionForm({ onCreated }: { onCreated: () => void }) {
  const notify = useApp((state) => state.notify);
  const [name, setName] = useState("");
  const [driver, setDriver] = useState("postgres");
  const [dsn, setDsn] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createDBProfile({ name, driver, dsn, readOnly });
      notify("success", "Connection added.");
      onCreated();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Could not add connection.");
    } finally {
      setBusy(false);
    }
  }

  const hints: Record<string, string> = {
    postgres: "postgres://user:pass@host:5432/db?sslmode=disable",
    mysql: "user:pass@tcp(host:3306)/db",
    sqlite: "/path/to/database.db",
    sqlserver: "sqlserver://user:pass@host:1433?database=db",
    oracle: "oracle://user:pass@host:1521/service",
    clickhouse: "clickhouse://user:pass@host:9000/db",
    mongodb: "mongodb://user:pass@host:27017",
    redis: "redis://user:pass@host:6379/0",
  };

  return (
    <form className="connection-form" onSubmit={submit}>
      <input
        placeholder="Connection name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <select value={driver} onChange={(event) => setDriver(event.target.value)}>
        <option value="postgres">PostgreSQL</option>
        <option value="mysql">MySQL / MariaDB</option>
        <option value="sqlite">SQLite</option>
        <option value="sqlserver">SQL Server</option>
        <option value="oracle">Oracle</option>
        <option value="clickhouse">ClickHouse</option>
        <option value="mongodb">MongoDB</option>
        <option value="redis">Redis</option>
      </select>
      <input
        placeholder={hints[driver]}
        value={dsn}
        onChange={(event) => setDsn(event.target.value)}
        required
      />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={readOnly}
          onChange={(event) => setReadOnly(event.target.checked)}
        />
        Read-only
      </label>
      <button className="primary small" disabled={busy}>
        {busy ? "Adding..." : "Add connection"}
      </button>
    </form>
  );
}
