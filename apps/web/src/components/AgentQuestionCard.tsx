import { useMemo, useState } from "react";
import { MessageCircleQuestion, Send } from "@toph/icons";
import { Button } from "@/boardui/base/buttons/button";
import { Checkbox } from "@/boardui/base/checkbox/checkbox";
import { Input } from "@/boardui/base/input/input";
import { Radio, RadioGroup } from "@/boardui/base/radio/radio";

export interface AgentQuestionOption {
  label: string;
  description?: string;
}

export interface AgentQuestion {
  header?: string;
  question: string;
  options: AgentQuestionOption[];
  multiple?: boolean;
}

export function parseAgentQuestions(value: string): AgentQuestion[] {
  try {
    const parsed = JSON.parse(value) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return [];
    return parsed.questions.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      if (typeof item.question !== "string") return [];
      const options = Array.isArray(item.options)
        ? item.options.flatMap((option) => option && typeof option === "object" && typeof (option as Record<string, unknown>).label === "string"
          ? [{ label: String((option as Record<string, unknown>).label), description: typeof (option as Record<string, unknown>).description === "string" ? String((option as Record<string, unknown>).description) : undefined }]
          : [])
        : [];
      return [{ header: typeof item.header === "string" ? item.header : undefined, question: item.question, options, multiple: item.multiple === true }];
    });
  } catch {
    return [];
  }
}

interface Props {
  questions: AgentQuestion[];
  busy?: boolean;
  onSubmit?: (answer: string) => void;
}

export default function AgentQuestionCard({ questions, busy = false, onSubmit }: Props) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const complete = useMemo(() => questions.every((_, index) => (selected[index]?.length ?? 0) > 0 || Boolean(custom[index]?.trim())), [custom, questions, selected]);

  function submit() {
    if (!complete || !onSubmit) return;
    const lines = questions.map((question, index) => {
      const answers = [...(selected[index] ?? [])];
      if (custom[index]?.trim()) answers.push(custom[index].trim());
      return `- ${question.header || question.question}: ${answers.join(", ")}`;
    });
    onSubmit(`Respostas às perguntas do agente:\n${lines.join("\n")}`);
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 border-y border-accent-500/30 bg-accent-500/[0.04] px-2 py-3">
      <header className="flex items-start gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-500"><MessageCircleQuestion size={15} /></span>
        <div className="min-w-0">
          <strong className="text-caption-1-semibold text-text-primary">O agente precisa da sua resposta</strong>
          <p className="text-caption-2-regular text-text-secondary">Escolha uma opção ou escreva sua própria resposta.</p>
        </div>
      </header>
      {questions.map((question, index) => (
        <div key={`${question.header}-${index}`} className="flex min-w-0 flex-col gap-2">
          <div>
            {question.header ? <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-500">{question.header}</p> : null}
            <p className="text-caption-1-medium leading-relaxed text-text-primary">{question.question}</p>
          </div>
          {question.multiple ? (
            <div className="flex flex-col gap-1">
              {question.options.map((option) => {
                const checked = selected[index]?.includes(option.label) ?? false;
                return (
                  <Checkbox key={option.label} size="sm" isSelected={checked} onChange={(next) => setSelected((current) => ({ ...current, [index]: next ? [...(current[index] ?? []), option.label] : (current[index] ?? []).filter((label) => label !== option.label) }))}>
                    <span className="flex min-w-0 flex-col"><span>{option.label}</span>{option.description ? <span className="text-caption-2-regular text-text-tertiary">{option.description}</span> : null}</span>
                  </Checkbox>
                );
              })}
            </div>
          ) : (
            <RadioGroup value={selected[index]?.[0] ?? ""} onChange={(value) => setSelected((current) => ({ ...current, [index]: [value] }))} className="gap-0.5">
              {question.options.map((option) => (
                <Radio key={option.label} value={option.label} size="sm" className="rounded-lg px-2 py-1.5 hover:bg-background-primary-hover">
                  <span className="flex min-w-0 flex-col"><span>{option.label}</span>{option.description ? <span className="text-caption-2-regular text-text-tertiary">{option.description}</span> : null}</span>
                </Radio>
              ))}
            </RadioGroup>
          )}
          <Input value={custom[index] ?? ""} onChange={(value) => setCustom((current) => ({ ...current, [index]: value }))} placeholder="Outra resposta..." aria-label={`Outra resposta para ${question.header || question.question}`} />
        </div>
      ))}
      {onSubmit ? <Button type="button" size="small" leadingIcon={Send} disabled={!complete || busy} onClick={submit} className="self-end">{busy ? "Enviando..." : "Responder"}</Button> : null}
    </section>
  );
}
