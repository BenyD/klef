import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router";
import { useTheme } from "next-themes";
import {
  Boxes,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Lock,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SunMoon,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils.ts";
import { signOut } from "../auth.ts";
import { clearDek } from "../dek-store.ts";
import {
  discoverIcon,
  fileToDataUrl,
  fileToIconDataUrl,
  resolveIconUrl,
  settleIcon,
} from "../lib/project-icon.ts";
import {
  AUTO_LOCK_OPTIONS,
  isMacPlatform,
  setAutoLockMinutes,
  useAutoLock,
  useAutoLockMinutes,
  useLockShortcut,
} from "../lib/auto-lock.ts";
import { usePaletteShortcut } from "../lib/command-palette.ts";
import { recordRecentFile } from "../lib/recent-files.ts";
import {
  closeTabs,
  cycleTab,
  moveTab,
  openTab,
  restoreTabs,
  serializeTabs,
  tabForDigit,
} from "../lib/file-tabs.ts";
import { useTree } from "../use-tree.ts";
import { useVault } from "../vault-context.ts";
import * as api from "../structure-api.ts";
import type { SelectedFile } from "../vault-types.ts";
import {
  isPresetEnvironment,
  normalizeEnvironment,
  type Environment,
  type EnvFileNode,
  type Framework,
  type PresetEnvironment,
  type ProjectNode,
  type WorkspaceNode,
} from "../../shared/api-types.ts";
import { workspaceSlug } from "../../shared/slug.ts";
import {
  FRAMEWORK_LABELS,
  STACK_GROUPS,
  suggestedEnvFileNames,
  type NameSuggestion,
} from "../lib/env-file-names.ts";
import { AppSidebar } from "./AppSidebar.tsx";
import { Banner } from "./Banner.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { FrameworkIcon } from "./FrameworkIcon.tsx";
import { FileTabs } from "./FileTabs.tsx";
import { ProjectIcon } from "./ProjectIcon.tsx";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";
import { ProjectsOverview } from "./ProjectsOverview.tsx";
import { CompareEnvironmentsDialog } from "./CompareEnvironmentsDialog.tsx";
import { KeySearchDialog } from "./KeySearchDialog.tsx";
import { LockShortcutKeys } from "./LockShortcutKeys.tsx";
import { envTag } from "../lib/env-meta.ts";
import { FilePane } from "./FilePane.tsx";
import { SettingsDialog, type SettingsTab } from "./SettingsDialog.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.tsx";
import { AvatarCropDialog } from "./AvatarCropDialog.tsx";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty.tsx";
import { Input } from "./ui/input.tsx";
import { Kbd, KbdGroup } from "./ui/kbd.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";
import { Label } from "./ui/label.tsx";
import { SkeletonText, Skeleton } from "./ui/skeleton.tsx";
import { LoadingStatus } from "./ui/loading-status.tsx";
import { ContentSkeleton, WorkspaceSwitcherSkeleton } from "./skeletons.tsx";
import { readLayoutHint, rememberLayout } from "../lib/layout-hint.ts";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "./ui/combobox.tsx";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/sidebar.tsx";

// Deep-link into settings: pin the recovery section once the dialog settles.
// The open animation and the dialog's initial focus can each undo an early
// scroll, so re-apply it until the section actually sits at the top.
function scrollToRecoverySection() {
  for (const delay of [250, 550, 900]) {
    setTimeout(() => {
      const el = document.getElementById("settings-recovery");
      const panel = el?.closest(".overflow-y-auto");
      if (!el || !panel) return;
      const offset =
        el.getBoundingClientRect().top - panel.getBoundingClientRect().top;
      if (Math.abs(offset) > 24) el.scrollIntoView({ block: "start" });
    }, delay);
  }
}

type Kind = "workspace" | "project" | "file";
type FrameworkItem = { value: Framework; label: string };
type StackGroup = { value: string; items: FrameworkItem[] };
// Clearing happens via the ✕ in the search field, not a "None" row.
const STACK_GROUP_ITEMS: StackGroup[] = STACK_GROUPS.map((g) => ({
  value: g.label,
  items: g.stacks.map((f) => ({ value: f, label: FRAMEWORK_LABELS[f] })),
}));
const ALL_STACK_ITEMS = STACK_GROUP_ITEMS.flatMap((g) => g.items);
type DialogFields = {
  name: string;
  framework: Framework | null;
  icon: string | null;
};
type NameDialog = {
  title: string;
  label: string;
  initial: string;
  /** When set, the dialog also shows a framework picker (projects only). */
  withFramework?: { initial: Framework | null };
  /** When set, the dialog also shows the icon field (projects, workspaces). */
  withIcon?: { initial: string | null };
  /**
   * One-click names for the stack (files only). The first fills the field;
   * picks follow stack changes until the user types a name of their own.
   */
  suggestNames?: (framework: Framework | null) => NameSuggestion[];
  /**
   * Where name suggestions come from, with an inline way to change the
   * project's stack without leaving the dialog. Saves immediately.
   */
  stackHint?: {
    initial: Framework | null;
    save: (framework: Framework | null) => Promise<void>;
  };
  submit: (fields: DialogFields) => Promise<void>;
};

export function VaultHome({
  name,
  email,
  image,
  animateIn = true,
}: {
  name: string;
  email: string;
  image?: string | null;
  /**
   * Enter with the screen hand-off. Off when the boot skeleton was on screen
   * just before: that skeleton is this screen, so it should fill in, not
   * fade in from nothing.
   */
  animateIn?: boolean;
}) {
  const { tree, loading, error, reload } = useTree();
  const [layoutHint] = useState(readLayoutHint);
  const { lock, recoveryConfirmed } = useVault();
  useAutoLock(lock);
  // The shortcut is a deliberate action, so it gets the dirty-draft guard
  // (requestLock below); only idle auto-lock skips it.
  useLockShortcut(() => requestLock());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [keySearchOpen, setKeySearchOpen] = useState(false);
  usePaletteShortcut(useCallback(() => setPaletteOpen((o) => !o), []));
  const navigate = useNavigate();
  // The workspace lives in the URL (klef.sh/<slug>); /app has no param and
  // falls through to the first workspace below.
  const { wsSlug } = useParams<{ wsSlug: string }>();
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  // Open-file tabs, IDE style: every visited file stays open (and keeps its
  // draft mounted) until its tab is closed. `selected` is the active tab;
  // null shows the overview while tabs stay open.
  const [openFiles, setOpenFiles] = useState<SelectedFile[]>([]);
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(new Set());
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [movingProject, setMovingProject] = useState<ProjectNode | null>(null);
  const [comparingProject, setComparingProject] = useState<ProjectNode | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<{
    kind: Kind;
    id: string;
    name: string;
    run: () => Promise<unknown>;
  } | null>(null);
  // Workspace deletes are type-to-confirm; the typed name must match exactly.
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  // Any teardown that would silently drop dirty drafts (lock, sign out,
  // workspace switch, closing a dirty tab) funnels through one confirmation.
  // Auto-lock deliberately bypasses it: an idle vault must lock regardless.
  const [pendingDiscard, setPendingDiscard] = useState<{
    description: string;
    confirmLabel: string;
    run: () => void;
  } | null>(null);

  const unsavedNote = () =>
    dirtyIds.size === 1
      ? "1 file has unsaved edits."
      : `${dirtyIds.size} files have unsaved edits.`;

  function guardDirty(
    run: () => void,
    what: { verb: string; confirmLabel: string },
  ) {
    if (dirtyIds.size === 0) run();
    else {
      setPendingDiscard({
        description: `${unsavedNote()} ${what.verb} discards them.`,
        confirmLabel: what.confirmLabel,
        run,
      });
    }
  }

  function requestLock() {
    guardDirty(lock, { verb: "Locking", confirmLabel: "Lock and discard" });
  }

  const workspaces = tree?.workspaces ?? [];
  // Match by slug, or by raw id for legacy names with nothing sluggable.
  const workspace =
    workspaces.find(
      (w) => workspaceSlug(w.name, w.id) === wsSlug || w.id === wsSlug,
    ) ??
    workspaces[0] ??
    null;
  const projects = workspace?.projects ?? [];
  const allFiles = projects.flatMap((p) => p.files);

  // Canonicalize the address bar: /app, an unknown slug, or a stale slug
  // (after rename/delete) all settle on the resolved workspace's URL.
  useEffect(() => {
    if (!workspace) return;
    const slug = workspaceSlug(workspace.name, workspace.id);
    if (wsSlug !== slug) navigate(`/${slug}`, { replace: true });
  }, [workspace, wsSlug, navigate]);

  // RouteTitle only knows static paths; give workspace URLs their real name.
  useEffect(() => {
    if (workspace) document.title = `${workspace.name} - Klef`;
  }, [workspace]);

  // Drop a selection that no longer exists (e.g. after a delete elsewhere).
  useEffect(() => {
    if (selected && !allFiles.some((f) => f.id === selected.id)) {
      setSelected(null);
    }
  }, [allFiles, selected]);

  // Keep tabs honest against the tree: prune deleted files, follow renames
  // and environment changes. Bails out identity-stable so it can't loop.
  useEffect(() => {
    setOpenFiles((prev) => {
      let changed = false;
      const next: SelectedFile[] = [];
      for (const tab of prev) {
        const project = projects.find((p) =>
          p.files.some((f) => f.id === tab.id),
        );
        const live = project?.files.find((f) => f.id === tab.id);
        if (!project || !live) {
          changed = true;
          continue;
        }
        if (
          live.name !== tab.name ||
          live.environment !== tab.environment ||
          project.name !== tab.project
        ) {
          changed = true;
          next.push({
            ...tab,
            name: live.name,
            environment: live.environment,
            project: project.name,
          });
        } else {
          next.push(tab);
        }
      }
      return changed ? next : prev;
    });
  }, [projects]);

  // Open tabs survive a reload, per workspace and per device: ids only, the
  // names come back from the tree. Restoring happens once per workspace,
  // after its tree has loaded; saving only starts after that, so switching
  // workspaces never writes one workspace's tabs under another's key.
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !workspace || restoredFor.current === workspace.id) return;
    restoredFor.current = workspace.id;
    const ws = workspace;
    const restored = restoreTabs<SelectedFile>(
      readStored(tabsKey(ws.id)),
      (id) => {
        for (const p of ws.projects) {
          const f = p.files.find((x) => x.id === id);
          if (f) {
            return {
              id: f.id,
              name: f.name,
              projectId: p.id,
              project: p.name,
              workspace: ws.name,
              environment: f.environment,
            };
          }
        }
        return null;
      },
    );
    setOpenFiles(restored.tabs);
    setSelected(restored.tabs.find((t) => t.id === restored.activeId) ?? null);
  }, [loading, workspace]);
  useEffect(() => {
    if (!workspace || restoredFor.current !== workspace.id) return;
    writeStored(
      tabsKey(workspace.id),
      serializeTabs({ tabs: openFiles, activeId: selected?.id ?? null }),
    );
    rememberLayout({ tabs: openFiles.length, fileOpen: selected !== null });
  }, [workspace, openFiles, selected]);

  const run = async (op: Promise<unknown>) => {
    await op;
    await reload();
  };

  function pickWorkspace(id: string) {
    guardDirty(
      () => {
        const ws = workspaces.find((w) => w.id === id);
        if (ws) navigate(`/${workspaceSlug(ws.name, ws.id)}`);
        // Tabs are per-workspace: the restore effect swaps in the new
        // workspace's saved tabs. Drafts belong to the vault being left.
        setDirtyIds(new Set());
      },
      { verb: "Switching workspaces", confirmLabel: "Switch and discard" },
    );
  }

  // Open (or focus) a tab for the file and make it active.
  function openFileTab(entry: SelectedFile) {
    setOpenFiles((prev) => openTab({ tabs: prev, activeId: null }, entry).tabs);
    setSelected(entry);
  }

  function closeTabsNow(ids: readonly string[]) {
    const next = closeTabs(
      { tabs: openFiles, activeId: selected?.id ?? null },
      ids,
    );
    setOpenFiles(next.tabs);
    setDirtyIds((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const copy = new Set(prev);
      for (const id of ids) copy.delete(id);
      return copy;
    });
    setSelected(next.tabs.find((t) => t.id === next.activeId) ?? null);
  }

  // Close one or several tabs (close others, close to the right); any with
  // unsaved edits go through the one discard confirmation.
  function closeFileTabs(ids: readonly string[]) {
    const dirty = ids.filter((id) => dirtyIds.has(id));
    if (dirty.length === 0) return closeTabsNow(ids);
    const name = openFiles.find((f) => f.id === dirty[0])?.name ?? "This file";
    setPendingDiscard({
      description:
        dirty.length === 1
          ? `"${name}" has unsaved edits. Closing discards them.`
          : `${dirty.length} files have unsaved edits. Closing discards them.`,
      confirmLabel: "Close and discard",
      run: () => closeTabsNow(ids),
    });
  }

  // Tab keys use Alt (Option): the browser keeps Cmd/Ctrl+1-9, Cmd/Ctrl+W and
  // Ctrl+Tab for its own tabs and never hands them to the page. e.code, not
  // e.key, because Option+1 on a Mac types "¡".
  const tabKeys = useRef<(e: KeyboardEvent) => void>(() => {});
  tabKeys.current = (e: KeyboardEvent) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || openFiles.length === 0) return;
    const state = { tabs: openFiles, activeId: selected?.id ?? null };
    // e.key as a fallback for layouts and tools that leave e.code empty.
    const digit = /^Digit([1-9])$/.exec(e.code)?.[1] ?? /^[1-9]$/.exec(e.key)?.[0];
    let target: string | null = null;
    if (digit) {
      target = tabForDigit(openFiles, Number(digit));
    } else if (e.code === "BracketRight" || e.key === "]") {
      target = cycleTab(state, 1);
    } else if (e.code === "BracketLeft" || e.key === "[") {
      target = cycleTab(state, -1);
    } else if ((e.code === "KeyW" || e.key.toLowerCase() === "w") && selected) {
      e.preventDefault();
      closeFileTabs([selected.id]);
      return;
    } else {
      return;
    }
    e.preventDefault();
    const tab = openFiles.find((f) => f.id === target);
    if (tab) setSelected(tab);
  };
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => tabKeys.current(e);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The browser's own "leave site?" prompt is the only guard available for
  // closing the tab or navigating away with unsaved edits.
  useEffect(() => {
    if (dirtyIds.size === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome still requires returnValue to be set to show the prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyIds]);

  const markDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  function selectFile(project: ProjectNode, file: EnvFileNode) {
    if (!workspace) return;
    recordRecentFile(file.id);
    openFileTab({
      id: file.id,
      name: file.name,
      projectId: project.id,
      project: project.name,
      workspace: workspace.name,
      environment: file.environment,
    });
  }

  // "Go to project" from the palette: land on the overview with the
  // project's card in view.
  function showProject(project: ProjectNode) {
    setSelected(null);
    requestAnimationFrame(() => {
      document
        .getElementById(`project-${project.id}`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function openNewWorkspace() {
    setNameDialog({
      title: "New workspace",
      label: "Workspace name",
      initial: "",
      withIcon: { initial: null },
      submit: async ({ name, icon }) => {
        const { id } = await api.createWorkspace(name, icon);
        await reload();
        navigate(`/${workspaceSlug(name, id)}`);
        setSelected(null);
      },
    });
  }
  function openDeleteWorkspace() {
    // The last workspace can't be deleted (also enforced server-side).
    if (!workspace || workspaces.length <= 1) return;
    const ws = workspace;
    setPendingDelete({
      kind: "workspace",
      id: ws.id,
      name: ws.name,
      run: () => api.deleteWorkspace(ws.id),
    });
  }

  function openNewProject() {
    if (!workspace) return;
    const ws = workspace;
    setNameDialog({
      title: "New project",
      label: "Project name",
      initial: "",
      withFramework: { initial: null },
      withIcon: { initial: null },
      submit: async ({ name, framework, icon }) => {
        await api.createProject(ws.id, name, framework, icon);
        await reload();
      },
    });
  }
  function openEditProject(project: ProjectNode) {
    setNameDialog({
      title: "Edit project",
      label: "Project name",
      initial: project.name,
      withFramework: { initial: project.framework },
      withIcon: { initial: project.icon },
      submit: ({ name, framework, icon }) =>
        run(api.updateProject(project.id, { name, framework, icon })),
    });
  }
  function openDeleteProject(project: ProjectNode) {
    setPendingDelete({
      kind: "project",
      id: project.id,
      name: project.name,
      run: () => api.deleteProject(project.id),
    });
  }
  // Moving carries the project's files along (same DEK, no re-encryption). Only
  // offered when there's somewhere else to move to.
  function openMoveProject(project: ProjectNode) {
    if (workspaces.length > 1) setMovingProject(project);
  }
  async function moveProjectTo(project: ProjectNode, workspaceId: string) {
    setMovingProject(null);
    try {
      await run(api.updateProject(project.id, { workspaceId }));
      const dest = workspaces.find((w) => w.id === workspaceId);
      toast.success(`Moved "${project.name}" to ${dest?.name ?? "workspace"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
  function openCompareEnvironments(project: ProjectNode) {
    setComparingProject(project);
  }

  function openNewFile(project: ProjectNode) {
    if (!workspace) return;
    const ws = workspace;
    setNameDialog({
      title: "New file",
      label: "File name",
      initial: "",
      suggestNames: suggestedEnvFileNames,
      stackHint: {
        initial: project.framework,
        save: (framework) => run(api.updateProject(project.id, { framework })),
      },
      // No environment: the name implies it, and the file's menu overrides.
      submit: async ({ name }) => {
        const { id } = await api.createFile(project.id, name, null);
        await reload();
        openFileTab({
          id,
          name,
          projectId: project.id,
          project: project.name,
          workspace: ws.name,
          environment: null,
        });
      },
    });
  }
  // File management works on any file (sidebar right-click), not just the
  // active one; open tabs and the selection follow via the sync effect.
  function openRenameFile(file: { id: string; name: string }) {
    setNameDialog({
      title: "Rename file",
      label: "File name",
      initial: file.name,
      submit: async ({ name }) => {
        await api.renameFile(file.id, name);
        await reload();
        setSelected((sel) => (sel?.id === file.id ? { ...sel, name } : sel));
      },
    });
  }
  function openDeleteFile(file: { id: string; name: string }) {
    setPendingDelete({
      kind: "file",
      id: file.id,
      name: file.name,
      run: () => api.deleteFile(file.id),
    });
  }

  async function setFileEnvironment(
    file: { id: string },
    environment: Environment | null,
  ) {
    try {
      await api.setFileEnvironment(file.id, environment);
      await reload();
      setSelected((sel) =>
        sel?.id === file.id ? { ...sel, environment } : sel,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function openCustomEnvironment(file: EnvFileNode) {
    setNameDialog({
      title: "Custom environment",
      label: "Environment label",
      initial:
        file.environment && !isPresetEnvironment(file.environment)
          ? file.environment
          : "",
      submit: async ({ name }) => {
        const environment = normalizeEnvironment(name);
        if (!environment) {
          toast.error(
            "Labels are letters, numbers, spaces, dots, or dashes (max 32).",
          );
          return;
        }
        await setFileEnvironment(file, environment);
      },
    });
  }

  const currentProject = selected
    ? (projects.find((p) => p.files.some((f) => f.id === selected.id)) ?? null)
    : null;

  return (
    <SidebarProvider
      defaultOpen
      className={cn(animateIn && "klef-screen", "h-svh overflow-hidden")}
    >
      <AppSidebar
        loading={loading}
        header={
          loading ? (
            <WorkspaceSwitcherSkeleton />
          ) : (
            <WorkspaceSwitcher
              workspaces={workspaces}
              workspace={workspace}
              onPick={pickWorkspace}
              onNew={openNewWorkspace}
              onOpenSettings={() => setSettingsTab("workspace")}
            />
          )
        }
        footer={
          <>
            <UserMenu
              name={name}
              email={email}
              image={image}
              onOpenSettings={setSettingsTab}
              onLock={requestLock}
              beforeSignOut={(proceed) =>
                guardDirty(proceed, {
                  verb: "Signing out",
                  confirmLabel: "Sign out and discard",
                })
              }
            />
            <LockButton lock={requestLock} />
          </>
        }
        projects={projects}
        selectedFileId={selected?.id ?? null}
        overviewActive={!selected}
        canMoveProjects={workspaces.length > 1}
        onShowOverview={() => setSelected(null)}
        onOpenPalette={() => setPaletteOpen(true)}
        onSearchKeys={() => setKeySearchOpen(true)}
        onSelectFile={selectFile}
        onNewProject={openNewProject}
        onNewFile={openNewFile}
        onRenameFile={openRenameFile}
        onDeleteFile={openDeleteFile}
        onSetEnvironment={(file, env) => void setFileEnvironment(file, env)}
        onCustomEnvironment={openCustomEnvironment}
        onEditProject={openEditProject}
        onMoveProject={openMoveProject}
        onCompareEnvironments={openCompareEnvironments}
        onDeleteProject={openDeleteProject}
      />

      <SidebarInset className="min-h-0 overflow-hidden">
        {/* No stored dismissal: the real dismiss is saving a key (rotation or
            the setup checkbox), which clears this across devices. */}
        {!recoveryConfirmed && (
          <Banner variant="info">
            <span className="font-medium">Save your recovery key.</span>
            <span className="text-muted-foreground">
              {" "}
              If you forget your passphrase, it's the only way back in.{" "}
            </span>
            <button
              type="button"
              className="hover:text-foreground cursor-pointer underline underline-offset-4"
              onClick={() => {
                setSettingsTab("security");
                scrollToRecoverySection();
              }}
            >
              Get one now
            </button>
          </Banner>
        )}

        {/* Where you are, not how to get elsewhere: navigation lives in the
            sidebar. The file crumb still switches between the project's
            files, the one jump that's handy without leaving the editor. */}
        <header className="flex h-11 w-full shrink-0 items-center gap-1 border-b px-2 sm:px-3">
          {/* Mobile drill-down: a back arrow replaces the sheet trigger while
              a file is open. after:-inset-2 grows the hit area to ~44px. */}
          {selected && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to projects"
              onClick={() => setSelected(null)}
              className="relative after:absolute after:-inset-2 sm:hidden"
            >
              <ChevronLeft />
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarTrigger
                  className={cn(
                    "text-muted-foreground",
                    selected && "max-sm:hidden",
                  )}
                />
              }
            />
            <TooltipContent className="flex items-center gap-2">
              Toggle sidebar
              <SidebarShortcutKeys />
            </TooltipContent>
          </Tooltip>

          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-0.5 text-sm"
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-current={selected ? undefined : "page"}
              className={cn(
                "hover:bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 outline-none transition-interactive focus-visible:ring-2",
                !selected && "text-foreground font-medium",
                selected && "max-sm:hidden",
              )}
            >
              {loading ? (
                <>
                  <Skeleton className="size-4 shrink-0 rounded-sm" />
                  <SkeletonText className="w-24" />
                </>
              ) : (
                <>
                  <WorkspaceIcon workspace={workspace} />
                  <span className="truncate">{workspace?.name ?? "Workspace"}</span>
                </>
              )}
            </button>
            {selected && currentProject && (
              <>
                <Crumb className="max-sm:hidden" />
                <button
                  type="button"
                  onClick={() => showProject(currentProject)}
                  className="hover:bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 outline-none transition-interactive focus-visible:ring-2 max-sm:hidden"
                >
                  <ProjectIcon project={currentProject} size="sm" />
                  <span className="max-w-40 truncate">
                    {currentProject.name}
                  </span>
                </button>
                <Crumb className="max-sm:hidden" />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-current="page"
                        className="min-w-0 gap-1.5 px-1.5"
                      />
                    }
                  >
                    <span className="truncate font-mono text-xs">
                      {selected.name}
                    </span>
                    {envTag(selected.name, selected.environment) && (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {envTag(selected.name, selected.environment)}
                      </span>
                    )}
                    <ChevronsUpDown className="text-muted-foreground size-3 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-56">
                    {currentProject.files.map((f) => (
                      <DropdownMenuItem
                        key={f.id}
                        className="font-mono text-xs"
                        onClick={() => selectFile(currentProject, f)}
                      >
                        <FileText />
                        <span className="truncate">{f.name}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          {envTag(f.name, f.environment) && (
                            <span className="text-muted-foreground font-sans">
                              {envTag(f.name, f.environment)}
                            </span>
                          )}
                          {f.id === selected.id && <Check className="size-4" />}
                        </span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => openNewFile(currentProject)}
                    >
                      <Plus />
                      New file
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </nav>

          {/* The sidebar's search is a sheet away on phones. */}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Search"
            className="text-muted-foreground relative ml-auto after:absolute after:-inset-1.5 md:hidden"
            onClick={() => setPaletteOpen(true)}
          >
            <Search />
          </Button>
        </header>

        {error && (
          <p className="text-destructive px-4 py-2 text-sm">{error}</p>
        )}

        {/* The strip belongs to the file area; the overview stands alone.
            Tabs (and their drafts) survive hidden and return with any file. */}
        {openFiles.length > 0 && selected && (
          <FileTabs
            files={openFiles}
            projectOf={(id) =>
              projects.find((p) => p.files.some((f) => f.id === id))
            }
            activeId={selected.id}
            dirtyIds={dirtyIds}
            onSelect={setSelected}
            onClose={closeFileTabs}
            onReorder={(from, to) =>
              setOpenFiles((prev) => moveTab(prev, from, to))
            }
          />
        )}

        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* Every open file keeps its pane (and draft) mounted; only the
              active one is visible. The overview renders when no tab is
              active, with the strip still up top. */}
          {openFiles.map((f) => (
            <div
              key={f.id}
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                selected?.id !== f.id && "hidden",
              )}
            >
              <FilePane
                file={f}
                onSaved={reload}
                onDirtyChange={(dirty) => markDirty(f.id, dirty)}
              />
            </div>
          ))}
          {selected ? null : loading ? (
            <div aria-busy="true" className="flex flex-1 flex-col">
              <LoadingStatus>Loading projects</LoadingStatus>
              <ContentSkeleton hint={layoutHint} />
            </div>
          ) : !workspace ? (
            // Unreachable through normal flows (setup seeds a workspace and
            // the last one can't be deleted); kept for legacy accounts.
            <NextStep
              icon={<Boxes />}
              title="Create a workspace"
              description="Your vault needs a workspace to hold projects."
              actionLabel="New workspace"
              onAction={openNewWorkspace}
            />
          ) : projects.length === 0 ? (
            <NextStep
              icon={<FolderPlus />}
              title="Create your first project"
              description="A project holds the env files for one app or service."
              actionLabel="New project"
              onAction={openNewProject}
            />
          ) : (
            <ProjectsOverview
              workspaceName={workspace.name}
              projects={projects}
              onSelectFile={selectFile}
              onNewFile={openNewFile}
              onNewProject={openNewProject}
              onEditProject={openEditProject}
              onMoveProject={workspaces.length > 1 ? openMoveProject : null}
              onCompareEnvironments={openCompareEnvironments}
              onDeleteProject={openDeleteProject}
            />
          )}
        </div>
      </SidebarInset>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        workspaces={workspaces}
        workspace={workspace}
        selectedFileId={selected?.id ?? null}
        onSelectFile={selectFile}
        onShowProject={showProject}
        onPickWorkspace={pickWorkspace}
        onNewFile={openNewFile}
        onNewProject={openNewProject}
        onNewWorkspace={openNewWorkspace}
        onLock={requestLock}
        onOpenSettings={setSettingsTab}
        onSearchKeys={() => setKeySearchOpen(true)}
      />

      <KeySearchDialog
        open={keySearchOpen}
        onClose={() => setKeySearchOpen(false)}
        workspaces={workspaces}
        onSelectFile={selectFile}
      />

      <SettingsDialog
        open={settingsTab !== null}
        onOpenChange={(open) => !open && setSettingsTab(null)}
        tab={settingsTab ?? "profile"}
        onTabChange={setSettingsTab}
        name={name}
        email={email}
        image={image}
        workspace={workspace}
        canDeleteWorkspace={workspaces.length > 1}
        onRenameWorkspace={async (newName) => {
          if (!workspace) return;
          await run(api.renameWorkspace(workspace.id, newName));
          // Keep the address bar on this workspace under its new slug.
          navigate(`/${workspaceSlug(newName.trim(), workspace.id)}`, {
            replace: true,
          });
        }}
        onUpdateWorkspaceIcon={async (icon) => {
          if (!workspace) return;
          await run(api.updateWorkspace(workspace.id, { icon }));
        }}
        onRequestDeleteWorkspace={openDeleteWorkspace}
      />

      <NameDialogView
        dialog={nameDialog}
        onClose={() => setNameDialog(null)}
      />

      <MoveProjectDialog
        project={movingProject}
        workspaces={workspaces}
        currentWorkspaceId={workspace?.id ?? null}
        onClose={() => setMovingProject(null)}
        onMove={moveProjectTo}
      />

      <CompareEnvironmentsDialog
        project={comparingProject}
        onClose={() => setComparingProject(null)}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            setDeleteConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "file"
                ? "This permanently deletes the file and all its saved versions."
                : `This permanently deletes the ${pendingDelete?.kind} and everything inside it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete?.kind === "workspace" && (
            <div className="grid gap-2">
              <Label htmlFor="delete-confirm-name">
                Type "{pendingDelete.name}" to confirm
              </Label>
              <Input
                id="delete-confirm-name"
                autoComplete="off"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              disabled={
                pendingDelete?.kind === "workspace" &&
                deleteConfirmText.trim() !== pendingDelete.name
              }
              onClick={() => {
                const pd = pendingDelete;
                setPendingDelete(null);
                setDeleteConfirmText("");
                setSelected(null);
                if (pd) void run(pd.run());
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* One confirmation for every action that would drop dirty drafts. */}
      <AlertDialog
        open={pendingDiscard !== null}
        onOpenChange={(open) => !open && setPendingDiscard(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved edits?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDiscard?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              onClick={() => {
                const pd = pendingDiscard;
                setPendingDiscard(null);
                pd?.run();
              }}
            >
              {pendingDiscard?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}

function SidebarShortcutKeys() {
  const mac = isMacPlatform();
  return (
    <KbdGroup className="max-sm:hidden">
      <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
      <Kbd>B</Kbd>
    </KbdGroup>
  );
}

function Crumb({ className }: { className?: string }) {
  return (
    <ChevronRight
      className={cn("text-muted-foreground/60 size-3.5 shrink-0", className)}
      aria-hidden="true"
    />
  );
}

// The workspace's own mark: its uploaded icon, or its initial on a solid
// tile, so the switcher reads as "this workspace" rather than a generic cube.
function WorkspaceTile({ workspace }: { workspace: WorkspaceNode | null }) {
  if (workspace?.icon) {
    // No frame: uploaded logos usually bring their own shape, and a border
    // around one reads as a box inside a box.
    return <WorkspaceIcon workspace={workspace} className="size-7 rounded-md" />;
  }
  return (
    <span
      className="bg-foreground text-background flex size-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
      aria-hidden="true"
    >
      {(workspace?.name.trim().charAt(0) || "W").toUpperCase()}
    </span>
  );
}

// Top of the sidebar: which workspace you are in, and the way to every other
// one. Workspace settings live here too, next to the thing they configure.
function WorkspaceSwitcher({
  workspaces,
  workspace,
  onPick,
  onNew,
  onOpenSettings,
}: {
  workspaces: WorkspaceNode[];
  workspace: WorkspaceNode | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="hover:bg-sidebar-hover aria-expanded:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-11 w-full min-w-0 items-center gap-2.5 rounded-md px-1.5 text-left outline-none transition-interactive focus-visible:ring-2"
          />
        }
      >
        <WorkspaceTile workspace={workspace} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-semibold">
            {workspace?.name ?? "Workspace"}
          </span>
          <span className="text-muted-foreground truncate text-xs tabular-nums">
            {workspace
              ? `${workspace.projects.length} ${workspace.projects.length === 1 ? "project" : "projects"}`
              : "Loading..."}
          </span>
        </span>
        <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-(--anchor-width) sm:min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => onPick(w.id)}>
              <WorkspaceIcon workspace={w} />
              <span className="truncate">{w.name}</span>
              {w.id === workspace?.id && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onNew}>
          <Plus />
          New workspace
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenSettings}>
          <Settings />
          Workspace settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The sidebar's account menu: who you are, then everything about this
// session in one place (settings, theme, locking, signing out), each with
// its shortcut. Replaces a row of unlabelled icon buttons.
function UserMenu({
  name,
  email,
  image,
  onOpenSettings,
  onLock,
  beforeSignOut,
}: {
  name: string;
  email: string;
  image?: string | null;
  onOpenSettings: (tab: SettingsTab) => void;
  onLock: () => void;
  /** Owner-provided gate (e.g. the dirty-draft guard) around signing out. */
  beforeSignOut: (proceed: () => void) => void;
}) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const autoLockMinutes = useAutoLockMinutes();
  const displayName = name.trim() || email;
  const initial = displayName.charAt(0).toUpperCase();
  const mac = isMacPlatform();

  async function onSignOut() {
    await clearDek();
    await signOut();
    navigate("/");
  }

  function requestSignOut() {
    beforeSignOut(() => void onSignOut());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Account menu"
            className="hover:bg-sidebar-hover aria-expanded:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left outline-none transition-interactive focus-visible:ring-2"
          />
        }
      >
        {/* One 32px axis: avatar, the two 16px lines beside it, and the
            lock button next door all share the height. */}
        <Avatar className="size-8 shrink-0">
          {image && (
            <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm/4 font-medium">{displayName}</span>
          <span className="text-muted-foreground truncate text-xs/4">{email}</span>
        </span>
        <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onOpenSettings("profile")}>
            <Settings />
            Settings
          </DropdownMenuItem>
          {/* Security surfaces the vault-critical pages (passphrase,
              recovery key, passkeys) without a second hop through Profile. */}
          <DropdownMenuItem onClick={() => onOpenSettings("security")}>
            <ShieldCheck />
            Security
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SunMoon />
              Theme
              <span data-slot="menu-value" className="text-muted-foreground ml-auto pl-4 text-xs capitalize">
                {theme ?? "system"}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-36">
              <DropdownMenuRadioGroup
                value={theme ?? "system"}
                onValueChange={(v) => setTheme(String(v))}
              >
                <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onLock}>
            <Lock />
            Lock now
            <span className="ml-auto pl-4">
              <LockShortcutKeys />
            </span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Timer />
              Auto-lock
              <span data-slot="menu-value" className="text-muted-foreground ml-auto pl-4 text-xs">
                {AUTO_LOCK_OPTIONS.find((o) => o.minutes === autoLockMinutes)
                  ?.label ?? ""}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40">
              <DropdownMenuRadioGroup
                value={String(autoLockMinutes)}
                onValueChange={(v) => setAutoLockMinutes(Number(v))}
              >
                {AUTO_LOCK_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.minutes}
                    value={String(option.minutes)}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <a
              href="https://github.com/BenyD/klef/issues"
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <Bug />
          Report a bug
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={requestSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="text-muted-foreground px-2 py-1 text-xs">
          Search everything with {mac ? "⌘" : "Ctrl+"}K
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Locking is the one session action worth a permanent button: outlined so
// it reads as a control, with its shortcut a hover away.
function LockButton({ lock }: { lock: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Lock vault"
            onClick={lock}
            // The account trigger's height, so the footer is one row.
            className="text-muted-foreground hover:text-foreground size-10 shrink-0"
          >
            <Lock />
          </Button>
        }
      />
      <TooltipContent className="flex items-center gap-2">
        Lock vault
        <LockShortcutKeys />
      </TooltipContent>
    </Tooltip>
  );
}

// Guided empty state: names the single next action so a fresh vault is never
// a dead end.
function NextStep({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Empty className="m-4 w-auto flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" onClick={onAction}>
          <Plus />
          {actionLabel}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

// Open tabs persist per workspace, on this device only.
const tabsKey = (workspaceId: string) => `klef.open-tabs.${workspaceId}`;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: tabs just won't survive a reload.
  }
}

// The grouped stack picker, shared by the project dialogs and the new-file
// dialog's inline stack hint.
function StackCombobox({
  value,
  onChange,
}: {
  value: Framework | null;
  onChange: (framework: Framework | null) => void;
}) {
  return (
    <Combobox
      items={STACK_GROUP_ITEMS}
      value={value ? (ALL_STACK_ITEMS.find((i) => i.value === value) ?? null) : null}
      onValueChange={(item: FrameworkItem | null) =>
        onChange(item?.value ?? null)
      }
      itemToStringLabel={(item: FrameworkItem) => item.label}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="outline"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="flex items-center gap-2">
          {value && (
            <FrameworkIcon framework={value} className="text-muted-foreground" />
          )}
          {value ? (
            FRAMEWORK_LABELS[value]
          ) : (
            <span className="text-muted-foreground">Select a stack</span>
          )}
        </span>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput
          placeholder="Search stacks..."
          showTrigger={false}
          showClear
        />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        {/* Capped height so the popup fits below the trigger instead of
            flipping above the dialog; pt-0 keeps scrolled rows clipping flush
            under the search divider instead of peeking through the top
            padding. */}
        <ComboboxList className="max-h-56 pt-0">
          {(group: StackGroup) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(item: FrameworkItem) => (
                  <ComboboxItem key={item.value} value={item}>
                    <FrameworkIcon
                      framework={item.value}
                      className="text-muted-foreground"
                    />
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

// "New file" creates a file, so its button says so; edits and renames save.
function submitLabel(title: string | undefined): string {
  return title?.startsWith("New ")
    ? `Create ${title.slice(4).toLowerCase()}`
    : "Save";
}

function NameDialogView({
  dialog,
  onClose,
}: {
  dialog: NameDialog | null;
  onClose: () => void;
}): ReactNode {
  const [value, setValue] = useState("");
  // Suggested names track the stack until the user types one of their own;
  // `picked` remembers which suggestion so a stack change can remap it.
  const [nameDirty, setNameDirty] = useState(false);
  const [picked, setPicked] = useState<PresetEnvironment | null>(null);
  const [framework, setFramework] = useState<Framework | null>(null);
  // The stack hint's picker stays collapsed until asked for.
  const [stackOpen, setStackOpen] = useState(false);
  // Icon: either a pasted URL (resolved to a favicon/avatar) or an upload.
  const [iconInput, setIconInput] = useState("");
  const [iconUpload, setIconUpload] = useState<string | null>(null);
  const [iconDiscovered, setIconDiscovered] = useState<string | null>(null);
  // A freshly picked raster image awaiting its crop.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const iconFileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const iconGuess = iconUpload ?? (iconInput ? resolveIconUrl(iconInput) : null);
  const icon = iconDiscovered ?? iconGuess;

  // A /favicon.ico guess is just a convention; many sites only declare icons
  // in their HTML head. Ask the Worker to look once the input settles.
  useEffect(() => {
    setIconDiscovered(null);
    if (!iconGuess?.endsWith("/favicon.ico")) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void discoverIcon(iconGuess.slice(0, -"favicon.ico".length)).then(
        (found) => {
          if (!cancelled && found) setIconDiscovered(found);
        },
      );
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [iconGuess]);

  useEffect(() => {
    const initialFramework =
      dialog?.withFramework?.initial ?? dialog?.stackHint?.initial ?? null;
    setPicked(null);
    setFramework(initialFramework);
    setStackOpen(false);
    setValue(
      dialog?.initial ||
        (dialog?.suggestNames?.(initialFramework)[0]?.name ?? ""),
    );
    setNameDirty(Boolean(dialog?.initial));
    const initialIcon = dialog?.withIcon?.initial ?? null;
    if (initialIcon?.startsWith("data:")) {
      setIconUpload(initialIcon);
      setIconInput("");
    } else {
      setIconUpload(null);
      setIconInput(initialIcon ?? "");
    }
    setCropSrc(null);
  }, [dialog]);

  // Stack picks from the hint persist to the project right away; the dialog's
  // own submit only creates the file.
  function pickStack(fw: Framework | null) {
    setFramework(fw);
    const names = dialog?.suggestNames?.(fw);
    if (!nameDirty && names?.[0]) {
      // A stack can fold a pick into another name (Node develops in .env).
      setValue((names.find((n) => n.environment === picked) ?? names[0]).name);
    }
    dialog?.stackHint?.save(fw).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : String(e));
    });
  }

  // Uploads go through the same square-crop dialog as the profile picture;
  // small SVGs skip it (cropping would rasterize them for nothing).
  async function onPickIconFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.type === "image/svg+xml") {
        setIconUpload(await fileToIconDataUrl(file));
        setIconInput("");
      } else {
        setCropSrc(await fileToDataUrl(file));
      }
    } catch {
      toast.error("Couldn't read that image.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name || !dialog) return;
    setBusy(true);
    try {
      // A fast type-and-save can beat the debounced discovery; settle first
      // so the committed icon matches what the preview would have shown.
      await dialog.submit({
        name,
        framework,
        icon: await settleIcon(iconGuess, iconDiscovered),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{dialog?.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name-dialog">{dialog?.label}</Label>
            <Input
              id="name-dialog"
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setNameDirty(true);
              }}
            />
            {dialog?.suggestNames && (
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Suggested names"
              >
                {dialog.suggestNames(framework).map((s) => (
                  <SuggestionChip
                    key={s.name}
                    label={s.name}
                    active={value.trim() === s.name}
                    onClick={() => {
                      setValue(s.name);
                      setPicked(s.environment);
                      setNameDirty(false);
                    }}
                  />
                ))}
              </div>
            )}
            {dialog?.stackHint && (
              <>
                <p className="text-muted-foreground text-xs">
                  {framework
                    ? `Suggested for ${FRAMEWORK_LABELS[framework]}.`
                    : "Set a stack to tune suggested names."}{" "}
                  <button
                    type="button"
                    className="text-foreground cursor-pointer underline underline-offset-2 hover:no-underline"
                    aria-expanded={stackOpen}
                    onClick={() => setStackOpen((o) => !o)}
                  >
                    {stackOpen ? "Done" : "Change"}
                  </button>
                </p>
                {stackOpen && (
                  <StackCombobox value={framework} onChange={pickStack} />
                )}
              </>
            )}
          </div>
          {dialog?.withFramework && (
            <div className="grid gap-2">
              <Label>Tech stack (optional)</Label>
              <StackCombobox value={framework} onChange={setFramework} />
              <p className="text-muted-foreground text-xs">
                Used to suggest file names, like{" "}
                <code className="font-mono">.env.local</code> for Next.js.
              </p>
            </div>
          )}
          {dialog?.withIcon && (
            <div className="grid gap-2">
              <Label htmlFor="project-icon">Icon (optional)</Label>
              <div className="flex items-center gap-2">
                <DialogIconPreview icon={icon} />
                <Input
                  id="project-icon"
                  placeholder="Site, GitHub, or image URL"
                  value={iconInput}
                  onChange={(e) => {
                    setIconInput(e.target.value);
                    setIconUpload(null);
                  }}
                />
                <input
                  ref={iconFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickIconFile(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Upload icon"
                  onClick={() => iconFileRef.current?.click()}
                >
                  <Upload />
                </Button>
              </div>
              {iconUpload && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 self-start px-2 text-xs"
                  onClick={() => setIconUpload(null)}
                >
                  <Trash2 className="size-3.5" />
                  Remove uploaded image
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy ? "Saving..." : submitLabel(dialog?.title)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {cropSrc && (
        <AvatarCropDialog
          key={cropSrc}
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onCropped={(dataUrl) => {
            setIconUpload(dataUrl);
            setIconInput("");
            setCropSrc(null);
          }}
        />
      )}
    </Dialog>
  );
}

// Picking a destination moves the project immediately (its files ride along).
// A short list of workspaces, so buttons beat a Select here.
function MoveProjectDialog({
  project,
  workspaces,
  currentWorkspaceId,
  onClose,
  onMove,
}: {
  project: ProjectNode | null;
  workspaces: WorkspaceNode[];
  currentWorkspaceId: string | null;
  onClose: () => void;
  onMove: (project: ProjectNode, workspaceId: string) => void;
}) {
  const targets = workspaces.filter((w) => w.id !== currentWorkspaceId);
  return (
    <Dialog open={project !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move "{project?.name}"</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground -mt-1 text-sm">
          Its files move too. Choose a workspace.
        </p>
        <div className="flex flex-col gap-1">
          {targets.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => project && onMove(project, w.id)}
              className="hover:bg-muted flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors"
            >
              <WorkspaceIcon workspace={w} />
              <span className="truncate font-medium">{w.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DialogIconPreview({ icon }: { icon: string | null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [icon]);
  return (
    <div className="bg-background ring-border flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1">
      {icon && !broken ? (
        <img
          src={icon}
          alt=""
          className="size-5"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        <ImageIcon className="text-muted-foreground size-4" aria-hidden="true" />
      )}
    </div>
  );
}

function SuggestionChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border-border text-muted-foreground inline-flex h-7 items-center rounded-md border px-2.5 font-mono text-xs transition-colors",
        "hover:bg-muted hover:text-foreground",
        active && "border-primary bg-primary/5 text-foreground",
      )}
    >
      {label}
    </button>
  );
}
