import {
  FilePlus2,
  FileText,
  FolderPlus,
  Lock,
  Plus,
  Settings,
} from "lucide-react";
import { isMacPlatform } from "../lib/auto-lock.ts";
import { paletteFilter } from "../lib/command-palette.ts";
import type {
  EnvFileNode,
  ProjectNode,
  WorkspaceNode,
} from "../../shared/api-types.ts";
import { EnvBadge } from "./EnvBadge.tsx";
import { LockShortcutKeys } from "./LockShortcutKeys.tsx";
import { ProjectIcon } from "./ProjectIcon.tsx";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";
import type { SettingsTab } from "./SettingsDialog.tsx";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./ui/command.tsx";
import { Kbd, KbdGroup } from "./ui/kbd.tsx";

/**
 * The palette chord (Cmd/Ctrl+K) as keycaps, matching the platform.
 * Hidden on phones: no keyboard, no shortcut hints.
 */
export function PaletteShortcutKeys() {
  const mac = isMacPlatform();
  return (
    <KbdGroup className="max-sm:hidden">
      <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  );
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: WorkspaceNode[];
  workspace: WorkspaceNode | null;
  /** Picks the target project for "New file" (falls back to the first). */
  selectedFileId: string | null;
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
  onShowProject: (project: ProjectNode) => void;
  onPickWorkspace: (id: string) => void;
  onNewFile: (project: ProjectNode) => void;
  onNewProject: () => void;
  onNewWorkspace: () => void;
  onLock: () => void;
  onOpenSettings: (tab: SettingsTab) => void;
}

/**
 * Cmd+K everything-finder: files and projects in the current workspace, plus
 * the handful of actions that otherwise live in menus. This is the app's file
 * search — the sidebar deliberately has no filter box.
 */
export function CommandPalette({
  open,
  onOpenChange,
  workspaces,
  workspace,
  selectedFileId,
  onSelectFile,
  onShowProject,
  onPickWorkspace,
  onNewFile,
  onNewProject,
  onNewWorkspace,
  onLock,
  onOpenSettings,
}: CommandPaletteProps) {
  const projects = workspace?.projects ?? [];
  // "New file" lands next to what's being worked on: the selected file's
  // project when there is one, the first project otherwise.
  const fileTarget =
    projects.find((p) => p.files.some((f) => f.id === selectedFileId)) ??
    projects[0] ??
    null;
  const otherWorkspaces = workspaces.filter((w) => w.id !== workspace?.id);

  // Close first so a follow-up dialog (New file, settings) isn't fighting
  // the palette for focus.
  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Search files, projects and actions"
    >
      <Command filter={paletteFilter} loop>
        <CommandInput placeholder="Search files, projects, actions..." />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>

          {projects.some((p) => p.files.length > 0) && (
            <CommandGroup heading="Files">
              {projects.flatMap((project) =>
                project.files.map((file) => (
                  <CommandItem
                    key={file.id}
                    value={`${project.name}/${file.name}`}
                    keywords={file.environment ? [file.environment] : []}
                    onSelect={() => run(() => onSelectFile(project, file))}
                  >
                    <FileText className="text-muted-foreground" />
                    <span className="truncate font-mono">{file.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {project.name}
                    </span>
                    {file.environment && (
                      // CommandShortcut is the item's right-edge slot; it also
                      // hides the built-in (invisible) check indicator that
                      // would otherwise reserve space after the badge.
                      <CommandShortcut>
                        <EnvBadge environment={file.environment} />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                )),
              )}
            </CommandGroup>
          )}

          {projects.length > 0 && (
            <CommandGroup heading="Projects">
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.name}
                  keywords={["project"]}
                  onSelect={() => run(() => onShowProject(project))}
                >
                  <ProjectIcon project={project} size="sm" />
                  <span className="truncate">{project.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Actions">
            {fileTarget && (
              <CommandItem
                value="New file"
                keywords={["create", "env", fileTarget.name]}
                onSelect={() => run(() => onNewFile(fileTarget))}
              >
                <FilePlus2 className="text-muted-foreground" />
                New file
                <span className="text-muted-foreground truncate text-xs">
                  in {fileTarget.name}
                </span>
              </CommandItem>
            )}
            {workspace && (
              <CommandItem
                value="New project"
                keywords={["create"]}
                onSelect={() => run(onNewProject)}
              >
                <FolderPlus className="text-muted-foreground" />
                New project
              </CommandItem>
            )}
            <CommandItem
              value="Lock vault"
              keywords={["security"]}
              onSelect={() => run(onLock)}
            >
              <Lock className="text-muted-foreground" />
              Lock vault
              <CommandShortcut>
                <LockShortcutKeys />
              </CommandShortcut>
            </CommandItem>
            <CommandItem
              value="Settings"
              keywords={[
                "profile",
                "account",
                "password",
                "auto-lock",
                "recovery",
                "workspace",
              ]}
              onSelect={() => run(() => onOpenSettings("profile"))}
            >
              <Settings className="text-muted-foreground" />
              Settings
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Workspaces">
            {otherWorkspaces.map((w) => (
              <CommandItem
                key={w.id}
                value={`Switch to ${w.name}`}
                keywords={["workspace"]}
                onSelect={() => run(() => onPickWorkspace(w.id))}
              >
                <WorkspaceIcon workspace={w} />
                <span className="truncate">Switch to {w.name}</span>
              </CommandItem>
            ))}
            <CommandItem
              value="New workspace"
              keywords={["create"]}
              onSelect={() => run(onNewWorkspace)}
            >
              <Plus className="text-muted-foreground" />
              New workspace
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
