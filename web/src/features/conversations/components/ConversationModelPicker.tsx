import { useState } from "react";
import { Check, ChevronDown, Settings2 } from "@toph/icons";
import type { AIModel } from "../../../shared/api";
import { useAI, findModel, modelDisplay, modelGroup, modelTitle } from "../../providers/store";
import { ModelOptions, effortLabel } from "../../providers/components/ModelPicker";
import ProviderIcon from "../../providers/components/ProviderIcon";
import BotAvatar from "../../agents/components/BotAvatar";
import type { ChatToph } from "../store";
import { useChats } from "../store";
import ComposerMenu from "./ComposerMenu";
import { cx } from "@/shared/boardui/utils/cx";

interface Props {
  projectId: string;
  tophs: ChatToph[];
  /** Opens the participants and context dialog from the picker. */
  onOpenSettings?: () => void;
}

/**
 * Model and effort of a conversation's Toph. A group conversation asks which
 * Toph changes first, then shows that Toph's models.
 */
export default function ConversationModelPicker({ projectId, tophs, onOpenSettings }: Props) {
  const models = useAI((state) => state.models);
  const config = useAI((state) => state.config);
  const updateToph = useChats((state) => state.updateToph);
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const member = tophs.find((toph) => toph.id === memberId) ?? tophs[0] ?? null;
  if (!member) return null;

  const modelOf = (toph: ChatToph) => toph.model || config?.model || "";
  const infoOf = (toph: ChatToph) => {
    const id = modelOf(toph);
    return findModel(models, id) ?? (id ? { id, label: id.split("::").pop() ?? id } : undefined);
  };
  const active = infoOf(member);
  const variants = findModel(models, modelOf(member))?.variants ?? [];
  const group = tophs.length > 1;

  function update(next: { model?: string; effort?: string }): void {
    updateToph(projectId, member!.id, next);
  }
  return (
    <ComposerMenu
      label="Modelo e esforço"
      isOpen={open}
      onOpenChange={setOpen}
      trigger={
        <>
          {group ? (
            <BotAvatar bot={member} size={16} />
          ) : (
            <ProviderIcon provider={active ? modelGroup(active) : "opencode"} className="size-3.5 text-text-tertiary" />
          )}
          <span className="truncate" title={modelTitle(active)}>{modelDisplay(active)}</span>
          {variants.length > 0 ? <span className="shrink-0 text-caption-2-regular text-text-tertiary">· {effortLabel(member.effort ?? "")}</span> : null}
          <ChevronDown size={12} className="size-3 shrink-0 text-text-tertiary" />
        </>
      }
      triggerClassName="min-w-0 max-w-[min(280px,42vw)]"
      popoverClassName="w-[320px] max-w-[calc(100vw-24px)] p-0"
      contentClassName="max-h-[min(60vh,460px)] overflow-y-auto p-1.5"
    >
      {() => (
        <>
          {group ? (
            <div className="mb-1.5 border-b border-separator-border pb-1.5">
              <p className="px-2 pb-1 pt-0.5 text-caption-2-regular text-text-tertiary">Mudar o modelo de qual Toph?</p>
              <div className="flex flex-col gap-0.5">
                {tophs.map((toph) => {
                  const selectedToph = toph.id === member.id;
                  return (
                    <button
                      key={toph.id}
                      type="button"
                      onClick={() => setMemberId(toph.id)}
                      className={cx(
                        "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors",
                        selectedToph ? "bg-accent-500/10" : "hover:bg-background-primary-hover",
                      )}
                    >
                      <BotAvatar bot={toph} size={20} />
                      <span className="min-w-0 flex-1 truncate text-caption-1-medium text-text-primary">{toph.name}</span>
                      <span className="max-w-[110px] shrink-0 truncate text-caption-2-regular text-text-tertiary">{modelDisplay(infoOf(toph))}</span>
                      {selectedToph ? <Check size={13} className="shrink-0 text-accent-500" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <ModelOptions
            models={models as AIModel[]}
            model={modelOf(member)}
            onModelChange={(model) => update({ model })}
            effort={member.effort ?? ""}
            efforts={variants}
            onEffortChange={(effort) => update({ effort })}
            inlineEffort
            onPicked={() => setOpen(false)}
          />
          {onOpenSettings ? (
            <button
              type="button"
              onClick={() => { setOpen(false); onOpenSettings(); }}
              className="mt-1 flex w-full items-center gap-2 border-t border-separator-border px-2 py-2 text-start text-caption-1-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              <Settings2 size={13} className="shrink-0 text-text-tertiary" />
              <span className="min-w-0 flex-1 truncate">Participantes e contexto</span>
            </button>
          ) : null}
        </>
      )}
    </ComposerMenu>
  );
}
