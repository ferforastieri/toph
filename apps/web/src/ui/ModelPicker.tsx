import { useMemo, useState } from "react";
import { Bot, ChevronDown } from "@toph/icons";
import type { AIModel } from "../api";
import { Dropdown, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
import { cx } from "@/boardui/utils/cx";

interface Props {
  models: AIModel[];
  model: string;
  onModelChange: (value: string) => void;
  effort: string;
  efforts: string[];
  onEffortChange: (value: string) => void;
}

const EFFORT_LABEL: Record<string, string> = {
  minimal: "Mínimo",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
  max: "Max",
  xhigh: "Máximo",
};

function effortLabel(value: string): string {
  if (!value) return "Padrão";
  return EFFORT_LABEL[value] ?? value;
}

export default function ModelPicker({ models, model, onModelChange, effort, efforts, onEffortChange }: Props) {
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const uniqueModels = useMemo(() => [...new Map(models.map((item) => [item.id, item])).values()], [models]);
  const selected = uniqueModels.find((item) => item.id === model);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Dropdown isOpen={modelOpen} onOpenChange={setModelOpen}>
        <DropdownTrigger
          aria-label="Modelo"
          className="flex h-7 max-w-[170px] min-w-0 items-center gap-1.5 rounded-md px-1.5 text-body-2-medium text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          <Bot size={13} className="shrink-0 text-foreground-icon-tertiary" />
          <span className="truncate">{selected?.label ?? (model ? model.split("/").pop() : "Modelo")}</span>
          <ChevronDown size={12} className="size-3 shrink-0 text-foreground-icon-tertiary" />
        </DropdownTrigger>
        <DropdownPopover aria-label="Modelos" placement="top start" className="w-[266px] p-0" dialogClassName="gap-0">
          <div className="px-3 py-2">
            <p className="px-1 pb-1 text-body-medium text-text-secondary">Modelos</p>
            <div className="flex max-h-72 flex-col overflow-y-auto">
              {uniqueModels.length === 0 && <p className="px-1 py-2 text-body-regular text-text-tertiary">Salve a configuração para carregar os modelos.</p>}
              {uniqueModels.map((item) => {
                const active = item.id === model;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onModelChange(item.id); setModelOpen(false); }}
                    className={cx(
                      "flex w-full cursor-pointer items-center justify-between gap-3 rounded-2lg px-2 py-2.5 text-start text-body-medium outline-none transition-colors",
                      active ? "bg-background-secondary-hover text-text-primary" : "text-text-primary hover:bg-background-secondary-hover/60",
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className={cx("flex size-4 shrink-0 items-center justify-center rounded-full border-2", active ? "border-accent-500" : "border-border-checkbox-default")}>
                      {active && <span className="size-2 rounded-full bg-accent-500" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </DropdownPopover>
      </Dropdown>

      {efforts.length >= 2 && (
        <Dropdown isOpen={effortOpen} onOpenChange={setEffortOpen}>
          <DropdownTrigger
            aria-label="Esforço"
            className="flex h-7 items-center gap-1 rounded-md px-1.5 text-body-2-medium text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
          >
            <span>{effortLabel(effort)}</span>
            <ChevronDown size={12} className="size-3 shrink-0 text-foreground-icon-tertiary" />
          </DropdownTrigger>
          <DropdownPopover aria-label="Esforço" placement="top start" className="w-44 p-0" dialogClassName="gap-0">
            <div className="px-3 py-2">
              <p className="px-1 pb-1 text-body-medium text-text-secondary">Esforço</p>
              <div className="flex flex-col">
                {efforts.map((level) => {
                  const active = level === effort;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => { onEffortChange(level); setEffortOpen(false); }}
                      className={cx(
                        "flex w-full cursor-pointer items-center justify-between gap-3 rounded-2lg px-2 py-2 text-start text-body-medium outline-none transition-colors",
                        active ? "bg-background-secondary-hover text-text-primary" : "text-text-primary hover:bg-background-secondary-hover/60",
                      )}
                    >
                      <span>{effortLabel(level)}</span>
                      <span className={cx("flex size-4 shrink-0 items-center justify-center rounded-full border-2", active ? "border-accent-500" : "border-border-checkbox-default")}>
                        {active && <span className="size-2 rounded-full bg-accent-500" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </DropdownPopover>
        </Dropdown>
      )}
    </div>
  );
}
