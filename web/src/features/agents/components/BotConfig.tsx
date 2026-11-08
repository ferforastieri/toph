import { useCallback, useEffect, useState } from "react";
import { BookOpen, Bot, Image, Settings2, Trash2, UserRound, Wrench } from "@toph/icons";
import { agentApi } from "../api";
import { skillApi, type SkillRecord } from "../../skills/api";
import { api, type EmailAccount } from "../../../shared/api";
import type { ChatToph } from "../../conversations/store";
import { useChats } from "../../conversations/store";
import type { BotAvatar as BotAvatarShape } from "../avatars";
import { BOT_AVATAR_LABELS, BOT_AVATARS } from "../avatars";
import { findModel, modelDisplay, modelTitle, useAI } from "../../providers/store";
import BotAvatar from "./BotAvatar";
import { Accordion, AccordionItem } from "@/shared/boardui/base/accordion/accordion";
import { Button } from "@/shared/boardui/base/buttons/button";
import { Checkbox } from "@/shared/boardui/base/checkbox/checkbox";
import { Input } from "@/shared/boardui/base/input/input";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";
import { Switch } from "@/shared/boardui/base/switch/switch";
import { Select, SelectItem } from "@/shared/boardui/base/select/select";
import ModelPicker from "../../providers/components/ModelPicker";
import ColorPicker from "../../../shared/ui/ColorPicker";
import { useConfirm } from "../../../shared/ui/confirm";

interface Props {
  projectId: string;
  projectRoot?: string;
  bot: ChatToph;
}

const AVATARS: Array<{ id: BotAvatarShape; label: string }> = BOT_AVATARS.map((id) => ({
  id,
  label: BOT_AVATAR_LABELS[id],
}));

