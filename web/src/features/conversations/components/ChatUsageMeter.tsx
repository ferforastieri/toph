import type { AgentUsage } from "../../agents/api";
import type { ChatToph } from "../store";
import ComposerMenu from "./ComposerMenu";
import ProviderIcon from "../../providers/components/ProviderIcon";
import { modelGroup } from "../../providers/store";
import type { AIModel } from "../../../shared/api";
import { ProgressBar } from "@/shared/boardui/base/progress/progress";

interface Props { usage: AgentUsage; chatName: string; tophs: ChatToph[]; model?: AIModel }
const CIRCUMFERENCE = 2 * Math.PI * 11.5;
const number = (value: number) => value.toLocaleString("pt-BR");

export default function ChatUsageMeter({ usage, chatName, tophs, model }: Props) {
  const context = usage.contextTokens ?? 0;
  const budget = usage.contextBudget;
  const percent = budget ? Math.min(100, Math.round(context / budget * 100)) : 0;
  const provider = model ? modelGroup(model) : "custom";
  const owner = tophs.find((a) => a.id === usage.contextAgentId);
  return <ComposerMenu label="Uso da IA" trigger={
    <span className="relative inline-flex size-[26px] shrink-0 items-center justify-center" title={`Uso de #${chatName}`}>
      <svg viewBox="0 0 26 26" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="13" cy="13" r="11.5" fill="none" strokeWidth="1.6" className="stroke-border-button-default" />
        <circle cx="13" cy="13" r="11.5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)} className="stroke-accent-500" />
      </svg>
      <ProviderIcon provider={provider} className="relative size-3.5 text-text-primary" />
    </span>
  } popoverClassName="w-[340px] p-0" contentClassName="p-3">
    {() => <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2"><span className="flex size-9 items-center justify-center rounded-xl bg-background-secondary-default"><ProviderIcon provider={provider} className="size-4" /></span><div><strong className="text-body-medium">Uso da IA</strong><p className="text-caption-2-regular text-text-tertiary">Acumulado de #{chatName}</p></div></div>
      {budget != null && <div className="rounded-2xl border border-border-button-white bg-background-secondary-default p-3">
        <div className="flex justify-between text-caption-1-medium"><span>Último contexto{owner ? ` · ${owner.name}` : ""}</span><strong>{percent}%</strong></div>
        <ProgressBar value={context} maxValue={budget} size="sm" className="mt-2" aria-label="Orçamento de contexto utilizado" />
        <p className="mt-1 text-caption-2-regular text-text-tertiary">{number(context)} / {number(budget)} tokens estimados</p>
      </div>}
      <dl className="grid grid-cols-2 gap-2 rounded-2xl border border-border-button-white bg-background-secondary-default p-3 text-caption-1-regular">
        <dt>Entrada</dt><dd className="text-end tabular-nums">{number(usage.inputTokens)}</dd><dt>Saída</dt><dd className="text-end tabular-nums">{number(usage.outputTokens)}</dd><dt>Leitura de cache</dt><dd className="text-end tabular-nums">{number(usage.cachedTokens)}</dd><dt>Chamadas</dt><dd className="text-end tabular-nums">{number(usage.calls)}</dd>
      </dl>
      <div className="flex flex-col gap-2"><strong className="text-caption-1-medium">Por Toph</strong>{tophs.map((toph) => {
        const item = usage.byAgent?.find((u) => u.agentId === toph.id);
        return <div key={toph.id} className="flex items-center justify-between gap-2 text-caption-2-regular"><span>{toph.name}{toph.coordinator && tophs.length > 1 ? " · coordenador" : ""}</span><span className="tabular-nums text-text-secondary">{number((item?.inputTokens ?? 0) + (item?.outputTokens ?? 0))} tokens · {item?.calls ?? 0} chamadas</span></div>;
      })}</div>
      <p className="text-[10px] text-text-tertiary">Uso registrado pelo harness nativo, incluindo resumos e delegações deste chat. Tokens são informados pelo provedor; contexto é uma estimativa.</p>
    </div>}
  </ComposerMenu>;
}
