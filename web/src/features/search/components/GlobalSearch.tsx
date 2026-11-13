import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Folder, LoaderCircle, Search, Settings2, Sparkles } from "@toph/icons";
import { useApp } from "../../../app/store";
import { agentApi, type AgentSearchResult } from "../../agents/api";
import { chatDisplayName, chatTophs, conversations, latestChatForToph, useChats, type ChatToph, type TophChat } from "../../conversations/store";
import { requestOpenChat } from "../../conversations/navigation";
import BotAvatar from "../../agents/components/BotAvatar";
import { Modal } from "@toph/ui/app";
import { cx } from "@toph/ui";

type SettingsSection = "general" | "appearance" | "skills" | "harness" | "email" | "workspace";

const SETTINGS: Array<{ id: SettingsSection; title: string; subtitle: string }> = [
  { id: "general", title: "Geral", subtitle: "Conta, servidor e versão" },
  { id: "appearance", title: "Layout e ferramentas", subtitle: "Aparência do workspace" },
  { id: "skills", title: "Skills", subtitle: "Receitas do Toph" },
  { id: "harness", title: "Harness", subtitle: "CLIs, modelos e MCPs" },
  { id: "email", title: "Email", subtitle: "Contas de email do Toph" },
  { id: "workspace", title: "Workspace", subtitle: "Pastas acessíveis" },
];

type Item =
  | { kind: "project"; key: string; projectId: string; title: string; subtitle: string }
  | { kind: "chat"; key: string; projectId: string; chat: TophChat; tophs: ChatToph[]; title: string; subtitle: string }
  | { kind: "toph"; key: string; projectId: string; chatId: string | null; toph: ChatToph; title: string; subtitle: string }
  | { kind: "settings"; key: string; section: SettingsSection; title: string; subtitle: string }
  | { kind: "message"; key: string; projectId: string; result: AgentSearchResult; toph?: ChatToph; title: string; subtitle: string };

function firstLine(value: string, limit = 110): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Command palette: projects, tasks, Tophs, messages and settings. */
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
    const chats = conversations(project);
    const tophs = project?.tophs ?? [];

    for (const message of messages) {
      const toph = tophs.find((item) => item.id === message.agentId);
      const chat = chats.find((item) => item.id === message.chatId);
      result.push({
        kind: "message",
        key: `m:${message.id}`,
        projectId: activeProjectId ?? "",
        result: message,
        toph,
        title: firstLine(message.text),
        subtitle: `${toph?.name ?? "Toph"} · ${chatDisplayName(project, chat) || "Conversa"} · ${new Date(message.createdAt).toLocaleDateString("pt-BR")}`,
      });
    }

    for (const item of projects) {
      if (needle && !item.name.toLowerCase().includes(needle)) continue;
      result.push({ kind: "project", key: `p:${item.id}`, projectId: item.id, title: item.name, subtitle: item.root });
    }

    for (const chat of chats) {
      const members = chatTophs(project, chat.id);
      const name = chatDisplayName(project, chat);
      if (needle && !`${name} ${chat.description} ${members.map((m) => `${m.name} ${m.handle} ${m.role}`).join(" ")}`.toLowerCase().includes(needle)) continue;
      result.push({
        kind: "chat",
        key: `c:${chat.id}`,
        projectId: activeProjectId ?? "",
        chat,
        tophs: members,
        title: name,
        subtitle: `${members.length} Toph${members.length === 1 ? "" : "s"}${chat.description ? ` · ${chat.description}` : ""}`,
      });
    }

    for (const toph of tophs) {
      if (needle && !`${toph.name} ${toph.handle} ${toph.role} ${toph.description}`.toLowerCase().includes(needle)) continue;
      const chat = latestChatForToph(project, toph.id);
      result.push({
        kind: "toph",
        key: `h:${toph.id}`,
        projectId: activeProjectId ?? "",
        chatId: chat?.id ?? null,
        toph,
        title: toph.name,
        subtitle: `@${toph.handle} · ${toph.role}`,
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

  function openTask(projectId: string, chatId: string, title?: string) {
    if (projectId !== activeProjectId) setActiveProject(projectId);
    requestOpenChat(projectId, chatId, title);
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
    if (item.kind === "chat") {
      openTask(item.projectId, item.chat.id, item.title);
      return;
    }
    if (item.kind === "toph") {
      const chat = item.chatId
        ? project?.chats.find((entry) => entry.id === item.chatId)
        : latestChatForToph(project, item.toph.id);
      const created = chat ?? useChats.getState().createConversation(
        item.projectId,
        [item.toph.id],
        { name: item.toph.name },
      );
      if (created) openTask(item.projectId, created.id, chatDisplayName(project, created));
      return;
    }
    if (item.kind === "settings") {
      window.dispatchEvent(new CustomEvent("toph:open-settings", { detail: { section: item.section } }));
      setOpen(false);
      return;
    }
    if (item.kind === "message") {
      openTask(item.projectId, item.result.chatId);
      void agentApi
        .switchSession(item.projectId, item.result.agentId, item.result.sessionId, item.result.chatId)
        .then(() => window.setTimeout(() => window.dispatchEvent(new CustomEvent("toph:refresh-chat")), 260))
        .catch(() => undefined);
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => setOpen(false)}
      title="Busca global"
      description="Tophs, tarefas, mensagens, projetos e configurações."
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
          {!query.trim() ? <p className="px-3 py-8 text-center text-caption-1-regular text-text-tertiary">Digite para buscar Tophs, tarefas, mensagens e configurações.</p> : null}
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(item)}
              className={cx("flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2 py-2 text-start transition-colors", index === active ? "bg-background-tertiary-default" : "hover:bg-background-primary-hover")}
            >
              {item.kind === "chat" ? (
                <BotAvatar bot={item.tophs[0] ?? { name: "Toph", color: "#FFB547", avatar: "toph-logo" }} size={28} />
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
                {item.kind === "message" ? "mensagem" : item.kind === "project" ? "projeto" : item.kind === "settings" ? "config" : item.kind === "toph" ? "toph" : "tarefa"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
