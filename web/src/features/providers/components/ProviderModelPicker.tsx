import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "@toph/icons";
import type { AIModel } from "../../../shared/api";
import { modelDisplay, modelGroup, modelTitle, providerLabel } from "../store";
import ProviderIcon from "./ProviderIcon";
import { Dropdown, DropdownPopover, DropdownTrigger } from "@/shared/toph-ui/base/dropdown/dropdown";
import { cx } from "@/shared/toph-ui/utils/cx";

interface Props {
  models: AIModel[];
  model: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function ProviderModelPicker({ models, model, onChange, placeholder = "Escolha um modelo", disabled = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [openProviders, setOpenProviders] = useState<Set<string>>(new Set());
  const uniqueModels = useMemo(() => [...new Map(models.map((item) => [item.id, item])).values()], [models]);
  const selected = uniqueModels.find((item) => item.id === model);
  const selectedInfo = selected ?? (model ? { id: model, label: model.split("/").pop() ?? model } : undefined);
  const selectedProvider = selected ? modelGroup(selected) : modelGroup({ id: model, label: model.split("/").pop() ?? model });

  const groups = useMemo(() => {
    const grouped = new Map<string, AIModel[]>();
    for (const item of uniqueModels) {
      const provider = modelGroup(item);
      grouped.set(provider, [...(grouped.get(provider) ?? []), item]);
    }
    return [...grouped.entries()].sort(([a], [b]) => (selected && modelGroup(selected) === a ? -1 : selected && modelGroup(selected) === b ? 1 : providerLabel(a).localeCompare(providerLabel(b))));
  }, [uniqueModels, selected?.connectionLabel]);

  useEffect(() => {
    if (!open || !selected) return;
    setOpenProviders((current) => new Set(current).add(modelGroup(selected)));
  }, [open, selected]);

  function toggle(provider: string) {
    setOpenProviders((current) => {
      const next = new Set(current);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label="Modelo"
        isDisabled={disabled}
        className={cx(
          "flex h-9 min-w-0 items-center gap-2 rounded-xl border border-border-button-default bg-background-primary-default px-3 text-start text-body-2-regular text-text-primary outline-none transition-colors hover:bg-background-primary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <ProviderIcon provider={selectedProvider} className="size-3.5 text-text-tertiary" />
        <span className="min-w-0 flex-1 truncate" title={selectedInfo ? modelTitle(selectedInfo) : placeholder}>{selectedInfo ? modelDisplay(selectedInfo) : placeholder}</span>
        <ChevronDown size={13} className="size-3.5 shrink-0 text-text-tertiary" />
      </DropdownTrigger>
      <DropdownPopover aria-label="Modelos por provedor" placement="bottom start" className="w-[320px] max-w-[calc(100vw-24px)] p-0" dialogClassName="gap-0">
        <div className="max-h-[min(52vh,380px)] overflow-y-auto p-1.5">
          {groups.length === 0 ? <p className="px-2 py-3 text-caption-1-regular text-text-tertiary">Nenhum modelo disponível.</p> : null}
          {groups.map(([provider, items]) => {
            const expanded = openProviders.has(provider);
            return (
              <div key={provider} className="border-b border-separator-border last:border-b-0">
                <button type="button" onClick={() => toggle(provider)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-start text-caption-1-semibold text-text-secondary transition-colors hover:bg-background-primary-hover hover:text-text-primary">
                  <ProviderIcon provider={provider} className="size-3.5 text-text-tertiary" />
                  <span className="min-w-0 flex-1 truncate">{providerLabel(provider)}</span>
                  <span className="rounded-full bg-background-tertiary-default px-1.5 text-caption-2-regular text-text-tertiary">{items.length}</span>
                  <ChevronDown size={13} className={cx("shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", expanded ? "rotate-180" : "")} />
                </button>
                {expanded ? (
                  <div className="flex flex-col gap-0.5 pb-1">
                    {items.map((item) => {
                      const active = item.id === model;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => { onChange(item.id); setOpen(false); }}
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
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </DropdownPopover>
    </Dropdown>
  );
}
