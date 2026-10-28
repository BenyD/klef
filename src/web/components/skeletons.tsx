// Loading placeholders for the vault screens, each drawn with the same
// containers, heights and paddings as the component it stands in for, so
// content lands without moving anything. The boot shell (AppShellSkeleton)
// and the app's own loading states both use these, so the hand-over between
// them is invisible.
//
// Light on purpose: the boot shell sits in the entry chunk, so nothing here
// pulls in the sidebar primitives or the editor. Where a class string copies
// one from a real component, the comment names it; change both together.

import {
  ChevronDown,
  ChevronsUpDown,
  KeyRound,
  LayoutGrid,
  Lock,
  PanelLeft,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "../lib/utils.ts";
import { isMacPlatform } from "../lib/auto-lock.ts";
import type { LayoutHint } from "../lib/layout-hint.ts";
import { Skeleton, SkeletonText } from "./ui/skeleton.tsx";

// Text widths cycle through these so a list reads as names of different
// lengths without being random (random widths jump on every remount).
const NAME_WIDTHS = ["w-24", "w-16", "w-28", "w-20", "w-14", "w-24", "w-20"];
const FILE_WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-16", "w-24"];
const pick = (widths: string[], i: number) => widths[i % widths.length];

// ---------------------------------------------------------------------------
// Sidebar

/** VaultHome's WorkspaceSwitcher trigger. */
export function WorkspaceSwitcherSkeleton() {
  return (
    <div className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-md px-1.5">
      <Skeleton className="size-7 shrink-0" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold">
          <SkeletonText className="w-24" />
        </span>
        <span className="text-xs">
          <SkeletonText className="w-16" />
        </span>
      </span>
      <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
    </div>
  );
}

/**
 * The project rows of AppSidebar's tree, as list items for its SidebarMenu:
 * a 28px row per project and, under an expanded one, its files and the "New
 * file" row (SidebarMenuSub / SidebarMenuSubButton).
 */
export function ProjectTreeSkeleton({
  hint,
}: {
  hint: Pick<LayoutHint, "files" | "expanded">;
}) {
  return hint.files.map((files, i) => (
    <li key={i} className="relative">
      <div className="flex h-7 items-center gap-2 rounded-md px-2">
        <Skeleton className="size-4 shrink-0 rounded-sm" />
        <span className="min-w-0 text-sm">
          <SkeletonText className={pick(NAME_WIDTHS, i)} />
        </span>
      </div>
      {hint.expanded[i] && (
        <ul className="border-sidebar-border mr-0 ml-4 flex min-w-0 translate-x-px flex-col gap-0.5 border-l py-0.5 pl-2">
          {Array.from({ length: files }, (_, j) => (
            <li key={j} className="flex h-7 -translate-x-px items-center px-2 text-xs">
              <SkeletonText className={pick(FILE_WIDTHS, i + j)} />
            </li>
          ))}
          <li className="text-muted-foreground flex h-7 -translate-x-px items-center gap-2 px-2 text-xs">
            <Plus className="size-3.5 shrink-0" />
            <span>New file</span>
          </li>
        </ul>
      )}
    </li>
  ));
}

/** VaultHome's UserMenu trigger. */
function UserMenuSkeleton() {
  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm/4">
          <SkeletonText className="w-20" />
        </span>
        <span className="text-xs/4">
          <SkeletonText className="w-28" />
        </span>
      </span>
      <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
    </div>
  );
}

/**
 * AppSidebar (variant="inset") with its data drawn as placeholders. The fixed
 * parts (search, the two nav rows, the Projects label) are drawn for real:
 * they never change, so they never need to load.
 */
