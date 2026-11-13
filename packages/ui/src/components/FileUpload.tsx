"use client";

import { useRef, useState, type ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "../icons/Icon";
import { CloseButton } from "./CloseButton";

export interface UploadFile {
  name: string;
  /** In bytes. */
  size?: number;
  status?: "uploading" | "done" | "failed";
  /** 0–100 while `uploading`. */
  progress?: number;
}

function readableSize(bytes: number | undefined) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

/**
 * A drop target with a picker: files are dropped or chosen, filtered by type
 * and size, and listed under the zone with their own state. Uploading is the
 * caller's; the list only shows what it was given.
 */
export function FileUpload({
  label = "Arraste um arquivo",
  hint,
  accept,
  multiple,
  maxSize,
  onFiles,
  files = [],
  onRemove,
  removeLabel = "Remover",
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  /** In bytes; larger files are dropped before `onFiles`. */
  maxSize?: number;
  onFiles?: (files: File[]) => void;
  files?: UploadFile[];
  onRemove?: (index: number) => void;
  removeLabel?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState(0);

  function take(list: FileList | null) {
    const picked = [...(list ?? [])].slice(0, multiple ? undefined : 1);
    const allowed = maxSize ? picked.filter((file) => file.size <= maxSize) : picked;
    setRejected(picked.length - allowed.length);
    if (allowed.length) onFiles?.(allowed);
  }

  return (
    <div className={cx("ac-upload", className)}>
      <div
        className={cx("ac-upload__zone", over && "ac-upload__zone--over")}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          take(event.dataTransfer.files);
        }}
      >
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          className="ac-upload__input"
          onChange={(event) => {
            take(event.target.files);
            event.target.value = "";
          }}
        />

        <span className="ac-upload__key" aria-hidden="true">
          <Icon name="upload" size={20} />
        </span>
        <p className="ac-upload__label">{label}</p>
        <p className="ac-upload__hint">
          {hint ?? "Qualquer arquivo"}
          {" · "}
          <button type="button" className="ac-link ac-link--action" onClick={() => input.current?.click()}>
            escolher
          </button>
        </p>
      </div>

      {rejected > 0 ? (
        <p className="ac-upload__rejected" role="status">
          {rejected === 1 ? "Um arquivo passou do limite." : `${rejected} arquivos passaram do limite.`}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="ac-upload__files">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="ac-upload__file">
              <Icon name="file" size={14} />
              <span className="ac-upload__name">{file.name}</span>
              <span className="ac-upload__meta">
                {file.status === "failed" ? "falhou" : readableSize(file.size)}
              </span>
              {file.status === "uploading" ? (
                <span className="ac-upload__progress" aria-hidden="true">
                  <i style={{ width: `${file.progress ?? 0}%` }} />
                </span>
              ) : null}
              {onRemove ? <CloseButton size="sm" label={`${removeLabel} ${file.name}`} onClick={() => onRemove(index)} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
