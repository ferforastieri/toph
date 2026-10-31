import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Database, Folder, Play, Plus, Table2, Trash2, Wifi } from "@toph/icons";
import { api, type DBProfile, type Project, type SchemaTable } from "../../api";
import { useApp } from "../../store";
import { useConfirm } from "../../ui/confirm";
import { useProjectEvents } from "../../projectEvents";
import { Badge } from "@/boardui/base/badges/badge";
import { Button } from "@/boardui/base/buttons/button";
import { Checkbox } from "@/boardui/base/checkbox/checkbox";
import { Input } from "@/boardui/base/input/input";
import { Modal } from "@/boardui/base/modal/modal";
import { Select, SelectItem } from "@/boardui/base/select/select";
import LoadingState from "../../components/LoadingState";

interface Props {
  project: Project;
  onOpenQuery: (profileId: string, sql: string) => void;
  onOpenTable: (profileId: string, table: SchemaTable, driver: string) => void;
}

const DRIVERS = [
  ["postgres", "PostgreSQL"], ["mysql", "MySQL / MariaDB"], ["sqlite", "SQLite"], ["sqlserver", "SQL Server"],
  ["oracle", "Oracle"], ["clickhouse", "ClickHouse"], ["mongodb", "MongoDB"], ["redis", "Redis"],
  ["cassandra", "Cassandra"], ["elasticsearch", "Elasticsearch"], ["neo4j", "Neo4j"],
];

const HINTS: Record<string, string> = {
  postgres: "postgres://user:pass@host:5432/db",
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

export default function DatabasesScreen({ project, onOpenQuery, onOpenTable }: Props) {
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const [profiles, setProfiles] = useState<DBProfile[]>([]);
  const [schemas, setSchemas] = useState<Record<string, SchemaTable[] | undefined>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    try {
      setProfiles(await api.dbProfiles(project.root));
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível carregar as conexões.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [project.root]);
  useProjectEvents(project.id, ["databases"], () => void load(true));

  async function toggle(profile: DBProfile) {
    const next = !expanded[profile.id];
    setExpanded((value) => ({ ...value, [profile.id]: next }));
    if (next && !schemas[profile.id]) {
      setBusy(profile.id);
      try {
        setSchemas((value) => ({ ...value, [profile.id]: [] }));
        const tables = await api.dbSchema(profile.id);
        setSchemas((value) => ({ ...value, [profile.id]: tables }));
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Não foi possível ler o schema.");
      } finally {
        setBusy("");
      }
    }
  }

  async function test(profile: DBProfile) {
    setBusy(`test:${profile.id}`);
    try {
      await api.testDBProfile(profile.id);
      notify("success", `${profile.name} está acessível.`);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Falha ao conectar.");
    } finally {
      setBusy("");
    }
  }

  async function remove(profile: DBProfile) {
    const ok = await confirm({
      title: "Excluir conexão?",
      message: `Excluir "${profile.name}" deste workspace?`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDBProfile(profile.id);
      await load(true);
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background-secondary-default">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <Button className="h-11 w-full justify-center" leadingIcon={Plus} onClick={() => setFormOpen(true)}>
          Nova conexão
        </Button>

        {loading ? <LoadingState label="Carregando conexões..." className="py-6" /> : null}
        {!loading && profiles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-border-button-white bg-background-primary-default p-6 text-center shadow-xs">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500">
              <Database className="size-6" />
            </span>
            <strong className="text-title-3-medium text-text-primary">Nenhuma conexão</strong>
            <p className="text-caption-1-regular text-text-secondary">Adicione um banco para consultar tabelas e executar queries.</p>
          </div>
        ) : null}

        {profiles.map((profile) => {
          const open = Boolean(expanded[profile.id]);
          const tables = schemas[profile.id];
          return (
            <section key={profile.id} className="overflow-hidden rounded-3xl border border-border-button-white bg-background-primary-default shadow-xs">
              <button type="button" className="flex w-full items-center gap-3 p-3 text-start" onClick={() => void toggle(profile)}>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500">
                  <Database className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-body-2-medium text-text-primary">{profile.name}</span>
                  <span className="flex items-center gap-1 truncate text-caption-2-regular text-text-tertiary">
                    <Folder className="size-3" /> {profile.folder || "Sem pasta"} · {profile.driver}
                  </span>
                </span>
                {profile.readOnly ? <Badge color="neutral">read-only</Badge> : null}
                {open ? <ChevronDown className="size-5 text-text-tertiary" /> : <ChevronRight className="size-5 text-text-tertiary" />}
              </button>

              <div className="grid grid-cols-3 gap-1 border-t border-separator-border p-2">
                <Button variant="secondary" size="small" className="w-full justify-center" leadingIcon={Play} disabled={Boolean(busy)} onClick={() => onOpenQuery(profile.id, "")}>Query</Button>
                <Button variant="ghost" size="small" className="w-full justify-center" leadingIcon={Wifi} disabled={Boolean(busy)} onClick={() => void test(profile)}>Testar</Button>
                <Button variant="ghost" size="small" className="w-full justify-center" leadingIcon={Trash2} onClick={() => void remove(profile)}>Excluir</Button>
              </div>

              {open ? (
                <div className="border-t border-separator-border p-2">
                  {busy === profile.id ? <LoadingState label="Lendo schema..." className="py-2" /> : null}
                  {tables?.length === 0 && busy !== profile.id ? <p className="px-2 py-3 text-caption-1-regular text-text-secondary">Sem tabelas.</p> : null}
                  <div className="flex flex-col gap-1">
                    {tables?.map((table) => (
                      <button
                        key={`${profile.id}:${table.schema}.${table.name}`}
                        type="button"
                        className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-2.5 text-start hover:bg-background-secondary-default"
                        onClick={() => onOpenTable(profile.id, table, profile.driver)}
                      >
                        <Table2 className="size-4 shrink-0 text-foreground-icon-secondary" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-caption-1-medium text-text-primary">{table.name}</span>
                          <span className="truncate text-caption-2-regular text-text-tertiary">{table.schema || "default"} · {table.columns.length} colunas</span>
                        </span>
                        <ChevronRight className="size-4 text-text-tertiary" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="Nova conexão" description="Adicione um banco ao workspace." placement="bottom" size="sm" bodyClassName="p-3" swipeToClose>
        <ConnectionForm
          projectRoot={project.root}
          onCreated={() => { setFormOpen(false); void load(true); }}
        />
      </Modal>
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
      notify("success", "Conexão adicionada.");
      onCreated();
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input placeholder="Nome da conexão" value={name} onChange={setName} isRequired fieldClassName="h-10" />
      <Input placeholder="Pasta (opcional)" value={folder} onChange={setFolder} fieldClassName="h-10" />
      <Select selectedKey={driver} onSelectionChange={(key) => setDriver(String(key))} aria-label="Driver" className="w-full">
        {DRIVERS.map(([value, label]) => <SelectItem key={value} id={value}>{label}</SelectItem>)}
      </Select>
      <Input placeholder={HINTS[driver]} value={dsn} onChange={setDsn} isRequired fieldClassName="h-10" />
      <Checkbox isSelected={readOnly} onChange={setReadOnly}>Somente leitura</Checkbox>
      <Button type="submit" className="h-11 w-full justify-center" disabled={busy || !name.trim() || !dsn.trim()}>
        {busy ? "Adicionando..." : "Adicionar conexão"}
      </Button>
    </form>
  );
}
