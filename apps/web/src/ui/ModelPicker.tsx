import { useMemo, useState } from "react";
import { ChevronDown } from "@toph/icons";
import type { AIModel } from "../api";
import { Dropdown, DropdownDivider, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
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
  max: "Máximo",
};

function effortLabel(value: string): string {
  if (!value) return "Padrão";
  return EFFORT_LABEL[value] ?? value;
}

export default function ModelPicker({ models, model, onModelChange, effort, efforts, onEffortChange }: Props) {
  const [open, setOpen] = useState(false);
  const uniqueModels = useMemo(() => [...new Map(models.map((item) => [item.id, item])).values()], [models]);
  const selected = uniqueModels.find((item) => item.id === model);
  const levels = efforts.length >= 2 ? efforts : ["1", "2", "3", "4", "5", "6"];
  const selectedLevel = effort ? levels.indexOf(effort) : Math.floor((levels.length - 1) / 2);
  const canChangeEffort = efforts.length >= 2;

  return (
    <Dropdown isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label="Modelos e esforço"
        className="flex h-7 max-w-[150px] items-center gap-1 rounded-xl px-1.5 text-body-2-medium text-text-secondary outline-none transition-colors hover:bg-background-secondary-hover focus-visible:ring-2 focus-visible:ring-border-focus-ring"
      >
        <span className="truncate">{selected?.label ?? "Modelo"}</span>
        <ChevronDown size={12} className="size-3 shrink-0 text-foreground-icon-tertiary" />
      </DropdownTrigger>
      <DropdownPopover aria-label="Modelos" placement="top end" className="w-[266px] p-0" dialogClassName="gap-0">
        <div className="px-3 pt-3 pb-2">
          <p className="px-1 pb-1 text-body-medium text-text-secondary">Modelos</p>
          <div className="flex flex-col">
            {uniqueModels.length === 0 && <p className="px-1 py-2 text-body-regular text-text-tertiary">Salve a configuração para carregar os modelos.</p>}
            {uniqueModels.map((item) => {
              const active = item.id === model;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { onModelChange(item.id); setOpen(false); }}
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
        <DropdownDivider className="mx-0 my-0" />
        <div className="px-3 pt-2 pb-3">
          <p className="px-1 text-body-medium text-text-secondary">
            Esforço <span className="font-semibold text-text-primary">{effortLabel(effort)}</span>
          </p>
          <div className="mt-1 flex items-center justify-between px-1 text-body-2-regular text-text-secondary">
            <span>Mais rápido.</span>
            <span>Mais inteligente</span>
          </div>
          <div className={cx("mt-2 flex h-9 items-center gap-1 rounded-full bg-background-tertiary-default p-1", !canChangeEffort && "opacity-50")}>
            {levels.map((level, index) => {
              const active = index === selectedLevel;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={!canChangeEffort}
                  aria-label={`Esforço ${effortLabel(level)}`}
                  onClick={() => { onEffortChange(level === "1" || level === "2" || level === "3" || level === "4" || level === "5" || level === "6" ? "" : level); setOpen(false); }}
                  className="relative flex h-full flex-1 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring disabled:cursor-not-allowed"
                >
                  {active ? <span className="block h-7 w-6 rounded-full bg-background-primary-default shadow-xs" /> : <span className="block h-3 w-0.5 rounded-full bg-foreground-icon-quaternary" />}
                </button>
              );
            })}
          </div>
        </div>
      </DropdownPopover>
    </Dropdown>
  );
}
