import { Fragment, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  Play,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
  Wifi,
} from "lucide-react";
import { api, type DBProfile, type Project, type SchemaTable } from "../api";
import { useApp } from "../store";
import { Button } from "@toph/ui";
import { Checkbox } from "@toph/ui";
import { Select } from "@toph/ui";
import { useConfirm } from "@toph/ui";

interface Props {
  project: Project;
  onOpenQuery: (profileId: string, sql: string) => void;
  onOpenTable: (profileId: string, table: SchemaTable, driver: string) => void;
}

export default function DatabasesPanel({ project, onOpenQuery, onOpenTable }: Props) {
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [schemas, setSchemas] = useState<Record<string, SchemaTable[] | undefined>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();

  async function load() {
    setBusy(true);
    try {
      setProfiles(await api.dbProfiles(project.root));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connections.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [project.root]);

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
          <Button className="icon-button" title="Refresh" onClick={() => void load()}>
            <RefreshCw size={14} />
          </Button>
          <Button className="icon-button" title="New connection" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} />
          </Button>
        </div>
      </div>

      {showForm && (
        <ConnectionForm
          projectRoot={project.root}
          onCreated={() => {
            setShowForm(false);
            void load();
          }}
        />
      )}

      {busy && <div className="panel-muted">Loading...</div>}
      {error && <div className="panel-error">{error}</div>}

      {(() => {
        let lastFolder = "";
        return profiles.map((profile) => {
          const folder = profile.folder?.trim() || "Ungrouped";
          const showFolder = folder !== lastFolder;
          lastFolder = folder;
          return (
            <Fragment key={profile.id}>
              {showFolder && (
                <div className="db-folder-heading">
                  <Folder size={13} />
                  <span>{folder}</span>
                  <b>{profiles.filter((item) => (item.folder?.trim() || "Ungrouped") === folder).length}</b>
                </div>
              )}
        <div className="db-profile">
          <div className="db-profile-row">
            <Button className="db-profile-name" onClick={() => void toggle(profile)}>
              {expanded[profile.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Database size={15} className="db-icon" />
              <span>{profile.name}</span>
              <span className={`driver-badge ${profile.driver}`}>{profile.driver}</span>
              {profile.readOnly && <span className="readonly-badge">read-only</span>}
            </Button>
            <div className="db-profile-actions">
              <Button
                className="icon-button"
                title="New query"
                onClick={() => onOpenQuery(profile.id, "")}
              >
                <Play size={13} />
              </Button>
              <Button
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
              </Button>
              <Button
                className="icon-button danger"
                title="Delete connection"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Delete connection?",
                    message: `Delete "${profile.name}" from this workspace?`,
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await api.deleteDBProfile(profile.id);
                    await load();
                  } catch (err) {
                    notify("error", err instanceof Error ? err.message : "Could not delete.");
                  }
                }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
          {expanded[profile.id] && (
            <div className="db-schema">
              {schemas[profile.id] === undefined && <div className="panel-muted">Reading schema...</div>}
              {schemas[profile.id]?.length === 0 && <div className="panel-muted">No tables.</div>}
              {(() => {
                let lastSchema = "";
                return schemas[profile.id]?.map((table) => {
                  const key = `${profile.id}:${table.schema}.${table.name}`;
                  const open = Boolean(expandedTables[key]);
                  const showSchema = table.schema !== lastSchema;
                  lastSchema = table.schema;
                  return (
                    <Fragment key={key}>
                      {showSchema && (
                        <div className="db-schema-heading">
                          <Database size={11} />
                          <span>{table.schema || "default"}</span>
                        </div>
                      )}
                      <div className="db-table-node">
                        <div className="db-table-row">
                          <Button
                            className="db-table-expand"
                            title={open ? "Hide columns" : "Show columns"}
                            onClick={() => setExpandedTables((value) => ({ ...value, [key]: !open }))}
                          >
                            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </Button>
                          <Button
                            className="db-table"
                            onClick={() => onOpenTable(profile.id, table, profile.driver)}
                            title={`Open ${table.schema}.${table.name}`}
                          >
                            <Table2 size={14} />
                            <span>{table.name}</span>
                            <span className="db-column-count">{table.columns.length}</span>
                          </Button>
                        </div>
                        {open && (
                          <div className="db-columns">
                            {table.columns.map((column) => (
                              <div className="db-column-row" key={`${key}:${column.name}`}>
                                <span className="db-column-name">{column.name}</span>
                                <span className="db-column-type">{column.type}</span>
                                {column.primary && <em>PK</em>}
                                {column.nullable && <small>NULL</small>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                });
              })()}
            </div>
          )}
        </div>
            </Fragment>
          );
        });
      })()}

      {!busy && profiles.length === 0 && !showForm && (
        <div className="empty-hint">
          <Database size={22} />
          <p>No database connections yet.</p>
          <Button className="ghost" onClick={() => setShowForm(true)}>
            Add connection
          </Button>
        </div>
      )}
    </div>
  );
}

function ConnectionForm({ projectRoot, onCreated }: { projectRoot: string; onCreated: () => void }) {
  const notify = useApp((state) => state.notify);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [driver, setDriver] = useState("postgres");
  const [dsn, setDsn] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createDBProfile({ name, folder, projectRoot, driver, dsn, readOnly });
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
    cassandra: "cassandra://host:9042/keyspace",
    elasticsearch: "http://user:pass@host:9200",
    neo4j: "neo4j://user:pass@host:7687",
  };

  return (
    <form className="connection-form" onSubmit={submit}>
      <input
        placeholder="Connection name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <input
        placeholder="Folder (optional)"
        value={folder}
        onChange={(event) => setFolder(event.target.value)}
      />
      <Select
        value={driver}
        onChange={setDriver}
        label="Driver"
        options={[
          { value: "postgres", label: "PostgreSQL" },
          { value: "mysql", label: "MySQL / MariaDB" },
          { value: "sqlite", label: "SQLite" },
          { value: "sqlserver", label: "SQL Server" },
          { value: "oracle", label: "Oracle" },
          { value: "clickhouse", label: "ClickHouse" },
          { value: "mongodb", label: "MongoDB" },
          { value: "redis", label: "Redis" },
          { value: "cassandra", label: "Cassandra" },
          { value: "elasticsearch", label: "Elasticsearch" },
          { value: "neo4j", label: "Neo4j" },
        ]}
      />
      <input
        placeholder={hints[driver]}
        value={dsn}
        onChange={(event) => setDsn(event.target.value)}
        required
      />
      <Checkbox checked={readOnly} onChange={setReadOnly} label="Read-only" />
      <Button className="primary small" disabled={busy}>
        {busy ? "Adding..." : "Add connection"}
      </Button>
    </form>
  );
}
