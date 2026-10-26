import { useEffect } from "react";
import { Bot, Plus, Sparkles } from "@toph/icons";
import { providerLabel, useAI } from "../ai";
import type { Project } from "../api";
import OpenCodeSidebar from "./OpenCodeSidebar";
import { Button } from "@toph/ui";

interface Props {
  project: Project;
  onNewSession: () => void;
  onOpenSession: (session: { id: string; title?: string }) => void;
}


export default function AiSidebar({ project, onNewSession, onOpenSession }: Props) {
  const config = useAI((state) => state.config);
  const load = useAI((state) => state.load);

  useEffect(() => {
    if (!config) void load();
  }, [config, load]);

  if (config?.provider === "opencode") {
    return <OpenCodeSidebar project={project} onNewSession={onNewSession} onOpenSession={onOpenSession} />;
  }

  const label = config ? providerLabel(config.provider) : "Agent";
  return (
    <div className="panel">
      <div className="panel-heading">
        <span>Agent</span>
        <Button className="icon-button" title="New chat" onClick={onNewSession}>
          <Plus size={15} />
        </Button>
      </div>
      <div className="opencode-status online">
        <span className="status-dot" />
        {config ? `${label}${config.model ? ` · ${config.model}` : ""}` : "Loading configuration..."}
      </div>
      <div className="ai-sidebar-copy">
        <Sparkles size={16} />
        <p>
          The selected agent runs through the Toph server with access to <code>{project.root}</code>.
        </p>
      </div>
      <Button className="ghost small agent-new-chat" onClick={onNewSession}>
        <Bot size={14} /> New agent chat
      </Button>
    </div>
  );
}
