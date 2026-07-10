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
import {
  Boxes,
  Bug,
  Check,
  ChevronLeft,
  ChevronsUpDown,
  FolderPlus,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  X,
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
} from "../lib/project-icon.ts";
import {
  AUTO_LOCK_OPTIONS,
  setAutoLockMinutes,
  useAutoLock,
  useAutoLockMinutes,
  useLockShortcut,
} from "../lib/auto-lock.ts";
import { usePaletteShortcut } from "../lib/command-palette.ts";
import { recordRecentFile } from "../lib/recent-files.ts";
import { useTree } from "../use-tree.ts";
import { useVault } from "../vault-context.ts";
import * as api from "../structure-api.ts";
import type { SelectedFile } from "../vault-types.ts";
import {
  ENVIRONMENTS,
  isPresetEnvironment,
  normalizeEnvironment,
  type Environment,
  type EnvFileNode,
  type Framework,
  type ProjectNode,
} from "../../shared/api-types.ts";
import { workspaceSlug } from "../../shared/slug.ts";
import {
  defaultEnvFileName,
  FRAMEWORK_LABELS,
  STACK_GROUPS,
} from "../lib/env-file-names.ts";
import { AppSidebar } from "./AppSidebar.tsx";
import { Banner } from "./Banner.tsx";
import { CommandPalette, PaletteShortcutKeys } from "./CommandPalette.tsx";
import { FrameworkIcon } from "./FrameworkIcon.tsx";
import { ProjectIcon } from "./ProjectIcon.tsx";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";
import { ProjectsOverview } from "./ProjectsOverview.tsx";
import { LockShortcutKeys } from "./LockShortcutKeys.tsx";
import { envMeta, useEnvMeta } from "../lib/env-meta.ts";
import { FilePane } from "./FilePane.tsx";
import { SettingsDialog, type SettingsTab } from "./SettingsDialog.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
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
  DropdownMenuSeparator,
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
import { Label } from "./ui/label.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
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
  environment: Environment | null;
  framework: Framework | null;
  icon: string | null;
};
type NameDialog = {
  title: string;
  label: string;
  initial: string;
  /** When set, the dialog also shows an environment picker (files only). */
  withEnvironment?: { initial: Environment | null };
  /** When set, the dialog also shows a framework picker (projects only). */
  withFramework?: { initial: Framework | null };
  /** When set, the dialog also shows the icon field (projects only). */
  withIcon?: { initial: string | null };
  /** Suggested name per environment; applied until the user edits the name. */
  defaultNameFor?: (
    environment: Environment | null,
    framework: Framework | null,
  ) => string;
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
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  const { tree, loading, error, reload } = useTree();
  const { lock, recoveryConfirmed } = useVault();
  useAutoLock(lock);
  useLockShortcut(lock);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
  const [pendingDelete, setPendingDelete] = useState<{
    kind: Kind;
    id: string;
    name: string;
    run: () => Promise<unknown>;
  } | null>(null);
  // Workspace deletes are type-to-confirm; the typed name must match exactly.
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

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

  const run = async (op: Promise<unknown>) => {
    await op;
    await reload();
  };

  function pickWorkspace(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (ws) navigate(`/${workspaceSlug(ws.name, ws.id)}`);
    // Tabs are per-workspace; drafts belong to the vault being left.
    setSelected(null);
    setOpenFiles([]);
    setDirtyIds(new Set());
  }

  // Open (or focus) a tab for the file and make it active.
  function openFileTab(entry: SelectedFile) {
    setOpenFiles((prev) =>
      prev.some((f) => f.id === entry.id) ? prev : [...prev, entry],
    );
    setSelected(entry);
  }

  function closeFileTab(id: string) {
    const index = openFiles.findIndex((f) => f.id === id);
    const next = openFiles.filter((f) => f.id !== id);
    setOpenFiles(next);
    setDirtyIds((prev) => {
      if (!prev.has(id)) return prev;
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
    if (selected?.id === id) {
      setSelected(next[Math.min(index, next.length - 1)] ?? null);
    }
  }

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
        .getElementById(`project-card-${project.id}`)
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  function openNewWorkspace() {
    setNameDialog({
      title: "New workspace",
      label: "Workspace name",
      initial: "",
      submit: async ({ name }) => {
        const { id } = await api.createWorkspace(name);
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

  function openNewFile(project: ProjectNode) {
    if (!workspace) return;
    const ws = workspace;
    setNameDialog({
      title: "New file",
      label: "File name",
      initial: "",
      withEnvironment: { initial: null },
      defaultNameFor: (environment, framework) =>
        defaultEnvFileName(framework, environment),
      stackHint: {
        initial: project.framework,
        save: (framework) => run(api.updateProject(project.id, { framework })),
      },
      submit: async ({ name, environment }) => {
        const { id } = await api.createFile(project.id, name, environment);
        await reload();
        openFileTab({
          id,
          name,
          project: project.name,
          workspace: ws.name,
          environment,
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
      defaultOpen={false}
      className="klef-screen **:data-[slot=sidebar-gap]:w-12! h-svh flex-col overflow-hidden"
    >
      <Banner id="early-access" variant="warning">
        <span className="font-medium">Klef is in early access.</span>
        <span className="text-muted-foreground">
          {" "}
          Found a bug?{" "}
          <a
            href="https://github.com/BenyD/klef/issues"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline underline-offset-4"
          >
            Report it on GitHub
          </a>
        </span>
      </Banner>

      {/* No stored dismissal: the real dismiss is saving a key (rotation or
          the setup checkbox), which clears this across devices. */}
      {!recoveryConfirmed && (
        <Banner variant="warning">
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

      {/* Supabase-style topbar: brand, then breadcrumb switchers, then the
          global cluster. Cross-navigation lives here so the rail below stays
          purely contextual. */}
      <header className="bg-background flex h-12 w-full shrink-0 items-center gap-1 border-b px-3">
        {/* Mobile drill-down: a back arrow replaces the sheet trigger while
            a file is open. after:-inset-2 grows the hit area to ~44px. */}
        {selected && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to projects"
            onClick={() => setSelected(null)}
            className="relative -ml-1 after:absolute after:-inset-2 sm:hidden"
          >
            <ChevronLeft />
          </Button>
        )}
        <SidebarTrigger
          className={cn("-ml-1 md:hidden", selected && "max-sm:hidden")}
        />
        <button
          type="button"
          aria-label="Workspace overview"
          onClick={() => setSelected(null)}
          className={cn(
            "bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-md",
            selected && "max-sm:hidden",
          )}
        >
          <KeyRound className="size-3.5" />
        </button>

        <Slash className={cn(selected && "max-sm:hidden")} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "max-w-40 gap-1 px-1.5",
                  selected && "max-sm:hidden",
                )}
              />
            }
          >
            <WorkspaceIcon workspace={workspace} />
            <span className="truncate">{workspace?.name ?? "Workspace"}</span>
            <ChevronsUpDown className="text-muted-foreground size-3 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => pickWorkspace(w.id)}>
                <WorkspaceIcon workspace={w} />
                <span className="truncate">{w.name}</span>
                {w.id === workspace?.id && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
            {workspaces.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={openNewWorkspace}>
              <Plus />
              New workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {selected && currentProject && (
          <>
            <Slash className="max-sm:hidden" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="max-w-40 gap-1.5 px-1.5 max-sm:hidden"
                  />
                }
              >
                <ProjectIcon project={currentProject} size="sm" />
                <span className="truncate">{currentProject.name}</span>
                <ChevronsUpDown className="text-muted-foreground size-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-56">
                {projects.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => showProject(p)}>
                    <ProjectIcon project={p} size="sm" />
                    <span className="truncate">{p.name}</span>
                    {p.id === currentProject.id && (
                      <Check className="ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openNewProject}>
                  <Plus />
                  New project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Sized like a search field, not a button, so it reads as the
              app's search box; a plain icon button on phones. */}
          <Button
            variant="outline"
            size="sm"
            aria-label="Search"
            className="text-muted-foreground relative h-8 font-normal max-sm:w-8 max-sm:px-0 max-sm:after:absolute max-sm:after:-inset-1.5 sm:w-48 sm:justify-start md:w-56"
            onClick={() => setPaletteOpen(true)}
          >
            <Search />
            <span className="hidden sm:inline">Search</span>
            <span className="sm:ml-auto">
              <PaletteShortcutKeys />
            </span>
          </Button>
          <LockMenu lock={lock} />
          <ThemeToggle />
          <UserMenu
            name={name}
            email={email}
            image={image}
            onOpenSettings={setSettingsTab}
          />
        </div>
      </header>

      {/* relative: the rail inside anchors to this row, not the viewport. */}
      <div className="relative flex min-h-0 w-full flex-1">
        <AppSidebar
          loading={loading}
          workspace={workspace}
          currentProject={currentProject}
          selectedFileId={selected?.id ?? null}
          onShowOverview={() => setSelected(null)}
          onSelectFile={selectFile}
          onNewFile={openNewFile}
          onRenameFile={openRenameFile}
          onDeleteFile={openDeleteFile}
          onSetEnvironment={(file, env) => void setFileEnvironment(file, env)}
          onCustomEnvironment={openCustomEnvironment}
          onEditProject={openEditProject}
          onOpenSettings={setSettingsTab}
        />

        <SidebarInset className="min-h-0 overflow-hidden">
          {error && (
            <p className="text-destructive px-4 py-2 text-sm">{error}</p>
          )}

          {/* The strip belongs to the file area; the overview stands alone.
              Tabs (and their drafts) survive hidden and return with any file. */}
          {openFiles.length > 0 && selected && (
            <FileTabs
              files={openFiles}
              activeId={selected.id}
              dirtyIds={dirtyIds}
              onSelect={setSelected}
              onClose={closeFileTab}
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
            <div className="w-full flex-1 px-4 py-6 sm:px-6">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
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
              description="Projects live inside your workspace. Add one for an app or service to hold its env files."
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
              onDeleteProject={openDeleteProject}
            />
          )}
          </div>
        </SidebarInset>
      </div>

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
        onLock={lock}
        onOpenSettings={setSettingsTab}
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
              className="bg-destructive text-white hover:bg-destructive/90"
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
    </SidebarProvider>
  );
}

// Lock button + auto-lock timing in one menu: "Lock now" acts immediately,
// the options below persist the inactivity timeout (same setting as in
// Settings → Account).
// Roomy on purpose (Supabase-style): each segment gets clear air around
// the slash.
function Slash({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-border mx-0.5 select-none text-base font-light",
        className,
      )}
      aria-hidden="true"
    >
      /
    </span>
  );
}

function UserMenu({
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
  const navigate = useNavigate();
  const displayName = name.trim() || email;
  const initial = displayName.charAt(0).toUpperCase();

  async function onSignOut() {
    await clearDek();
    await signOut();
    navigate("/");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Account menu"
            className="rounded-full"
          />
        }
      >
        <Avatar className="size-6">
          {image && (
            <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar className="size-8">
            {image && (
              <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />
            )}
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{displayName}</span>
            <span className="text-muted-foreground truncate text-xs">
              {email}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        {/* Both jump into the same dialog, landing on different tabs:
            Security surfaces the vault-critical pages (passphrase, recovery
            key, passkeys) without a second hop through Profile. */}
        <DropdownMenuItem onClick={() => onOpenSettings("profile")}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenSettings("security")}>
          <ShieldCheck />
          Security
        </DropdownMenuItem>
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
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => void onSignOut()}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LockMenu({ lock }: { lock: () => void }) {
  const autoLockMinutes = useAutoLockMinutes();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Lock options">
            <Lock />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onClick={lock}>
          <Lock />
          Lock now
          <span className="ml-auto">
            <LockShortcutKeys />
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Auto-lock
          </DropdownMenuLabel>
          {AUTO_LOCK_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.minutes}
              onClick={() => setAutoLockMinutes(option.minutes)}
            >
              {option.label}
              {option.minutes === autoLockMinutes && (
                <Check className="ml-auto size-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <Empty className="bg-muted/40 m-4 w-auto flex-1 border border-dashed">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-10 [&_svg:not([class*='size-'])]:size-5"
        >
          {icon}
        </EmptyMedia>
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onAction}>
          <Plus />
          {actionLabel}
        </Button>
      </EmptyContent>
    </Empty>
  );
}

// IDE-style strip of open files: env dot + name per tab, active tab marked
// with a top bar, dirty tabs show a dot that becomes ✕ on hover (VS Code
// language). Horizontal scroll instead of collapsing when crowded.
function FileTabs({
  files,
  activeId,
  dirtyIds,
  onSelect,
  onClose,
}: {
  files: SelectedFile[];
  activeId: string | null;
  dirtyIds: ReadonlySet<string>;
  onSelect: (file: SelectedFile) => void;
  onClose: (id: string) => void;
}) {
  // Same file name open from two projects would render identical tabs; those
  // get their project as a dim suffix (VS Code's folder-suffix pattern).
  const nameCounts = new Map<string, number>();
  for (const f of files) {
    nameCounts.set(f.name, (nameCounts.get(f.name) ?? 0) + 1);
  }
  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="bg-muted/40 flex h-9 shrink-0 items-center overflow-x-auto border-b"
    >
      {files.map((f) => {
        const active = f.id === activeId;
        const dirty = dirtyIds.has(f.id);
        return (
          <div
            key={f.id}
            className={cn(
              "group/tab relative flex h-full max-w-48 shrink-0 items-center border-r",
              active ? "bg-background" : "hover:bg-background/50",
            )}
          >
            {active && (
              <span
                className="bg-primary absolute inset-x-0 top-0 h-0.5"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(f)}
              className={cn(
                "flex h-full min-w-0 items-center gap-1.5 pr-1 pl-3 font-mono text-xs outline-none",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.environment && (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    envMeta(f.environment).dot,
                  )}
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{f.name}</span>
              {(nameCounts.get(f.name) ?? 0) > 1 && (
                <span className="text-muted-foreground/70 truncate font-sans text-[11px]">
                  {f.project}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={`Close ${f.name}`}
              onClick={() => onClose(f.id)}
              className={cn(
                "text-muted-foreground hover:bg-muted hover:text-foreground mr-1.5 flex size-5 shrink-0 items-center justify-center rounded",
                // Hover-revealed on pointers that can hover; always present on
                // touch, where there is no hover to reveal it.
                !active &&
                  !dirty &&
                  "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
              )}
            >
              {dirty ? (
                <>
                  <span
                    className="bg-foreground/70 size-2 rounded-full group-hover/tab:hidden"
                    aria-hidden="true"
                  />
                  <X className="hidden size-3.5 group-hover/tab:block" />
                </>
              ) : (
                <X className="size-3.5" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
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

function NameDialogView({
  dialog,
  onClose,
}: {
  dialog: NameDialog | null;
  onClose: () => void;
}): ReactNode {
  const envMetaOf = useEnvMeta();
  const [value, setValue] = useState("");
  // Auto-fill the name from the environment pick until the user edits it.
  const [nameDirty, setNameDirty] = useState(false);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  // The "Custom" chip reveals a free-text label field; the raw text lives
  // apart from `environment` so typing isn't fought by normalization.
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
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
    const initialEnv = dialog?.withEnvironment?.initial ?? null;
    const initialFramework =
      dialog?.withFramework?.initial ?? dialog?.stackHint?.initial ?? null;
    setEnvironment(initialEnv);
    const initialCustom = initialEnv !== null && !isPresetEnvironment(initialEnv);
    setCustomOpen(initialCustom);
    setCustomText(initialCustom ? initialEnv : "");
    setFramework(initialFramework);
    setStackOpen(false);
    setValue(
      dialog?.initial ||
        (dialog?.defaultNameFor?.(initialEnv, initialFramework) ?? ""),
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

  function applyEnvironment(env: Environment | null) {
    setEnvironment(env);
    if (!nameDirty && dialog?.defaultNameFor) {
      setValue(dialog.defaultNameFor(env, framework));
    }
  }

  function pickEnvironment(env: Environment | null) {
    setCustomOpen(false);
    applyEnvironment(env);
  }

  function pickCustom() {
    setCustomOpen(true);
    applyEnvironment(normalizeEnvironment(customText));
  }

  function typeCustom(text: string) {
    setCustomText(text);
    applyEnvironment(normalizeEnvironment(text));
  }

  // Stack picks from the hint persist to the project right away; the dialog's
  // own submit only creates the file.
  function pickStack(fw: Framework | null) {
    setFramework(fw);
    if (!nameDirty && dialog?.defaultNameFor) {
      setValue(dialog.defaultNameFor(environment, fw));
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
      await dialog.submit({ name, environment, framework, icon });
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
          {dialog?.withEnvironment && (
            <div className="grid gap-2">
              <Label>Environment (optional)</Label>
              <div className="flex flex-wrap gap-1.5" role="group">
                <EnvChip
                  label="None"
                  active={!customOpen && environment === null}
                  onClick={() => pickEnvironment(null)}
                />
                {ENVIRONMENTS.map((env) => (
                  <EnvChip
                    key={env}
                    label={envMetaOf(env).label}
                    dot={envMetaOf(env).dot}
                    active={!customOpen && environment === env}
                    onClick={() => pickEnvironment(env)}
                  />
                ))}
                <EnvChip
                  label="Custom"
                  dot="bg-violet-500"
                  active={customOpen}
                  onClick={pickCustom}
                />
              </div>
              {customOpen && (
                <Input
                  autoFocus
                  value={customText}
                  maxLength={32}
                  placeholder="e.g. staging"
                  aria-label="Custom environment label"
                  onChange={(e) => typeCustom(e.target.value)}
                />
              )}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="name-dialog">{dialog?.label}</Label>
            <Input
              id="name-dialog"
              autoFocus={!dialog?.withEnvironment}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setNameDirty(true);
              }}
            />
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
              {busy ? "Saving..." : "Save"}
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

function EnvChip({
  label,
  dot,
  active,
  onClick,
}: {
  label: string;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "border-border text-muted-foreground inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        "hover:bg-muted hover:text-foreground",
        active && "border-primary bg-primary/5 text-foreground",
      )}
    >
      {dot && (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", dot)}
          aria-hidden="true"
        />
      )}
      {label}
    </button>
  );
}
