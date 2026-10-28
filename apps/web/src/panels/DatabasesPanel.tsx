import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Database, Folder, Play, Plus, Table2, Trash2, Wifi } from "@toph/icons";
import { api, type DBProfile, type Project, type SchemaTable } from "../api";
import { useApp } from "../store";
import { useConfirm } from "../ui/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectEvents } from "../projectEvents";

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

  async function load(quiet = false): Promise<DBProfile[]> {
    if (!quiet) setBusy(true);
    try {
      const next = await api.dbProfiles(project.root);
      setProfiles(next);
      setError("");
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load connections.");
      return [];
    } finally { if (!quiet) setBusy(false); }
  }

  useEffect(() => { void load(); }, [project.root]);
  useProjectEvents(project.id, ["databases"], () => { void load(true); });

  async function toggle(profile: DBProfile) {
    const next = !expanded[profile.id];
    setExpanded((value) => ({ ...value, [profile.id]: next }));
    if (next && schemas[profile.id] === undefined) {
      try { const tables = await api.dbSchema(profile.id); setSchemas((value) => ({ ...value, [profile.id]: tables })); }
      catch (err) { notify("error", err instanceof Error ? err.message : "Could not read schema."); }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2">
        <span className="text-xs font-medium text-muted-foreground">Databases</span>
        <Button variant="ghost" size="icon-xs" aria-label="Nova conexão" onClick={() => setShowForm((value) => !value)}><Plus size={15} /></Button>
      </div>
      {showForm && <ConnectionForm projectRoot={project.root} onCreated={() => { setShowForm(false); void load(); }} />}
      {busy && <p className="px-3 py-2 text-xs text-muted-foreground">Carregando...</p>}
      {error && <p className="mx-2 mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {(() => {
          let lastFolder = "";
          return profiles.map((profile) => {
            const folder = profile.folder?.trim() || "Ungrouped";
            const showFolder = folder !== lastFolder;
            lastFolder = folder;
            return (
              <Fragment key={profile.id}>
                {showFolder && (
                  <div className="mt-2 flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Folder size={13} /><span className="flex-1 truncate">{folder}</span><span>{profiles.filter((item) => (item.folder?.trim() || "Ungrouped") === folder).length}</span>
                  </div>
                )}
                <div className="group flex items-center gap-0.5 px-1">
                  <Button variant="ghost" size="sm" className="h-8 min-w-0 flex-1 justify-start px-1.5" onClick={() => void toggle(profile)}>
                    {expanded[profile.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <Database size={15} className="text-muted-foreground" />
                    <span className="truncate text-xs">{profile.name}</span>
                    <Badge variant="outline" className="px-1 text-[9px] uppercase">{profile.driver}</Badge>
                  </Button>
                  <span className="flex shrink-0 opacity-0 group-hover:opacity-100">
                    <Button variant="ghost" size="icon-xs" aria-label="Nova query" onClick={() => onOpenQuery(profile.id, "")}><Play size={13} /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Testar conexão" onClick={() => { api.testDBProfile(profile.id).then(() => notify("success", `${profile.name} is reachable.`)).catch((err) => notify("error", err instanceof Error ? err.message : "Connection failed.")); }}><Wifi size={13} /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Excluir conexão" onClick={async () => { const ok = await confirm({ title: "Excluir conexão?", message: `Excluir "${profile.name}" deste workspace?`, confirmLabel: "Excluir", danger: true }); if (!ok) return; try { await api.deleteDBProfile(profile.id); await load(); } catch (err) { notify("error", err instanceof Error ? err.message : "Could not delete."); } }}><Trash2 size={13} /></Button>
                  </span>
                </div>
                {expanded[profile.id] && (
                  <div className="ms-5 border-s ps-1">
                    {schemas[profile.id] === undefined && <div className="px-2 py-1 text-[11px] text-muted-foreground">Lendo schema...</div>}
                    {schemas[profile.id]?.length === 0 && <div className="px-2 py-1 text-[11px] text-muted-foreground">Sem tabelas.</div>}
                    {(() => {
                      let lastSchema = "";
                      return schemas[profile.id]?.map((table) => {
                        const key = `${profile.id}:${table.schema}.${table.name}`;
                        const open = Boolean(expandedTables[key]);
                        const showSchema = table.schema !== lastSchema;
                        lastSchema = table.schema;
                        return (
                          <Fragment key={key}>
                            {showSchema && <div className="flex items-center gap-1.5 px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><Database size={11} /><span>{table.schema || "default"}</span></div>}
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="icon-xs" aria-label={open ? "Ocultar colunas" : "Mostrar colunas"} onClick={() => setExpandedTables((value) => ({ ...value, [key]: !open }))}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</Button>
                              <Button variant="ghost" size="sm" className="h-7 min-w-0 flex-1 justify-start px-1" onClick={() => onOpenTable(profile.id, table, profile.driver)} title={`Open ${table.schema}.${table.name}`}>
                                <Table2 size={14} className="text-muted-foreground" /><span className="truncate text-[11px]">{table.name}</span><span className="text-[10px] text-muted-foreground">{table.columns.length}</span>
                              </Button>
                            </div>
                            {open && (
                              <div className="ms-4 flex flex-col gap-0.5 pb-1">
                                {table.columns.map((column) => (
                                  <div className="flex items-center gap-2 px-2 text-[10px]" key={`${key}:${column.name}`}>
                                    <span className="min-w-0 flex-1 truncate">{column.name}</span><span className="truncate text-muted-foreground">{column.type}</span>{column.primary && <span className="text-primary">PK</span>}{column.nullable && <span className="text-muted-foreground">NULL</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </Fragment>
                        );
                      });
                    })()}
                  </div>
                )}
              </Fragment>
            );
          });
        })()}
        {!busy && profiles.length === 0 && !showForm && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Database size={22} className="text-muted-foreground" /><p className="text-sm text-muted-foreground">Nenhuma conexão ainda.</p>
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>Adicionar conexão</Button>
          </div>
        )}
      </div>
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
  const hints: Record<string, string> = {
    postgres: "postgres://user:pass@host:5432/db?sslmode=disable", mysql: "user:pass@tcp(host:3306)/db", sqlite: "/path/to/database.db",
    sqlserver: "sqlserver://user:pass@host:1433?database=db", oracle: "oracle://user:pass@host:1521/service", clickhouse: "clickhouse://user:pass@host:9000/db",
    mongodb: "mongodb://user:pass@host:27017", redis: "redis://user:pass@host:6379/0", cassandra: "cassandra://host:9042/keyspace",
    elasticsearch: "http://user:pass@host:9200", neo4j: "neo4j://user:pass@host:7687",
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api.createDBProfile({ name, folder, projectRoot, driver, dsn, readOnly }); notify("success", "Conexão adicionada."); onCreated(); }
    catch (err) { notify("error", err instanceof Error ? err.message : "Could not add connection."); }
    finally { setBusy(false); }
  }
  return (
    <form className="flex shrink-0 flex-col gap-2 border-b p-2" onSubmit={submit}>
      <Input placeholder="Connection name" value={name} onChange={(event) => setName(event.target.value)} required />
      <Input placeholder="Folder (optional)" value={folder} onChange={(event) => setFolder(event.target.value)} />
      <Select value={driver} onValueChange={setDriver}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[["postgres","PostgreSQL"],["mysql","MySQL / MariaDB"],["sqlite","SQLite"],["sqlserver","SQL Server"],["oracle","Oracle"],["clickhouse","ClickHouse"],["mongodb","MongoDB"],["redis","Redis"],["cassandra","Cassandra"],["elasticsearch","Elasticsearch"],["neo4j","Neo4j"]].map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input placeholder={hints[driver]} value={dsn} onChange={(event) => setDsn(event.target.value)} required />
      <label className="flex items-center gap-2 text-xs"><Checkbox checked={readOnly} onCheckedChange={(value) => setReadOnly(value === true)} /> Somente leitura</label>
      <Button size="sm" disabled={busy}>{busy ? "Adicionando..." : "Adicionar conexão"}</Button>
    </form>
  );
}
