import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, Check, ChevronDown, ChevronRight, History, LoaderCircle, Pencil, Plus, Search, Sparkles, Trash2 } from "@toph/icons";
import { useApp } from "../../../app/store";
import { useChats } from "../../conversations/store";
import { useConfirm } from "../../../shared/ui/confirm";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Input } from "@/shared/boardui/base/input/input";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";
import { cx } from "@/shared/boardui/utils/cx";
import { skillApi, type LocalSkill, type SkillDraft, type SkillRecord, type SkillVersion, type SuggestedSkill } from "../api";

const RECOMMENDED = 10_000;

function emptyDraft(): SkillDraft {
  return { name: "", description: "", body: "", agents: [] };
}

function when(value: number): string {
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type DiffLine = { kind: " " | "-" | "+"; text: string };

/** Line diff for proposal review. Long recipes fall back to a plain summary. */
function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length > 600 || b.length > 600) {
    return [
      ...a.slice(0, 300).map((text) => ({ kind: "-" as const, text })),
      { kind: "-" as const, text: "…" },
      ...b.slice(0, 300).map((text) => ({ kind: "+" as const, text })),
      { kind: "+" as const, text: "…" },
    ];
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) lines.push({ kind: " ", text: a[i++] }), j++;
    else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) lines.push({ kind: "-", text: a[i++] });
    else lines.push({ kind: "+", text: b[j++] });
  }
  return lines;
}

function Diff({ before, after }: { before: string; after: string }) {
  const lines = useMemo(() => diffLines(before, after), [before, after]);
  return (
    <pre className="max-h-64 overflow-auto rounded-xl border border-border-button-default bg-background-secondary-default p-2 font-mono text-[11px] leading-5">
      {lines.map((line, index) => (
        <div key={index} className={line.kind === "+" ? "text-status-lime-text" : line.kind === "-" ? "text-status-rose-text" : "text-text-tertiary"}>
          {line.kind} {line.text}
        </div>
      ))}
    </pre>
  );
}

interface Props {
  projectId?: string;
}

