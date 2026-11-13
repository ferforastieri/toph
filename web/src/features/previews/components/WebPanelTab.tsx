import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, RefreshCw } from "@toph/icons";
import { webPreviewUrl } from "../../../shared/api";
import { normalizeHttpUrl } from "../../../shared/lib";
import type { Tab } from "../../../app/store";
import { Button } from "@/shared/toph-ui/base/buttons/button";
import { IconLinkButton } from "@/shared/toph-ui/base/buttons/icon-button";
import { Input } from "@/shared/toph-ui/base/input/input";

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
    const next = normalizeHttpUrl(raw);
    if (!next) return;
    setDraftUrl(next);
    setActiveUrl(next);
    setReloadKey((value) => value + 1);
  }

  if (!activeUrl) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhuma URL configurada.</div>;
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b bg-muted/20 px-2 py-2 min-[901px]:h-8 min-[901px]:flex-row min-[901px]:items-center min-[901px]:gap-1 min-[901px]:py-0">
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
        <div className="flex w-full items-center gap-1 min-[901px]:w-auto">
          <Button variant="ghost" size="xs" iconOnly leadingIcon={ArrowRight} aria-label="Abrir link no preview" title="Abrir link no preview" className="max-[900px]:flex-1" onClick={() => loadUrl(draftUrl)} />
          <Button variant="ghost" size="xs" iconOnly leadingIcon={RefreshCw} aria-label="Recarregar preview" title="Recarregar preview" className="max-[900px]:flex-1" onClick={() => setReloadKey((value) => value + 1)} />
          <IconLinkButton icon={ExternalLink} size="small" aria-label="Abrir no navegador" title="Abrir no navegador" href={webPreviewUrl(activeUrl)} target="_blank" rel="noreferrer" className="max-[900px]:flex-1 border-transparent bg-transparent shadow-none" />
        </div>
      </div>
      <iframe
        key={`${activeUrl}:${reloadKey}`}
        className="min-h-0 w-full flex-1 border-0 bg-background"
        src={webPreviewUrl(activeUrl)}
        title={tab.title}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
