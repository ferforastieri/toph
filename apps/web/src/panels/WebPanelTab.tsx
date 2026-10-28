import { ExternalLink } from "@toph/icons";
import type { Tab } from "../store";

export default function WebPanelTab({ tab }: { tab: Tab }) {
  if (!tab.url) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhuma URL configurada.</div>;
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b bg-muted/20 px-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={tab.url}>{tab.url}</span>
        <a className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" href={tab.url} target="_blank" rel="noreferrer" title="Abrir no navegador"><ExternalLink size={14} /></a>
      </div>
      <iframe className="min-h-0 w-full flex-1 border-0 bg-background" src={tab.url} title={tab.title} sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads" referrerPolicy="no-referrer" />
    </div>
  );
}