const LANGUAGES = [
  { id: "auto", label: "Detectar automaticamente" },
  { id: "pt", label: "Português" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
] as const;

const TOOL_OPTIONS = [
  { id: "generate_image", label: "Gerar imagens", description: "Criar e salvar imagens no projeto com os provedores configurados.", icon: Image },
] as const;

export default function BotConfig({ projectId, projectRoot, bot }: Props) {
  const updateToph = useChats((state) => state.updateToph);
  const removeToph = useChats((state) => state.removeToph);
  const aiConfig = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const loadModels = useAI((state) => state.loadModels);
  const effectiveModel = bot.model || aiConfig?.model || "";
  const selectedModel = findModel(models, effectiveModel);
  const confirm = useConfirm();
  const [mcpServers, setMcpServers] = useState<string[]>([]);
  const [mcpLabels, setMcpLabels] = useState<Record<string, string>>({});
  const [mcpLoading, setMcpLoading] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [managedSkills, setManagedSkills] = useState<SkillRecord[]>([]);
  const [managedLoading, setManagedLoading] = useState(false);
  const project = useChats((state) => state.byProject[projectId]);
  const projectAgents = project?.tophs ?? [];

  useEffect(() => {
    let cancelled = false;
    api.emailAccounts()
      .then((items) => { if (!cancelled) setEmailAccounts(items); })
      .catch(() => { if (!cancelled) setEmailAccounts([]); });
    return () => { cancelled = true; };
  }, []);

  const refreshMcpServers = useCallback(async () => {
    if (!projectRoot) {
      setMcpServers([]);
      return;
    }
    setMcpLoading(true);
    try {
      const result = await agentApi.mcpServers();
      setMcpServers(result.map((server) => server.id));
      setMcpLabels(Object.fromEntries(result.map((server) => [server.id, server.name])));
    } catch {
      setMcpServers([]);
    } finally {
      setMcpLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    void refreshMcpServers();
  }, [refreshMcpServers]);

  const refreshManagedSkills = useCallback(async () => {
    setManagedLoading(true);
    try {
      setManagedSkills((await skillApi.list(projectId)).filter((skill) => skill.state === "active"));
    } catch {
      setManagedSkills([]);
    } finally {
      setManagedLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refreshManagedSkills();
  }, [refreshManagedSkills]);

  useEffect(() => {
    if (models.length === 0) void loadModels();
  }, [loadModels, models.length]);

  function update(patch: Partial<ChatToph>) {
    updateToph(projectId, bot.id, patch);
  }

  function toggleTool(id: string) {
    const current = bot.tools ?? [];
    update({ tools: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] });
  }

  async function toggleManagedSkill(skill: SkillRecord) {
    const everyone = skill.agents.length === 0;
    const assigned = everyone || skill.agents.includes(bot.id);
    let agents: string[];
    if (everyone) {
      agents = projectAgents.filter((agent) => agent.id !== bot.id).map((agent) => agent.id);
      if (agents.length === 0) return;
    } else if (assigned) {
      agents = skill.agents.filter((id) => id !== bot.id);
      if (agents.length === 0) return;
    } else {
      agents = [...skill.agents, bot.id];
    }
    try {
      await skillApi.save(projectId, { id: skill.id, name: skill.name, description: skill.description, body: skill.body, agents });
      await refreshManagedSkills();
    } catch {
      // The switch keeps its previous state; the Skills screen shows the error.
    }
  }

  function toggleMcp(name: string) {
    const current = bot.mcpServers ?? [];
    update({ mcpServers: current.includes(name) ? current.filter((item) => item !== name) : [...current, name] });
  }

  function toggleEmail(id: string) {
    const current = bot.emailAccountIds ?? [];
    update({ emailAccountIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] });
  }

  async function remove() {
    const ok = await confirm({
      title: "Remover da equipe?",
      message: `Remover ${bot.name} desta equipe? O histórico no servidor permanece.`,
      confirmLabel: "Remover da equipe",
      danger: true,
    });
    if (ok) {
      await agentApi.cancelAgent(projectId, bot.id);
      removeToph(projectId, bot.id);
    }
  }

  const selectedModelInfo = selectedModel ?? (effectiveModel
    ? { id: effectiveModel, label: effectiveModel.split("/").pop() ?? effectiveModel }
    : undefined);

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <header className="flex items-center gap-3 rounded-2xl border border-border-button-default bg-background-secondary-default/45 p-3">
        <BotAvatar bot={bot} size={54} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-title-3-medium text-text-primary">{bot.name}</p>
            <span className="rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-2-semibold text-text-secondary">{bot.role}</span>
          </div>
          <p className="mt-0.5 truncate text-caption-1-regular text-text-secondary" title={modelTitle(selectedModelInfo)}>
            @{bot.handle} · motor {bot.engine || "opencode"} · {modelDisplay(selectedModelInfo)}
          </p>
        </div>
      </header>

      <Accordion variant="separated" allowsMultipleExpanded defaultExpandedKeys={["identity", "model", "capabilities"]}>
        <AccordionItem id="identity" title="Identidade" description="Nome, papel e personalidade" icon={UserRound}>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-caption-1-medium text-text-secondary">Nome</span>
                <Input value={bot.name} onChange={(value) => update({ name: value })} aria-label="Nome do bot" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption-1-medium text-text-secondary">Rótulo</span>
                <Input value={bot.role} onChange={(value) => update({ role: value })} aria-label="Rótulo do bot" placeholder="Design, Marketing, Produto..." />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Descrição</span>
              <Textarea value={bot.description} onChange={(value) => update({ description: value })} rows={3} aria-label="Descrição do bot" placeholder="O que este bot faz?" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Personalidade</span>
              <Textarea value={bot.personality} onChange={(value) => update({ personality: value })} rows={3} aria-label="Personalidade do Toph" placeholder="Como este Toph pensa e responde?" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Prompt do Toph</span>
              <Textarea value={bot.prompt} onChange={(value) => update({ prompt: value })} rows={5} aria-label="Prompt do Toph" placeholder="Instruções permanentes deste Toph. Se vazio, o papel e a personalidade acima são usados." />
              <span className="text-caption-2-regular text-text-tertiary">Este prompt é enviado junto com o histórico do chat.</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-caption-1-medium text-text-secondary">Idioma</span>
              <Select
                selectedKey={bot.language}
                onSelectionChange={(key) => update({ language: String(key) as ChatToph["language"] })}
                aria-label="Idioma do bot"
                className="w-full"
              >
                {LANGUAGES.map((language) => <SelectItem key={language.id} id={language.id}>{language.label}</SelectItem>)}
              </Select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-caption-1-medium text-text-secondary">Cor</span>
                <ColorPicker value={bot.color} onChange={(color) => update({ color })} />
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
                      className="rounded-xl border border-border-button-default p-1 transition-[background-color,border-color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-background-primary-hover active:scale-[0.95]"
                    >
                      <BotAvatar bot={{ ...bot, avatar: avatar.id }} size={28} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </AccordionItem>

        <AccordionItem id="model" title="Modelo e esforço" description="Escolha entre os modelos já configurados" icon={Settings2}>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-caption-1-medium text-text-secondary">Motor</span>
                <Select
                  selectedKey={bot.engine || "opencode"}
                  onSelectionChange={(key) => update({ engine: String(key) })}
                  aria-label="Motor do Toph"
                  className="w-full"
                >
                  <SelectItem id="opencode">OpenCode</SelectItem>
                </Select>
                <span className="text-caption-2-regular text-text-tertiary">
                  O CLI conduz o loop. Instale e teste outros motores em Configurações → CLIs.
                </span>
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-caption-1-medium text-text-secondary">Modelo</span>
                <ModelPicker
                  models={models}
                  model={effectiveModel}
                  onModelChange={(value) => update({ model: value })}
                  effort={bot.effort ?? ""}
                  efforts={selectedModel?.variants ?? []}
                  onEffortChange={(value) => update({ effort: value })}
                  fullWidth
                />
              </div>
            </div>
            <p className="text-caption-2-regular text-text-tertiary">
              Modelos, provedores e MCPs são gerenciados em Configurações → Conexões. CLIs e instalação ficam em Configurações → CLIs.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-caption-1-medium text-text-secondary">Modo do agente</span>
                <Select
                  selectedKey={bot.agentMode}
                  onSelectionChange={(key) => update({ agentMode: String(key) as ChatToph["agentMode"] })}
                  aria-label="Modo do agente"
                  className="w-full"
                >
                  <SelectItem id="build">Build</SelectItem>
                  <SelectItem id="plan">Plano</SelectItem>
                </Select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-caption-1-medium text-text-secondary">Permissões</span>
                <Select
                  selectedKey={bot.permissionMode}
                  onSelectionChange={(key) => update({ permissionMode: String(key) as ChatToph["permissionMode"] })}
                  aria-label="Permissões"
                  className="w-full"
                >
                  <SelectItem id="yolo">YOLO</SelectItem>
                  <SelectItem id="ask">Perguntar</SelectItem>
                </Select>
              </label>
            </div>
          </div>
        </AccordionItem>

        <AccordionItem id="capabilities" title="Capacidades" description="Ferramentas, skills, MCPs e email deste Toph" icon={Wrench}>
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-1.5">
              <p className="text-caption-1-semibold text-text-primary">Ferramentas</p>
              <p className="text-caption-2-regular text-text-tertiary">Arquivos, busca e terminal seguem o modo e as permissões do agente.</p>
              <div className="flex flex-col divide-y divide-separator-border">
                {TOOL_OPTIONS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Checkbox
                      key={tool.id}
                      size="sm"
                      isSelected={Boolean(bot.tools?.includes(tool.id))}
                      onChange={() => toggleTool(tool.id)}
                      className="w-full py-2"
                    >
                      <span className="flex items-start gap-2">
                        <Icon size={15} className="mt-0.5 shrink-0 text-text-tertiary" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-caption-1-medium text-text-primary">{tool.label}</span>
                          <span className="text-caption-2-regular text-text-tertiary">{tool.description}</span>
                        </span>
                      </span>
                    </Checkbox>
                  );
                })}
              </div>
            </section>

            <section className="flex flex-col gap-1.5">
              <p className="text-caption-1-semibold text-text-primary">Skills</p>
              <p className="text-caption-2-regular text-text-tertiary">Receitas atribuídas a este Toph. A lista vazia em “quem usa” vale para todos os Tophs. Gerencie em Configurações → Skills.</p>
              {managedLoading ? <span className="text-caption-2-regular text-text-tertiary">Carregando skills...</span> : null}
              {!managedLoading && managedSkills.length === 0 ? <span className="text-caption-2-regular text-text-tertiary">Nenhuma skill ainda. Crie, escolha uma sugerida ou vincule uma skill do Claude Code, Codex, OpenCode ou do projeto em Configurações → Skills.</span> : null}
              {managedSkills.length > 0 ? (
                <div className="flex flex-col divide-y divide-separator-border">
                  {managedSkills.map((skill) => {
                    const assigned = skill.agents.length === 0 || skill.agents.includes(bot.id);
                    return (
                      <Checkbox
                        key={skill.id}
                        size="sm"
                        isSelected={assigned}
                        onChange={() => void toggleManagedSkill(skill)}
                        className="w-full py-2"
                      >
                        <span className="flex items-start gap-2">
                          <BookOpen size={15} className="mt-0.5 shrink-0 text-text-tertiary" />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-caption-1-medium text-text-primary">{skill.name}</span>
                            <span className="text-caption-2-regular text-text-tertiary">{skill.description}</span>
                          </span>
                        </span>
                      </Checkbox>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-1.5">
              <p className="text-caption-1-semibold text-text-primary">MCPs</p>
              <p className="text-caption-2-regular text-text-tertiary">Servidores já configurados em Configurações → Conexões. Selecione os que este Toph pode usar.</p>
              {mcpLoading ? <span className="text-caption-2-regular text-text-tertiary">Carregando MCPs...</span> : null}
              {!mcpLoading && mcpServers.length === 0 ? <span className="text-caption-2-regular text-text-tertiary">Nenhum MCP configurado.</span> : null}
              {mcpServers.length > 0 ? (
                <div className="flex flex-col divide-y divide-separator-border">
                  {mcpServers.map((server) => (
                    <Checkbox
                      key={server}
                      size="sm"
                      isSelected={Boolean(bot.mcpServers?.includes(server))}
                      onChange={() => toggleMcp(server)}
                      className="w-full py-2"
                    >
                      <span className="text-caption-1-medium text-text-primary">{mcpLabels[server] ?? server}</span>
                    </Checkbox>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-1.5">
              <p className="text-caption-1-semibold text-text-primary">Email</p>
              <p className="text-caption-2-regular text-text-tertiary">Contas já conectadas em Configurações → Email. Selecione as que este Toph pode acessar.</p>
              {emailAccounts.length === 0 ? <span className="text-caption-2-regular text-text-tertiary">Nenhuma conta conectada.</span> : null}
              {emailAccounts.length > 0 ? (
                <div className="flex flex-col divide-y divide-separator-border">
                  {emailAccounts.map((account) => (
                    <Checkbox
                      key={account.id}
                      size="sm"
                      isSelected={Boolean(bot.emailAccountIds?.includes(account.id))}
                      onChange={() => toggleEmail(account.id)}
                      className="w-full py-2"
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-caption-1-medium text-text-primary">{account.name}</span>
                        <span className="text-caption-2-regular text-text-tertiary">{account.email}</span>
                      </span>
                    </Checkbox>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </AccordionItem>

        <AccordionItem id="execution" title="Execução" description="Notificações" icon={Bot}>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border-button-default px-2.5 py-2">
            <span className="flex flex-col">
              <span className="text-caption-1-medium text-text-primary">Notificações</span>
              <span className="text-caption-2-regular text-text-secondary">Avisar ao terminar.</span>
            </span>
            <Switch isSelected={bot.notifications} onChange={(checked) => update({ notifications: checked })} size="sm" />
          </div>
        </AccordionItem>
      </Accordion>

      <div className="flex flex-col gap-2 px-1 pt-1">
        <Button type="button" variant="ghost" size="small" leadingIcon={Trash2} className="justify-start text-status-rose-text" onClick={() => void remove()}>
          Remover da equipe
        </Button>
        <p className="flex items-center gap-1 text-caption-2-regular text-text-tertiary"><Bot size={11} /> As alterações são aplicadas nas próximas respostas.</p>
      </div>
    </div>
  );
}
