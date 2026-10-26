import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch } from "@toph/icons";
import { api, type Project } from "../api";
import { changeStatusByPath } from "../gitStatus";
import ProjectSearch from "../components/ProjectSearch";
import { Button } from "@toph/ui";
import { useProjectEvents } from "../projectEvents";
import FileTree from "./FileTree";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
  searchFocusToken?: number;
  onOpenGit?: () => void;
}

export default function ExplorerPanel({
  project,
  onOpenFile,
  searchFocusToken,
  onOpenGit,
}: Props) {
  const [gitStatus, setGitStatus] = useState("");
  const statuses = useMemo(() => changeStatusByPath(gitStatus), [gitStatus]);

  const loadStatus = useCallback(async () => {
    try {
      setGitStatus(await api.gitStatus(project.id));
    } catch {
      setGitStatus("");
    }
  }, [project.id]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useProjectEvents(project.id, ["git", "files"], () => void loadStatus());

  return (
    <div className="panel explorer-panel">
      <div className="panel-heading">
        <span>Arquivos</span>
        {onOpenGit && (
          <Button
            className="icon-button"
            title="Branches e alterações"
            aria-label="Abrir branches e alterações"
            onClick={onOpenGit}
          >
            <GitBranch size={14} />
          </Button>
        )}
      </div>
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
  );
}
