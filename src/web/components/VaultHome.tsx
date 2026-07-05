import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router";
import {
  Boxes,
  Check,
  FolderPlus,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "../lib/utils.ts";
import {
  AUTO_LOCK_OPTIONS,
  setAutoLockMinutes,
  useAutoLock,
  useAutoLockMinutes,
  useLockShortcut,
} from "../lib/auto-lock.ts";
import { usePaletteShortcut } from "../lib/command-palette.ts";
import { useTree } from "../use-tree.ts";
import { useVault } from "../vault-session.tsx";
import * as api from "../structure-api.ts";
import type { SelectedFile } from "../vault-types.ts";
import {
  ENVIRONMENTS,
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
import { CommandPalette, PaletteShortcutKeys } from "./CommandPalette.tsx";
import { FrameworkIcon } from "./FrameworkIcon.tsx";
import { ProjectsOverview } from "./ProjectsOverview.tsx";
import { LockShortcutKeys } from "./LockShortcutKeys.tsx";
import { ENV_META, EnvBadge } from "./EnvBadge.tsx";
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb.tsx";
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
import { Spinner } from "./ui/spinner.tsx";
import { Separator } from "./ui/separator.tsx";
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
};
type NameDialog = {
  title: string;
  label: string;
  initial: string;
  /** When set, the dialog also shows an environment picker (files only). */
  withEnvironment?: { initial: Environment | null };
  /** When set, the dialog also shows a framework picker (projects only). */
  withFramework?: { initial: Framework | null };
  /** Suggested name per environment; applied until the user edits the name. */
  defaultNameFor?: (environment: Environment | null) => string;
  /** Muted helper line under the name input (e.g. where suggestions come from). */
  nameHint?: string;
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
  const { lock } = useVault();
  useAutoLock(lock);
  useLockShortcut(lock);
  const [paletteOpen, setPaletteOpen] = useState(false);
  usePaletteShortcut(useCallback(() => setPaletteOpen((o) => !o), []));
  const navigate = useNavigate();
  // The workspace lives in the URL (klef.sh/<slug>); /app has no param and
  // falls through to the first workspace below.
  const { wsSlug } = useParams<{ wsSlug: string }>();
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: Kind;
    id: string;
    name: string;
    run: () => Promise<unknown>;
  } | null>(null);

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

  const run = async (op: Promise<unknown>) => {
    await op;
    await reload();
  };

  function pickWorkspace(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (ws) navigate(`/${workspaceSlug(ws.name, ws.id)}`);
    setSelected(null);
  }

  function selectFile(project: ProjectNode, file: EnvFileNode) {
    if (!workspace) return;
    setSelected({
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
      submit: async ({ name, framework }) => {
        await api.createProject(ws.id, name, framework);
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
      submit: ({ name, framework }) =>
        run(api.updateProject(project.id, { name, framework })),
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
      defaultNameFor: (environment) =>
        defaultEnvFileName(project.framework, environment),
      nameHint: project.framework
        ? `Suggested for ${FRAMEWORK_LABELS[project.framework]} — change in project settings`
        : "Set a framework on the project to tune suggested names",
      submit: async ({ name, environment }) => {
        const { id } = await api.createFile(project.id, name, environment);
        await reload();
        setSelected({
          id,
          name,
          project: project.name,
          workspace: ws.name,
          environment,
        });
      },
    });
  }
  function openRenameFile() {
    if (!selected) return;
    const file = selected;
    setNameDialog({
      title: "Rename file",
      label: "File name",
      initial: file.name,
      submit: async ({ name }) => {
        await api.renameFile(file.id, name);
        await reload();
        setSelected({ ...file, name });
      },
    });
  }
  function openDeleteFile() {
    if (!selected) return;
    const file = selected;
    setPendingDelete({
      kind: "file",
      id: file.id,
      name: file.name,
      run: () => api.deleteFile(file.id),
    });
  }

  async function setEnvironment(environment: Environment | null) {
    if (!selected) return;
    const file = selected;
    await api.setFileEnvironment(file.id, environment);
    await reload();
    setSelected({ ...file, environment });
  }

  return (
    <SidebarProvider className="klef-screen">
      <AppSidebar
        name={name}
        email={email}
        image={image}
        workspaces={workspaces}
        workspace={workspace}
        selectedFileId={selected?.id ?? null}
        onPickWorkspace={pickWorkspace}
        onSelectFile={selectFile}
        onNewWorkspace={openNewWorkspace}
        onOpenSettings={setSettingsTab}
        onNewProject={openNewProject}
        onRenameProject={openEditProject}
        onDeleteProject={openDeleteProject}
        onNewFile={openNewFile}
      />

      {/* Outline instead of the stock shadow: the shadow is invisible against
          bg-sidebar in both themes, so the border is what defines the card. */}
      <SidebarInset className="flex h-svh flex-col overflow-hidden md:h-[calc(100svh-1rem)] md:peer-data-[variant=inset]:border md:peer-data-[variant=inset]:shadow-none">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-1 data-vertical:h-4 data-vertical:self-center"
          />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {selected ? (
                <>
                  <BreadcrumbItem className="hidden sm:inline-flex">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="hover:text-foreground truncate transition-colors"
                    >
                      {selected.workspace}
                    </button>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:block" />
                  <BreadcrumbItem className="hidden sm:inline-flex">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="hover:text-foreground truncate transition-colors"
                    >
                      {selected.project}
                    </button>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="truncate font-mono">
                      {selected.name}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                  {selected.environment && (
                    <BreadcrumbItem>
                      <EnvBadge environment={selected.environment} />
                    </BreadcrumbItem>
                  )}
                </>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbPage className="truncate">
                    {workspace?.name ?? "Vault"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              )}
            </BreadcrumbList>
          </Breadcrumb>

          {selected && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="File actions"
                    className="text-muted-foreground"
                  >
                    <MoreHorizontal />
                  </Button>
                }
              />
              <DropdownMenuContent align="start" className="min-w-44">
                <DropdownMenuItem onClick={openRenameFile}>
                  <Pencil />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Environment
                </DropdownMenuLabel>
                {ENVIRONMENTS.map((env) => (
                  <DropdownMenuItem
                    key={env}
                    onClick={() => void setEnvironment(env)}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        ENV_META[env].dot,
                      )}
                      aria-hidden="true"
                    />
                    <span className="capitalize">{env}</span>
                    {selected.environment === env && (
                      <Check className="ml-auto size-4" />
                    )}
                  </DropdownMenuItem>
                ))}
                {selected.environment && (
                  <DropdownMenuItem onClick={() => void setEnvironment(null)}>
                    <X />
                    Clear label
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={openDeleteFile}>
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="ml-auto flex items-center gap-1">
            {/* Sized like a search field, not a button, so it reads as the
                app's search box; stays compact (icon + keys) on mobile. */}
            <Button
              variant="outline"
              size="sm"
              className="text-muted-foreground h-8 font-normal sm:w-56 sm:justify-start md:w-64"
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
          </div>
        </header>

        {error && <p className="text-destructive px-4 py-2 text-sm">{error}</p>}

        <div className="flex flex-1 flex-col overflow-y-auto">
          {selected ? (
            <FilePane key={selected.id} file={selected} onSaved={reload} />
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner className="text-muted-foreground size-5" />
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
        onRequestDeleteWorkspace={openDeleteWorkspace}
      />

      <NameDialogView
        dialog={nameDialog}
        onClose={() => setNameDialog(null)}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
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
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                const pd = pendingDelete;
                setPendingDelete(null);
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

function NameDialogView({
  dialog,
  onClose,
}: {
  dialog: NameDialog | null;
  onClose: () => void;
}): ReactNode {
  const [value, setValue] = useState("");
  // Auto-fill the name from the environment pick until the user edits it.
  const [nameDirty, setNameDirty] = useState(false);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const initialEnv = dialog?.withEnvironment?.initial ?? null;
    setEnvironment(initialEnv);
    setFramework(dialog?.withFramework?.initial ?? null);
    setValue(dialog?.initial || (dialog?.defaultNameFor?.(initialEnv) ?? ""));
    setNameDirty(Boolean(dialog?.initial));
  }, [dialog]);

  function pickEnvironment(env: Environment | null) {
    setEnvironment(env);
    if (!nameDirty && dialog?.defaultNameFor) {
      setValue(dialog.defaultNameFor(env));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name || !dialog) return;
    setBusy(true);
    try {
      await dialog.submit({ name, environment, framework });
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
                  active={environment === null}
                  onClick={() => pickEnvironment(null)}
                />
                {ENVIRONMENTS.map((env) => (
                  <EnvChip
                    key={env}
                    label={ENV_META[env].label}
                    dot={ENV_META[env].dot}
                    active={environment === env}
                    onClick={() => pickEnvironment(env)}
                  />
                ))}
              </div>
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
            {dialog?.nameHint && (
              <p className="text-muted-foreground text-xs">{dialog.nameHint}</p>
            )}
          </div>
          {dialog?.withFramework && (
            <div className="grid gap-2">
              <Label>Tech stack (optional)</Label>
              <Combobox
                items={STACK_GROUP_ITEMS}
                value={
                  framework
                    ? (ALL_STACK_ITEMS.find((i) => i.value === framework) ??
                      null)
                    : null
                }
                onValueChange={(item: FrameworkItem | null) =>
                  setFramework(item?.value ?? null)
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
                    {framework && (
                      <FrameworkIcon
                        framework={framework}
                        className="text-muted-foreground"
                      />
                    )}
                    {framework ? (
                      FRAMEWORK_LABELS[framework]
                    ) : (
                      <span className="text-muted-foreground">
                        Select a stack
                      </span>
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
                  {/* Capped height so the popup fits below the trigger instead
                      of flipping above the dialog; pt-0 keeps scrolled rows
                      clipping flush under the search divider instead of
                      peeking through the top padding. */}
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
              <p className="text-muted-foreground text-xs">
                Used to suggest file names, like{" "}
                <code className="font-mono">.env.local</code> for Next.js.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !value.trim()}>
              {busy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
