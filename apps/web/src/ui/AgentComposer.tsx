import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, AtSign, ChevronDown, FilePlus2, ImagePlus, LoaderCircle, Mic, Plus, Square, TerminalSquare, X } from "@toph/icons";
import type { AIModel } from "../api";
import { Button } from "@/boardui/base/buttons/button";
import { IconButton } from "@/boardui/base/buttons/icon-button";
import { Textarea } from "@/boardui/base/textarea/textarea";
import { DropdownDivider, DropdownGroup, DropdownItem } from "@/boardui/base/dropdown/dropdown";
import ComposerMenu from "./ComposerMenu";
import { ComposerLoader } from "@/boardui/application/composer-loader/composer-loader";
import ModelPicker from "./ModelPicker";
import { useAudioRecorder, type AgentAttachment } from "./useAudioRecorder";

export type { AgentAttachment } from "./useAudioRecorder";

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
  const audio = useAudioRecorder({
    onComplete: (attachment, transcript) => {
      if (allowAttachments) setAttachments((current) => [...current, attachment].slice(0, 6));
      if (transcript) {
        onChange(`${value}${value.trim() ? "\n\n" : ""}Transcrição do áudio:\n${transcript}`);
      } else if (!allowAttachments) {
        setError("Este navegador não conseguiu transcrever o áudio.");
      }
    },
    onError: setError,
  });

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
    if (busy || audio.recording || audio.processing || (!value.trim() && attachments.length === 0)) return;
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
            <div className="flex flex-wrap items-start gap-2">
              {attachments.map((file, index) => file.mime.startsWith("image/") ? (
                <figure key={`${file.name}-${file.size}-${index}`} className="group relative w-24 overflow-hidden rounded-xl border border-border-button-default bg-background-secondary-default">
                  <img src={file.uri} alt={file.name} className="h-20 w-full object-cover" />
                  <figcaption className="truncate px-2 py-1 text-[10px] text-text-secondary">{file.name}</figcaption>
                  <IconButton icon={X} size="xs" aria-label={`Remover ${file.name}`} className="absolute right-1 top-1 size-5 border-border-button-default bg-background-primary-default/90 p-0 shadow-xs [&_svg]:size-3" onClick={() => setAttachments((items) => items.filter((item) => item !== file))} />
                </figure>
              ) : (
                <span key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-1.5 rounded-lg bg-background-secondary-default px-2 py-1">
                  {file.mime.startsWith("audio/") ? <Mic size={13} className="text-foreground-icon-secondary" /> : <FilePlus2 size={13} className="text-foreground-icon-secondary" />}
                  <span className="max-w-40 truncate text-caption-1-regular text-text-primary">{file.name}</span>
                  <span className="text-caption-2-regular text-text-tertiary">{Math.ceil(file.size / 1024)} KB</span>
                  <IconButton icon={X} size="small" aria-label={`Remover ${file.name}`} className="size-4 border-transparent bg-transparent p-0 shadow-none [&_svg]:size-3" onClick={() => setAttachments((items) => items.filter((item) => item !== file))} />
                </span>
              ))}
            </div>
          )}
          {audio.recording ? (
            <div className="flex items-center gap-2 text-caption-2-regular text-status-rose-text" role="status">
              <span className="size-2 animate-pulse rounded-full bg-current" />
              <span className="shrink-0">Gravando {Math.floor(audio.elapsed / 60).toString().padStart(2, "0")}:{(audio.elapsed % 60).toString().padStart(2, "0")}</span>
              {audio.liveTranscript ? <span className="min-w-0 truncate text-text-tertiary">{audio.liveTranscript}</span> : null}
            </div>
          ) : null}
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
            <ComposerMenu
              label="Adicionar contexto ou arquivo"
              isOpen={addMenuOpen}
              onOpenChange={setAddMenuOpen}
              trigger={<><Plus size={15} /><ChevronDown size={12} className="size-3 text-foreground-icon-tertiary" /></>}
              popoverClassName="w-[300px] p-0"
              contentClassName="flex flex-col gap-1 p-1.5"
            >
              {(close) => (
                <>
                  <DropdownGroup>
                    {allowAttachments && <DropdownItem onSelect={() => { close(); fileRef.current?.click(); }}><ImagePlus size={15} /> Imagens, áudios e arquivos <span className="ms-auto text-caption-2-regular text-text-tertiary">Ctrl+U</span></DropdownItem>}
                    <DropdownItem onSelect={() => { close(); insert("/"); }}><TerminalSquare size={15} /> Comandos <span className="ms-auto text-caption-2-regular text-text-tertiary">/</span></DropdownItem>
                    <DropdownItem onSelect={() => { close(); insert("@"); }}><AtSign size={15} /> Contexto <span className="ms-auto text-caption-2-regular text-text-tertiary">@</span></DropdownItem>
                  </DropdownGroup>
                  <DropdownDivider />
                  <DropdownGroup>
                    <DropdownItem onSelect={() => { close(); insert("!"); }}><TerminalSquare size={15} /> Comando do shell <span className="ms-auto text-caption-2-regular text-text-tertiary">!</span></DropdownItem>
                  </DropdownGroup>
                </>
              )}
            </ComposerMenu>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <ModelPicker models={models} model={model} onModelChange={onModelChange} effort={effort} efforts={efforts} onEffortChange={onEffortChange} />
              {modeControls && <div className="flex shrink-0 items-center gap-0.5">{modeControls}</div>}
            </div>
            <Button
              type="button"
              variant={audio.recording ? "danger" : "secondary"}
              size="small"
              iconOnly
              leadingIcon={audio.processing ? LoaderCircle : audio.recording ? Square : Mic}
              onClick={() => audio.recording ? audio.stop() : void audio.start()}
              disabled={busy || audio.processing || !audio.supported}
              aria-label={audio.processing ? "Processando áudio" : audio.recording ? "Parar gravação" : "Gravar áudio"}
              title={audio.supported ? (audio.recording ? "Parar gravação" : "Gravar áudio") : "Gravação de áudio indisponível"}
              className={audio.processing ? "shrink-0 [&_svg]:animate-spin" : "shrink-0"}
            />
            {busy && onStop ? (
              <Button type="button" variant="secondary" size="small" iconOnly leadingIcon={Square} onClick={onStop} aria-label="Parar" className="shrink-0" />
            ) : (
              <Button type="submit" variant="primary" size="small" iconOnly leadingIcon={ArrowUp} disabled={audio.recording || audio.processing || (!value.trim() && attachments.length === 0)} aria-label="Enviar" className="shrink-0" />
            )}
          </div>
        </form>
      </ComposerLoader>
      {allowAttachments && <input ref={fileRef} type="file" hidden multiple accept="image/*,audio/*,.pdf,.txt,.md,.json,.csv,.log" onChange={(event) => void pickFiles(event.target.files)} />}
    </div>
  );
}
