import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  AtSign,
  FilePlus2,
  ImagePlus,
  Plus,
  Square,
  TerminalSquare,
  X,
} from "lucide-react";
import type { AIModel } from "../api";
import { Button, IconButton } from "./Button";
import { Select } from "./Select";

export interface AgentAttachment {
  name: string;
  uri: string;
  mime: string;
  size: number;
}

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
  yolo: boolean;
  onYoloChange: (value: boolean) => void;
  placeholder: string;
  allowAttachments?: boolean;
}

export function AgentComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  models,
  model,
  onModelChange,
  effort,
  efforts,
  onEffortChange,
  yolo,
  onYoloChange,
  placeholder,
  allowAttachments = true,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
        event.preventDefault();
        fileRef.current?.click();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  function insert(prefix: string) {
    const area = areaRef.current;
    const start = area?.selectionStart ?? value.length;
    const next = `${value.slice(0, start)}${prefix}${value.slice(start)}`;
    onChange(next);
    window.setTimeout(() => {
      area?.focus();
      area?.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
    setMenu(false);
  }

  async function pickFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const next: AgentAttachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (file.size > 8 * 1024 * 1024) {
        setError(`${file.name} is larger than 8 MB.`);
        continue;
      }
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
    <div className="agent-composer-wrap">
      {menu && (
        <div className="agent-menu">
          {allowAttachments && (
            <button type="button" onClick={() => { setMenu(false); fileRef.current?.click(); }}>
              <span><ImagePlus size={15} /> Imagens e arquivos</span><kbd>Ctrl+U</kbd>
            </button>
          )}
          <button type="button" onClick={() => insert("/")}>
            <span><TerminalSquare size={15} /> Comandos</span><kbd>/</kbd>
          </button>
          <button type="button" onClick={() => insert("@")}>
            <span><AtSign size={15} /> Contexto</span><kbd>@</kbd>
          </button>
          <button type="button" onClick={() => insert("!")}>
            <span><TerminalSquare size={15} /> Comando do shell</span><kbd>!</kbd>
          </button>
        </div>
      )}
      <div className="agent-composer">
        <div className="agent-composer-toolbar">
          <Select
            value={model}
            options={models.map((item) => ({ value: item.id, label: item.label }))}
            onChange={onModelChange}
            label="Model"
            placeholder="Default model"
            className="agent-model-select"
            placement="top"
          />
          <Select
            value={effort}
            options={efforts.length ? efforts.map((item) => ({ value: item, label: item })) : [{ value: "", label: "Default" }]}
            onChange={onEffortChange}
            label="Effort"
            className="agent-effort-select"
            placement="top"
            disabled={efforts.length === 0}
          />
          <button
            type="button"
            className={`agent-yolo ${yolo ? "on" : ""}`}
            aria-pressed={yolo}
            onClick={() => onYoloChange(!yolo)}
          >
            YOLO
          </button>
          <span className="agent-composer-spacer" />
          <span className="agent-model-name">{model || "OpenCode"}</span>
        </div>
        {attachments.length > 0 && (
          <div className="agent-attachments">
            {attachments.map((file) => (
              <span key={`${file.name}-${file.size}`} className="agent-attachment" title={file.name}>
                <FilePlus2 size={12} />
                <span>{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setAttachments((items) => items.filter((item) => item !== file))}
                ><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={areaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") setMenu(false);
          }}
          placeholder={placeholder}
          rows={3}
        />
        {error && <div className="agent-composer-error">{error}</div>}
        <div className="agent-composer-bottom">
          <IconButton label="Add context or file" onClick={() => setMenu((open) => !open)}><Plus size={16} /></IconButton>
          <span className="agent-composer-hint">
            {allowAttachments ? "Files, commands, context and shell" : "Commands and context"}
          </span>
          {busy && onStop ? (
            <Button type="button" variant="ghost" size="sm" onClick={onStop}><Square size={13} /> Stop</Button>
          ) : (
            <Button type="button" variant="primary" size="sm" className="agent-send" onClick={submit} disabled={!value.trim() && attachments.length === 0}>
              <ArrowUp size={15} />
            </Button>
          )}
        </div>
      </div>
      {allowAttachments && (
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.csv,.log"
          onChange={(event) => void pickFiles(event.target.files)}
        />
      )}
    </div>
  );
}
