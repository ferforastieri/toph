import { useCallback, useMemo, useState } from "react";
import { GitBranch } from "@toph/icons";
import type { Project } from "../api";
import { changeStatusByPath } from "../gitStatus";
import ProjectSearch from "../components/ProjectSearch";
import { Button } from "@toph/ui";
import FileTree from "./FileTree";
import SourceControlPanel from "./SourceControlPanel";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  searchFocusToken?: number;
  onOpenGit?: () => void;
  onOpenDiff: (path: string, staged: boolean) => void;
  onStatusChange?: (status: string) => void;
}

export default function ExplorerPanel({
  project,
  onOpenFile,
  searchFocusToken,
  onOpenGit,
  onOpenDiff,
  onStatusChange,
}: Props) {
  const [gitStatus, setGitStatus] = useState("");
  const statuses = useMemo(() => changeStatusByPath(gitStatus), [gitStatus]);
  const handleStatusChange = useCallback(
    (next: string) => {
      setGitStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange],
  );

  return (
    <div className="panel explorer-panel">
      <div className="panel-heading">
        <span>Arquivos</span>
        {onOpenGit && (
          <Button
            className="icon-button"
            title="Branches"
            aria-label="Abrir branches"
            onClick={onOpenGit}
          >
            <GitBranch size={14} />
          </Button>
        )}
      </div>
      <div className="explorer-files">
        <ProjectSearch
          project={project}
          onOpenFile={onOpenFile}
          focusToken={searchFocusToken}
        />
        <div className="explorer-tree-head">
          <span>Arquivos</span>
          {statuses.size > 0 && <b>{statuses.size}</b>}
        </div>
        <FileTree
          project={project}
          onOpenFile={onOpenFile}
          embedded
          statuses={statuses}
        />
      </div>
      <div className="explorer-changes">
        <div className="explorer-changes-head">
          <span>Alterações</span>
          {statuses.size > 0 && <b>{statuses.size}</b>}
        </div>
        <SourceControlPanel
          project={project}
          embedded
          view="changes"
          onOpenDiff={onOpenDiff}
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  );
}
