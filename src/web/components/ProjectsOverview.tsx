import {
  FilePlus2,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "../lib/utils.ts";
import type { EnvFileNode, ProjectNode } from "../../shared/api-types.ts";
import { FRAMEWORK_LABELS } from "../lib/env-file-names.ts";
import { getRecentFileIds, sortByRecency } from "../lib/recent-files.ts";
import { ENV_META } from "../lib/env-meta.ts";
import { FrameworkIcon } from "./FrameworkIcon.tsx";
import { ProjectIcon } from "./ProjectIcon.tsx";
import { Button } from "./ui/button.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
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
  onDeleteProject: (project: ProjectNode) => void;
}

/** The workspace home: every project as a card, files one click away. */
export function ProjectsOverview({
  workspaceName,
  projects,
  onSelectFile,
  onNewFile,
  onNewProject,
  onEditProject,
  onDeleteProject,
}: ProjectsOverviewProps) {
  return (
    <div className="w-full flex-1 px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {workspaceName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </p>
        </div>
        <Button onClick={onNewProject}>
          <Plus />
          New project
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onSelectFile={onSelectFile}
            onNewFile={onNewFile}
            onEditProject={onEditProject}
            onDeleteProject={onDeleteProject}
          />
        ))}

        <button
          type="button"
          onClick={onNewProject}
          className="border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm transition-colors"
        >
          <Plus className="size-4" />
          New project
        </button>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onSelectFile,
  onNewFile,
  onEditProject,
  onDeleteProject,
}: {
  project: ProjectNode;
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
  onNewFile: (project: ProjectNode) => void;
  onEditProject: (project: ProjectNode) => void;
  onDeleteProject: (project: ProjectNode) => void;
}) {
  const hasFiles = project.files.length > 0;
  // Cards stay a fixed size: the two most recently opened files (falling
  // back to file order), with the rest behind a count.
  const shownFiles = sortByRecency(project.files, getRecentFileIds()).slice(
    0,
    2,
  );
  const extraCount = project.files.length - shownFiles.length;
  return (
    // The id is the command palette's scroll target for "go to project".
    <Card
      id={`project-card-${project.id}`}
      size="sm"
      className="transition-shadow hover:ring-foreground/20"
    >
      <CardHeader className="border-b">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Fixed footprint for alignment, no frame: custom icons are
              already tiles, and brand marks stand on their own. */}
          <div className="text-foreground flex size-8 shrink-0 items-center justify-center">
            <ProjectIcon project={project} />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{project.name}</CardTitle>
            <CardDescription className="flex items-center gap-2.5 text-xs">
              <span className="flex min-w-0 items-center gap-1">
                {/* Only when the chip shows a custom icon; otherwise the
                    chip already is the framework mark. */}
                {project.icon && project.framework && (
                  <FrameworkIcon
                    framework={project.framework}
                    className="size-3 shrink-0"
                  />
                )}
                <span className="truncate">
                  {project.framework
                    ? FRAMEWORK_LABELS[project.framework]
                    : "No stack"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <FileText className="size-3" aria-hidden="true" />
                {project.files.length}
                <span className="sr-only">
                  {project.files.length === 1 ? "file" : "files"}
                </span>
              </span>
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for ${project.name}`}
                  className="text-muted-foreground transition-opacity focus-visible:opacity-100 aria-expanded:opacity-100 md:opacity-0 md:group-hover/card:opacity-100"
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onClick={() => onNewFile(project)}>
                <FilePlus2 />
                New file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditProject(project)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteProject(project)}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-0.5 px-1">
        {hasFiles ? (
          <>
            {shownFiles.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => onSelectFile(project, file)}
                className="hover:bg-muted flex h-7 items-center gap-2 rounded-md px-2 text-left transition-colors"
              >
                <FileText className="text-muted-foreground size-3.5 shrink-0" />
                <span className="truncate font-mono text-xs">{file.name}</span>
                {file.environment && (
                  <>
                    <span
                      className={cn(
                        "ml-auto size-1.5 shrink-0 rounded-full",
                        ENV_META[file.environment].dot,
                      )}
                      title={file.environment}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{file.environment}</span>
                  </>
                )}
              </button>
            ))}
            {extraCount > 0 && (
              <span className="text-muted-foreground flex h-7 items-center px-2 text-xs">
                +{extraCount} more
              </span>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => onNewFile(project)}
            className="border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground mx-1 mb-1 flex flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-5 text-xs transition-colors"
          >
            <Plus className="size-3.5" />
            Add your first file
          </button>
        )}
      </CardContent>

      {hasFiles && (
        <CardFooter className="p-1.5">
          <button
            type="button"
            onClick={() => onNewFile(project)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors"
          >
            <Plus className="size-3.5 shrink-0" />
            Add file
          </button>
        </CardFooter>
      )}
    </Card>
  );
}
