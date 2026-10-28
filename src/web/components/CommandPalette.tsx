import { useMemo, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Clipboard,
  FilePlus2,
  FileText,
  FolderPlus,
  KeyRound,
  Lock,
  Moon,
  PanelLeft,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { isMacPlatform } from "../lib/auto-lock.ts";
import { cn } from "../lib/utils.ts";
import { effectiveEnvLabel, envTag } from "../lib/env-meta.ts";
import { getRecentFileIds, sortByRecency } from "../lib/recent-files.ts";
import {
  highlightRuns,
  searchItems,
  type SearchField,
  type SearchResult,
} from "../lib/palette-search.ts";
import { useKeyNames } from "../lib/use-key-names.ts";
import { SETUP_COMMAND } from "../lib/agent-prompts.ts";
import type {
  EnvFileNode,
  ProjectNode,
  WorkspaceNode,
} from "../../shared/api-types.ts";
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
import { useSidebar } from "./ui/sidebar.tsx";

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

function SidebarShortcutKeys() {
  const mac = isMacPlatform();
  return (
    <KbdGroup className="max-sm:hidden">
      <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
      <Kbd>B</Kbd>
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
  onSearchKeys: () => void;
}

// What the list is built from. Every kind goes through the same matcher; the
// fields decide what a query can hit and how much each hit counts.
type Entry =
  | {
      kind: "file";
      id: string;
      fields: SearchField[];
      project: ProjectNode;
      file: EnvFileNode;
    }
  | {
      kind: "key";
      id: string;
      fields: SearchField[];
      key: string;
      project: ProjectNode;
      file: EnvFileNode;
    }
  | { kind: "project"; id: string; fields: SearchField[]; project: ProjectNode }
  | {
      kind: "action";
      id: string;
      fields: SearchField[];
      label: string;
      hint?: string;
      /** The hint is a command, so it sets in mono. */
      mono?: boolean;
      icon: ReactNode;
      shortcut?: ReactNode;
      run: () => void;
    };
type ActionEntry = Extract<Entry, { kind: "action" }>;

// How many rows each group shows for a query: enough to pick from, few
// enough that the best match is always in view.
const LIMIT = { files: 8, keys: 6, projects: 5, actions: 6, keyMode: 50 } as const;
const RECENT_LIMIT = 5;
// Key names only join the results once a query is specific enough to mean
// one; a single letter would flood the list with every key in the vault.
const KEY_MIN_QUERY = 2;

/**
 * Cmd+K everything-finder: files, key names, projects and actions in the
 * current workspace, ranked by one fuzzy matcher (lib/palette-search.ts) with
 * the matched characters marked. Empty, it shows recent files and actions
 * rather than the whole vault. This is the app's search; the sidebar has no
 * filter box.
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
  onSearchKeys,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const { resolvedTheme, setTheme } = useTheme();
  const { toggleSidebar } = useSidebar();
  const scope = useMemo(() => (workspace ? [workspace] : []), [workspace]);
  const { names: keyNames, loading: keysLoading } = useKeyNames(scope, open);

  const projects = useMemo(() => workspace?.projects ?? [], [workspace]);
  // "New file" lands next to what's being worked on: the selected file's
  // project when there is one, the first project otherwise.
  const fileTarget =
    projects.find((p) => p.files.some((f) => f.id === selectedFileId)) ??
    projects[0] ??
    null;

  // Close first so a follow-up dialog (New file, settings) isn't fighting
  // the palette for focus.
  function run(action: () => void) {
    onOpenChange(false);
    setQuery("");
    action();
  }

  // Most recently opened first, so ties in the ranking (and the empty
  // state) favour the files actually in use. Recency is read on open.
  const files = useMemo(() => {
    const entries = projects.flatMap((project) =>
      project.files.map(
        (file): Extract<Entry, { kind: "file" }> => ({
          kind: "file",
          id: `file:${file.id}`,
          fields: [
            { text: file.name },
            { text: project.name, weight: 0.8 },
            {
              // Search by the environment a file stands for, explicit or from
              // its name, so "production" finds .env.production unlabeled.
              text: effectiveEnvLabel(file.name, file.environment) ?? "",
              weight: 0.6,
            },
          ],
          project,
          file,
        }),
      ),
    );
    const order = new Map(
      sortByRecency(
        entries.map((e) => ({ id: e.file.id })),
        open ? getRecentFileIds() : [],
      ).map((e, i) => [e.id, i]),
    );
    return entries.sort(
      (a, b) => (order.get(a.file.id) ?? 0) - (order.get(b.file.id) ?? 0),
    );
  }, [projects, open]);

  const keys = useMemo(
    () =>
      files.flatMap(({ project, file }) =>
        (keyNames.get(file.id) ?? []).map(
          (key): Entry => ({
            kind: "key",
            id: `key:${file.id}:${key}`,
            fields: [{ text: key }],
            key,
            project,
            file,
          }),
        ),
      ),
    [files, keyNames],
  );

  const projectEntries = useMemo(
    () =>
      projects.map(
        (project): Entry => ({
          kind: "project",
          id: `project:${project.id}`,
          fields: [{ text: project.name }],
          project,
        }),
      ),
    [projects],
  );

  const dark = resolvedTheme === "dark";
  const actions: ActionEntry[] = [
    ...(fileTarget
      ? [
          action({
            id: "new-file",
            label: "New file",
            keywords: "create env",
            hint: `in ${fileTarget.name}`,
            icon: <FilePlus2 />,
            run: () => run(() => onNewFile(fileTarget)),
          }),
        ]
      : []),
    ...(workspace
      ? [
          action({
            id: "new-project",
            label: "New project",
            keywords: "create",
            icon: <FolderPlus />,
            run: () => run(onNewProject),
          }),
        ]
      : []),
    action({
      id: "find-key",
      label: "Find a key",
      keywords: "search variable all workspaces",
      hint: "in every workspace",
      icon: <KeyRound />,
      run: () => run(onSearchKeys),
    }),
    action({
      id: "copy-setup",
      label: "Copy setup command",
      keywords: "cli agent npx terminal claude cursor",
      hint: SETUP_COMMAND,
      mono: true,
      icon: <Clipboard />,
      run: () =>
        run(() => {
          navigator.clipboard
            .writeText(SETUP_COMMAND)
            .then(() => toast.success("Setup command copied"))
            .catch(() => toast.error("Couldn't copy to the clipboard"));
        }),
    }),
    action({
      id: "theme",
      label: dark ? "Switch to light theme" : "Switch to dark theme",
      keywords: "theme appearance mode",
      icon: dark ? <Sun /> : <Moon />,
      // A keyboard action, so no reveal animation: it just switches.
      run: () => run(() => setTheme(dark ? "light" : "dark")),
    }),
    action({
      id: "sidebar",
      label: "Toggle sidebar",
      keywords: "navigation",
      icon: <PanelLeft />,
      shortcut: <SidebarShortcutKeys />,
      run: () => run(toggleSidebar),
    }),
    action({
      id: "lock",
      label: "Lock vault",
      keywords: "security",
      icon: <Lock />,
      shortcut: <LockShortcutKeys />,
      run: () => run(onLock),
    }),
    action({
      id: "settings",
      label: "Settings",
      keywords:
        "profile account passphrase auto-lock recovery passkey preferences",
      icon: <Settings />,
      run: () => run(() => onOpenSettings("profile")),
    }),
    ...workspaces
      .filter((w) => w.id !== workspace?.id)
      .map((w) =>
        action({
          id: `workspace:${w.id}`,
          label: `Switch to ${w.name}`,
          keywords: "workspace",
          icon: <WorkspaceIcon workspace={w} />,
          run: () => run(() => onPickWorkspace(w.id)),
        }),
      ),
    action({
      id: "new-workspace",
      label: "New workspace",
      keywords: "create",
      icon: <Plus />,
      run: () => run(onNewWorkspace),
    }),
  ];

  const q = query.trim();
  const searching = q !== "";
  // "#" switches to key names only: "#stripe", or "#" alone to browse them.
  const keyMode = q.startsWith("#");
  const keyQuery = keyMode ? q.slice(1).trim() : q;

  // For a query, each group is ranked on its own and the groups are then
  // ordered by their best hit, so the best match leads the list wherever it
  // lives.
  const groups = keyMode
    ? [{ heading: "Keys", results: searchItems(keys, keyQuery).slice(0, LIMIT.keyMode) }]
        .filter((g) => g.results.length > 0)
    : searching
    ? [
        { heading: "Files", results: searchItems(files, q).slice(0, LIMIT.files) },
        {
          heading: "Keys",
          results:
            q.length >= KEY_MIN_QUERY
              ? searchItems(keys, q).slice(0, LIMIT.keys)
              : [],
        },
        {
          heading: "Projects",
          results: searchItems(projectEntries, q).slice(0, LIMIT.projects),
        },
        {
          heading: "Actions",
          results: searchItems(actions, q).slice(0, LIMIT.actions),
        },
      ]
        .filter((g) => g.results.length > 0)
        .sort((a, b) => (b.results[0]?.score ?? 0) - (a.results[0]?.score ?? 0))
    : [];

  function renderEntry(entry: Entry, highlights: number[][] = []) {
    switch (entry.kind) {
      case "file":
        return (
          <CommandItem
            key={entry.id}
            value={entry.id}
            onSelect={() => run(() => onSelectFile(entry.project, entry.file))}
          >
            <FileText className="text-muted-foreground" />
            <Marked
              className="min-w-0 truncate font-mono text-xs"
              text={entry.file.name}
              indices={highlights[0]}
            />
            <RowTrail
              project={entry.project}
              projectIndices={highlights[1]}
              file={entry.file}
              environmentIndices={highlights[2]}
            />
          </CommandItem>
        );
      case "key":
        // Names only: a key row never shows, or even has, the value.
        return (
          <CommandItem
            key={entry.id}
            value={entry.id}
            onSelect={() => run(() => onSelectFile(entry.project, entry.file))}
          >
            <KeyRound className="text-muted-foreground" />
            <Marked
              className="min-w-0 truncate font-mono text-xs"
              text={entry.key}
              indices={highlights[0]}
            />
            <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
              {entry.file.name}
            </span>
            <RowTrail project={entry.project} file={entry.file} />
          </CommandItem>
        );
      case "project":
        return (
          <CommandItem
            key={entry.id}
            value={entry.id}
            onSelect={() => run(() => onShowProject(entry.project))}
          >
            <ProjectIcon project={entry.project} size="sm" />
            <Marked
              className="min-w-0 truncate"
              text={entry.project.name}
              indices={highlights[0]}
            />
            <CommandShortcut className="tracking-normal tabular-nums">
              {entry.project.files.length}{" "}
              {entry.project.files.length === 1 ? "file" : "files"}
            </CommandShortcut>
          </CommandItem>
        );
      case "action":
        return (
          <ActionItem key={entry.id} action={entry} indices={highlights[0]} />
        );
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        // Every open starts clean; a stale query reads as a broken menu.
        if (!next) setQuery("");
        onOpenChange(next);
      }}
      title="Command palette"
      description="Search files, keys, projects, and actions"
    >
      {/* Ranking is ours (palette-search), so cmdk only drives the list:
          arrows, Enter, wrap-around. */}
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search files, keys, and actions. Type # for keys only"
        />
        <CommandList>
          {searching ? (
            <>
              <CommandEmpty>
                {keysLoading
                  ? "Searching key names..."
                  : keyMode
                    ? keyQuery
                      ? `No key in this workspace matches "${keyQuery}".`
                      : "No saved env files in this workspace yet."
                    : `Nothing matches "${q}".`}
              </CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.heading} heading={g.heading}>
                  {g.results.map((r: SearchResult<Entry>) =>
                    renderEntry(r.item, r.highlights),
                  )}
                </CommandGroup>
              ))}
            </>
          ) : (
            <>
              {files.length > 0 && (
                // Before anything has been opened on this device it's just
                // the first few files, so it says so.
                <CommandGroup
                  heading={
                    files.some((f) => getRecentFileIds().includes(f.file.id))
                      ? "Recent"
                      : "Files"
                  }
                >
                  {files.slice(0, RECENT_LIMIT).map((f) => renderEntry(f))}
                </CommandGroup>
              )}
              <CommandGroup heading="Actions">
                {actions.map((a) => renderEntry(a))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        {/* Keyboard legend: the palette is the app's keyboard home, so it
            says how to drive it. Phones have no keys to show. */}
        <div className="text-muted-foreground flex h-9 shrink-0 items-center gap-4 border-t px-4 text-xs max-sm:hidden">
          <span className="flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            Move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            Open
          </span>
          <span className="ml-auto">
            {searching && keysLoading ? "Searching key names..." : null}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            Close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}

// Actions are searched by their label first, then by quieter keywords
// ("theme" finds "Switch to dark theme" even if it said "appearance").
function action(a: {
  id: string;
  label: string;
  keywords: string;
  hint?: string;
  mono?: boolean;
  icon: ReactNode;
  shortcut?: ReactNode;
  run: () => void;
}): ActionEntry {
  return {
    kind: "action",
    id: `action:${a.id}`,
    fields: [{ text: a.label }, { text: a.keywords, weight: 0.5 }],
    label: a.label,
    hint: a.hint,
    mono: a.mono,
    icon: a.icon,
    shortcut: a.shortcut,
    run: a.run,
  };
}

function ActionItem({
  action,
  indices,
}: {
  action: ActionEntry;
  indices?: readonly number[];
}) {
  return (
    <CommandItem value={action.id} onSelect={action.run}>
      <span className="text-muted-foreground flex size-4 shrink-0 items-center justify-center">
        {action.icon}
      </span>
      <Marked className="min-w-0 truncate" text={action.label} indices={indices} />
      {action.hint && (
        <span
          className={cn(
            "text-muted-foreground min-w-0 truncate text-xs",
            action.mono && "font-mono",
          )}
        >
          {action.hint}
        </span>
      )}
      {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
    </CommandItem>
  );
}

/**
 * Text with the matched characters marked: brighter and heavier, no fill, so
 * a row still reads as one name rather than a string of highlights.
 */
function Marked({
  text,
  indices,
  className,
}: {
  text: string;
  indices?: readonly number[];
  className?: string;
}) {
  if (!indices || indices.length === 0) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span className={className}>
      {highlightRuns(text, indices).map((part, i) =>
        part.match ? (
          <mark key={i} className="text-foreground bg-transparent font-semibold">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  );
}

// The right end of a file or key row: the project (logo and name), then the
// environment, but only when the file's name doesn't already say it.
function RowTrail({
  project,
  projectIndices,
  file,
  environmentIndices,
}: {
  project: ProjectNode;
  projectIndices?: readonly number[];
  file: EnvFileNode;
  environmentIndices?: readonly number[];
}) {
  const tag = envTag(file.name, file.environment);
  return (
    <CommandShortcut className="flex min-w-0 shrink items-center gap-3 tracking-normal">
      <span className="flex min-w-0 items-center gap-1.5">
        <ProjectIcon project={project} size="sm" />
        <Marked
          className="min-w-0 truncate"
          text={project.name}
          indices={projectIndices}
        />
      </span>
      {/* A shown tag is the explicit label, the same text the search field
          holds, so the match marks still line up. */}
      {tag && <Marked text={tag} indices={environmentIndices} />}
    </CommandShortcut>
  );
}
