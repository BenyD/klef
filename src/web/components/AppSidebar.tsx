import { useEffect, useRef } from "react";
import {
  Check,
  FileText,
  LayoutGrid,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.ts";
import {
  ENVIRONMENTS,
  type EnvFileNode,
  type Environment,
  type ProjectNode,
  type WorkspaceNode,
} from "../../shared/api-types.ts";
import { ENV_META } from "../lib/env-meta.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";
import type { SettingsTab } from "./SettingsDialog.tsx";
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
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "./ui/sidebar.tsx";

interface AppSidebarProps {
  /** Tree still loading; skeleton rows. */
  loading?: boolean;
  workspace: WorkspaceNode | null;
  /** Project of the open file; null on the workspace overview. */
  currentProject: ProjectNode | null;
  selectedFileId: string | null;
  onShowOverview: () => void;
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
  onNewFile: (project: ProjectNode) => void;
  onRenameFile: (file: EnvFileNode) => void;
  onDeleteFile: (file: EnvFileNode) => void;
  onSetEnvironment: (file: EnvFileNode, env: Environment | null) => void;
  onEditProject: (project: ProjectNode) => void;
  onOpenSettings: (tab: SettingsTab) => void;
}

/**
 * Contextual rail (Supabase-style): collapsed to icons, expands over the
 * content on hover. On the workspace overview it is global navigation; inside
 * a project it is that project's files plus its settings. Cross-navigation
 * (workspaces/projects/files) lives in the topbar switchers.
 */
export function AppSidebar({
  loading = false,
  workspace,
  currentProject,
  selectedFileId,
  onShowOverview,
  onSelectFile,
  onNewFile,
  onRenameFile,
  onDeleteFile,
  onSetEnvironment,
  onEditProject,
  onOpenSettings,
}: AppSidebarProps) {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  // Short intent delay before the rail expands, so mousing across it on the
  // way to the content doesn't flare it open. Collapse stays immediate.
  const expandTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (expandTimer.current !== null) clearTimeout(expandTimer.current);
    },
    [],
  );

  // On mobile the sidebar is a sheet; close it once a choice is made.
  function act(fn: () => void) {
    fn();
    setOpenMobile(false);
  }

  return (
    <Sidebar
      collapsible="icon"
      /* Anchored to the content row (relative) rather than the viewport, so
         whatever sits above it (topbar, announcement banner) can vary in
         height without the rail drifting out of place. */
      className="absolute h-auto"
      onMouseEnter={() => {
        if (isMobile) return;
        expandTimer.current = window.setTimeout(() => setOpen(true), 150);
      }}
      onMouseLeave={() => {
        if (isMobile) return;
        if (expandTimer.current !== null) {
          clearTimeout(expandTimer.current);
          expandTimer.current = null;
        }
        setOpen(false);
      }}
    >
      <SidebarContent>
        {currentProject ? (
          <SidebarGroup>
            <SidebarGroupLabel className="gap-1.5">
              <ProjectIcon project={currentProject} size="sm" />
              <span className="truncate">{currentProject.name}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="All projects"
                    onClick={() => act(onShowOverview)}
                  >
                    <LayoutGrid />
                    <span>All projects</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {currentProject.files.map((file) => (
                  <SidebarMenuItem key={file.id}>
                    {/* Right-click manages the file in place; the row itself
                        just opens it. */}
                    <ContextMenu>
                      <ContextMenuTrigger>
                        <SidebarMenuButton
                          tooltip={file.name}
                          isActive={file.id === selectedFileId}
                          className="font-mono"
                          onClick={() =>
                            act(() => onSelectFile(currentProject, file))
                          }
                        >
                          <FileText />
                          <span className="truncate">{file.name}</span>
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
                              <span className="sr-only">
                                {file.environment}
                              </span>
                            </>
                          )}
                        </SidebarMenuButton>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="min-w-44">
                        <ContextMenuItem
                          onClick={() => act(() => onRenameFile(file))}
                        >
                          <Pencil />
                          Rename
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuGroup>
                          <ContextMenuLabel>Environment</ContextMenuLabel>
                          {ENVIRONMENTS.map((env) => (
                            <ContextMenuItem
                              key={env}
                              onClick={() => onSetEnvironment(file, env)}
                            >
                              <span
                                className={cn(
                                  "size-1.5 rounded-full",
                                  ENV_META[env].dot,
                                )}
                                aria-hidden="true"
                              />
                              {ENV_META[env].label}
                              {file.environment === env && (
                                <Check className="ml-auto size-4" />
                              )}
                            </ContextMenuItem>
                          ))}
                          {file.environment && (
                            <ContextMenuItem
                              onClick={() => onSetEnvironment(file, null)}
                            >
                              <X />
                              Clear label
                            </ContextMenuItem>
                          )}
                        </ContextMenuGroup>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          variant="destructive"
                          onClick={() => act(() => onDeleteFile(file))}
                        >
                          <Trash2 />
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="New file"
                    className="text-muted-foreground"
                    onClick={() => act(() => onNewFile(currentProject))}
                  >
                    <Plus />
                    <span>New file</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel className="truncate">
              {workspace?.name ?? "Workspace"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {loading ? (
                  Array.from({ length: 3 }, (_, i) => (
                    <SidebarMenuItem key={`skeleton-${i}`}>
                      <SidebarMenuSkeleton showIcon />
                    </SidebarMenuItem>
                  ))
                ) : (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="Projects"
                        isActive
                        onClick={() => act(onShowOverview)}
                      >
                        <LayoutGrid />
                        <span>Projects</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="Profile"
                        onClick={() => act(() => onOpenSettings("profile"))}
                      >
                        <UserRound />
                        <span>Profile</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="Security"
                        onClick={() => act(() => onOpenSettings("security"))}
                      >
                        <ShieldCheck />
                        <span>Security</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="Workspace settings"
                        onClick={() => act(() => onOpenSettings("workspace"))}
                      >
                        <Settings />
                        <span>Workspace settings</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      {/* Configuration pins to the bottom; the top of the rail stays about
          the project's contents. */}
      {currentProject && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Project settings"
                onClick={() => act(() => onEditProject(currentProject))}
              >
                <Settings />
                <span>Project settings</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
