import { useEffect, useMemo, useState } from "react";
import { Bot, Check, Trash2 } from "@toph/icons";
import { OpenCode } from "@opencode/client";
import { openCodeBase, api, type EmailAccount } from "../api";
import type { BotAvatar as BotAvatarShape, MiniBot, TophMode } from "../bots";
import { BOT_COLORS, useBots } from "../bots";
import { useAI } from "../ai";
import BotAvatar from "./BotAvatar";
import { Button } from "@/boardui/base/buttons/button";
import { Input } from "@/boardui/base/input/input";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { Switch } from "@/boardui/base/switch/switch";
import { Select, SelectItem } from "@/boardui/base/select/select";
import { useConfirm } from "../ui/confirm";

interface Props {
  projectId: string;
  projectRoot?: string;
  bot: MiniBot;
  mode?: TophMode | "unset";
}

const AVATARS: Array<{ id: BotAvatarShape; label: string }> = [
  { id: "shield", label: "Escudo" },
  { id: "star", label: "Estrela" },
  { id: "diamond", label: "Diamante" },
  { id: "blob", label: "Blob" },
  { id: "circle", label: "Círculo" },
];

const LANGUAGES = [
  { id: "auto", label: "Detectar automaticamente" },
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
] as const;

export default function BotConfig({ projectId, projectRoot, bot, mode }: Props) {
  const updateBot = useBots((state) => state.updateBot);
  const removeBot = useBots((state) => state.removeBot);
  const models = useAI((state) => state.models);
  const selectedModel = models.find((model) => model.id === bot.model);
  const efforts = selectedModel?.variants ?? [];
  const confirm = useConfirm();
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);

  const client = useMemo(() => {
    const csrf = document.cookie.match(/(?:^|;\s*)toph_csrf=([^;]+)/)?.[1] ?? "";
    return OpenCode.make({ baseUrl: openCodeBase(), headers: { "X-Toph-CSRF": csrf } });
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.emailAccounts()
      .then((items) => { if (!cancelled) setEmailAccounts(items); })
      .catch(() => { if (!cancelled) setEmailAccounts([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!projectRoot) return;
    let cancelled = false;
    setMcpLoading(true);
    client.mcp.list({ location: { directory: projectRoot } } as never)
      .then((result) => { if (!cancelled) setMcpServers(((result as unknown as { data?: Array<{ name: string }> }).data ?? []).map((server) => server.name)); })
      .catch(() => { if (!cancelled) setMcpServers([]); })
      .finally(() => { if (!cancelled) setMcpLoading(false); });
    return () => { cancelled = true; };
  }, [client, projectRoot]);

  function toggleMcp(name: string) {
    const current = bot.mcpServers ?? [];
    update({ mcpServers: current.includes(name) ? current.filter((item) => item !== name) : [...current, name] });
  }

  function toggleEmail(id: string) {
    const current = bot.emailAccountIds ?? [];
    update({ emailAccountIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] });
  }

  function update(patch: Partial<MiniBot>) {
    updateBot(projectId, bot.id, patch);
  }

  async function remove() {
    const ok = await confirm({
      title: "Remover bot?",
      message: `Remover ${bot.name} da equipe e apagar suas mensagens?`,
      confirmLabel: "Remover bot",
      danger: true,
    });
    if (ok) removeBot(projectId, bot.id);
  }

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-3">
      <div className="flex items-center gap-3">
        <BotAvatar bot={bot} size={46} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-medium text-text-primary">{bot.name}</p>
          <p className="truncate text-caption-1-regular text-text-secondary">@{bot.handle}</p>
        </div>
        {bot.coordinator && <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-caption-2-semibold text-accent-600">Coordena</span>}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption-1-medium text-text-secondary">Nome</span>
        <Input value={bot.name} onChange={(value) => update({ name: value })} aria-label="Nome do bot" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption-1-medium text-text-secondary">Rótulo</span>
        <Input value={bot.role} onChange={(value) => update({ role: value })} aria-label="Rótulo do bot" placeholder="Design, Marketing, Produto..." />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption-1-medium text-text-secondary">Descrição</span>
        <Textarea value={bot.description} onChange={(value) => update({ description: value })} rows={3} aria-label="Descrição do bot" placeholder="O que este bot faz?" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption-1-medium text-text-secondary">Personalidade</span>
        <Textarea value={bot.personality} onChange={(value) => update({ personality: value })} rows={3} aria-label="Personalidade do bot" placeholder="Como este bot pensa e responde?" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption-1-medium text-text-secondary">Modelo</span>
        <Select
          selectedKey={bot.model || "default"}
          onSelectionChange={(key) => update({ model: key === "default" ? "" : String(key) })}
          aria-label="Modelo do bot"
          className="w-full"
        >
          <SelectItem id="default">Usar o modelo padrão da IA</SelectItem>
          {models.map((model) => (
            <SelectItem key={model.id} id={model.id}>{model.label}</SelectItem>
          ))}
        </Select>
      </label>

      {efforts.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-caption-1-medium text-text-secondary">Esforço</span>
          <Select
            selectedKey={bot.effort || "default"}
            onSelectionChange={(key) => update({ effort: key === "default" ? "" : String(key) })}
            aria-label="Esforço do bot"
            className="w-full"
          >
            <SelectItem id="default">Padrão</SelectItem>
            {efforts.map((effort) => <SelectItem key={effort} id={effort}>{effort}</SelectItem>)}
          </Select>
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption-1-medium text-text-secondary">Modo</span>
          <Select selectedKey={bot.agentMode ?? "build"} onSelectionChange={(key) => update({ agentMode: String(key) as "build" | "plan" })} aria-label="Modo do agente" className="w-full">
            <SelectItem id="build">Build</SelectItem>
            <SelectItem id="plan">Plano</SelectItem>
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption-1-medium text-text-secondary">Permissões</span>
          <Select selectedKey={bot.permissionMode ?? "yolo"} onSelectionChange={(key) => update({ permissionMode: String(key) as "yolo" | "ask" | "deny" })} aria-label="Permissões" className="w-full">
            <SelectItem id="yolo">YOLO</SelectItem>
            <SelectItem id="ask">Perguntar</SelectItem>
            <SelectItem id="deny">Negar</SelectItem>
          </Select>
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption-1-medium text-text-secondary">MCPs deste Toph</span>
        {mcpLoading ? <span className="text-caption-2-regular text-text-tertiary">Carregando MCPs...</span> : null}
        {!mcpLoading && mcpServers.length === 0 ? <span className="text-caption-2-regular text-text-tertiary">Nenhum MCP conectado. Configure em IA → MCP.</span> : null}
        {mcpServers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {mcpServers.map((server) => {
              const selected = (bot.mcpServers ?? []).includes(server);
              return (
                <button key={server} type="button" aria-pressed={selected} onClick={() => toggleMcp(server)} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-caption-2-medium transition-colors ${selected ? "border-accent-500/40 bg-accent-500/10 text-accent-600" : "border-border-button-default text-text-secondary hover:bg-background-primary-hover"}`}>
                  {selected ? <Check size={11} /> : null}{server}
                </button>
              );
            })}
          </div>
        ) : null}
        <span className="text-caption-2-regular text-text-tertiary">Só os MCPs marcados ficam disponíveis para este Toph.</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption-1-medium text-text-secondary">Email deste Toph</span>
        {emailAccounts.length === 0 ? <span className="text-caption-2-regular text-text-tertiary">Nenhuma conta conectada. Configure em IA → Email.</span> : null}
        {emailAccounts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {emailAccounts.map((account) => {
              const selected = (bot.emailAccountIds ?? []).includes(account.id);
              return (
                <button key={account.id} type="button" aria-pressed={selected} onClick={() => toggleEmail(account.id)} className={`flex items-center gap-1 rounded-full border px-2 py-1 text-caption-2-medium transition-colors ${selected ? "border-accent-500/40 bg-accent-500/10 text-accent-600" : "border-border-button-default text-text-secondary hover:bg-background-primary-hover"}`}>
                  {selected ? <Check size={11} /> : null}{account.name}
                </button>
              );
            })}
          </div>
        ) : null}
        <span className="text-caption-2-regular text-text-tertiary">O Toph pode ler, responder, enviar e limpar emails destas contas.</span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption-1-medium text-text-secondary">Idioma</span>
        <Select
          selectedKey={bot.language}
          onSelectionChange={(key) => update({ language: String(key) as MiniBot["language"] })}
          aria-label="Idioma do bot"
          className="w-full"
        >
          {LANGUAGES.map((language) => <SelectItem key={language.id} id={language.id}>{language.label}</SelectItem>)}
        </Select>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption-1-medium text-text-secondary">Cor</span>
        <div className="flex flex-wrap gap-1.5">
          {BOT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Usar cor ${color}`}
              aria-pressed={bot.color === color}
              onClick={() => update({ color })}
              className="flex size-6 items-center justify-center rounded-full border border-black/10"
              style={{ backgroundColor: color }}
            >
              {bot.color === color && <Check size={12} className="text-black/70" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-caption-1-medium text-text-secondary">Forma</span>
        <div className="flex flex-wrap gap-1.5">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              aria-label={avatar.label}
              aria-pressed={bot.avatar === avatar.id}
              onClick={() => update({ avatar: avatar.id })}
              className="rounded-xl border border-border-button-default p-1 hover:bg-background-primary-hover"
            >
              <BotAvatar bot={{ ...bot, avatar: avatar.id }} size={28} />
            </button>
          ))}
        </div>
      </div>

      {mode !== "solo" ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border-button-default px-2.5 py-2">
          <span className="flex flex-col">
            <span className="text-caption-1-medium text-text-primary">Coordenador</span>
            <span className="text-caption-2-regular text-text-secondary">Distribui o trabalho e menciona especialistas.</span>
          </span>
          <Switch isSelected={bot.coordinator} onChange={(checked) => update({ coordinator: checked })} size="sm" />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 rounded-xl border border-border-button-default px-2.5 py-2">
        <span className="flex flex-col">
          <span className="text-caption-1-medium text-text-primary">Notificações</span>
          <span className="text-caption-2-regular text-text-secondary">Avisar quando este bot terminar.</span>
        </span>
        <Switch isSelected={bot.notifications} onChange={(checked) => update({ notifications: checked })} size="sm" />
      </div>

      <Button type="button" variant="ghost" size="small" leadingIcon={Trash2} className="justify-start text-status-rose-text" onClick={() => void remove()}>
        Remover bot
      </Button>
      <p className="flex items-center gap-1 text-caption-2-regular text-text-tertiary"><Bot size={11} /> As alterações são aplicadas nas próximas respostas.</p>
    </div>
  );
}
