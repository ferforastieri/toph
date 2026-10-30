import { useEffect, useRef, useState } from "react";
import { Check, Pencil, Play, Square, Rows3, Trash2 } from "@toph/icons";
import { api, type DBProfile, type QueryResult } from "../api";
import { useApp, type Tab } from "../store";
import { ProgressCircle } from "@/boardui/base/progress/progress";
import CodeEditor from "../components/CodeEditor";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Badge } from "@/boardui/base/badges/badge";
import { Modal } from "@/boardui/base/modal/modal";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/boardui/base/table/table";
import { useConfirm } from "../ui/confirm";
import { useIsMobile } from "../ui/useIsMobile";
import { cx } from "@/boardui/utils/cx";
import { useProjectEvents } from "../projectEvents";

interface Props {
  tab: Tab;
}

export default function DbPanelTab({ tab }: Props) {
  const updateTab = useApp((state) => state.updateTab);
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const mobile = useIsMobile();
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [sql, setSql] = useState(tab.sql ?? "");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ rowIndex: number; values: Record<string, string> } | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const autoRan = useRef(false);
  const suppressRefreshUntil = useRef(0);
  const refreshTimer = useRef<number | undefined>(undefined);
  const runRef = useRef<() => void>(() => undefined);
  const canAutoRefresh = Boolean(
    tab.id.startsWith("db:table:") && readOnlyTableQuery(sql, profile?.driver),
  );

  useProjectEvents(tab.projectId, ["database.rows", "databases"], (event) => {
    if (!tab.profileId) return;
    if (event.type !== "sync" && event.path !== tab.profileId) return;
    if (Date.now() < suppressRefreshUntil.current) return;
    if (canAutoRefresh && !busy) {
      if (event.type === "sync" && !result) return;
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => runRef.current(), 300);
      return;
    }
    if (event.type !== "sync") setStale(true);
  });

  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

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

  useEffect(() => {
    if (autoRan.current || !tab.autoRun || !tab.profileId || !sql.trim()) return;
    autoRan.current = true;
    void run();
  }, [sql, tab.autoRun, tab.profileId]);

  async function run() {
    if (!tab.profileId || !sql.trim()) return;
    window.clearTimeout(refreshTimer.current);
    suppressRefreshUntil.current = Date.now() + 1000;
    setBusy(true);
    setStale(false);
    setError("");
    try {
      const response = await api.queryDB(tab.profileId, sql, 500);
      setResult(response);
      setStale(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed.";
      setError(message);
      notify("error", message);
    } finally {
      setBusy(false);
    }
  }

  runRef.current = () => {
    void run();
  };

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
    suppressRefreshUntil.current = Date.now() + 1500;
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
    suppressRefreshUntil.current = Date.now() + 1500;
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className={cx("flex shrink-0 border-b bg-muted/20 px-3", mobile ? "flex-col items-stretch gap-2 py-2" : "h-10 items-center justify-between gap-3")}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 rounded-full bg-primary" />
          <strong className="truncate text-xs font-medium">{profile?.name ?? "Database"}</strong>
          {profile && <Badge color="neutral" className="px-1 text-[9px] uppercase">{profile.driver}</Badge>}
          {profile?.readOnly && <span className="text-caption-2-regular text-text-secondary">read-only</span>}
        </div>
        <div className={cx("flex shrink-0 items-center gap-2", mobile && "w-full")}>
          <span className="hidden text-caption-1-regular text-text-secondary sm:inline">
            {profile?.driver === "mongodb" || profile?.driver === "elasticsearch" ? "JSON query" : profile?.driver === "redis" ? "Redis command" : profile?.driver === "neo4j" ? "Cypher" : profile?.driver === "cassandra" ? "CQL" : "Ctrl/Cmd + Enter"}
          </span>
          <Button size="small" onClick={() => void run()} disabled={busy || !sql.trim()} className={mobile ? "flex-1" : undefined}>{busy ? <ProgressCircle size="sm" isIndeterminate aria-label="Executando" /> : <Play size={14} />}{busy ? "Running" : "Run"}</Button>
          {busy && <Button variant="secondary" size="small" disabled title="Query cancellation is coming next" className={mobile ? "flex-1" : undefined}><Square size={13} /> Stop</Button>}
        </div>
      </div>
      <div className="h-[180px] shrink-0 border-b">
        <CodeEditor path={`sql:${tab.id}`} value={sql} language={profile?.driver === "mongodb" || profile?.driver === "elasticsearch" ? "json" : profile?.driver === "neo4j" ? "cypher" : "sql"} onChange={updateSql} onRun={() => void run()} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {error && <div className="m-2 rounded-lg bg-status-rose-background px-3 py-2 text-caption-1-regular text-status-rose-text">{error}</div>}
        {!error && !result && <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-secondary"><Rows3 size={20} /><p className="text-body-regular">Run a query to see results here.</p></div>}
        {result && (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b px-3 py-1.5 text-caption-1-regular text-text-secondary">
              <span>{result.rowCount} rows</span><span>{result.durationMs} ms</span>
              {result.truncated && <span className="text-status-yellow-text">truncated at 500 rows</span>}
              {stale && <span className="text-status-yellow-text">data changed — run again</span>}
            </div>
            {result.columns.length === 0 ? <div className="flex flex-1 items-center justify-center text-body-regular text-text-secondary">Statement executed.</div> : (
              <div className="min-h-0 flex-1 overflow-auto">
                <Table aria-label="Query results">
                  <TableHeader>
                    {result.columns.map((column, index) => <TableColumn key={`${column.name}:${index}`} isRowHeader={index === 0}><span className="flex flex-col"><span>{column.name}</span>{column.type && <span className="text-caption-2-regular font-normal text-text-secondary">{column.type}</span>}</span></TableColumn>)}
                    {canEdit && <TableColumn>Actions</TableColumn>}
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((value, columnIndex) => <TableCell key={columnIndex} className="max-w-[360px] truncate"><span title={formatValue(value)} className={value === null ? "italic text-text-secondary" : ""}>{value === null ? "NULL" : formatValue(value)}</span></TableCell>)}
                        {canEdit && <TableCell><span className="flex items-center gap-0.5"><Button variant="ghost" size="xs" iconOnly leadingIcon={Pencil} aria-label="Edit row" onClick={() => startEdit(rowIndex)} /><Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label="Delete row" onClick={() => void deleteRow(rowIndex)} /></span></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
      <Modal
        isOpen={Boolean(editing && tab.table)}
        onClose={() => setEditing(null)}
        title={`Edit ${tab.table?.name ?? ""}`}
        description={`Primary key: ${tab.table?.primary.join(", ") ?? ""}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={mutationBusy} onClick={() => void saveEdit()} leadingIcon={Check}>{mutationBusy ? "Saving..." : "Save row"}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {result?.columns.map((column) => (
            <Input
              key={column.name}
              label={`${column.name}${tab.table?.primary.includes(column.name) ? " (PK)" : ""}`}
              value={editing?.values[column.name] ?? ""}
              isDisabled={tab.table?.primary.includes(column.name)}
              onChange={(value) => editing && setEditing({ ...editing, values: { ...editing.values, [column.name]: value } })}
            />
          ))}
        </div>
      </Modal>
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

function readOnlyTableQuery(sql: string, driver?: string): boolean {
  const text = sql.trim();
  if (!text) return false;
  if (driver === "mongodb" || driver === "elasticsearch") {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (driver === "mongodb") {
        return Boolean(parsed && parsed.filter && !parsed.update && !parsed.delete);
      }
      const body = parsed?.body as Record<string, unknown> | undefined;
      return Boolean(body?.query);
    } catch {
      return false;
    }
  }
  if (driver === "redis") return /^scan\b/i.test(text);
  if (driver === "neo4j") return /^match\b[\s\S]*\breturn\b/i.test(text);
  if (driver === "cassandra" || !driver) return /^select\b/i.test(text);
  if (driver === "postgres" || driver === "mysql" || driver === "sqlite" || driver === "sqlserver") {
    return /^select\b/i.test(text);
  }
  return /^select\b/i.test(text);
}
