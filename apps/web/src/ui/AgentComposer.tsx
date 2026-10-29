import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, AtSign, FilePlus2, ImagePlus, Plus, Square, TerminalSquare } from "@toph/icons";
import type { AIModel } from "../api";
import { Button } from "@/boardui/base/buttons/button";
import { CloseButton } from "@/boardui/base/buttons/close-button";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { Dropdown, DropdownDivider, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/boardui/base/dropdown/dropdown";
import { ComposerLoader } from "@/boardui/application/composer-loader/composer-loader";
import ModelPicker from "./ModelPicker";

export interface AgentAttachment { name: string; uri: string; mime: string; size: number; }

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string, attachments: AgentAttachment[]) => void;
  onStop?: () => void;
  busy: boolean;
  models: AIModel[];
  model: string;
  onModelChange: (value: string) => void;
  effort: string;
  efforts: string[];
  onEffortChange: (value: string) => void;
  placeholder: string;
  allowAttachments?: boolean;
  modeControls?: ReactNode;
}

export function AgentComposer({ value, onChange, onSend, onStop, busy, models, model, onModelChange, effort, efforts, onEffortChange, placeholder, allowAttachments = true, modeControls }: Props) {
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [error, setError] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") { event.preventDefault(); fileRef.current?.click(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  function insert(prefix: string) {
    const area = areaRef.current;
    const start = area?.selectionStart ?? value.length;
    onChange(`${value.slice(0, start)}${prefix}${value.slice(start)}`);
    window.setTimeout(() => { area?.focus(); area?.setSelectionRange(start + prefix.length, start + prefix.length); }, 0);
  }

  async function pickFiles(files: FileList | File[] | null) {
    if (!files) return;
    setError("");
    const next: AgentAttachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (file.size > 8 * 1024 * 1024) { setError(`${file.name} é maior que 8 MB.`); continue; }
      const uri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }).catch(() => "");
      if (uri) next.push({ name: file.name, uri, mime: file.type || "application/octet-stream", size: file.size });
    }
    setAttachments((current) => [...current, ...next].slice(0, 6));
  }

  function submit() {
    if (busy || (!value.trim() && attachments.length === 0)) return;
    onSend(value.trim(), attachments);
    setAttachments([]);
    setError("");
  }

  return (
    <div className="flex w-full flex-col p-2">
      <ComposerLoader active={busy} radius={14} surface={false}>
        <form
          onSubmit={(event) => { event.preventDefault(); submit(); }}
          className="flex flex-col gap-2 rounded-[14px] border border-border-button-default bg-background-primary-default p-3 pb-2 shadow-xs"
          onKeyDownCapture={(event) => { if (event.key === "Enter" && !event.shiftKey && event.target === areaRef.current) { event.preventDefault(); submit(); } }}
          onPaste={(event) => {
            if (!allowAttachments) return;
            const clipboard = event.clipboardData;
            const files = clipboard.files.length > 0 ? clipboard.files : Array.from(clipboard.items).map((item) => item.kind === "file" ? item.getAsFile() : null).filter((file): file is File => Boolean(file));
            if (files.length > 0) { event.preventDefault(); void pickFiles(files); }
          }}
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((file) => (
                <span key={`${file.name}-${file.size}`} className="flex items-center gap-1.5 rounded-lg bg-background-secondary-default px-2 py-1">
                  <FilePlus2 size={13} className="text-foreground-icon-secondary" />
                  <span className="max-w-40 truncate text-caption-1-regular text-text-primary">{file.name}</span>
                  <span className="text-caption-2-regular text-text-tertiary">{Math.ceil(file.size / 1024)} KB</span>
                  <CloseButton size="2xs" aria-label={`Remover ${file.name}`} onClick={() => setAttachments((items) => items.filter((item) => item !== file))} />
                </span>
              ))}
            </div>
          )}
          {error && <p className="text-caption-2-regular text-text-error-primary">{error}</p>}
          <Textarea
            ref={areaRef}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            aria-label="Mensagem para o agente"
            rows={1}
            autoResize
            maxRows={6}
            resize="none"
            fieldClassName="flex min-h-[38px] items-start rounded-none bg-transparent p-0 ring-0 shadow-none"
            className="min-h-[38px] px-0 py-0 text-[13.5px] leading-[1.5]"
          />
          <div className="flex min-w-0 items-center gap-1">
            <Dropdown isOpen={addMenuOpen} onOpenChange={setAddMenuOpen}>
              <DropdownTrigger aria-label="Adicionar contexto ou arquivo" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent text-foreground-icon-secondary transition-colors hover:bg-background-secondary-hover">
                <Plus size={17} />
              </DropdownTrigger>
              <DropdownPopover aria-label="Adicionar contexto" placement="top start" className="w-56">
                <DropdownGroup>
                  {allowAttachments && <DropdownItem onSelect={() => { setAddMenuOpen(false); fileRef.current?.click(); }}><ImagePlus size={15} /> Imagens e arquivos <span className="ms-auto text-caption-2-regular text-text-tertiary">Ctrl+U</span></DropdownItem>}
                  <DropdownItem onSelect={() => { setAddMenuOpen(false); insert("/"); }}><TerminalSquare size={15} /> Comandos <span className="ms-auto text-caption-2-regular text-text-tertiary">/</span></DropdownItem>
                  <DropdownItem onSelect={() => { setAddMenuOpen(false); insert("@"); }}><AtSign size={15} /> Contexto <span className="ms-auto text-caption-2-regular text-text-tertiary">@</span></DropdownItem>
                </DropdownGroup>
                <DropdownDivider />
                <DropdownGroup>
                  <DropdownItem onSelect={() => { setAddMenuOpen(false); insert("!"); }}><TerminalSquare size={15} /> Comando do shell <span className="ms-auto text-caption-2-regular text-text-tertiary">!</span></DropdownItem>
                </DropdownGroup>
              </DropdownPopover>
            </Dropdown>
            <ModelPicker models={models} model={model} onModelChange={onModelChange} effort={effort} efforts={efforts} onEffortChange={onEffortChange} />
            {modeControls && <div className="flex shrink-0 items-center gap-0.5">{modeControls}</div>}
            <span className="min-w-2 flex-1" />
            {busy && onStop ? (
              <Button type="button" variant="secondary" size="small" iconOnly leadingIcon={Square} onClick={onStop} aria-label="Parar" className="size-8 shrink-0 rounded-lg" />
            ) : (
              <Button type="submit" size="small" iconOnly leadingIcon={ArrowUp} disabled={!value.trim() && attachments.length === 0} aria-label="Enviar" className="size-8 shrink-0 rounded-lg" />
            )}
          </div>
        </form>
      </ComposerLoader>
      {allowAttachments && <input ref={fileRef} type="file" hidden multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.log" onChange={(event) => void pickFiles(event.target.files)} />}
    </div>
  );
}
