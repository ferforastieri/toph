import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, RefreshCw } from "@toph/icons";
import { webPreviewUrl } from "../api";
import type { Tab } from "../store";
import { Button } from "@/boardui/base/buttons/button";
import { IconLinkButton } from "@/boardui/base/buttons/icon-button";
import { Input } from "@/boardui/base/input/input";

function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const host = value.split("/")[0].split(":")[0];
  const local = host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") || host.startsWith("10.") || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host);
  return `${local ? "http" : "https"}://${value}`;
}

export default function WebPanelTab({ tab }: { tab: Tab }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [draftUrl, setDraftUrl] = useState(tab.url ?? "");
  const [activeUrl, setActiveUrl] = useState(tab.url ?? "");

  useEffect(() => {
    setDraftUrl(tab.url ?? "");
    setActiveUrl(tab.url ?? "");
    setReloadKey(0);
  }, [tab.url]);

  function loadUrl(raw: string) {
    const next = normalizeUrl(raw);
    if (!next) return;
    setDraftUrl(next);
    setActiveUrl(next);
    setReloadKey((value) => value + 1);
  }

  if (!activeUrl) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhuma URL configurada.</div>;
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b bg-muted/20 px-2">
        <Input
          value={draftUrl}
          onChange={setDraftUrl}
          onKeyDown={(event) => {
            if (event.key === "Enter") loadUrl(draftUrl);
            else if (event.key === "Escape") setDraftUrl(activeUrl);
          }}
          aria-label="URL do preview"
          spellCheck="false"
          size="small"
          className="min-w-0 flex-1"
        />
        <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowRight} aria-label="Abrir link no preview" title="Abrir link no preview" onClick={() => loadUrl(draftUrl)} />
        <Button variant="ghost" size="xs" iconOnly leadingIcon={RefreshCw} aria-label="Recarregar preview" title="Recarregar preview" onClick={() => setReloadKey((value) => value + 1)} />
        <IconLinkButton icon={ExternalLink} size="small" aria-label="Abrir no navegador" title="Abrir no navegador" href={activeUrl} target="_blank" rel="noreferrer" className="border-transparent bg-transparent shadow-none" />
      </div>
      <iframe
        key={`${activeUrl}:${reloadKey}`}
        className="min-h-0 w-full flex-1 border-0 bg-background"
        src={webPreviewUrl(activeUrl)}
        title={tab.title}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
