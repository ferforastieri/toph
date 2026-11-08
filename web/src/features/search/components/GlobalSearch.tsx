import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Folder, LoaderCircle, Search, Settings2, Sparkles } from "@toph/icons";
import { useApp } from "../../../app/store";
import { agentApi, type AgentSearchResult } from "../../agents/api";
import { teamChats, useChats, type ChatToph, type TophChat } from "../../conversations/store";
import TeamAvatar from "../../agents/components/TeamAvatar";
import BotAvatar from "../../agents/components/BotAvatar";
import { Modal } from "@/shared/boardui/base/modal/modal";
import { cx } from "@/shared/boardui/utils/cx";

type SettingsSection = "general" | "companion" | "appearance" | "skills" | "harness" | "email" | "workspace" | "about";

const SETTINGS: Array<{ id: SettingsSection; title: string; subtitle: string }> = [
  { id: "general", title: "Geral", subtitle: "Conta e servidor" },
  { id: "companion", title: "Toph pet", subtitle: "Companheiro e nível" },
  { id: "appearance", title: "Layout e ferramentas", subtitle: "Aparência do workspace" },
  { id: "skills", title: "Skills", subtitle: "Receitas dos Tophs" },
  { id: "harness", title: "Harness", subtitle: "CLIs, modelos e MCPs" },
  { id: "email", title: "Email", subtitle: "Contas de email dos Tophs" },
  { id: "workspace", title: "Workspace", subtitle: "Pastas acessíveis" },
  { id: "about", title: "Sobre", subtitle: "Versão e build" },
];

type Item =
  | { kind: "project"; key: string; projectId: string; title: string; subtitle: string }
  | { kind: "team"; key: string; projectId: string; chat: TophChat; tophs: ChatToph[]; title: string; subtitle: string }
  | { kind: "toph"; key: string; projectId: string; chatId: string; toph: ChatToph; title: string; subtitle: string }
  | { kind: "settings"; key: string; section: SettingsSection; title: string; subtitle: string }
  | { kind: "message"; key: string; projectId: string; result: AgentSearchResult; toph?: ChatToph; title: string; subtitle: string };

