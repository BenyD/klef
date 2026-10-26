import { useMemo, useState, type KeyboardEvent } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils.ts";
import { isMacPlatform } from "../lib/auto-lock.ts";
import { useEnvMeta, useEnvTag } from "../lib/env-meta.ts";
import { effectiveEnvironment } from "../../shared/env-from-name.ts";
import {
  filterKeyGroups,
  groupKeys,
  type FileRef,
  type KeyedFile,
  type ProjectPresence,
} from "../lib/key-groups.ts";
import { highlightRuns } from "../lib/palette-search.ts";
import { useKeyNames } from "../lib/use-key-names.ts";
import {
  ENVIRONMENTS,
  type EnvFileNode,
  type ProjectNode,
  type WorkspaceNode,
} from "../../shared/api-types.ts";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Kbd, KbdGroup } from "./ui/kbd.tsx";

// Where is STRIPE_SECRET_KEY set, and where is it missing? Every dotenv
// file's key names across the vault, one row per project with its files as
// chips. Files are decrypted in the browser while this is open (cached per
// version, dropped on lock); only names reach the UI, never values.
export function KeySearchDialog({
  open,
  onClose,
  workspaces,
  onSelectFile,
}: {
  open: boolean;
  onClose: () => void;
  workspaces: WorkspaceNode[];
  onSelectFile: (project: ProjectNode, file: EnvFileNode) => void;
}) {
  const envMeta = useEnvMeta();
  const { names, loading } = useKeyNames(workspaces, open);
  const [query, setQuery] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [selected, setSelected] = useState("");

  // fileId -> the nodes onSelectFile needs, plus the files with known names.
  const { nav, keyed } = useMemo(() => {
    const nav = new Map<string, { project: ProjectNode; file: EnvFileNode }>();
    const keyed: KeyedFile[] = [];
    for (const w of workspaces) {
      for (const p of w.projects) {
        for (const f of p.files) {
          nav.set(f.id, { project: p, file: f });
          const keys = names.get(f.id);
          if (!keys) continue;
          keyed.push({
            fileId: f.id,
            fileName: f.name,
            projectId: p.id,
            project: p.name,
            workspaceId: w.id,
            workspace: w.name,
            // What the file stands for: its label, else its name. The
            // environment filter and the "missing in" gaps both go by this,
            // so .env.production counts as production unlabelled.
            environment: effectiveEnvironment(f.name, f.environment),
            keys,
          });
        }
      }
    }
    return { nav, keyed };
  }, [workspaces, names]);

  const groups = useMemo(() => groupKeys(keyed), [keyed]);
  const results = useMemo(
    () => filterKeyGroups(groups, { query, workspaceId, environment, gapsOnly }),
    [groups, query, workspaceId, environment, gapsOnly],
  );
  const gapCount = useMemo(
    () =>
      filterKeyGroups(groups, { workspaceId, environment, gapsOnly: true })
        .length,
    [groups, workspaceId, environment],
  );

  // Presets first in their usual order, then any custom labels in use.
  const environments = useMemo(() => {
    const used = new Set(
      keyed.map((f) => f.environment).filter((e): e is string => e !== null),
    );
    return [
      ...ENVIRONMENTS.filter((e) => used.has(e)),
      ...[...used].filter((e) => !(ENVIRONMENTS as readonly string[]).includes(e)).sort(),
    ];
  }, [keyed]);

  // Workspace names only earn their space when keys span more than one.
  const multiWorkspace = new Set(keyed.map((f) => f.workspaceId)).size > 1;
  const workspaceName =
    workspaces.find((w) => w.id === workspaceId)?.name ?? "All workspaces";

  function close() {
    setQuery("");
    setSelected("");
    onClose();
  }

  function openFile(fileId: string) {
    const entry = nav.get(fileId);
    if (!entry) return;
    close();
    onSelectFile(entry.project, entry.file);
  }

  function copyName(key: string) {
    navigator.clipboard
      .writeText(key)
      .then(() => toast.success(`Copied ${key}`))
      .catch(() => toast.error("Couldn't copy to the clipboard"));
  }

  // Cmd/Ctrl+C copies the selected row's key name, unless text is selected
  // (then the browser's own copy wins).
  function onKeyDown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "c") return;
    if (window.getSelection()?.toString()) return;
    const key = selected.split("::")[0];
    if (!key) return;
    e.preventDefault();
    copyName(key);
  }

  const mac = isMacPlatform();
  const indexing = loading && keyed.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-2xl"
        initialFocus={() =>
          document.querySelector<HTMLElement>("[data-slot=command-input]")
        }
      >
        <DialogTitle className="sr-only">Find a key</DialogTitle>
        <DialogDescription className="sr-only">
          Which files set a key, and which files in the same project are
          missing it. Values stay hidden.
        </DialogDescription>
        <Command
          shouldFilter={false}
          loop
          value={selected}
          onValueChange={setSelected}
          onKeyDown={onKeyDown}
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Find a key, e.g. STRIPE_SECRET_KEY"
            className="font-mono"
          />

          {/* Filters: workspace, environment, and the gaps view. */}
          <div className="no-scrollbar flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-3">
            {multiWorkspace && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    chip,
                    workspaceId && "bg-muted text-foreground",
                  )}
                >
                  {workspaceName}
                  <ChevronDown className="size-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-48">
                  {[null, ...workspaces.map((w) => w.id)].map((id) => (
                    <DropdownMenuItem key={id ?? "all"} onClick={() => setWorkspaceId(id)}>
                      {id
                        ? workspaces.find((w) => w.id === id)?.name
                        : "All workspaces"}
                      {workspaceId === id && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {environments.length > 0 && (
              <div role="group" aria-label="Environment" className="flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={environment === null}
                  onClick={() => setEnvironment(null)}
                  className={chip}
                >
                  All
                </button>
                {environments.map((env) => (
                  <button
                    key={env}
                    type="button"
                    aria-pressed={environment === env}
                    onClick={() => setEnvironment(environment === env ? null : env)}
                    className={chip}
                  >
                    {envMeta(env).label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              aria-pressed={gapsOnly}
              onClick={() => setGapsOnly((v) => !v)}
              className={cn(chip, "ml-auto shrink-0")}
              title="Keys set in some of a project's files but not all"
            >
              <TriangleAlert className="text-warning size-3" />
              Missing somewhere
              <span className="tabular-nums">{gapCount}</span>
            </button>
          </div>

          <CommandList className="max-h-[min(60vh,32rem)] p-0">
            {indexing ? (
              <div className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Reading key names...
              </div>
            ) : (
              <CommandEmpty>
                {groups.length === 0
                  ? "No saved env files to search yet."
                  : gapsOnly && !query.trim()
                    ? "Every key is set in all of its project's files."
                    : `No keys match "${query.trim()}".`}
              </CommandEmpty>
            )}
            {results.map(({ group, highlight }) => (
              <CommandGroup
                key={group.key}
                // Sticky, so a long list of projects keeps its key in view.
                className="p-0 **:[[cmdk-group-heading]]:bg-popover **:[[cmdk-group-heading]]:sticky **:[[cmdk-group-heading]]:top-0 **:[[cmdk-group-heading]]:z-10 **:[[cmdk-group-heading]]:p-0 [&_[cmdk-group-items]]:px-1 [&_[cmdk-group-items]]:pb-1"
                heading={
                  <div className="flex h-8 items-center gap-2 px-3">
                    <KeyRound className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="text-foreground truncate font-mono text-xs font-medium">
                      {highlightRuns(group.key, highlight).map((part, i) =>
                        part.match ? (
                          <mark key={i} className="text-brand bg-transparent">
                            {part.text}
                          </mark>
                        ) : (
                          <span key={i}>{part.text}</span>
                        ),
                      )}
                    </span>
                    <span className="tabular-nums">
                      {group.fileCount} {group.fileCount === 1 ? "file" : "files"}
                    </span>
                    {group.gaps > 0 && (
                      <span className="text-warning tabular-nums">
                        {group.gaps} missing
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Copy ${group.key}`}
                      title="Copy name"
                      onClick={() => copyName(group.key)}
                      className="hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 ml-auto flex size-6 items-center justify-center rounded-md outline-none transition-interactive focus-visible:ring-2"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  </div>
                }
              >
                {group.projects.map((p) => (
                  <ProjectRow
                    key={p.projectId}
                    value={`${group.key}::${p.projectId}`}
                    presence={p}
                    showWorkspace={multiWorkspace && !workspaceId}
                    onOpen={openFile}
                  />
                ))}
              </CommandGroup>
            ))}
          </CommandList>

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
            <span className="flex items-center gap-1.5">
              <KbdGroup>
                <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
                <Kbd>C</Kbd>
              </KbdGroup>
              Copy name
            </span>
            <span className="ml-auto">
              {loading && !indexing ? "Updating..." : "Names only, never values"}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// A filter toggle: quiet until pressed, then filled.
const chip =
  "text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground focus-visible:ring-ring/50 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs outline-none transition-interactive focus-visible:ring-2";

// One project under a key: its name, then a chip per file that sets the key
// and a dashed chip per file that doesn't. Enter opens the first file that
// has it (or, in a gaps-only environment view, the one that's missing it).
function ProjectRow({
  value,
  presence,
  showWorkspace,
  onOpen,
}: {
  value: string;
  presence: ProjectPresence;
  showWorkspace: boolean;
  onOpen: (fileId: string) => void;
}) {
  const first = presence.present[0] ?? presence.missing[0];
  return (
    <CommandItem
      value={value}
      onSelect={() => first && onOpen(first.fileId)}
      className="h-auto min-h-8 flex-wrap gap-x-3 gap-y-1 py-1.5"
    >
      <span className="flex w-36 shrink-0 items-baseline gap-1.5 truncate text-sm">
        <span className="truncate">{presence.project}</span>
        {showWorkspace && (
          <span className="text-muted-foreground truncate text-xs">
            {presence.workspace}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {presence.present.map((f) => (
          <FileChip key={f.fileId} file={f} onOpen={onOpen} />
        ))}
        {presence.missing.map((f) => (
          <FileChip key={f.fileId} file={f} missing onOpen={onOpen} />
        ))}
      </span>
    </CommandItem>
  );
}

function FileChip({
  file,
  missing = false,
  onOpen,
}: {
  file: FileRef;
  missing?: boolean;
  onOpen: (fileId: string) => void;
}) {
  // file.environment is already the effective one; a tag only shows when
  // that isn't what the name says (a plain .env marked production).
  const tag = useEnvTag()(file.fileName, file.environment);
  return (
    <span
      role="button"
      tabIndex={-1}
      title={
        missing ? `Not set in ${file.fileName}` : `Open ${file.fileName}`
      }
      onClick={(e) => {
        // The row opens its first file; a chip opens its own.
        e.stopPropagation();
        onOpen(file.fileId);
      }}
      className={cn(
        "hover:bg-muted inline-flex h-5 items-center gap-1.5 rounded-[5px] border px-1.5 font-mono text-xs transition-interactive",
        missing
          ? "text-warning border-dashed border-current/40"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {file.fileName}
      {tag && <span className="font-sans">{tag}</span>}
      {missing && <span className="sr-only"> (missing)</span>}
    </span>
  );
}
