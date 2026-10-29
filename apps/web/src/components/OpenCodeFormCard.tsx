import { useEffect, useMemo, useState } from "react";
import { CircleAlert, ExternalLink, MessageCircleQuestion, Send } from "@toph/icons";
import { Button } from "@/boardui/base/buttons/button";
import { Checkbox } from "@/boardui/base/checkbox/checkbox";
import { Input } from "@/boardui/base/input/input";
import { Radio, RadioGroup } from "@/boardui/base/radio/radio";

export interface OpenCodeFormOption {
  value: string;
  label: string;
  description?: string;
}

export interface OpenCodeFormField {
  key: string;
  title?: string;
  description?: string;
  required?: boolean;
  hidden?: boolean;
  when?: Array<{ key: string; op: "eq" | "neq"; value: string | number | boolean }>;
  type: "string" | "number" | "integer" | "boolean" | "multiselect" | "external";
  default?: string | number | boolean | string[];
  placeholder?: string;
  url?: string;
  options?: OpenCodeFormOption[];
  custom?: boolean;
}

export interface OpenCodeForm {
  id: string;
  sessionID: string;
  title: string;
  fields: OpenCodeFormField[];
}

export type OpenCodeFormAnswer = Record<string, string | number | boolean | string[]>;

interface Props {
  form: OpenCodeForm;
  busy?: boolean;
  onSubmit: (answer: OpenCodeFormAnswer) => void;
  onCancel: () => void;
}

function defaultValue(field: OpenCodeFormField): string | number | boolean | string[] {
  if (field.default !== undefined) return field.default;
  if (field.type === "boolean") return false;
  if (field.type === "multiselect") return [];
  if (field.type === "number" || field.type === "integer") return "";
  return "";
}

function fieldVisible(field: OpenCodeFormField, answer: OpenCodeFormAnswer): boolean {
  return (field.when ?? []).every((condition) => {
    const value = answer[condition.key];
    return condition.op === "eq" ? value === condition.value : value !== condition.value;
  });
}

function isEmpty(value: string | number | boolean | string[]): boolean {
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  return value === false;
}

export default function OpenCodeFormCard({ form, busy = false, onSubmit, onCancel }: Props) {
  const initial = useMemo(() => {
    const next: OpenCodeFormAnswer = {};
    for (const field of form.fields) next[field.key] = defaultValue(field);
    return next;
  }, [form]);
  const [answer, setAnswer] = useState<OpenCodeFormAnswer>(initial);
  const [error, setError] = useState("");

  useEffect(() => {
    setAnswer(initial);
    setError("");
  }, [form.id, initial]);

  const visibleFields = form.fields.filter((field) => !field.hidden && fieldVisible(field, answer));
  const hiddenFields = form.fields.filter((field) => field.hidden);

  function setValue(key: string, value: string | number | boolean | string[]) {
    setAnswer((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function submit() {
    const missing = visibleFields.find((field) => field.required && isEmpty(answer[field.key]));
    if (missing) {
      setError(`Responda “${missing.title ?? missing.key}” para continuar.`);
      return;
    }
    const submitted: OpenCodeFormAnswer = {};
    for (const field of [...visibleFields, ...hiddenFields]) {
      let value = answer[field.key] ?? defaultValue(field);
      if ((field.type === "number" || field.type === "integer") && typeof value === "string") {
        if (!value.trim()) continue;
        value = Number(value);
      }
      submitted[field.key] = value;
    }
    onSubmit(submitted);
  }

  return (
    <section className="flex flex-col gap-3 rounded-2lg border border-accent-500/35 bg-background-secondary-default p-3 shadow-xs" aria-label={form.title}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-500">
          <MessageCircleQuestion size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-body-medium text-text-primary">{form.title}</p>
          <p className="text-caption-2-regular text-text-secondary">O agente precisa da sua resposta para continuar.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {visibleFields.map((field) => {
          const value = answer[field.key];
          const label = field.title ?? field.key;
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption-1-medium text-text-primary">
                  {label}
                  {field.required ? <span className="ms-0.5 text-accent-500">*</span> : null}
                </span>
                {field.description && <span className="text-caption-2-regular text-text-tertiary">{field.description}</span>}
              </div>

              {field.type === "string" && field.options ? (
                <div className="flex flex-col gap-1.5">
                  <RadioGroup value={String(value ?? "")} onChange={(next) => setValue(field.key, next)} className="gap-0.5">
                    {field.options.map((option) => (
                      <Radio key={option.value} value={option.value} size="sm" className="rounded-lg px-2 py-1.5 hover:bg-background-primary-hover">
                        <span className="flex min-w-0 flex-col">
                          <span className="text-caption-1-medium text-text-primary">{option.label}</span>
                          {option.description && <span className="text-caption-2-regular text-text-secondary">{option.description}</span>}
                        </span>
                      </Radio>
                    ))}
                  </RadioGroup>
                  {field.custom && (
                    <Input label="Outro" value={String(value ?? "")} onChange={(next) => setValue(field.key, next)} placeholder={field.placeholder ?? "Digite uma resposta"} />
                  )}
                </div>
              ) : field.type === "multiselect" ? (
                <div className="flex flex-col gap-1">
                  {field.options?.map((option) => {
                    const selected = Array.isArray(value) ? value.includes(option.value) : false;
                    return (
                      <Checkbox
                        key={option.value}
                        size="sm"
                        isSelected={selected}
                        onChange={(checked) => {
                          const current = Array.isArray(value) ? value : [];
                          setValue(field.key, checked ? [...current, option.value] : current.filter((item) => item !== option.value));
                        }}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="text-caption-1-medium text-text-primary">{option.label}</span>
                          {option.description && <span className="text-caption-2-regular text-text-secondary">{option.description}</span>}
                        </span>
                      </Checkbox>
                    );
                  })}
                </div>
              ) : field.type === "boolean" ? (
                <Checkbox size="sm" isSelected={Boolean(value)} onChange={(checked) => setValue(field.key, checked)}>
                  <span className="text-caption-1-medium text-text-primary">{field.placeholder ?? "Sim"}</span>
                </Checkbox>
              ) : field.type === "external" ? (
                <a className="inline-flex items-center gap-1 text-caption-1-medium text-accent-500 hover:underline" href={field.url ?? "#"} target="_blank" rel="noreferrer">
                  Abrir <ExternalLink size={12} />
                </a>
              ) : (
                <Input
                  type={field.type === "number" || field.type === "integer" ? "number" : "text"}
                  value={String(value ?? "")}
                  onChange={(next) => setValue(field.key, next)}
                  placeholder={field.placeholder}
                  autoComplete="off"
                />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-caption-2-regular text-status-rose-text">
          <CircleAlert size={12} /> {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-1.5 border-t border-separator-border pt-2">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="button" size="small" leadingIcon={Send} onClick={submit} disabled={busy}>
          {busy ? "Enviando..." : "Responder"}
        </Button>
      </div>
    </section>
  );
}
