import { useMemo, useState } from "react";
import { Check, MessageCircleQuestion, Send } from "@toph/icons";
import { Button } from "@/shared/toph-ui/base/buttons/button";
import { Input } from "@/shared/toph-ui/base/input/input";
import { cx } from "@/shared/toph-ui/utils/cx";

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

function QuestionOption({ label, description, selected, multiple, onClick }: {
  label: string;
  description?: string;
  selected: boolean;
  multiple: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={cx(
        "flex w-full min-w-0 items-start gap-2 rounded-lg border px-2 py-1.5 text-start",
        "transition-[background-color,border-color,color,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99]",
        selected
          ? "border-accent-500/40 bg-accent-500/10"
          : "border-transparent hover:bg-background-primary-hover",
      )}
    >
      <span
        className={cx(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center border shadow-xs",
          multiple ? "rounded" : "rounded-full",
          selected
            ? "border-accent-500 bg-accent-500 text-text-on-accent"
            : "border-border-checkbox-default bg-background-primary-default",
        )}
      >
        {selected ? <Check size={11} /> : null}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body-2-medium text-text-primary">{label}</span>
        {description ? <span className="text-caption-2-regular text-text-tertiary">{description}</span> : null}
      </span>
    </button>
  );
}

interface Props {
  questions: AgentQuestion[];
  busy?: boolean;
  onSubmit?: (answer: string) => void | Promise<void>;
}

export default function AgentQuestionCard({ questions, busy = false, onSubmit }: Props) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const complete = useMemo(() => questions.every((_, index) => (selected[index]?.length ?? 0) > 0 || Boolean(custom[index]?.trim())), [custom, questions, selected]);

  async function submit() {
    if (!complete || !onSubmit || submitting) return;
    const lines = questions.map((question, index) => {
      const answers = [...(selected[index] ?? [])];
      if (custom[index]?.trim()) answers.push(custom[index].trim());
      return `- ${question.header || question.question}: ${answers.join(", ")}`;
    });
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(`Respostas às perguntas do agente:\n${lines.join("\n")}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível enviar a resposta.");
    } finally {
      setSubmitting(false);
    }
  }

  function choose(index: number, option: AgentQuestionOption, multiple: boolean) {
    setSelected((current) => {
      if (!multiple) return { ...current, [index]: [option.label] };
      const values = current[index] ?? [];
      return {
        ...current,
        [index]: values.includes(option.label)
          ? values.filter((label) => label !== option.label)
          : [...values, option.label],
      };
    });
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
          <div
            role={question.multiple ? "group" : "radiogroup"}
            aria-label={question.header || question.question}
            className="flex flex-col gap-0.5"
          >
            {question.options.map((option) => (
              <QuestionOption
                key={option.label}
                label={option.label}
                description={option.description}
                selected={selected[index]?.includes(option.label) ?? false}
                multiple={question.multiple === true}
                onClick={() => choose(index, option, question.multiple === true)}
              />
            ))}
          </div>
          <Input value={custom[index] ?? ""} onChange={(value) => setCustom((current) => ({ ...current, [index]: value }))} placeholder="Outra resposta..." aria-label={`Outra resposta para ${question.header || question.question}`} />
        </div>
      ))}
      {error ? <p className="text-caption-2-regular text-status-rose-text">{error}</p> : null}
      {onSubmit ? <Button type="button" size="small" leadingIcon={Send} disabled={!complete || busy || submitting} onClick={() => void submit()} className="self-end">{busy || submitting ? "Enviando..." : "Responder"}</Button> : null}
    </section>
  );
}
