import { useEffect, useRef, useState } from "react";
import { ArrowUp, AtSign, FilePlus2, ImagePlus, Plus, Square, TerminalSquare, X } from "@toph/icons";
import type { AIModel } from "../api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";

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
}

export function AgentComposer({ value, onChange, onSend, onStop, busy, models, model, onModelChange, effort, efforts, onEffortChange, placeholder, allowAttachments = true }: Props) {
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [error, setError] = useState("");
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

  const uniqueModels = [...new Map(models.map((item) => [item.id, item])).values()];

  return (
    <div className="flex w-full flex-col gap-2 p-2">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-sm">
        <Textarea
          ref={areaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onPaste={(event) => {
            if (!allowAttachments) return;
            const clipboard = event.clipboardData;
            const files = clipboard.files.length > 0 ? clipboard.files : Array.from(clipboard.items).map((item) => item.kind === "file" ? item.getAsFile() : null).filter((file): file is File => Boolean(file));
            if (files.length > 0) { event.preventDefault(); void pickFiles(files); }
          }}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
          placeholder={placeholder}
          aria-label="Mensagem para o agente"
          rows={3}
          className="min-h-16 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
        />
        {attachments.length > 0 && (
          <AttachmentGroup className="px-1">
            {attachments.map((file) => (
              <Attachment key={`${file.name}-${file.size}`} size="sm">
                <AttachmentMedia><FilePlus2 /></AttachmentMedia>
                <AttachmentContent><AttachmentTitle>{file.name}</AttachmentTitle><AttachmentDescription>{Math.ceil(file.size / 1024)} KB</AttachmentDescription></AttachmentContent>
                <AttachmentActions><AttachmentAction aria-label={`Remover ${file.name}`} onClick={() => setAttachments((items) => items.filter((item) => item !== file))}><X size={12} /></AttachmentAction></AttachmentActions>
              </Attachment>
            ))}
          </AttachmentGroup>
        )}
        {error && <p className="px-1 text-[10px] text-destructive">{error}</p>}
        <div className="flex min-w-0 items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Adicionar contexto ou arquivo"><Plus size={16} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              {allowAttachments && <DropdownMenuItem onSelect={() => fileRef.current?.click()} className="gap-2"><ImagePlus size={15} /> Imagens e arquivos <span className="ms-auto text-[10px] text-muted-foreground">Ctrl+U</span></DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => insert("/")} className="gap-2"><TerminalSquare size={15} /> Comandos <span className="ms-auto text-[10px] text-muted-foreground">/</span></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => insert("@")} className="gap-2"><AtSign size={15} /> Contexto <span className="ms-auto text-[10px] text-muted-foreground">@</span></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => insert("!")} className="gap-2"><TerminalSquare size={15} /> Comando do shell <span className="ms-auto text-[10px] text-muted-foreground">!</span></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Select value={model} onValueChange={onModelChange}>
            <SelectTrigger size="sm" className="h-7 w-[160px] min-w-0 text-[11px]"><SelectValue placeholder="Modelo" /></SelectTrigger>
            <SelectContent>{uniqueModels.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={effort} onValueChange={onEffortChange} disabled={efforts.length === 0}>
            <SelectTrigger size="sm" className="h-7 w-[86px] min-w-0 text-[11px]"><SelectValue placeholder="Default" /></SelectTrigger>
            <SelectContent>{(efforts.length ? efforts : [""]).map((item) => <SelectItem key={item || "default"} value={item || "default"}>{item || "Default"}</SelectItem>)}</SelectContent>
          </Select>
          <span className="flex-1" />
          {busy && onStop ? <Button type="button" variant="outline" size="sm" onClick={onStop}><Square size={13} /> Stop</Button> : <Button type="button" size="icon-sm" onClick={submit} disabled={!value.trim() && attachments.length === 0} aria-label="Enviar"><ArrowUp size={15} /></Button>}
        </div>
      </div>
      {allowAttachments && <input ref={fileRef} type="file" hidden multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.log" onChange={(event) => void pickFiles(event.target.files)} />}
    </div>
  );
}
