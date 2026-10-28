import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { ProjectNode } from "../../shared/api-types.ts";
import { isMacPlatform } from "../lib/auto-lock.ts";
import { othersOf, rightOf, tabGroups } from "../lib/file-tabs.ts";
import { cn } from "../lib/utils.ts";
import type { SelectedFile } from "../vault-types.ts";
import { ProjectIcon } from "./ProjectIcon.tsx";
import { Button } from "./ui/button.tsx";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Kbd, KbdGroup } from "./ui/kbd.tsx";

function TabShortcut({ keys }: { keys: string[] }) {
  return (
    <KbdGroup className="ml-auto pl-4 max-sm:hidden">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </KbdGroup>
  );
}

// The open-file strip. Tabs are quiet pills on the canvas tint; the active one
// is raised onto the panel surface. Tabs are grouped by project: with one
// project open each tab leads with its icon; with several, each run gets a
// project chip that collapses it. Every tab reserves the same trailing slot
// (unsaved dot that becomes a close button on hover). Middle-click closes,
// drag reorders (within a group, or a group to the front), right-click offers
// bulk closes, and the overflow menu lists everything when the strip scrolls.
export function FileTabs({
  files,
  projectOf,
  activeId,
  dirtyIds,
  onSelect,
  onClose,
  onReorder,
}: {
  files: SelectedFile[];
  projectOf: (fileId: string) => ProjectNode | undefined;
  activeId: string | null;
  dirtyIds: ReadonlySet<string>;
  onSelect: (file: SelectedFile) => void;
  onClose: (ids: readonly string[]) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const groups = tabGroups(files);
  const grouped = groups.length > 1;
  const indexOf = new Map(files.map((f, i) => [f.id, i]));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const opt = isMacPlatform() ? "⌥" : "Alt";

  function toggleGroup(projectId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(projectId)) next.add(projectId);
      return next;
    });
  }

  // Keep the active tab in view when it changes (keyboard, palette, sidebar),
  // opening its group if it was collapsed.
  const activeProjectId = files.find((f) => f.id === activeId)?.projectId;
  useEffect(() => {
    if (!activeProjectId) return;
    setCollapsed((prev) => {
      if (!prev.has(activeProjectId)) return prev;
      const next = new Set(prev);
      next.delete(activeProjectId);
      return next;
    });
  }, [activeId, activeProjectId]);
  useEffect(() => {
    if (!activeId) return;
    refs.current
      .get(activeId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  function renderTab(f: SelectedFile, i: number) {
    const active = f.id === activeId;
    const dirty = dirtyIds.has(f.id);
    const project = !grouped && projectOf(f.id);
    return (
      <ContextMenu key={f.id}>
        <ContextMenuTrigger
          render={
            <div
              ref={(el) => {
                if (el) refs.current.set(f.id, el);
                else refs.current.delete(f.id);
              }}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDropAt(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) onReorder(dragFrom, i);
                setDragFrom(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
              // Middle-click closes, as in every tabbed app.
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose([f.id]);
                }
              }}
              className={cn(
                "group/tab relative flex h-7 max-w-56 shrink-0 items-center rounded-md transition-interactive has-focus-visible:ring-ring/50 has-focus-visible:ring-2",
                active
                  ? "bg-background text-foreground shadow-raised ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                dragFrom === i && "opacity-50",
                dropAt === i &&
                  dragFrom !== null &&
                  dragFrom !== i &&
                  "ring-ring/60 ring-1",
              )}
            />
          }
        >
          <button
            type="button"
            role="tab"
            aria-selected={active}
            title={`${f.project} / ${f.name}`}
            onClick={() => onSelect(f)}
            className="flex h-full min-w-0 items-center gap-1.5 rounded-md pr-1 pl-2 font-mono text-xs outline-none"
          >
            {project && (
              <span
                className={cn(
                  "flex shrink-0 transition-interactive",
                  !active && "opacity-70 group-hover/tab:opacity-100",
                )}
              >
                <ProjectIcon project={project} size="sm" />
              </span>
            )}
            <span className="truncate">{f.name}</span>
          </button>
          <button
            type="button"
            aria-label={dirty ? `Close ${f.name} (unsaved)` : `Close ${f.name}`}
            onClick={() => onClose([f.id])}
            className={cn(
              "text-muted-foreground hover:bg-muted hover:text-foreground mr-1 flex size-5 shrink-0 items-center justify-center rounded outline-none transition-interactive",
              // Revealed on hover, focus and for the active tab; always
              // there on touch, where nothing hovers.
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
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          <ContextMenuItem onClick={() => onClose([f.id])}>
            Close
            <TabShortcut keys={[opt, "W"]} />
          </ContextMenuItem>
          <ContextMenuItem
            disabled={files.length < 2}
            onClick={() => onClose(othersOf(files, f.id))}
          >
            Close others
          </ContextMenuItem>
          <ContextMenuItem
            disabled={i === files.length - 1}
            onClick={() => onClose(rightOf(files, f.id))}
          >
            Close to the right
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onClose(files.map((t) => t.id))}>
            Close all
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <div className="bg-sidebar/50 flex h-10 shrink-0 items-center border-b">
      <div
        role="tablist"
        aria-label="Open files"
        className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1.5"
      >
        {groups.map((g, gi) => {
          const hidden = grouped && collapsed.has(g.projectId);
          const project = projectOf(g.tabs[0]!.id);
          const holdsActive = g.tabs.some((t) => t.id === activeId);
          return (
            <Fragment key={g.projectId}>
              {gi > 0 && (
                <span
                  className="bg-border mx-1 h-4 w-px shrink-0"
                  aria-hidden="true"
                />
              )}
              {grouped && (
                <ContextMenu>
                  <ContextMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-expanded={!hidden}
                        title={hidden ? `Show ${g.project}` : `Collapse ${g.project}`}
                        onClick={() => toggleGroup(g.projectId)}
                        className={cn(
                          "hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 flex h-7 max-w-40 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium outline-none transition-interactive focus-visible:ring-2",
                          holdsActive ? "text-foreground" : "text-muted-foreground",
                        )}
                      />
                    }
                  >
                    {project && <ProjectIcon project={project} size="sm" />}
                    <span className="truncate">{g.project}</span>
                    {hidden && (
                      <span className="bg-muted text-muted-foreground rounded px-1 tabular-nums">
                        {g.tabs.length}
                      </span>
                    )}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-48">
                    <ContextMenuItem onClick={() => toggleGroup(g.projectId)}>
                      {hidden ? "Expand" : "Collapse"}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onClose(g.tabs.map((t) => t.id))}>
                      Close {g.tabs.length === 1 ? "tab" : `${g.tabs.length} tabs`}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )}
              {!hidden && g.tabs.map((f) => renderTab(f, indexOf.get(f.id)!))}
            </Fragment>
          );
        })}
      </div>

      {/* Every open tab in one list, for when the strip scrolls. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="All open files"
              className="text-muted-foreground mx-1.5"
            >
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center">
              Open files
              <span className="ml-auto font-normal">
                {opt} 1-9 to jump, {opt} [ ] to cycle
              </span>
            </DropdownMenuLabel>
            {files.map((f, i) => (
              <DropdownMenuItem
                key={f.id}
                className="font-mono text-xs"
                onClick={() => onSelect(f)}
              >
                <span className="truncate">{f.name}</span>
                <span className="text-muted-foreground truncate font-sans">
                  {f.project}
                </span>
                {dirtyIds.has(f.id) && (
                  <span
                    className="bg-foreground/70 size-1.5 shrink-0 rounded-full"
                    aria-label="Unsaved"
                  />
                )}
                <span className="ml-auto flex items-center gap-2">
                  {f.id === activeId && <Check className="size-4" />}
                  {/* Mirrors tabForDigit: 1-8 by position, 9 is the last tab. */}
                  {(i < 8 || i === files.length - 1) && (
                    <TabShortcut
                      keys={[opt, i === files.length - 1 && i >= 8 ? "9" : String(i + 1)]}
                    />
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onClose(files.map((t) => t.id))}>
            <X />
            Close all
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
