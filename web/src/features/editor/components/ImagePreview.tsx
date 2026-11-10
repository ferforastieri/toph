import { useEffect, useRef, useState } from "react";
import { api } from "../../../shared/api";

interface Props {
  projectId: string;
  path: string;
  /** Bumped by the panel when the file changes on disk. */
  version: number;
}

/**
 * Renders an image file served by the raw endpoint. A refresh keeps the decoded
 * image on screen until the replacement arrives, so the watcher events a build
 * or checkout raises cannot flash the preview.
 */
export default function ImagePreview({ projectId, path, version }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeUrl = useRef<string | null>(null);
  const activeSize = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Coalesce the bursts of file events into a single read.
    const timer = window.setTimeout(() => {
      api
        .fileBlob(projectId, path)
        .then((blob) => {
          if (cancelled) return;
          const previous = activeUrl.current;
          // Same bytes (a re-read after an unrelated event) keep the current image.
          if (previous && activeSize.current === blob.size) return;
          const next = URL.createObjectURL(blob);
          activeUrl.current = next;
          activeSize.current = blob.size;
          setUrl(next);
          if (previous) URL.revokeObjectURL(previous);
        })
        .catch((cause) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "Não foi possível abrir a imagem.");
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [path, projectId, version]);

  useEffect(() => () => {
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    activeUrl.current = null;
  }, []);

  if (error) {
    return <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-text-tertiary">{error}</div>;
  }

  if (!url) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-text-tertiary">Abrindo {path}...</div>;
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-background-full p-4">
      <img src={url} alt={path} className="block max-h-full max-w-full object-contain" />
    </div>
  );
}
