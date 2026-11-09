import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, FilePlus2, ImagePlus, LoaderCircle, Mic, Square, X } from "@toph/icons";
import { Button } from "@/shared/boardui/base/buttons/button";
import { IconButton } from "@/shared/boardui/base/buttons/icon-button";
import { Textarea } from "@/shared/boardui/base/textarea/textarea";
import { ComposerLoader } from "@/shared/boardui/application/composer-loader/composer-loader";
import { useAudioRecorder, type AgentAttachment } from "../../../shared/ui/useAudioRecorder";
import type { ChatToph } from "../store";
import BotAvatar from "../../agents/components/BotAvatar";

export type { AgentAttachment } from "../../../shared/ui/useAudioRecorder";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string, attachments: AgentAttachment[]) => void;
  onStop?: () => void;
  busy: boolean;
  placeholder: string;
  hint?: string;
  allowAttachments?: boolean;
  modeControls?: ReactNode;
  history?: string[];
  members?: ChatToph[];
}

export function AgentComposer({ value, onChange, onSend, onStop, busy, placeholder, hint = "", allowAttachments = true, modeControls, history = [], members = [] }: Props) {
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const localHistory = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const historyDraft = useRef("");
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionItems = useMemo(() => {
    if (!mention) return [];
    const needle = mention.query.toLowerCase();
    return members
      .filter((member) => `${member.name} ${member.handle} ${member.role}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [mention, members]);
  const audio = useAudioRecorder({
    onComplete: (attachment, transcript) => {
      if (allowAttachments && !transcript) setAttachments((current) => [...current, attachment].slice(0, 6));
      if (transcript) {
        onChange(`${value}${value.trim() ? " " : ""}${transcript}`);
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
    const text = value.trim();
    if (text && localHistory.current[localHistory.current.length - 1] !== text) localHistory.current.push(text);
    historyIndex.current = -1;
    historyDraft.current = "";
    onSend(text, attachments);
    setAttachments([]);
    setMention(null);
    setError("");
  }

  function detectMention(next: string) {
    const match = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(next);
    if (!match) {
      setMention(null);
      return;
    }
    setMention({ query: match[2], start: next.length - match[2].length - 1 });
    setMentionIndex(0);
  }

  function insertMention(member: ChatToph) {
    if (!mention) return;
    const next = `${value.slice(0, mention.start)}@${member.handle} `;
    onChange(next);
    setMention(null);
    window.setTimeout(() => {
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(next.length, next.length);
    }, 0);
  }

  function messageHistory(): string[] {
    const items: string[] = [];
    for (const item of [...history, ...localHistory.current]) {
      const text = item.trim();
      if (text && items[items.length - 1] !== text) items.push(text);
    }
    return items.slice(-100);
  }

  function navigateMessageHistory(direction: -1 | 1) {
    const items = messageHistory();
    if (items.length === 0) return;
    if (historyIndex.current < 0) {
      if (direction > 0) return;
      historyDraft.current = value;
      historyIndex.current = items.length - 1;
    } else if (direction > 0 && historyIndex.current === items.length - 1) {
      historyIndex.current = -1;
    } else {
      historyIndex.current = Math.max(0, Math.min(items.length - 1, historyIndex.current + direction));
    }
    const next = historyIndex.current < 0 ? historyDraft.current : items[historyIndex.current] ?? "";
    onChange(next);
    window.setTimeout(() => areaRef.current?.setSelectionRange(next.length, next.length), 0);
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[860px] flex-col px-3 pt-1.5 pb-[18px] sm:px-7">
      {mention && mentionItems.length > 0 ? (
        <div className="absolute bottom-full left-3 z-30 mb-2 w-[min(340px,calc(100vw-32px))] rounded-2xl border border-border-button-white bg-background-primary-default p-1 shadow-sidebar sm:left-7" role="listbox" aria-label="Mencionar Toph">
          {mentionItems.map((member, index) => (
            <button
              key={member.id}
              type="button"
              role="option"
              aria-selected={index === mentionIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setMentionIndex(index)}
              onClick={() => insertMention(member)}
              className={cxMention(index === mentionIndex)}
            >
              <BotAvatar bot={member} size={22} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-caption-1-semibold text-text-primary">{member.name}</span>
                <span className="truncate text-caption-2-regular text-text-tertiary">@{member.handle}</span>
              </span>
              <span className="shrink-0 text-caption-2-regular text-text-tertiary">{member.role || "Toph"}</span>
            </button>
          ))}
          <p className="mt-1 border-t border-separator-border px-2 py-1 text-[10px] text-text-tertiary">Enter insere · Esc fecha</p>
        </div>
      ) : null}
      <ComposerLoader active={busy} radius={20} surface={false}>
        <form
          onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) submit(); }}
          className="flex flex-col gap-0 overflow-hidden rounded-[20px] border border-border-button-default bg-background-primary-default shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-border-button-hover focus-within:ring-4 focus-within:ring-accent-500/10"
          onKeyDownCapture={(event) => {
            if (event.target !== areaRef.current) return;
            if (mention && mentionItems.length > 0) {
              if (event.key === "ArrowDown") { event.preventDefault(); setMentionIndex((index) => Math.min(mentionItems.length - 1, index + 1)); return; }
              if (event.key === "ArrowUp") { event.preventDefault(); setMentionIndex((index) => Math.max(0, index - 1)); return; }
              if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); insertMention(mentionItems[mentionIndex]); return; }
              if (event.key === "Escape") { event.preventDefault(); setMention(null); return; }
            }
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); return; }
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const area = areaRef.current;
            if (event.key === "ArrowUp" && (value.length === 0 || (area?.selectionStart === 0 && area?.selectionEnd === 0))) { event.preventDefault(); navigateMessageHistory(-1); }
            if (event.key === "ArrowDown" && historyIndex.current >= 0 && area?.selectionStart === value.length && area?.selectionEnd === value.length) { event.preventDefault(); navigateMessageHistory(1); }
          }}
          onPaste={(event) => {
            if (!allowAttachments) return;
            const clipboard = event.clipboardData;
            const files = clipboard.files.length > 0 ? clipboard.files : Array.from(clipboard.items).map((item) => item.kind === "file" ? item.getAsFile() : null).filter((file): file is File => Boolean(file));
            if (files.length > 0) { event.preventDefault(); void pickFiles(files); }
          }}
        >
          {attachments.length > 0 && (
            <div className="flex flex-wrap items-start gap-2 px-4 pt-3">
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
            onChange={(next) => { historyIndex.current = -1; historyDraft.current = next; detectMention(next); onChange(next); }}
            placeholder={placeholder}
            aria-label="Mensagem para o agente"
            rows={1}
            autoResize
            maxRows={6}
            resize="none"
            fieldClassName="flex min-h-[50px] items-start rounded-none bg-transparent p-0 ring-0 shadow-none"
            className="min-h-[50px] px-4 pt-[13px] pb-1 text-[14px] leading-[1.55]"
          />
          <div className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-1">
            {allowAttachments ? <IconButton icon={ImagePlus} size="small" aria-label="Anexar arquivo" title="Anexar arquivo (Ctrl+U)" onClick={() => fileRef.current?.click()} /> : null}
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-text-tertiary">{hint}</span>
            {modeControls ? <div className="flex shrink-0 items-center gap-0.5">{modeControls}</div> : null}
            <Button
              type="button"
              variant={audio.recording ? "danger" : "ghost"}
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
              <Button
                type="button"
                variant="secondary"
                size="small"
                iconOnly
                leadingIcon={Square}
                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); onStop(); }}
                aria-label="Parar"
                className="shrink-0 rounded-full"
              />
            ) : (
              <Button type="submit" variant="primary" size="small" iconOnly leadingIcon={ArrowUp} disabled={audio.recording || audio.processing || (!value.trim() && attachments.length === 0)} aria-label="Enviar" className="shrink-0 rounded-full" />
            )}
          </div>
        </form>
      </ComposerLoader>
      {allowAttachments && <input ref={fileRef} type="file" hidden multiple accept="image/*,audio/*,.pdf,.txt,.md,.json,.csv,.log" onChange={(event) => void pickFiles(event.target.files)} />}
    </div>
  );
}


function cxMention(active: boolean): string {
  return `flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start transition-colors ${active ? "bg-accent-500/10" : "hover:bg-background-primary-hover"}`;
}