/** Managed skills: recipes stored per project and assigned to Tophs. */
export default function SkillsPanel({ projectId }: Props) {
  const notify = useApp((state) => state.notify);
  const confirm = useConfirm();
  const project = useChats((state) => (projectId ? state.byProject[projectId] : undefined));
  const ensure = useChats((state) => state.ensure);
  const [skills, setSkills] = useState<SkillRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [showingVersion, setShowingVersion] = useState<number | null>(null);
  const [discover, setDiscover] = useState(false);
  const [discoverTab, setDiscoverTab] = useState<"suggested" | "local">("suggested");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [suggested, setSuggested] = useState<SuggestedSkill[]>([]);
  const [localSkills, setLocalSkills] = useState<LocalSkill[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState("");
  const [pickedLocal, setPickedLocal] = useState<LocalSkill | null>(null);
  const [linkAgents, setLinkAgents] = useState<string[]>([]);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (projectId) void ensure(projectId);
  }, [ensure, projectId]);

  const load = useCallback(async () => {
    if (!projectId) {
      setSkills([]);
      return;
    }
    setLoading(true);
    try {
      setSkills(await skillApi.list(projectId));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível carregar as skills.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!discover || !projectId) return;
    setDiscoverLoading(true);
    setDiscoverError("");
    Promise.all([skillApi.catalog(projectId), skillApi.local(projectId)])
      .then(([catalog, local]) => {
        setSuggested(catalog);
        setLocalSkills(local);
      })
      .catch((caught) => setDiscoverError(caught instanceof Error ? caught.message : "Não foi possível buscar as skills."))
      .finally(() => setDiscoverLoading(false));
  }, [discover, projectId]);

  const members = project?.tophs ?? [];
  const existingNames = useMemo(() => new Set((skills ?? []).map((skill) => skill.name)), [skills]);
  const linkedSources = useMemo(() => new Set((skills ?? []).map((skill) => skill.source).filter((source): source is string => Boolean(source))), [skills]);
  const needle = discoverQuery.trim().toLowerCase();
  const shownSuggested = suggested.filter((skill) => !needle || `${skill.name} ${skill.description} ${skill.category}`.toLowerCase().includes(needle));
  const shownLocal = localSkills.filter((skill) => !needle || `${skill.name} ${skill.description} ${skill.origin}`.toLowerCase().includes(needle));
  const active = (skills ?? []).filter((skill) => skill.state === "active");
  const pending = (skills ?? []).filter((skill) => skill.state === "pending");
  const archived = (skills ?? []).filter((skill) => skill.state === "archived");
  const selected = selectedId ? (skills ?? []).find((skill) => skill.id === selectedId) ?? null : null;

  function agentName(id: string): string {
    const agent = members.find((item) => item.id === id);
    return agent ? agent.name : "Toph removido";
  }

  function who(ids: string[]): string {
    if (ids.length === 0) return "Todos os Tophs";
    return ids.map(agentName).join(", ");
  }

  function open(skill: SkillRecord) {
    setSelectedId(skill.id);
    setVersions([]);
    setShowingVersion(null);
    if (!projectId) return;
    setVersionsLoading(true);
    void skillApi
      .versions(projectId, skill.id)
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setVersionsLoading(false));
  }

  function edit(skill: SkillRecord) {
    setDraft({ id: skill.id, name: skill.name, description: skill.description, body: skill.body, agents: [...skill.agents], source: skill.source ?? null });
    setFormError("");
  }

  async function save() {
    if (!projectId || !draft) return;
    setSaving(true);
    setFormError("");
    try {
      await skillApi.save(projectId, draft);
      setDraft(null);
      setSelectedId(null);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Não foi possível salvar a skill.");
    } finally {
      setSaving(false);
    }
  }

  async function decide(skill: SkillRecord, approve: boolean) {
    if (!projectId) return;
    try {
      await skillApi.decide(projectId, skill.id, approve);
      await load();
      if (approve) notify("success", `Skill “${skill.name}” aprovada.`);
    } catch (caught) {
      notify("error", caught instanceof Error ? caught.message : "Não foi possível decidir a proposta.");
    }
  }

  async function archive(skill: SkillRecord, archivedValue: boolean) {
    if (!projectId) return;
    try {
      await skillApi.archive(projectId, skill.id, archivedValue);
      setSelectedId(null);
      await load();
    } catch (caught) {
      notify("error", caught instanceof Error ? caught.message : "Não foi possível arquivar a skill.");
    }
  }

  async function remove(skill: SkillRecord) {
    if (!projectId) return;
    const ok = await confirm({
      title: `Apagar a skill “${skill.name}”?`,
      message: "Ela some da lista e nenhum Toph volta a usar. Não dá para desfazer.",
      confirmLabel: "Apagar skill",
      danger: true,
    });
    if (!ok) return;
    try {
      await skillApi.remove(projectId, skill.id);
      setSelectedId(null);
      await load();
    } catch (caught) {
      notify("error", caught instanceof Error ? caught.message : "Não foi possível apagar a skill.");
    }
  }

  async function restore(skill: SkillRecord, versionId: number) {
    if (!projectId) return;
    try {
      await skillApi.restore(projectId, skill.id, versionId);
      await load();
      open((await skillApi.list(projectId)).find((item) => item.id === skill.id) ?? skill);
      notify("success", "Versão restaurada.");
    } catch (caught) {
      notify("error", caught instanceof Error ? caught.message : "Não foi possível restaurar a versão.");
    }
  }

  function openDiscover() {
    setDiscover(true);
    setDiscoverTab("suggested");
    setDiscoverQuery("");
    setPickedLocal(null);
    setLinkAgents([]);
  }

  function closeDiscover() {
    setDiscover(false);
    setPickedLocal(null);
    setLinkAgents([]);
  }

  function addSuggested(skill: SuggestedSkill) {
    setDraft({ name: skill.name, description: skill.description, body: skill.body, agents: [] });
    setFormError("");
    closeDiscover();
  }

  async function linkLocal() {
    if (!projectId || !pickedLocal) return;
    setLinking(true);
    try {
      await skillApi.link(projectId, pickedLocal.source, linkAgents);
      closeDiscover();
      await load();
      notify("success", `Skill “${pickedLocal.name}” vinculada.`);
    } catch (caught) {
      setDiscoverError(caught instanceof Error ? caught.message : "Não foi possível vincular a skill.");
    } finally {
      setLinking(false);
    }
  }

  if (!projectId) {
    return <p className="text-caption-1-regular text-text-secondary">Abra um projeto para gerenciar as skills dos Tophs.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-title-3-medium text-text-primary">Skills</p>
          <p className="mt-0.5 text-caption-1-regular text-text-secondary">
            Receitas que os Tophs seguem para um tipo de tarefa. Só o nome e o “quando usar” entram no prompt; o Toph lê a receita quando precisa. Escreva, escolha uma sugerida ou vincule uma skill do Claude Code, Codex, OpenCode ou do projeto.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {pending.length > 0 ? <Button variant="secondary" size="small" leadingIcon={History} onClick={() => setReview(true)}>{pending.length} proposta{pending.length === 1 ? "" : "s"}</Button> : null}
          <Button variant="secondary" size="small" leadingIcon={Search} onClick={openDiscover}>Encontrar skills</Button>
          <Button variant="primary" size="small" leadingIcon={Plus} onClick={() => { setDraft(emptyDraft()); setFormError(""); }}>Nova skill</Button>
        </div>
      </header>

      {error ? <p role="alert" className="rounded-xl bg-status-rose-bg px-3 py-2 text-caption-1-regular text-status-rose-text">{error}</p> : null}
      {loading && !skills ? <p className="text-caption-1-regular text-text-tertiary">Carregando skills…</p> : null}

      {!loading && active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-button-default p-5 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-accent-500/10 text-accent-500"><Sparkles size={18} /></span>
          <p className="mt-2 text-caption-1-medium text-text-primary">Nenhuma skill em uso ainda.</p>
          <p className="mx-auto mt-1 max-w-md text-caption-2-regular text-text-tertiary">
            Escreva uma, escolha uma sugerida, ou deixe os Tophs proporem: quando resolverem algo em vários passos, eles sugerem guardar o caminho. A proposta só vale depois que você aprovar.
          </p>
          <Button variant="secondary" size="small" leadingIcon={Search} className="mt-3" onClick={openDiscover}>Ver skills sugeridas</Button>
        </div>
      ) : null}

      {active.length > 0 ? (
        <section className="flex flex-col gap-1">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">Em uso</p>
          {active.map((skill) => (
            <button key={skill.id} type="button" onClick={() => open(skill)} className="flex items-center gap-3 rounded-xl border border-border-button-default bg-background-primary-default px-3 py-2.5 text-start transition-colors hover:bg-background-primary-hover">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-500"><BookOpen size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption-1-semibold text-text-primary">{skill.name}</span>
                <span className="block truncate text-caption-2-regular text-text-tertiary">{skill.description}</span>
                <span className="mt-0.5 block truncate text-caption-2-regular text-text-tertiary">{who(skill.agents)} · {skill.body.length.toLocaleString("pt-BR")} caracteres</span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-text-tertiary" />
            </button>
          ))}
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="rounded-2xl border border-accent-500/25 bg-accent-500/[0.04] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-caption-1-semibold text-text-primary">{pending.length} proposta{pending.length === 1 ? "" : "s"} esperando você</p>
            <Button variant="secondary" size="small" onClick={() => setReview(true)}>Revisar</Button>
          </div>
          <p className="mt-1 text-caption-2-regular text-text-tertiary">Propostas dos Tophs. Elas só entram em uso depois da sua aprovação.</p>
        </section>
      ) : null}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-1">
          <button type="button" onClick={() => setShowArchived((value) => !value)} className="flex items-center gap-1 px-1 py-1 text-start text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Arquivadas ({archived.length})
          </button>
          {showArchived ? archived.map((skill) => (
            <div key={skill.id} className="flex items-center gap-3 rounded-xl border border-border-button-default px-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-text-tertiary"><BookOpen size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption-1-medium text-text-secondary">{skill.name}</span>
                <span className="block truncate text-caption-2-regular text-text-tertiary">{skill.description}</span>
              </span>
              <Button variant="ghost" size="xs" onClick={() => void archive(skill, false)}>Reativar</Button>
              <Button variant="ghost" size="xs" iconOnly leadingIcon={Trash2} aria-label={`Apagar ${skill.name}`} onClick={() => void remove(skill)} />
            </div>
          )) : null}
        </section>
      ) : null}

      <Modal isOpen={discover} onClose={closeDiscover} title="Encontrar skills" description="Sugeridas pelo Toph ou já instaladas no Claude Code, Codex, OpenCode ou no projeto." placement="center" size="lg" bodyClassName="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <Button variant={discoverTab === "suggested" ? "primary" : "ghost"} size="small" onClick={() => { setDiscoverTab("suggested"); setPickedLocal(null); }}>Sugeridas</Button>
              <Button variant={discoverTab === "local" ? "primary" : "ghost"} size="small" onClick={() => { setDiscoverTab("local"); setPickedLocal(null); }}>No computador</Button>
            </div>
            <div className="min-w-[180px] flex-1">
              <Input value={discoverQuery} onChange={setDiscoverQuery} placeholder="Buscar por nome, descrição ou origem" aria-label="Buscar skills" />
            </div>
          </div>

          {discoverError ? <p role="alert" className="rounded-xl bg-status-rose-bg px-3 py-2 text-caption-1-regular text-status-rose-text">{discoverError}</p> : null}
          {discoverLoading ? <p className="flex items-center gap-2 text-caption-1-regular text-text-tertiary"><LoaderCircle className="size-4 animate-spin" /> Buscando skills…</p> : null}

          {!discoverLoading && discoverTab === "suggested" ? (
            <div className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto pe-1">
              {shownSuggested.length === 0 ? <p className="py-6 text-center text-caption-1-regular text-text-tertiary">Nenhuma sugestão encontrada.</p> : shownSuggested.map((skill) => {
                const exists = existingNames.has(skill.name);
                return (
                  <div key={skill.key} className="flex items-start gap-3 rounded-xl border border-border-button-default px-3 py-2.5">
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-500/10 text-accent-500"><Sparkles size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="text-caption-1-semibold text-text-primary">{skill.name}</strong>
                        <span className="rounded-full bg-background-tertiary-default px-1.5 text-[10px] text-text-tertiary">{skill.category}</span>
                        {exists ? <span className="rounded-full bg-status-lime-bg px-1.5 text-[10px] text-status-lime-text">Já adicionada</span> : null}
                      </div>
                      <p className="mt-0.5 text-caption-2-regular text-text-secondary">{skill.description}</p>
                    </div>
                    <Button variant="secondary" size="small" disabled={exists} onClick={() => addSuggested(skill)}>{exists ? "Em uso" : "Adicionar"}</Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!discoverLoading && discoverTab === "local" ? (
            pickedLocal ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border-button-default p-3">
                <button type="button" onClick={() => setPickedLocal(null)} className="self-start text-caption-1-medium text-text-secondary hover:text-text-primary">← Voltar</button>
                <div>
                  <strong className="text-caption-1-semibold text-text-primary">{pickedLocal.name}</strong>
                  <p className="mt-0.5 text-caption-2-regular text-text-secondary">{pickedLocal.description || "Sem descrição no frontmatter."}</p>
                  <p className="mt-1 text-caption-2-regular text-text-tertiary">{pickedLocal.origin} · {pickedLocal.bodyLength.toLocaleString("pt-BR")} caracteres · {pickedLocal.files.length} arquivo{pickedLocal.files.length === 1 ? "" : "s"} de apoio{pickedLocal.scripts ? " · tem scripts" : ""}</p>
                </div>
                <div className="rounded-xl border border-border-button-default p-3">
                  <p className="mb-2 text-caption-1-medium text-text-primary">Quem usa</p>
                  <AgentPicker agents={members} value={linkAgents} onChange={setLinkAgents} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setPickedLocal(null)}>Cancelar</Button>
                  <Button variant="primary" disabled={linking} onClick={() => void linkLocal()}>{linking ? "Vinculando…" : "Vincular skill"}</Button>
                </div>
              </div>
            ) : (
              <div className="flex max-h-[55vh] flex-col gap-1.5 overflow-y-auto pe-1">
                {shownLocal.length === 0 ? <p className="py-6 text-center text-caption-1-regular text-text-tertiary">Nenhuma skill encontrada no projeto, no Claude Code, no Codex ou no OpenCode.</p> : shownLocal.map((skill) => {
                  const linked = linkedSources.has(skill.source);
                  return (
                    <div key={skill.source} className="flex items-start gap-3 rounded-xl border border-border-button-default px-3 py-2.5">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-text-secondary"><BookOpen size={15} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-caption-1-semibold text-text-primary">{skill.name}</strong>
                          <span className="rounded-full bg-background-tertiary-default px-1.5 text-[10px] text-text-tertiary">{skill.origin}</span>
                          {skill.scripts ? <span className="rounded-full bg-status-amber-bg px-1.5 text-[10px] text-status-amber-text">scripts</span> : null}
                          {linked ? <span className="rounded-full bg-status-lime-bg px-1.5 text-[10px] text-status-lime-text">Vinculada</span> : null}
                        </div>
                        <p className="mt-0.5 text-caption-2-regular text-text-secondary">{skill.description || "Sem descrição no frontmatter."}</p>
                        <p className="mt-0.5 truncate text-caption-2-regular text-text-tertiary" title={skill.source}>{skill.bodyLength.toLocaleString("pt-BR")} caracteres · {skill.files.length} arquivo{skill.files.length === 1 ? "" : "s"} de apoio</p>
                      </div>
                      <Button variant="secondary" size="small" disabled={linked} onClick={() => { setPickedLocal(skill); setLinkAgents([]); setDiscoverError(""); }}>{linked ? "Vinculada" : "Vincular"}</Button>
                    </div>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      </Modal>

      <Modal isOpen={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? "Editar skill" : "Nova skill"} description="O nome e o “quando usar” entram no prompt. A receita é lida sob demanda." placement="center" size="lg" bodyClassName="p-4" footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
          <Button variant="primary" disabled={saving || !draft?.name.trim() || !draft.description.trim() || !draft.body.trim()} onClick={() => void save()}>{saving ? "Salvando…" : draft?.id ? "Salvar" : "Criar skill"}</Button>
        </div>
      }>
        {draft ? <SkillForm draft={draft} members={members} onChange={setDraft} error={formError} /> : null}
      </Modal>

      <Modal isOpen={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected?.name ?? "Skill"} description={selected?.description} placement="center" size="lg" bodyClassName="p-4" footer={
        selected ? <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="small" leadingIcon={Pencil} onClick={() => edit(selected)}>Editar</Button>
          <Button variant="ghost" size="small" onClick={() => void archive(selected, true)}>Arquivar</Button>
          <Button variant="danger" size="small" leadingIcon={Trash2} onClick={() => void remove(selected)}>Apagar</Button>
        </div> : null
      }>
        {selected ? <div className="flex flex-col gap-4">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border-button-default px-3 py-2"><dt className="text-caption-2-regular text-text-tertiary">Quem usa</dt><dd className="mt-0.5 text-caption-1-medium text-text-primary">{who(selected.agents)}</dd></div>
            <div className="rounded-xl border border-border-button-default px-3 py-2"><dt className="text-caption-2-regular text-text-tertiary">Origem</dt><dd className="mt-0.5 text-caption-1-medium text-text-primary">{selected.source ? "Arquivo externo" : "Escrita aqui"}</dd></div>
          </dl>
          <section>
            <p className="mb-1.5 text-caption-1-semibold text-text-primary">Receita</p>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border-button-default bg-background-secondary-default p-3 font-mono text-caption-2-regular text-text-secondary">{selected.body}</pre>
            {selected.body.length > RECOMMENDED ? <p className="mt-1 text-caption-2-regular text-status-amber-text">Receita longa: {selected.body.length.toLocaleString("pt-BR")} caracteres. O recomendado é até {RECOMMENDED.toLocaleString("pt-BR")}.</p> : null}
          </section>
          <section>
            <p className="mb-1.5 flex items-center gap-1.5 text-caption-1-semibold text-text-primary"><History size={13} /> Histórico</p>
            {versionsLoading ? <p className="text-caption-2-regular text-text-tertiary">Buscando o histórico…</p> : versions.length === 0 ? <p className="text-caption-2-regular text-text-tertiary">Nenhuma mudança ainda: esta é a primeira versão.</p> : <div className="flex flex-col gap-2">
              {versions.map((version) => <div key={version.id} className="rounded-xl border border-border-button-default px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-caption-2-regular text-text-secondary">Antes de {when(version.at)} · {version.by === "me" ? "mudada por você" : `proposta de ${agentName(version.by)}`}</span>
                  <Button variant="ghost" size="xs" onClick={() => setShowingVersion(showingVersion === version.id ? null : version.id)}>{showingVersion === version.id ? "Esconder" : "Ver mudança"}</Button>
                  <Button variant="secondary" size="xs" onClick={() => void restore(selected, version.id)}>Restaurar</Button>
                </div>
                {showingVersion === version.id ? <div className="mt-2"><Diff before={`${version.description}\n\n${version.body}`} after={`${selected.description}\n\n${selected.body}`} /></div> : null}
              </div>)}
            </div>}
          </section>
        </div> : null}
      </Modal>

      <Modal isOpen={review} onClose={() => setReview(false)} title="Propostas dos Tophs" description="Elas só entram em uso depois que você aprovar." placement="center" size="lg" bodyClassName="p-4">
        <div className="flex flex-col gap-3">
          {pending.length === 0 ? <p className="text-caption-1-regular text-text-secondary">Nenhuma proposta esperando.</p> : pending.map((proposal) => {
            const current = proposal.replaces ? (skills ?? []).find((skill) => skill.id === proposal.replaces) : null;
            const author = proposal.proposedBy ? agentName(proposal.proposedBy) : "Um Toph";
            return <section key={proposal.id} className="rounded-2xl border border-border-button-default p-3">
              <header className="flex flex-wrap items-center gap-2">
                <strong className="text-caption-1-semibold text-text-primary">{current ? `Mudar ${proposal.name}` : `Nova: ${proposal.name}`}</strong>
                <span className="text-caption-2-regular text-text-tertiary">{author} propôs {when(proposal.createdAt)}</span>
              </header>
              {proposal.reason ? <p className="mt-1 text-caption-1-regular italic text-text-secondary">“{proposal.reason}”</p> : null}
              {current ? <div className="mt-2"><Diff before={`${current.description}\n\n${current.body}`} after={`${proposal.description}\n\n${proposal.body}`} /></div> : <div className="mt-2 flex flex-col gap-2">
                <p className="text-caption-1-regular text-text-secondary"><span className="font-medium text-text-primary">Quando usar:</span> {proposal.description}</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-background-secondary-default p-2 font-mono text-[11px] leading-5 text-text-secondary">{proposal.body}</pre>
                <p className="text-caption-2-regular text-text-tertiary">Vale para {who(proposal.agents)}. Depois de aprovar, dá para liberar para outros Tophs.</p>
              </div>}
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="small" leadingIcon={Trash2} onClick={() => void decide(proposal, false)}>Recusar</Button>
                <Button variant="primary" size="small" leadingIcon={Check} onClick={() => void decide(proposal, true)}>Aprovar</Button>
              </div>
            </section>;
          })}
        </div>
      </Modal>
    </div>
  );
}

function SkillForm({ draft, members, onChange, error }: { draft: SkillDraft; members: Array<{ id: string; name: string; handle: string }>; onChange: (draft: SkillDraft) => void; error: string }): ReactNode {
  return <div className="flex flex-col gap-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Input label="Nome" value={draft.name} onChange={(value) => onChange({ ...draft, name: value })} placeholder="testes do core" />
      <Input label="Quando usar" value={draft.description} onChange={(value) => onChange({ ...draft, description: value })} placeholder="Ao rodar ou consertar os testes do Core" />
    </div>
    <Textarea label="Receita" rows={10} value={draft.body} onChange={(value) => onChange({ ...draft, body: value })} placeholder="Os passos, em Markdown: comandos exatos, armadilhas, como conferir." />
    {draft.body.length > RECOMMENDED ? <p className="text-caption-2-regular text-status-amber-text">Receita longa: {draft.body.length.toLocaleString("pt-BR")} caracteres. O recomendado é até {RECOMMENDED.toLocaleString("pt-BR")}; a receita inteira será mantida.</p> : null}
    <div className="flex flex-col gap-2 rounded-xl border border-border-button-default p-3">
      <p className="text-caption-1-medium text-text-primary">Quem usa</p>
      <AgentPicker agents={members} value={draft.agents} onChange={(agents) => onChange({ ...draft, agents })} />
    </div>
    {error ? <p role="alert" className="rounded-xl bg-status-rose-bg px-3 py-2 text-caption-1-regular text-status-rose-text">{error}</p> : null}
  </div>;
}


function AgentPicker({ agents, value, onChange }: { agents: Array<{ id: string; name: string; handle: string }>; value: string[]; onChange: (ids: string[]) => void }): ReactNode {
  const everyone = value.length === 0;
  const toggle = (id: string): void => {
    if (value.includes(id)) {
      if (value.length === 1) return;
      onChange(value.filter((item) => item !== id));
    } else {
      onChange([...value, id]);
    }
  };
  return <div className="flex flex-col gap-2">
    <div className="flex gap-1">
      <Button variant={everyone ? "primary" : "ghost"} size="xs" onClick={() => onChange([])}>Todos</Button>
      <Button variant={!everyone ? "primary" : "ghost"} size="xs" disabled={agents.length === 0} onClick={() => onChange(everyone ? [agents[0].id] : value)}>Só alguns</Button>
    </div>
    {everyone ? <p className="text-caption-2-regular text-text-tertiary">Todos os Tophs do projeto, inclusive os que forem criados depois.</p> : agents.length === 0 ? <p className="text-caption-2-regular text-text-tertiary">Nenhum Toph no projeto. Adicione um Toph a uma equipe primeiro.</p> : <div className="flex flex-wrap gap-1.5">
      {agents.map((agent) => {
        const selected = value.includes(agent.id);
        return <button key={agent.id} type="button" onClick={() => toggle(agent.id)} className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption-2-medium transition-colors", selected ? "border-accent-500 bg-accent-500/10 text-text-primary" : "border-border-button-default text-text-secondary hover:bg-background-primary-hover")}>
          <span className={cx("flex size-3.5 items-center justify-center rounded-full border", selected ? "border-accent-500 bg-accent-500 text-white" : "border-border-button-default")}>{selected ? <Check size={9} /> : null}</span>
          {agent.name} <span className="text-text-tertiary">@{agent.handle}</span>
        </button>;
      })}
    </div>}
  </div>;
}
