import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Columns3,
  FilePlus2,
  FolderInput,
  KeyRound,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.ts";
import {
  ENVIRONMENTS,
  isPresetEnvironment,
  type EnvFileNode,
  type Environment,
  type ProjectNode,
} from "../../shared/api-types.ts";
import { useEnvMeta } from "../lib/env-meta.ts";
import { isMacPlatform } from "../lib/auto-lock.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "./ui/sidebar.tsx";

interface AppSidebarProps {
  /** Tree still loading; skeleton rows. */
  loading?: boolean;
  /** Workspace switcher, rendered at the top. */
  header: ReactNode;
  /** Account, lock and theme controls, pinned to the bottom. */
  footer: ReactNode;
  projects: ProjectNode[];
  selectedFileId: string | null;
  /** True on the workspace overview (no file open). */
  overviewActive: boolean;
  /** Moving is only offered when there is another workspace to move to. */
  canMoveProjects: boolean;
  onShowOverview: () => void;
  onOpenPalette: () => void;
  onSearchKeys: () => void;
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
  onNewProject: () => void;
  onNewFile: (project: ProjectNode) => void;
  onRenameFile: (file: EnvFileNode) => void;
  onDeleteFile: (file: EnvFileNode) => void;
  onSetEnvironment: (file: EnvFileNode, env: Environment | null) => void;
  /** Opens the dialog for typing a custom environment label. */
  onCustomEnvironment: (file: EnvFileNode) => void;
  onEditProject: (project: ProjectNode) => void;
  onMoveProject: (project: ProjectNode) => void;
  onCompareEnvironments: (project: ProjectNode) => void;
  onDeleteProject: (project: ProjectNode) => void;
}

// Which projects are expanded survives reloads on this device. Storage can be
// unavailable (private mode, tests); the tree then just starts collapsed.
const EXPANDED_KEY = "klef-sidebar-expanded";

function readExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeExpanded(ids: ReadonlySet<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...ids]));
  } catch {
    // Still holds for this session via state.
  }
}

/**
 * The one navigation surface (Linear-style): workspace switcher, search, the
 * overview, and every project as a collapsible row with its files beneath.
 * The content header only shows where you are; moving around happens here.
 * On phones the same tree opens as a sheet.
 */