function SidebarSkeleton({ hint }: { hint: LayoutHint }) {
  const row =
    "flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm [&>svg]:size-4 [&>svg]:shrink-0";
  return (
    // Sidebar's gap + container: 15rem wide, p-2 around the inner column.
    <div className="text-sidebar-foreground hidden w-60 shrink-0 md:block">
      <div className="flex h-svh w-60 flex-col p-2">
        {/* SidebarHeader className="gap-2 pb-1" */}
        <div className="flex flex-col gap-2 p-2 pb-1">
          <WorkspaceSwitcherSkeleton />
          <div className="bg-background text-muted-foreground shadow-raised flex h-8 w-full items-center gap-2 rounded-md border px-2 text-sm">
            <Search className="size-3.5 shrink-0" />
            <span>Search</span>
            <span className="ml-auto text-xs tracking-wide">
              {isMacPlatform() ? "⌘K" : "Ctrl K"}
            </span>
          </div>
          <ul className="flex w-full min-w-0 flex-col gap-0.5">
            <li
              className={cn(
                row,
                !hint.fileOpen &&
                  "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
              )}
            >
              <LayoutGrid />
              <span>All projects</span>
            </li>
            <li className={row}>
              <KeyRound />
              <span>Find a key</span>
            </li>
          </ul>
        </div>

        {/* SidebarContent > SidebarGroup className="pt-3" */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex w-full min-w-0 flex-col px-2 pt-3 pb-1">
            <div className="text-muted-foreground flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-medium">
              Projects
            </div>
            <span className="absolute top-4 right-3 flex w-5 items-center justify-center">
              <Plus className="size-4" />
            </span>
            <ul className="flex w-full min-w-0 flex-col gap-0.5 text-sm">
              <ProjectTreeSkeleton hint={hint} />
            </ul>
          </div>
        </div>

        {/* SidebarFooter className="flex-row items-center gap-2" */}
        <div className="flex flex-row items-center gap-2 p-2">
          <UserMenuSkeleton />
          <span className="bg-background text-muted-foreground dark:border-input dark:bg-input/30 flex size-10 shrink-0 items-center justify-center rounded-lg border">
            <Lock className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content panel

/** VaultHome's content header: the sidebar toggle and the workspace crumb. */
function ContentHeaderSkeleton() {
  return (
    <header className="flex h-11 w-full shrink-0 items-center gap-1 border-b px-2 sm:px-3">
      <span className="text-muted-foreground flex size-7 shrink-0 items-center justify-center">
        <PanelLeft className="size-4" />
      </span>
      <div className="flex h-7 min-w-0 items-center gap-1.5 px-1.5 text-sm">
        <Skeleton className="size-4 shrink-0 rounded-sm" />
        <SkeletonText className="w-24" />
      </div>
    </header>
  );
}

/** ProjectsOverview: the heading, then a bordered group per project. */
export function OverviewSkeleton({ hint }: { hint: Pick<LayoutHint, "files"> }) {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xl">
            <SkeletonText className="w-40" />
          </div>
          <div className="text-sm">
            <SkeletonText className="w-28" />
          </div>
        </div>
        {/* Button size="sm" "New project" */}
        <Skeleton className="h-7 w-[7.1875rem] shrink-0 rounded-[min(var(--radius-md),12px)]" />
      </div>

      <div className="flex flex-col gap-4">
        {hint.files.map((files, i) => (
          <div key={i} className="overflow-hidden rounded-lg border">
            <div className="bg-muted/50 flex h-10 items-center gap-2.5 border-b px-3 text-sm">
              <Skeleton className="size-5 shrink-0 rounded-sm" />
              <SkeletonText className={pick(NAME_WIDTHS, i)} />
            </div>
            <ul className="divide-y">
              {/* An empty project still has its "Add the first file" row. */}
              {Array.from({ length: Math.max(1, files) }, (_, j) => (
                // box-content: the row is 36px plus its divider, like the
                // real <li> around an h-9 button.
                <li key={j} className="box-content flex h-9 items-center gap-2.5 px-3 text-xs">
                  <Skeleton className="size-3.5 shrink-0 rounded-sm" />
                  <SkeletonText className={pick(FILE_WIDTHS, i + j)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** FileTabs: the 40px strip with one 28px tab per open file. */
function FileTabsSkeleton({ tabs }: { tabs: number }) {
  return (
    <div className="bg-sidebar/50 flex h-10 shrink-0 items-center border-b">
      <div className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-hidden px-1.5">
        {Array.from({ length: tabs }, (_, i) => (
          <Skeleton key={i} className="h-7 w-32 shrink-0" />
        ))}
      </div>
      <span className="text-muted-foreground mx-1.5 flex size-7 items-center justify-center">
        <ChevronDown className="size-4" />
      </span>
    </div>
  );
}

// Line lengths for the editor placeholder: a short comment, a few KEY=value
// lines, a blank line between groups, the way an env file usually reads.
const EDITOR_LINES = ["w-32", "w-56", "w-72", "w-48", null, "w-28", "w-64", "w-52", "w-60", null, "w-36", "w-44"];

/**
 * EnvCodeEditor's text area: the same padding and line height
 * (px-4 py-3, text-sm leading-relaxed), so lines sit where text will.
 */
export function EditorSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden px-4 py-3 font-mono text-sm leading-relaxed",
        className,
      )}
    >
      {EDITOR_LINES.map((w, i) => (
        <div key={i}>{w ? <SkeletonText className={w} /> : " "}</div>
      ))}
    </div>
  );
}

/** FilePane's toolbar over the editor, before the pane itself has mounted. */
function FilePaneSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b px-3 py-1.5">
        {/* TabsList: Code / Table */}
        <Skeleton className="h-8 w-[4.125rem] rounded-lg" />
        <div className="ml-auto flex items-center gap-1">
          {/* ButtonGroup of four icon-sm buttons, then "Save version" */}
          <Skeleton className="h-7 w-28 rounded-[min(var(--radius-md),12px)]" />
          <Skeleton className="h-7 w-30 rounded-[min(var(--radius-md),12px)]" />
        </div>
      </div>
      <EditorSkeleton className="min-h-80 flex-1" />
    </div>
  );
}

/** What the content panel will hold: the open file, or the overview. */
export function ContentSkeleton({ hint }: { hint: LayoutHint }) {
  return hint.fileOpen ? (
    <>
      <FileTabsSkeleton tabs={hint.tabs} />
      <FilePaneSkeleton />
    </>
  ) : (
    <OverviewSkeleton hint={hint} />
  );
}

// ---------------------------------------------------------------------------
// The whole shell

/** VaultHome as a skeleton: sidebar on the canvas, inset content panel. */
export function ShellSkeleton({ hint }: { hint: LayoutHint }) {
  return (
    <div className="bg-sidebar flex h-svh w-full overflow-hidden">
      <SidebarSkeleton hint={hint} />
      {/* SidebarInset, variant="inset" */}
      <div className="bg-background relative flex min-w-0 flex-1 flex-col overflow-hidden md:m-2 md:ml-0 md:rounded-lg md:border md:shadow-raised">
        <ContentHeaderSkeleton />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ContentSkeleton hint={hint} />
        </div>
      </div>
    </div>
  );
}
