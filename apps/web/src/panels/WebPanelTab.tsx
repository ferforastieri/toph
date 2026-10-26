import { ExternalLink, RefreshCw } from "@toph/icons";
import { useState } from "react";
import type { Tab } from "../store";
import { Button } from "@toph/ui";

interface Props {
  tab: Tab;
}

export default function WebPanelTab({ tab }: Props) {
  const [nonce, setNonce] = useState(0);
  if (!tab.url) {
    return (
      <div className="empty-hint">
        <p>No URL configured for this tab.</p>
      </div>
    );
  }
  return (
    <div className="web-tab">
      <div className="web-toolbar">
        <span className="web-url" title={tab.url}>
          {tab.url}
        </span>
        <Button className="icon-button" title="Reload" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw size={14} />
        </Button>
        <a className="icon-button" href={tab.url} target="_blank" rel="noreferrer" title="Open in browser">
          <ExternalLink size={14} />
        </a>
      </div>
      <iframe
        key={nonce}
        className="web-frame"
        src={tab.url}
        title={tab.title}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
