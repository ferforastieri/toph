import { useEffect, useState } from "react";
import { useAI } from "../ai";
import AiSettings from "../panels/AiSettings";
import AiConnectionsPanel from "./AiConnectionsPanel";
import { Button } from "@/boardui/base/buttons/button";
import { Modal } from "@/boardui/base/modal/modal";

export type AiSettingsTab = "general" | "connections";

interface Props {
  open: boolean;
  onClose: () => void;
  projectRoot?: string;
  initialTab?: AiSettingsTab;
  showConnections?: boolean;
}

export default function AiSettingsModal({
  open,
  onClose,
  projectRoot,
  initialTab = "general",
  showConnections = true,
}: Props) {
  const loadModels = useAI((state) => state.loadModels);
  const [tab, setTab] = useState<AiSettingsTab>(initialTab);

  useEffect(() => {
    if (open) setTab(showConnections ? initialTab : "general");
  }, [open, initialTab, showConnections]);

  const activeTab = showConnections ? tab : "general";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Configurações de IA"
      description="Provider, modelo, autocomplete e contas conectadas."
      size="lg"
      bodyClassName="p-0"
      footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}
    >
      <div className="flex min-h-0 flex-col">
        {showConnections && (
          <div role="tablist" aria-label="Configurações de IA" className="sticky top-0 z-10 flex shrink-0 gap-1 border-b border-border-button-default bg-background-primary-default px-5">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "general"}
              className={`-mb-px cursor-pointer border-b-2 px-2 py-3 text-body-2-medium transition-colors ${activeTab === "general" ? "border-accent-500 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
              onClick={() => setTab("general")}
            >
              Geral
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "connections"}
              className={`-mb-px cursor-pointer border-b-2 px-2 py-3 text-body-2-medium transition-colors ${activeTab === "connections" ? "border-accent-500 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
              onClick={() => setTab("connections")}
            >
              Conexões de IA
            </button>
          </div>
        )}
        <div className="min-h-0 p-5">
          {activeTab === "general" ? (
            <AiSettings />
          ) : (
            <AiConnectionsPanel
              projectRoot={projectRoot}
              onConnectionsChanged={() => void loadModels()}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
