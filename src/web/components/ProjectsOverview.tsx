import {
  ChevronRight,
  Columns3,
  FilePlus2,
  FileText,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "../lib/utils.ts";
import type { EnvFileNode, ProjectNode } from "../../shared/api-types.ts";
import { FRAMEWORK_LABELS } from "../lib/env-file-names.ts";
import { getRecentFileIds, sortByRecency } from "../lib/recent-files.ts";
import { useEnvMeta } from "../lib/env-meta.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

interface ProjectsOverviewProps {
  workspaceName: string;
  projects: ProjectNode[];
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
  onNewFile: (project: ProjectNode) => void;
  onNewProject: () => void;
  onEditProject: (project: ProjectNode) => void;
  /** Null when there is no other workspace to move to. */
  onMoveProject: ((project: ProjectNode) => void) | null;
  onCompareEnvironments: (project: ProjectNode) => void;
  onDeleteProject: (project: ProjectNode) => void;
}

/**
 * The workspace home as a list (Linear-style): each project is a group
 * header, its files are rows beneath, most recently opened first. Every row
 * is one click (or Tab + Enter) from the editor.
 */
export function ProjectsOverview({
  workspaceName,
  projects,
  onSelectFile,
  onNewFile,
  onNewProject,
  onEditProject,
  onMoveProject,
  onCompareEnvironments,
  onDeleteProject,
}: ProjectsOverviewProps) {
  const fileCount = projects.reduce((n, p) => n + p.files.length, 0);
  const recent = getRecentFileIds();
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{workspaceName}</h1>
          <p className="text-muted-foreground text-sm tabular-nums">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
            <span aria-hidden="true"> · </span>
            {fileCount} {fileCount === 1 ? "file" : "files"}
          </p>
        </div>
        <Button size="sm" onClick={onNewProject}>
          <Plus />
          New project
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {projects.map((project) => (
          <ProjectGroup
            key={project.id}
            project={project}
            files={sortByRecency(project.files, recent)}
            onSelectFile={onSelectFile}
            onNewFile={onNewFile}
            onEditProject={onEditProject}
            onMoveProject={onMoveProject}
            onCompareEnvironments={onCompareEnvironments}
            onDeleteProject={onDeleteProject}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectGroup({
  project,
  files,
  onSelectFile,
  onNewFile,
  onEditProject,
  onMoveProject,
  onCompareEnvironments,
  onDeleteProject,
}: {
  project: ProjectNode;
  files: EnvFileNode[];
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
  onNewFile: (project: ProjectNode) => void;
  onEditProject: (project: ProjectNode) => void;
  onMoveProject: ((project: ProjectNode) => void) | null;
  onCompareEnvironments: (project: ProjectNode) => void;
  onDeleteProject: (project: ProjectNode) => void;
}) {
  const envMeta = useEnvMeta();
  return (
    // The id is the scroll target for "go to project" (palette, breadcrumb).
    <section
      id={`project-${project.id}`}
      aria-label={project.name}
      className="overflow-hidden rounded-lg border"
    >
      <header className="bg-muted/50 group/header flex h-10 items-center gap-2.5 border-b px-3">
        <span className="flex size-5 shrink-0 items-center justify-center">
          <ProjectIcon project={project} size="sm" />
        </span>
        <h2 className="truncate text-sm font-medium">{project.name}</h2>
        <span className="text-muted-foreground hidden truncate text-xs sm:inline">
          {project.framework ? FRAMEWORK_LABELS[project.framework] : "No stack"}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {project.files.length}
          <span className="sr-only">
            {project.files.length === 1 ? " file" : " files"}
          </span>
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`New file in ${project.name}`}
            title="New file"
            className="text-muted-foreground"
            onClick={() => onNewFile(project)}
          >
            <Plus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for ${project.name}`}
                  className="text-muted-foreground"
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent
              align="end"
              className="min-w-52 whitespace-nowrap"
            >
              <DropdownMenuItem onClick={() => onNewFile(project)}>
                <FilePlus2 />
                New file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditProject(project)}>
                <Pencil />
                Edit project
              </DropdownMenuItem>
              {onMoveProject && (
                <DropdownMenuItem onClick={() => onMoveProject(project)}>
                  <FolderInput />
                  Move to workspace
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onCompareEnvironments(project)}>
                <Columns3 />
                Compare environments
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteProject(project)}
              >
                <Trash2 />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {files.length > 0 ? (
        <ul className="divide-y">
          {files.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => onSelectFile(project, file)}
                className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring/50 group/row flex h-9 w-full items-center gap-2.5 px-3 text-left outline-none transition-interactive focus-visible:ring-2 focus-visible:ring-inset"
              >
                <FileText className="text-muted-foreground size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {file.name}
                </span>
                {file.currentVersionId === null && (
                  <span className="text-muted-foreground hidden text-xs sm:inline">
                    Empty
                  </span>
                )}
                {file.environment ? (
                  <span className="text-muted-foreground flex w-28 shrink-0 items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        envMeta(file.environment).dot,
                      )}
                      aria-hidden="true"
                    />
                    <span className="truncate">
                      {envMeta(file.environment).label}
                    </span>
                  </span>
                ) : (
                  <span className="w-28 shrink-0" aria-hidden="true" />
                )}
                <ChevronRight className="text-muted-foreground size-3.5 shrink-0 opacity-0 transition-[opacity] group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => onNewFile(project)}
          className="text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:ring-ring/50 flex h-9 w-full items-center gap-2.5 px-3 text-left text-xs outline-none transition-interactive focus-visible:ring-2 focus-visible:ring-inset"
        >
          <Plus className="size-3.5 shrink-0" />
          Add the first file
        </button>
      )}
    </section>
  );
}