export function AppSidebar({
  loading = false,
  header,
  footer,
  projects,
  selectedFileId,
  overviewActive,
  canMoveProjects,
  onShowOverview,
  onOpenPalette,
  onSearchKeys,
  onSelectFile,
  onNewProject,
  onNewFile,
  onRenameFile,
  onDeleteFile,
  onSetEnvironment,
  onCustomEnvironment,
  onEditProject,
  onMoveProject,
  onCompareEnvironments,
  onDeleteProject,
}: AppSidebarProps) {
  const envMeta = useEnvMeta();
  const { setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState<Set<string>>(readExpanded);

  // Opening a file from anywhere (palette, tabs, overview) reveals it here.
  const selectedProjectId = selectedFileId
    ? (projects.find((p) => p.files.some((f) => f.id === selectedFileId))?.id ??
      null)
    : null;
  useEffect(() => {
    if (!selectedProjectId) return;
    setExpanded((prev) => {
      if (prev.has(selectedProjectId)) return prev;
      const next = new Set(prev).add(selectedProjectId);
      writeExpanded(next);
      return next;
    });
  }, [selectedProjectId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      writeExpanded(next);
      return next;
    });
  }

  // On mobile the sidebar is a sheet; close it once a choice is made.
  function act(fn: () => void) {
    fn();
    setOpenMobile(false);
  }

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="gap-2 pb-1">
        {header}
        {/* Styled as a search field, not a nav row: it opens the command
            menu, which is where searching happens. */}
        <button
          type="button"
          onClick={() => act(onOpenPalette)}
          className="bg-background text-muted-foreground hover:text-foreground hover:border-foreground/20 focus-visible:ring-sidebar-ring flex h-8 w-full items-center gap-2 rounded-md border px-2 text-sm shadow-raised outline-none transition-interactive focus-visible:ring-2"
        >
          <Search className="size-3.5 shrink-0" />
          <span>Search</span>
          <span className="ml-auto text-xs tracking-wide max-sm:hidden">
            {isMacPlatform() ? "⌘K" : "Ctrl K"}
          </span>
        </button>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={overviewActive}
              onClick={() => act(onShowOverview)}
            >
              <LayoutGrid />
              <span>All projects</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => act(onSearchKeys)}>
              <KeyRound />
              <span>Find a key</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* 12px between the fixed navigation above and the tree: enough to
            read as a new section without a rule. */}
        <SidebarGroup className="pt-3">
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction
            // Centred on the label, which the group's pt-3 moved down.
            className="top-4"
            aria-label="New project"
            title="New project"
            onClick={() => act(onNewProject)}
          >
            <Plus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {loading
                ? Array.from({ length: 3 }, (_, i) => (
                    <SidebarMenuItem key={`skeleton-${i}`}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))
                : projects.map((project) => {
                    const open = expanded.has(project.id);
                    return (
                      <SidebarMenuItem key={project.id}>
                        <SidebarMenuButton
                          aria-expanded={open}
                          onClick={() => toggle(project.id)}
                          className="group/project"
                        >
                          <span className="relative flex size-4 shrink-0 items-center justify-center">
                            <span className="flex group-hover/project:opacity-0 group-focus-visible/project:opacity-0">
                              <ProjectIcon project={project} size="sm" />
                            </span>
                            <ChevronRight
                              className={cn(
                                "text-muted-foreground absolute opacity-0 transition-[rotate] duration-(--duration-fast) group-hover/project:opacity-100 group-focus-visible/project:opacity-100",
                                open && "rotate-90",
                              )}
                            />
                          </span>
                          <span className="truncate">{project.name}</span>
                        </SidebarMenuButton>
                        <ProjectMenu
                          project={project}
                          canMove={canMoveProjects}
                          onNewFile={() => act(() => onNewFile(project))}
                          onEdit={() => act(() => onEditProject(project))}
                          onMove={() => act(() => onMoveProject(project))}
                          onCompare={() =>
                            act(() => onCompareEnvironments(project))
                          }
                          onDelete={() => act(() => onDeleteProject(project))}
                        />
                        {open && (
                          <SidebarMenuSub>
                            {project.files.map((file) => (
                              <SidebarMenuSubItem key={file.id}>
                                {/* Right-click manages the file in place;
                                    the row itself just opens it. */}
                                <ContextMenu>
                                  <ContextMenuTrigger
                                    render={
                                      <SidebarMenuSubButton
                                        render={<button type="button" />}
                                        isActive={file.id === selectedFileId}
                                        className="w-full font-mono text-xs"
                                        onClick={() =>
                                          act(() => onSelectFile(project, file))
                                        }
                                      />
                                    }
                                  >
                                    <span className="truncate">
                                      {file.name}
                                    </span>
                                    {file.environment && (
                                      <>
                                        <span
                                          className={cn(
                                            "ml-auto size-1.5 shrink-0 rounded-full",
                                            envMeta(file.environment).dot,
                                          )}
                                          title={envMeta(file.environment).label}
                                          aria-hidden="true"
                                        />
                                        <span className="sr-only">
                                          {envMeta(file.environment).label}
                                        </span>
                                      </>
                                    )}
                                  </ContextMenuTrigger>
                                  <ContextMenuContent className="min-w-44">
                                    <ContextMenuItem
                                      onClick={() =>
                                        act(() => onRenameFile(file))
                                      }
                                    >
                                      <Pencil />
                                      Rename
                                    </ContextMenuItem>
                                    <ContextMenuSeparator />
                                    <ContextMenuGroup>
                                      <ContextMenuLabel>
                                        Environment
                                      </ContextMenuLabel>
                                      {ENVIRONMENTS.map((env) => (
                                        <ContextMenuItem
                                          key={env}
                                          onClick={() =>
                                            onSetEnvironment(file, env)
                                          }
                                        >
                                          <span
                                            className={cn(
                                              "size-1.5 rounded-full",
                                              envMeta(env).dot,
                                            )}
                                            aria-hidden="true"
                                          />
                                          {envMeta(env).label}
                                          {file.environment === env && (
                                            <Check className="ml-auto size-4" />
                                          )}
                                        </ContextMenuItem>
                                      ))}
                                      <ContextMenuItem
                                        onClick={() =>
                                          act(() => onCustomEnvironment(file))
                                        }
                                      >
                                        <span
                                          className="bg-env-custom size-1.5 rounded-full"
                                          aria-hidden="true"
                                        />
                                        {file.environment &&
                                        !isPresetEnvironment(file.environment)
                                          ? file.environment
                                          : "Custom"}
                                        {file.environment &&
                                          !isPresetEnvironment(
                                            file.environment,
                                          ) && (
                                            <Check className="ml-auto size-4" />
                                          )}
                                      </ContextMenuItem>
                                      {file.environment && (
                                        <ContextMenuItem
                                          onClick={() =>
                                            onSetEnvironment(file, null)
                                          }
                                        >
                                          <X />
                                          Clear label
                                        </ContextMenuItem>
                                      )}
                                    </ContextMenuGroup>
                                    <ContextMenuSeparator />
                                    <ContextMenuItem
                                      variant="destructive"
                                      onClick={() =>
                                        act(() => onDeleteFile(file))
                                      }
                                    >
                                      <Trash2 />
                                      Delete
                                    </ContextMenuItem>
                                  </ContextMenuContent>
                                </ContextMenu>
                              </SidebarMenuSubItem>
                            ))}
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                render={<button type="button" />}
                                className="text-muted-foreground w-full text-xs"
                                onClick={() => act(() => onNewFile(project))}
                              >
                                <Plus className="text-muted-foreground! size-3.5!" />
                                <span>New file</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
              {!loading && projects.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="text-muted-foreground"
                    onClick={() => act(onNewProject)}
                  >
                    <Plus />
                    <span>New project</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="flex-row items-center gap-2">
        {footer}
      </SidebarFooter>
    </Sidebar>
  );
}

function ProjectMenu({
  project,
  canMove,
  onNewFile,
  onEdit,
  onMove,
  onCompare,
  onDelete,
}: {
  project: ProjectNode;
  canMove: boolean;
  onNewFile: () => void;
  onEdit: () => void;
  onMove: () => void;
  onCompare: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuAction
            showOnHover
            aria-label={`Actions for ${project.name}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        className="min-w-52 whitespace-nowrap"
      >
        <DropdownMenuItem onClick={onNewFile}>
          <FilePlus2 />
          New file
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          Edit project
        </DropdownMenuItem>
        {canMove && (
          <DropdownMenuItem onClick={onMove}>
            <FolderInput />
            Move to workspace
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onCompare}>
          <Columns3 />
          Compare environments
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          Delete project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
