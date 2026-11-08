import { RiCoinsLine } from "@remixicon/react";
import type { AgentUsage } from "../../agents/api";
import type { ChatToph } from "../store";
import ComposerMenu from "./ComposerMenu";
import ProviderIcon from "../../providers/components/ProviderIcon";
import { modelGroup } from "../../providers/store";

interface ModelInfo {
  id: string;
  label?: string;
  provider?: string;
  connectionLabel?: string;
}

interface Props {
  usage: AgentUsage;
  chatName: string;
  tophs: ChatToph[];
  model?: ModelInfo;
}

const number = (value: number) => value.toLocaleString("pt-BR");

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/**
 * Plan/model consumption for this chat. This deliberately reports the tokens
 * the provider billed instead of the context-window estimate: the number is
 * useful for tracking plan usage, while context is an internal agent detail.
 */
export default function ChatUsageMeter({ usage, chatName, tophs, model }: Props) {
  const total = usage.inputTokens + usage.outputTokens;
  const provider = model ? modelGroup({ ...model, label: model.label ?? model.id }) : "custom";
  const modelLabel = model?.label?.trim() || model?.id || "modelo atual";
  return <ComposerMenu label="Consumo do plano" trigger={
    <span className="inline-flex h-[26px] shrink-0 items-center gap-1 rounded-full border border-border-button-default bg-background-primary-default px-2 text-[10px] tabular-nums text-text-secondary" title={`Consumo do plano em #${chatName}`}>
      <RiCoinsLine className="size-3.5 text-text-primary" aria-hidden />
      {compact(total)}
    </span>
  } popoverClassName="w-[330px] p-0" contentClassName="p-3">
    {() => <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-background-secondary-default"><RiCoinsLine className="size-4 text-text-primary" aria-hidden /></span>
        <div className="min-w-0"><strong className="block text-body-medium">Consumo do plano</strong><p className="truncate text-caption-2-regular text-text-tertiary" title={modelLabel}>#{chatName} · {modelLabel}</p></div>
        <ProviderIcon provider={provider} className="ms-auto size-4 shrink-0 text-text-tertiary" />
      </div>
      <div className="rounded-2xl bg-background-secondary-default p-3">
        <div className="flex items-end justify-between gap-2">
          <span className="text-caption-1-medium text-text-secondary">Tokens usados</span>
          <strong className="text-title-3-medium tabular-nums text-text-primary">{number(total)}</strong>
        </div>
        <p className="mt-1 text-[10px] text-text-tertiary">Entrada + saída informadas pelo provedor neste chat. O saldo restante do plano é controlado pelo provedor.</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-background-secondary-default p-3 text-caption-1-regular">
        <dt>Entrada</dt><dd className="text-end tabular-nums">{number(usage.inputTokens)}</dd><dt>Saída</dt><dd className="text-end tabular-nums">{number(usage.outputTokens)}</dd><dt>Cache</dt><dd className="text-end tabular-nums">{number(usage.cachedTokens)}</dd><dt>Chamadas</dt><dd className="text-end tabular-nums">{number(usage.calls)}</dd>
      </dl>
      <div className="flex flex-col gap-2"><strong className="text-caption-1-medium">Por Toph</strong>{tophs.map((toph) => {
        const item = usage.byAgent?.find((u) => u.agentId === toph.id);
        return <div key={toph.id} className="flex items-center justify-between gap-2 text-caption-2-regular"><span>{toph.name}{toph.coordinator && tophs.length > 1 ? " · coordenador" : ""}</span><span className="tabular-nums text-text-secondary">{number((item?.inputTokens ?? 0) + (item?.outputTokens ?? 0))} tokens · {item?.calls ?? 0} chamadas</span></div>;
      })}</div>
    </div>}
  </ComposerMenu>;
}
