import { Plus } from "@toph/icons";
import { TOPH_PRESETS, chatTophs, useChats, type TophPreset } from "../../conversations/store";
import BotAvatar from "./BotAvatar";
import { Modal } from "@/shared/boardui/base/modal/modal";

interface Props {
  open: boolean;
  projectId: string;
  chatId: string | null;
  onClose: () => void;
  onCreated?: (tophId: string) => void;
}

const CUSTOM_PRESET: TophPreset = {
  name: "Novo Toph",
  role: "Personalizado",
  description: "",
  personality: "",
  prompt: "",
  color: "#FFB547",
  avatar: "toph-core",
  agentMode: "build",
  permissionMode: "yolo",
  mcpServers: [],
  skills: [],
  emailAccountIds: [],
  tools: ["generate_image", "delegate"],
  language: "auto",
};

/** Adds a pre-made Toph or a blank custom Toph to the active chat. */
export default function TophGallery({ open, projectId, chatId, onClose, onCreated }: Props) {
  const project = useChats((state) => state.byProject[projectId]);
  const addToph = useChats((state) => state.addToph);
  const existing = chatTophs(project, chatId);
  const usedNames = new Set(existing.map((toph) => toph.name.toLowerCase()));

  function add(preset: TophPreset) {
    if (!chatId) return;
    const toph = addToph(projectId, chatId, preset);
    if (!toph) return;
    onClose();
    onCreated?.(toph.id);
  }

  function addCustom() {
    let role = "Personalizado";
    let index = 2;
    while (existing.some((toph) => toph.role.trim().toLowerCase() === role.toLowerCase())) {
      role = `Personalizado ${index}`;
      index += 1;
    }
    add({ ...CUSTOM_PRESET, role });
  }

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Adicionar Toph ao chat"
      description="Sugestões prontas — escolha uma e ajuste nome, papel, cor, prompt e ferramentas."
      placement="bottom"
      size="lg"
      bodyClassName="p-3"
      swipeToClose
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <button
          type="button"
          onClick={addCustom}
          className="flex min-w-0 items-center gap-2 rounded-2xl border border-dashed border-border-button-default bg-background-primary-default p-2 text-start transition-colors hover:border-accent-500/40 hover:bg-accent-500/5"
        >
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-background-secondary-default text-accent-500">
            <Plus size={16} />
          </span>
          <span className="flex min-w-0 flex-col">
            <strong className="truncate text-caption-1-semibold text-text-primary">Criar Toph livre</strong>
            <span className="truncate text-caption-2-regular text-text-tertiary">Define papel, prompt e modelo</span>
          </span>
        </button>
        {TOPH_PRESETS.map((preset) => {
          const name = usedNames.has(preset.name.toLowerCase()) ? `${preset.name} 2` : preset.name;
          return (
            <button
              key={`${preset.name}-${preset.avatar}`}
              type="button"
              onClick={() => add(preset)}
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
