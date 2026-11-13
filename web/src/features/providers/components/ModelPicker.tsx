import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "@toph/icons";
import type { AIModel } from "../../../shared/api";
import { modelDisplay, modelGroup, modelTitle, providerLabel } from "../store";
import ProviderIcon from "./ProviderIcon";
import { cx } from "@toph/ui";
import { Slider } from "@toph/ui/app";
import ComposerMenu from "../../conversations/components/ComposerMenu";

const EFFORT_LABEL: Record<string, string> = {
  minimal: "Mínimo",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  max: "Max",
  xhigh: "Máximo",
  none: "Nenhum",
};

export function effortLabel(value: string): string {
  if (!value) return "Padrão";
  return EFFORT_LABEL[value] ?? value;
}

interface OptionsProps {
  models: AIModel[];
  model: string;
  onModelChange: (value: string) => void;
  effort: string;
  efforts: string[];
  onEffortChange?: (value: string) => void;
  /** Show the effort slider under a model with variants. */
  inlineEffort?: boolean;
  onPicked?: () => void;
}

/** Provider-grouped model list with the effort slider, shared by every picker. */
export function ModelOptions({ models, model, onModelChange, effort, efforts, onEffortChange, inlineEffort = false, onPicked }: OptionsProps) {
  const [openProviders, setOpenProviders] = useState<Set<string>>(new Set());
  const [expandedModel, setExpandedModel] = useState("");
  const uniqueModels = useMemo(() => [...new Map(models.map((item) => [item.id, item])).values()], [models]);
  const selected = uniqueModels.find((item) => item.id === model);
  const variants = selected?.variants?.length ? selected.variants : efforts;
  const showEffort = inlineEffort && variants.length > 0 && Boolean(onEffortChange);

  const groups = useMemo(() => {
    const grouped = new Map<string, AIModel[]>();
    for (const item of uniqueModels) {
      const provider = modelGroup(item);
      grouped.set(provider, [...(grouped.get(provider) ?? []), item]);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => (selected && modelGroup(selected) === a ? -1 : selected && modelGroup(selected) === b ? 1 : providerLabel(a).localeCompare(providerLabel(b))));
  }, [uniqueModels, selected?.connectionLabel]);

  useEffect(() => {
    if (!selected) return;
    setOpenProviders((current) => new Set(current).add(modelGroup(selected)));
  }, [selected]);

  function toggleProvider(provider: string) {
    setOpenProviders((current) => {
      const next = new Set(current);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  function pick(item: AIModel, nextEffort: string, close = true) {
    onModelChange(item.id);
    if (nextEffort !== effort) onEffortChange?.(nextEffort);
    if (close) onPicked?.();
  }

  function chooseModel(item: AIModel) {
    const itemVariants = item.variants ?? [];
    if (itemVariants.length === 0) {
      pick(item, "");
      return;
    }
    const nextEffort = itemVariants.includes(effort) ? effort : "";
    onModelChange(item.id);
    if (nextEffort !== effort) onEffortChange?.(nextEffort);
    setExpandedModel(item.id);
  }

  if (groups.length === 0) {
    return <p className="px-2 py-3 text-caption-1-regular text-text-tertiary">Salve a configuração para carregar os modelos.</p>;
  }

  return (
    <>
      {groups.map(([provider, items]) => {
        const expanded = openProviders.has(provider);
        return (
          <div key={provider} className="border-b border-separator-border last:border-b-0">
            <button
              type="button"
              onClick={() => toggleProvider(provider)}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-start text-caption-1-semibold text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary"
            >
              <ProviderIcon provider={provider} className="size-3.5 text-text-tertiary" />
              <span className="min-w-0 flex-1 truncate">{providerLabel(provider)}</span>
              <span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{items.length}</span>
              <ChevronDown size={13} className={cx("shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", expanded ? "rotate-180" : "")} />
            </button>
            {expanded ? (
              <div className="flex flex-col gap-0.5 pb-1">
                {items.map((item) => {
                  const active = item.id === model;
                  const itemVariants = item.variants ?? [];
                  const effortOpen = showEffort && expandedModel === item.id && itemVariants.length > 0;
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => chooseModel(item)}
                        className={cx(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-start text-body-2-regular transition-colors",
                          active ? "bg-background-secondary-hover text-text-primary" : "text-text-primary hover:bg-background-secondary-hover/60",
                        )}
                      >
                        <span className="flex min-w-0 flex-1 flex-col truncate">
                          <span className="truncate">{item.label}</span>
                          {item.label !== item.id ? <span className="truncate text-caption-2-regular text-text-tertiary">{item.id}</span> : null}
                        </span>
                        {active ? <Check size={14} className="shrink-0 text-accent-500" /> : null}
                        {itemVariants.length > 0 && showEffort ? <ChevronDown size={12} className={cx("shrink-0 text-text-tertiary transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", effortOpen ? "rotate-180" : "")} /> : null}
                      </button>
                      {effortOpen ? (
                        <div className="px-2 pb-3 pt-1">
                          <div className="mb-1 flex items-center justify-between gap-2 text-caption-2-regular">
                            <span className="text-text-tertiary">Esforço</span>
                            <span className="text-text-secondary">{effortLabel(effort)}</span>
                          </div>
                          <Slider
                            aria-label="Esforço"
                            minValue={0}
                            maxValue={itemVariants.length}
                            step={1}
                            value={effort && itemVariants.includes(effort) ? itemVariants.indexOf(effort) + 1 : 0}
                            onChange={(value) => pick(item, Number(value) === 0 ? "" : itemVariants[Number(value) - 1] ?? "", false)}
                            showTooltip={false}
                            thumbLabel="Esforço"
                          />
                          <div className="flex items-center justify-between text-[10px] leading-none text-text-tertiary">
                            <span>Padrão</span>
                            <span>{effortLabel(itemVariants[itemVariants.length - 1])}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

interface Props {
  models: AIModel[];
  model: string;
  onModelChange: (value: string) => void;
  effort: string;
  efforts: string[];
  onEffortChange?: (value: string) => void;
  fullWidth?: boolean;
}

export default function ModelPicker({ models, model, onModelChange, effort, efforts, onEffortChange, fullWidth = false }: Props) {
  const [open, setOpen] = useState(false);
  const uniqueModels = useMemo(() => [...new Map(models.map((item) => [item.id, item])).values()], [models]);
  const selected = uniqueModels.find((item) => item.id === model);
  const selectedInfo = selected ?? (model ? { id: model, label: model.split("/").pop() ?? model } : undefined);
  const selectedProvider = selected ? modelGroup(selected) : modelGroup({ id: model, label: model.split("/").pop() ?? model });
  const variants = selected?.variants?.length ? selected.variants : efforts;

  return (
    <ComposerMenu
      label="Modelo e esforço"
      isOpen={open}
      onOpenChange={setOpen}
      trigger={
        <>
          <ProviderIcon provider={selectedProvider} className="size-3.5 text-text-tertiary" />
          <span className="truncate" title={modelTitle(selectedInfo)}>{modelDisplay(selectedInfo)}</span>
          {variants.length > 0 ? <span className="shrink-0 text-caption-2-regular text-text-tertiary">· {effortLabel(effort)}</span> : null}
          <ChevronDown size={12} className="size-3 shrink-0 text-text-tertiary" />
        </>
      }
      triggerClassName={fullWidth ? "w-full max-w-none justify-start border border-border-button-default bg-background-primary-default" : "min-w-0 max-w-[340px] sm:min-w-[220px]"}
      popoverClassName="w-[300px] max-w-[calc(100vw-24px)] p-0"
      contentClassName="max-h-[min(56vh,420px)] overflow-y-auto p-1.5"
    >
      {() => (
        <ModelOptions
          models={models}
          model={model}
          onModelChange={onModelChange}
          effort={effort}
          efforts={efforts}
          onEffortChange={onEffortChange}
          inlineEffort={fullWidth}
          onPicked={() => setOpen(false)}
        />
      )}
    </ComposerMenu>
  );
}
