import { useAI } from "../ai";
import { botThread, TOPH_PRESETS, useBots, type TophMode, type TophPreset } from "../bots";
import BotAvatar from "./BotAvatar";
import { Modal } from "@/boardui/base/modal/modal";

interface Props {
  open: boolean;
  projectId: string;
  target: TophMode;
  onClose: () => void;
  onCreated?: (botId: string, target: TophMode) => void;
}

function nextName(base: string, used: Set<string>): string {
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    name = `${base} ${suffix}`;
    suffix += 1;
  }
  return name;
}

/** Shared gallery used to add individual Tophs and team members. */
export default function TophGallery({ open, projectId, target, onClose, onCreated }: Props) {
  const config = useAI((state) => state.config);
  const models = useAI((state) => state.models);
  const workspace = useBots((state) => state.byProject[projectId]);
  const addBot = useBots((state) => state.addBot);
  const setActiveBot = useBots((state) => state.setActiveBot);
  const setMode = useBots((state) => state.setMode);
  const team = target === "team";
  const existing = botThread(workspace, target).bots;
  const usedNames = new Set(existing.map((bot) => bot.name));

  function addPreset(preset: TophPreset) {
    const state = useBots.getState();
    if ((state.byProject[projectId]?.mode ?? "solo") !== target) setMode(projectId, target);
    const current = botThread(useBots.getState().byProject[projectId], target).bots;
    const used = new Set(current.map((bot) => bot.name));
    const name = nextName(preset.name, used);
    const bot = addBot(projectId, {
      name,
      role: preset.role,
      description: preset.description,
      personality: preset.personality,
      color: preset.color,
      avatar: preset.avatar,
      model: config?.model || models[0]?.id || "",
      coordinator: team ? (current.length === 0 || preset.coordinator === true) : false,
    });
    setActiveBot(projectId, bot.id);
    onClose();
    onCreated?.(bot.id, target);
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={team ? "Adicionar Toph à equipe" : "Adicionar Toph individual"}
      description={team ? "Visuais e cores únicas para cada membro." : "Cada individual tem conversa e sessão próprias."}
      placement="bottom"
      size="lg"
      bodyClassName="p-3"
      swipeToClose
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {TOPH_PRESETS.filter((preset) => preset.name !== "Toph").map((preset) => {
          const name = nextName(preset.name, usedNames);
          return (
            <button
              key={preset.name}
              type="button"
              onClick={() => addPreset(preset)}
              className="flex min-w-0 items-center gap-2 rounded-2xl border border-border-button-white bg-background-primary-default p-2 text-start transition-colors hover:border-accent-500/40 hover:bg-accent-500/5"
            >
              <BotAvatar bot={{ name: preset.name, color: preset.color, avatar: preset.avatar }} size={34} />
              <span className="flex min-w-0 flex-col">
                <strong className="truncate text-caption-1-semibold text-text-primary">{name}</strong>
                <span className="truncate text-caption-2-regular text-text-tertiary">{preset.role}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
