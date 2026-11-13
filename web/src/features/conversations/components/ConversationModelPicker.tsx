import { useState } from "react";
import { Check, ChevronDown } from "@toph/icons";
import type { AIModel } from "../../../shared/api";
import { useAI, findModel, modelDisplay, modelGroup, modelTitle } from "../../providers/store";
import { ModelOptions, effortLabel } from "../../providers/components/ModelPicker";
import ProviderIcon from "../../providers/components/ProviderIcon";
import type { ChatToph, TophChat } from "../store";
import { useChats } from "../store";
import ComposerMenu from "./ComposerMenu";
import { cx } from "@toph/ui";

interface Props {
  projectId: string;
  chat: TophChat;
  tophs: ChatToph[];
}

/**
 * The conversation's model and effort, side by side. The model list shows only
 * models; effort is its own small list beside it, and both live in this
 * conversation alone (the same Toph can run another task with another pair).
 */
export default function ConversationModelPicker({ projectId, chat, tophs }: Props) {
  const models = useAI((state) => state.models);
  const config = useAI((state) => state.config);
  const updateChatToph = useChats((state) => state.updateChatToph);
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const member = tophs[0] ?? null;
  if (!member) return null;

  const override = chat.tophSettings?.[member.id] ?? {};
  const model = override.model ?? member.model ?? config?.model ?? "";
  const effort = override.effort ?? member.effort ?? "";
  const info = findModel(models, model) ?? (model ? { id: model, label: model.split("::").pop() ?? model } : undefined);
  const variants = findModel(models, model)?.variants ?? [];

  function setModel(next: string) {
    const nextVariants = findModel(models, next)?.variants ?? [];
    updateChatToph(projectId, chat.id, member!.id, {
      model: next,
      ...(nextVariants.includes(effort) ? {} : { effort: "" }),
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <ComposerMenu
        label="Modelo"
        isOpen={modelOpen}
        onOpenChange={setModelOpen}
        trigger={
          <>
            <ProviderIcon provider={info ? modelGroup(info) : "opencode"} className="size-3.5 text-text-tertiary" />
            <span className="truncate" title={modelTitle(info)}>{modelDisplay(info)}</span>
            <ChevronDown size={12} className="size-3 shrink-0 text-text-tertiary" />
          </>
        }
        triggerClassName="min-w-0 max-w-[min(240px,38vw)]"
        popoverClassName="w-[320px] max-w-[calc(100vw-24px)] p-0"
        contentClassName="max-h-[min(60vh,460px)] overflow-y-auto p-1.5"
      >
        {() => (
          <ModelOptions
            models={models as AIModel[]}
            model={model}
            onModelChange={setModel}
            effort={effort}
            efforts={variants}
            onPicked={() => setModelOpen(false)}
          />
        )}
      </ComposerMenu>
      {variants.length > 0 ? (
        <ComposerMenu
          label="Esforço"
          isOpen={effortOpen}
          onOpenChange={setEffortOpen}
          trigger={
            <>
              <span className="truncate text-text-tertiary">{effortLabel(effort)}</span>
              <ChevronDown size={12} className="size-3 shrink-0 text-text-tertiary" />
            </>
          }
          triggerClassName="max-w-[110px]"
          popoverClassName="w-[168px] p-1"
        >
          {(close) => (
            <div className="flex flex-col gap-0.5">
              {variants.map((variant) => {
                const active = variant === effort;
                return (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => {
                      updateChatToph(projectId, chat.id, member.id, { effort: variant });
                      close();
                    }}
                    className={cx(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-start text-caption-1-medium transition-colors",
                      active ? "bg-background-primary-hover text-text-primary" : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{effortLabel(variant)}</span>
                    {active ? <Check size={13} className="shrink-0 text-accent-500" /> : null}
                  </button>
                );
              })}
            </div>
          )}
        </ComposerMenu>
      ) : null}
    </div>
  );
}
