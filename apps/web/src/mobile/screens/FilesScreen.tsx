import { Files } from "@toph/icons";
import type { Project } from "../../api";
import ProjectSearch from "../../components/ProjectSearch";
import FileTree from "../../panels/FileTree";
import ScreenHeader from "../components/ScreenHeader";

interface Props {
  project: Project;
  onOpenFile: (path: string, line?: number) => void;
}

/** Mobile file browser: search lives here, and there is no Explorer header. */
export default function FilesScreen({ project, onOpenFile }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background-primary-default">
      <ScreenHeader title="Arquivos" subtitle={project.name} icon={Files} />
      <div className="relative z-20 shrink-0 border-b border-separator-border bg-background-primary-default p-3">
        <ProjectSearch project={project} onOpenFile={onOpenFile} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <FileTree project={project} onOpenFile={onOpenFile} embedded />
      </div>
    </div>
  );
}
