import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  EllipsisVertical,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  KeyRound,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "../lib/utils.ts";
import { signOut } from "../auth.ts";
import { clearDek } from "../dek-store.ts";
import {
  type EnvFileNode,
  type ProjectNode,
  type WorkspaceNode,
} from "../../shared/api-types.ts";
import { ENV_META } from "./EnvBadge.tsx";
import type { SettingsTab } from "./SettingsDialog.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible.tsx";
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
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "./ui/sidebar.tsx";

interface AppSidebarProps {
  name: string;
  email: string;
  image?: string | null;
  workspaces: WorkspaceNode[];
  workspace: WorkspaceNode | null;
  selectedFileId: string | null;
  onPickWorkspace: (id: string) => void;
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
  onNewWorkspace: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
  onNewProject: () => void;
  onRenameProject: (project: ProjectNode) => void;
  onDeleteProject: (project: ProjectNode) => void;
  onNewFile: (project: ProjectNode) => void;
}

export function AppSidebar({
  name,
  email,
  image,
  workspaces,
  workspace,
  selectedFileId,
  onPickWorkspace,
  onSelectFile,
  onNewWorkspace,
  onOpenSettings,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  onNewFile,
}: AppSidebarProps) {
  const { isMobile, setOpenMobile } = useSidebar();
  const projects = workspace?.projects ?? [];

  // Sidebar search was removed on purpose: file finding belongs to the
  // command palette (Cmd+K), not a header filter box.
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => openProjects[id] ?? true;

  // On mobile the sidebar is a sheet; close it once a file is chosen.
  function selectFile(project: ProjectNode, file: EnvFileNode) {
    onSelectFile(project, file);
    setOpenMobile(false);
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    aria-label="Switch workspace"
                    className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
                  >
                    <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                      <KeyRound className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">
                        {workspace?.name ?? "Klef"}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        Workspace
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                side={isMobile ? "bottom" : "right"}
                align="start"
                className="min-w-56"
              >
                {workspaces.map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => onPickWorkspace(w.id)}
                  >
                    <span className="truncate">{w.name}</span>
                    {w.id === workspace?.id && (
                      <Check className="ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                ))}
                {workspaces.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onNewWorkspace}>
                  <Plus />
                  New workspace
                </DropdownMenuItem>
                {/* Rename/delete deliberately live in Account settings, not
                    here — the switcher is for switching. */}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>

      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.map((project) => (
                <Collapsible
                  key={project.id}
                  open={isOpen(project.id)}
                  onOpenChange={(open) =>
                    setOpenProjects((s) => ({ ...s, [project.id]: open }))
                  }
                  className="group/collapsible"
                  render={<SidebarMenuItem />}
                >
                  <CollapsibleTrigger
                    render={
                      <SidebarMenuButton>
                        {isOpen(project.id) ? <FolderOpen /> : <Folder />}
                        <span className="truncate">{project.name}</span>
                      </SidebarMenuButton>
                    }
                  />
                  <SidebarMenuBadge className="text-muted-foreground transition-opacity group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0">
                    {project.files.length}
                  </SidebarMenuBadge>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuAction
                          showOnHover
                          aria-label={`Actions for ${project.name}`}
                        >
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      }
                    />
                    <DropdownMenuContent
                      side={isMobile ? "bottom" : "right"}
                      align="start"
                      className="min-w-44"
                    >
                      <DropdownMenuItem onClick={() => onNewFile(project)}>
                        <FilePlus2 />
                        New file
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onRenameProject(project)}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDeleteProject(project)}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {project.files.length === 0 ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            render={<button type="button" />}
                            className="text-muted-foreground w-full"
                            onClick={() => onNewFile(project)}
                          >
                            <Plus />
                            <span>Add file</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : (
                        project.files.map((file) => (
                          <SidebarMenuSubItem key={file.id}>
                            <SidebarMenuSubButton
                              size="sm"
                              render={<button type="button" />}
                              isActive={file.id === selectedFileId}
                              className="w-full font-mono"
                              onClick={() => selectFile(project, file)}
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
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              ))}
              {/* Always the last row, so "add" reads as part of the list. */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="text-muted-foreground"
                  onClick={onNewProject}
                  disabled={!workspace}
                >
                  <Plus />
                  <span>Add project</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* The footer is the account area, not another switcher: a hairline
          separates it from the tree and its row reads as a menu (ellipsis,
          muted monogram) while the workspace tile up top keeps the bold
          primary square and the up/down switcher chevrons. */}
      <SidebarFooter className="border-sidebar-border border-t">
        <NavUser
          name={name}
          email={email}
          image={image}
          onOpenSettings={onOpenSettings}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NavUser({
  name,
  email,
  image,
  onOpenSettings,
}: {
  name: string;
  email: string;
  image?: string | null;
  onOpenSettings: (tab: SettingsTab) => void;
}) {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const displayName = name.trim() || email;
  const initial = displayName.charAt(0).toUpperCase();

  async function onSignOut() {
    await clearDek();
    await signOut();
    navigate("/");
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label="Account menu"
                className="aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
              >
                <Avatar>
                  {image && (
                    <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
                  )}
                  <AvatarFallback>{initial}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{displayName}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {email}
                  </span>
                </div>
                <EllipsisVertical className="text-muted-foreground ml-auto size-4" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="end"
            className="min-w-56"
          >
            {/* One entry; Profile/Account live as tabs inside the dialog. */}
            <DropdownMenuItem onClick={() => onOpenSettings("profile")}>
              <Settings />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => void onSignOut()}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
