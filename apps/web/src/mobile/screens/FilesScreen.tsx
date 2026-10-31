import type { Project } from "../../api";
import ProjectSearch from "../../components/ProjectSearch";
import FileTree from "../../panels/FileTree";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
}

/** Mobile file browser: search lives here, and there is no Explorer header. */
export default function FilesScreen({ project, onOpenFile }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background-primary-default">
      <div className="relative z-20 shrink-0 bg-background-primary-default p-3 pb-2">
        <ProjectSearch project={project} onOpenFile={onOpenFile} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
        <div className="px-1 pb-2 pt-1 text-caption-2-semibold uppercase tracking-[0.14em] text-text-tertiary">
          Repositório
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-3xl border border-border-button-white bg-background-primary-default p-1 shadow-xs [&_[role=treeitem]]:h-11 [&_[role=treeitem]]:rounded-2xl [&_[role=treeitem]]:px-2">
          <FileTree project={project} onOpenFile={onOpenFile} embedded />
        </div>
      </div>
    </div>
  );
}