function firstLine(value: string, limit = 110): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Command palette: projects, teams, Tophs, messages and settings. */
export default function GlobalSearch() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const setActiveProject = useApp((state) => state.setActiveProject);
  const setSidebar = useApp((state) => state.setSidebar);
  const project = useChats((state) => (activeProjectId ? state.byProject[activeProjectId] : undefined));
  const ensure = useChats((state) => state.ensure);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<AgentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openSearch = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("toph:global-search", openSearch);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("toph:global-search", openSearch);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setMessages([]);
    setActive(0);
    window.setTimeout(() => input.current?.focus(), 30);
    if (activeProjectId) void ensure(activeProjectId);
  }, [open, activeProjectId, ensure]);

  useEffect(() => {
    if (!open || !activeProjectId || !query.trim()) {
      setMessages([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void agentApi
        .searchMessages(activeProjectId, query.trim())
        .then((items) => {
          if (!cancelled) setMessages(items);
        })
        .catch(() => {
          if (!cancelled) setMessages([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, activeProjectId, query]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result: Item[] = [];
    const teams = teamChats(project);
    const tophs = project?.tophs ?? [];
    const tophsByChat = new Map<string, ChatToph[]>();
    for (const toph of tophs) {
      const list = tophsByChat.get(toph.chatId) ?? [];
      list.push(toph);
      tophsByChat.set(toph.chatId, list);
    }

    for (const message of messages) {
      const toph = tophs.find((item) => item.id === message.agentId);
      const team = teams.find((item) => item.id === message.chatId);
      result.push({
        kind: "message",
        key: `m:${message.id}`,
        projectId: activeProjectId ?? "",
        result: message,
        toph,
        title: firstLine(message.text),
        subtitle: `${toph?.name ?? "Toph"} · ${team?.name ?? "Equipe"} · ${new Date(message.createdAt).toLocaleDateString("pt-BR")}`,
      });
    }

    for (const item of projects) {
      if (needle && !item.name.toLowerCase().includes(needle)) continue;
      result.push({ kind: "project", key: `p:${item.id}`, projectId: item.id, title: item.name, subtitle: item.root });
    }

    for (const team of teams) {
      const name = team.name || "Equipe";
      const members = tophsByChat.get(team.id) ?? [];
      if (needle && !`${name} ${team.description} ${members.map((m) => `${m.name} ${m.handle} ${m.role}`).join(" ")}`.toLowerCase().includes(needle)) continue;
      result.push({
        kind: "team",
        key: `t:${team.id}`,
        projectId: activeProjectId ?? "",
        chat: team,
        tophs: members,
        title: name,
        subtitle: `${members.length} Toph${members.length === 1 ? "" : "s"}${team.description ? ` · ${team.description}` : ""}`,
      });
    }

    for (const toph of tophs) {
      if (needle && !`${toph.name} ${toph.handle} ${toph.role} ${toph.description}`.toLowerCase().includes(needle)) continue;
      const team = teams.find((item) => item.id === toph.chatId);
      result.push({
        kind: "toph",
        key: `h:${toph.id}`,
        projectId: activeProjectId ?? "",
        chatId: toph.chatId,
        toph,
        title: toph.name,
        subtitle: `@${toph.handle} · ${toph.role}${team ? ` · ${team.name}` : ""}`,
      });
    }

    for (const section of SETTINGS) {
      if (needle && !`${section.title} ${section.subtitle}`.toLowerCase().includes(needle)) continue;
      result.push({ kind: "settings", key: `s:${section.id}`, section: section.id, title: section.title, subtitle: section.subtitle });
    }

    return result.slice(0, 40);
  }, [activeProjectId, messages, project, projects, query]);

  useEffect(() => {
    setActive(0);
  }, [query, messages.length]);

  function openTeam(projectId: string, chatId: string) {
    if (projectId !== activeProjectId) setActiveProject(projectId);
    useChats.getState().setActiveChat(projectId, chatId);
    setSidebar("bots");
    setOpen(false);
  }

  function choose(item: Item) {
    if (item.kind === "project") {
      setActiveProject(item.projectId);
      setSidebar("bots");
      setOpen(false);
      return;
    }
    if (item.kind === "team") {
      openTeam(item.projectId, item.chat.id);
      return;
    }
    if (item.kind === "toph") {
      openTeam(item.projectId, item.chatId);
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("toph:toph-action", { detail: { action: "config", tophId: item.toph.id } }));
      }, 120);
      return;
    }
    if (item.kind === "settings") {
      window.dispatchEvent(new CustomEvent("toph:open-settings", { detail: { section: item.section } }));
      setOpen(false);
      return;
    }
    if (item.kind === "message") {
      openTeam(item.projectId, item.result.chatId);
      void agentApi
        .switchSession(item.projectId, item.result.agentId, item.result.sessionId)
        .then(() => window.setTimeout(() => window.dispatchEvent(new CustomEvent("toph:refresh-chat")), 120))
        .catch(() => undefined);
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => setOpen(false)}
      title="Busca global"
      description="Equipes, Tophs, mensagens, projetos e configurações."
      size="md"
      bodyClassName="p-0"
    >
      <div className="flex flex-col">
        <label className="flex items-center gap-2 border-b border-separator-border px-4 py-3">
          <Search size={16} className="shrink-0 text-text-tertiary" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(items.length - 1, value + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter" && items[active]) {
                event.preventDefault();
                choose(items[active]);
              }
            }}
            placeholder="Buscar em tudo…"
            aria-label="Buscar em tudo"
            className="min-w-0 flex-1 bg-transparent text-body-medium text-text-primary outline-none placeholder:text-text-tertiary"
            autoComplete="off"
          />
          <kbd className="rounded-md border border-border-button-default px-1.5 py-0.5 text-[10px] text-text-tertiary">Ctrl K</kbd>
        </label>

        <div className="max-h-[min(60vh,520px)] min-h-24 overflow-y-auto p-2">
          {searching ? <p className="flex items-center gap-2 px-2 py-1 text-caption-2-regular text-text-tertiary"><LoaderCircle className="size-3 animate-spin" /> Buscando mensagens…</p> : null}
          {!items.length && query.trim() && !searching ? <p className="px-3 py-8 text-center text-caption-1-regular text-text-tertiary">Nada encontrado para “{query.trim()}”.</p> : null}
          {!query.trim() ? <p className="px-3 py-8 text-center text-caption-1-regular text-text-tertiary">Digite para buscar equipes, Tophs, mensagens e configurações.</p> : null}
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item)}
              className={cx("flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors", index === active ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}
            >
              {item.kind === "team" ? (
                <TeamAvatar tophs={item.tophs} size={28} />
              ) : item.kind === "toph" ? (
                <BotAvatar bot={item.toph} size={28} />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-tertiary-default text-text-tertiary">
                  {item.kind === "project" ? <Folder size={15} /> : item.kind === "settings" ? <Settings2 size={15} /> : item.kind === "message" ? <Sparkles size={15} /> : <Bot size={15} />}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption-1-medium text-text-primary">{item.title}</span>
                <span className="truncate text-caption-2-regular text-text-tertiary">{item.subtitle}</span>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-text-tertiary">
                {item.kind === "message" ? "mensagem" : item.kind === "project" ? "projeto" : item.kind === "settings" ? "config" : item.kind === "toph" ? "toph" : "equipe"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
