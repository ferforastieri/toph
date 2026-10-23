import { useEffect } from "react";
import { Bot, Plus, Sparkles } from "lucide-react";
import { providerLabel, useAI } from "../ai";
import type { Project } from "../api";
import OpenCodeSidebar from "./OpenCodeSidebar";

interface Props {
  project: Project;
  onOpenAI: () => void;
  onOpenSession: (session: { id: string; title?: string }) => void;
}


export default function AiSidebar({ project, onOpenAI, onOpenSession }: Props) {
  const config = useAI((state) => state.config);
  const load = useAI((state) => state.load);

  useEffect(() => {
    if (!config) void load();
  }, [config, load]);

  if (config?.provider === "opencode") {
    return <OpenCodeSidebar project={project} onOpenAI={onOpenAI} onOpenSession={onOpenSession} />;
  }

  const label = config ? providerLabel(config.provider) : "Agent";
  return (
    <div className="panel">
      <div className="panel-heading">
        <span>Agent</span>
        <button className="icon-button" title="New chat" onClick={onOpenAI}>
          <Plus size={15} />
        </button>
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
      <button className="ghost small agent-new-chat" onClick={onOpenAI}>
        <Bot size={14} /> New agent chat
      </button>
    </div>
  );
}
