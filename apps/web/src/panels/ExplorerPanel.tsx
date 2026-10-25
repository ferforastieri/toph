import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Project } from "../api";
import { changeStatusByPath } from "../gitStatus";
import { Button } from "@toph/ui";
import ProjectSearch from "../components/ProjectSearch";
import FileTree from "./FileTree";
import SourceControlPanel from "./SourceControlPanel";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  onOpenDiff: (path: string, staged: boolean) => void;
  searchFocusToken?: number;
}

export default function ExplorerPanel({
  project,
  onOpenFile,
  onOpenDiff,
  searchFocusToken,
}: Props) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [gitStatus, setGitStatus] = useState("");
  const statuses = useMemo(() => changeStatusByPath(gitStatus), [gitStatus]);

  return (
    <div className="panel explorer-panel">
      <div className="panel-heading">
        <span>Arquivos</span>
        <Button
          className="icon-button"
          title="Atualizar arquivos e Git"
          aria-label="Atualizar arquivos e Git"
          onClick={() => setRefreshToken((current) => current + 1)}
        >
          <RefreshCw size={14} />
        </Button>
      </div>
      <ProjectSearch
        project={project}
        onOpenFile={onOpenFile}
        focusToken={searchFocusToken}
      />
      <SourceControlPanel
        project={project}
        onOpenDiff={onOpenDiff}
        embedded
        refreshToken={refreshToken}
        onStatusChange={setGitStatus}
      />
      <div className="explorer-tree-head">
        <span>Arquivos</span>
        {statuses.size > 0 && <b>{statuses.size}</b>}
      </div>
      <FileTree
        project={project}
        onOpenFile={onOpenFile}
        embedded
        refreshToken={refreshToken}
        statuses={statuses}
      />
    </div>
  );
}
