import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  Code,
  Copy,
  Download,
  Eraser,
  GitCompare,
  History,
  Import,
  Loader2,
  PanelRight,
  RotateCcw,
  Save,
  Table2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils.ts";
import { decryptBlob, encryptBlob } from "../../shared/crypto.ts";
import {
  diffLines,
  diffStats,
  finalNewlineNote,
  isUnchanged,
} from "../../shared/diff.ts";
import {
  getCurrentVersion,
  getVersion,
  listVersions,
  saveVersion,
  type VersionSummary,
} from "../structure-api.ts";
import { cleanEnvWhitespace, lintEnvText } from "../lib/env-lint.ts";
import { absoluteTime, relativeTime } from "../lib/format-time.ts";
import {
  getConfirmLoadVersion,
  getConfirmSaveReview,
  setConfirmLoadVersion,
  setConfirmSaveReview,
} from "../lib/preferences.ts";
import { useVault } from "../vault-context.ts";
import type { SelectedFile } from "../vault-types.ts";
import { useIsMobile } from "../hooks/use-mobile.ts";
import { EnvCodeEditor } from "./EnvCodeEditor.tsx";
import { EnvTable } from "./EnvTable.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { ButtonGroup } from "./ui/button-group.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Label } from "./ui/label.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./ui/empty.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

interface Props {
  file: SelectedFile;
  onSaved: () => void;
  /** Reports unsaved-draft state upward (drives the tab strip's dirty dot). */
  onDirtyChange?: (dirty: boolean) => void;
}

type SidePanel = "review" | "history" | null;

// The heart of Klef: paste, decrypt current in-browser, diff, save. The server
// only ever sees opaque blobs across this whole flow.
//
// Anatomy, on purpose:
// - Raw/Table is a segmented switch (two views of the same draft)
// - review and history share one docked side panel (resizable, persisted);
//   phones present the same content as full-width sheets instead
export function FilePane({ file, onSaved, onDirtyChange }: Props) {
  const { dek } = useVault();
  const isMobile = useIsMobile();
  const [stored, setStored] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState("editor");
  const [panel, setPanel] = useState<SidePanel>(null);
  const [history, setHistory] = useState<VersionSummary[] | null>(null);
  // Drill-in inside the history panel: an older version decrypted for a
  // read-only diff against the current saved version.
  const [compare, setCompare] = useState<{
    id: string;
    createdAt: string;
    text: string;
  } | null>(null);
  // Save confirmation: a final look at the diff before a version is written.
  // Preference-gated; the checkbox turns it off for this device.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipFutureReviews, setSkipFutureReviews] = useState(false);
  // Load confirmation: loading a version replaces the draft, so unsaved
  // edits get a warning first. Same preference pattern as the save review.
  const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);
  const [skipFutureLoadWarnings, setSkipFutureLoadWarnings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setView("editor");
    setPanel(null);
    setHistory(null);
    setCompare(null);
    getCurrentVersion(file.id)
      .then(async ({ version }) => {
        const text = version && dek ? await decryptBlob(dek, version.blob) : "";
        if (cancelled) return;
        setStored(text);
        setDraft(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file.id, dek]);

  const ops = useMemo(() => diffLines(stored, draft), [stored, draft]);
  const stats = useMemo(() => diffStats(ops), [ops]);
  const newlineNote = finalNewlineNote(stored, draft);
  const changed = !isUnchanged(stored, draft);
  const lint = useMemo(() => lintEnvText(draft), [draft]);

  useEffect(() => {
    onDirtyChange?.(changed);
  }, [changed, onDirtyChange]);

  // Old version on the left, current saved version on the right, so "+" reads
  // as "added since then".
  const compareOps = useMemo(
    () => (compare ? diffLines(compare.text, stored) : null),
    [compare, stored],
  );
  const compareStats = useMemo(
    () => (compareOps ? diffStats(compareOps) : null),
    [compareOps],
  );

  // A review with nothing to review never shows.
  const activePanel: SidePanel =
    panel === "review" && !changed ? null : panel;

  const refreshHistory = useCallback(async () => {
    setHistory((await listVersions(file.id)).versions);
  }, [file.id]);

  function openHistory() {
    setCompare(null);
    setPanel((p) => (p === "history" ? null : "history"));
    if (!history) {
      refreshHistory().catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : String(e)),
      );
    }
  }

  // The toolbar's save goes through the review dialog (when the preference is
  // on); saving from the review panel skips it, the diff is already on screen.
  function requestSave() {
    if (!changed || saving) return;
    if (getConfirmSaveReview()) {
      setSkipFutureReviews(false);
      setConfirmOpen(true);
    } else {
      void onSave();
    }
  }

  async function confirmSave() {
    if (skipFutureReviews) setConfirmSaveReview(false);
    setConfirmOpen(false);
    await onSave();
  }

  async function onSave() {
    if (!dek || !changed) return;
    setSaving(true);
    try {
      const blob = await encryptBlob(dek, draft);
      await saveVersion(file.id, blob);
      setStored(draft);
      setPanel((p) => (p === "review" ? null : p));
      onSaved();
      if (history) await refreshHistory();
      toast.success("Version saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Copied to clipboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  function exportFile() {
    const blob = new Blob([draft], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${file.name}`);
  }

  // Loading only destroys work when the draft has unsaved edits; a clean
  // draft loads straight away (the current version stays saved regardless).
  function requestLoadVersion(versionId: string) {
    if (changed && getConfirmLoadVersion()) {
      setSkipFutureLoadWarnings(false);
      setPendingLoadId(versionId);
    } else {
      void loadVersion(versionId);
    }
  }

  async function confirmLoadVersion() {
    if (!pendingLoadId) return;
    if (skipFutureLoadWarnings) setConfirmLoadVersion(false);
    const versionId = pendingLoadId;
    setPendingLoadId(null);
    await loadVersion(versionId);
  }

  // Load an older version into the editor as the draft; the panel flips to
  // review so what restoring would change is immediately visible.
  async function loadVersion(versionId: string) {
    if (!dek) return;
    try {
      const { version } = await getVersion(file.id, versionId);
      setDraft(await decryptBlob(dek, version.blob));
      setView("editor");
      setCompare(null);
      setPanel("review");
      toast.info(
        "This version is now your draft. Review the changes, then save to restore it.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  // Decrypt an older version for a read-only comparison; nothing touches the
  // draft until the user explicitly loads it.
  async function openCompare(v: VersionSummary) {
    if (!dek) return;
    try {
      const { version } = await getVersion(file.id, v.id);
      setCompare({
        id: v.id,
        createdAt: v.createdAt,
        text: await decryptBlob(dek, version.blob),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const diffStatsLine = (
    <span className="font-mono text-xs">
      <span className="text-diff-add">
        +{stats.added}
      </span>{" "}
      <span className="text-diff-remove">-{stats.removed}</span>
    </span>
  );

  const reviewActions = (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setDraft(stored);
          setPanel(null);
        }}
      >
        <RotateCcw />
        Discard
      </Button>
      <Button size="sm" onClick={() => void onSave()} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Save />}
        Save version
      </Button>
    </>
  );

  // A timeline, newest on top: filled dot = current, connecting rail matches
  // the onboarding stepper language.
  const historyList = !history ? (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  ) : history.length === 0 ? (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No versions yet</EmptyTitle>
        <EmptyDescription>Saved versions will appear here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : (
    <ol className="flex flex-col">
      {history.map((v, i) => {
        const last = i === history.length - 1;
        const created = new Date(v.createdAt);
        return (
          <li key={v.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 size-2.5 shrink-0 rounded-full border-2",
                  v.isCurrent
                    ? "border-primary bg-primary"
                    : "border-border bg-background",
                )}
                aria-hidden="true"
              />
              {!last && <span className="bg-border my-1 w-px flex-1" />}
            </div>
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center gap-3",
                !last && "pb-4",
              )}
            >
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {relativeTime(created)}
                  {v.isCurrent && (
                    <Badge variant="secondary" className="font-normal">
                      current
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {absoluteTime(created)}
                </span>
              </div>
              {!v.isCurrent && (
                <div className="ml-auto flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void openCompare(v)}
                  >
                    <GitCompare />
                    Compare
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => requestLoadVersion(v.id)}
                  >
                    <Import />
                    Load
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );

  // Read-only diff of an older version against the current saved version,
  // shown in place of the timeline with a back affordance.
  const compareStatsLine = compareStats && (
    <span className="font-mono text-xs">
      <span className="text-diff-add">
        +{compareStats.added}
      </span>{" "}
      <span className="text-diff-remove">
        -{compareStats.removed}
      </span>
    </span>
  );

  const compareHeader = compare && (
    <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Back to versions"
        className="text-muted-foreground"
        onClick={() => setCompare(null)}
      >
        <ChevronLeft />
      </Button>
      <span className="truncate text-sm">
        {absoluteTime(new Date(compare.createdAt))}
      </span>
      <span className="text-muted-foreground shrink-0 text-xs">vs current</span>
      <span className="ml-auto shrink-0">{compareStatsLine}</span>
    </div>
  );

  const compareBody = compareOps && compareStats && (
    <>
      {compare && isUnchanged(compare.text, stored) && (
        <p className="text-muted-foreground border-b px-3 py-2 text-xs">
          Same content as the current version.
        </p>
      )}
      <DiffList
        ops={compareOps}
        note={compare ? finalNewlineNote(compare.text, stored) : null}
      />
    </>
  );

  const compareFooter = compare && (
    <div className="flex justify-end gap-2 border-t p-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => requestLoadVersion(compare.id)}
      >
        <Import />
        Load into editor
      </Button>
    </div>
  );

  return (
    <Tabs
      value={view}
      onValueChange={setView}
      /* min-h-0 keeps the pane viewport-bound so the side panel and table
         scroll internally instead of growing the page. */
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* View switch: same draft, two lenses. Icons, not labeled tabs;
            the code view is the byte-for-byte source of truth, the table is
            the KV lens over it. */}
        <TabsList>
          <Tooltip>
            <TooltipTrigger
              render={
                <TabsTrigger value="editor" aria-label="Code view">
                  <Code />
                </TabsTrigger>
              }
            />
            <TooltipContent>Code</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <TabsTrigger value="table" aria-label="Table view">
                  <Table2 />
                </TabsTrigger>
              }
            />
            <TooltipContent>Table</TooltipContent>
          </Tooltip>
        </TabsList>

        <div className="ml-auto flex items-center gap-1">
          {changed && (
            <Button
              variant="outline"
              size="sm"
              aria-expanded={activePanel === "review"}
              onClick={() =>
                setPanel((p) => (p === "review" ? null : "review"))
              }
              className="h-8 gap-1.5 font-mono text-xs"
            >
              <span className="text-diff-add">
                +{stats.added}
              </span>
              <span className="text-diff-remove">
                -{stats.removed}
              </span>
              <span className="font-sans">Review</span>
              <PanelRight className="text-muted-foreground size-3.5" />
            </Button>
          )}
          {/* Segmented so the icon actions read as one toolbar, not
              scattered buttons; each keeps its tooltip. */}
          <ButtonGroup>
            <IconAction label="Copy" onClick={copyToClipboard}>
              <Copy />
            </IconAction>
            <IconAction label="Export" onClick={exportFile}>
              <Download />
            </IconAction>
            {changed && (
              <IconAction
                label="Discard changes"
                onClick={() => setDraft(stored)}
              >
                <RotateCcw />
              </IconAction>
            )}
            <IconAction label="Version history" onClick={openHistory}>
              <History />
            </IconAction>
          </ButtonGroup>
          <Button
            size="sm"
            className="h-8"
            onClick={requestSave}
            disabled={!changed || saving}
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save version
          </Button>
        </div>
      </div>

      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="klef.side-panel-split"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize={60} minSize={30} className="min-w-0">
          <TabsContent
            value="editor"
            keepMounted
            className="flex h-full flex-col"
          >
            {lint.hasIssues && (
              <WhitespaceWarning
                lint={lint}
                onClean={() => setDraft(cleanEnvWhitespace(draft))}
              />
            )}
            <EnvCodeEditor
              value={draft}
              onChange={setDraft}
              placeholder="Paste your .env contents here..."
              className="min-h-80 flex-1"
            />
          </TabsContent>

          <TabsContent
            value="table"
            keepMounted
            className="h-full overflow-y-auto"
          >
            {/* Rows normally diff against the saved version; while a version
                is open in the compare panel, they diff against that instead,
                so any older version can be reviewed (and cherry-picked from)
                in place. */}
            <EnvTable
              text={draft}
              onChange={setDraft}
              baseline={compare?.text ?? stored}
              comparing={compare !== null}
            />
          </TabsContent>
        </ResizablePanel>

        {/* One docked slot for review and history: resizable, and the split
            persists per device. Review keeps editing live on the left. */}
        {!isMobile && activePanel && (
          <>
            <ResizableHandle
              withHandle
              className="mx-1.5 bg-transparent after:w-3"
            />
            <ResizablePanel defaultSize={40} minSize={20} className="min-w-0">
              <aside className="flex h-full flex-col overflow-hidden rounded-md border">
                {/* One header row; in a compare it becomes back + timestamp +
                    stats instead of stacking a second title underneath. */}
                <div
                  className={cn(
                    "flex items-center gap-2 border-b py-2 pr-3",
                    activePanel === "history" && compare ? "pl-2" : "pl-3",
                  )}
                >
                  {activePanel === "history" && compare ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Back to versions"
                        className="text-muted-foreground"
                        onClick={() => setCompare(null)}
                      >
                        <ChevronLeft />
                      </Button>
                      <span className="truncate text-sm font-medium">
                        {absoluteTime(new Date(compare.createdAt))}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        vs current
                      </span>
                      <span className="ml-auto shrink-0">
                        {compareStatsLine}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium">
                        {activePanel === "review"
                          ? "Review changes"
                          : "Version history"}
                      </span>
                      {activePanel === "review" ? (
                        diffStatsLine
                      ) : (
                        <span className="text-muted-foreground truncate font-mono text-xs">
                          {file.name}
                        </span>
                      )}
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close panel"
                    className={cn(
                      "text-muted-foreground",
                      !(activePanel === "history" && compare) && "ml-auto",
                    )}
                    onClick={() => {
                      setPanel(null);
                      setCompare(null);
                    }}
                  >
                    <X />
                  </Button>
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-y-auto",
                    activePanel === "history" && !compare && "p-3",
                  )}
                >
                  {activePanel === "review" ? (
                    <DiffList ops={ops} note={newlineNote} />
                  ) : compare ? (
                    compareBody
                  ) : (
                    historyList
                  )}
                </div>
                {activePanel === "review" && (
                  <div className="flex justify-end gap-2 border-t p-2">
                    {reviewActions}
                  </div>
                )}
                {activePanel === "history" && compareFooter}
              </aside>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Phones: the same content as full-width sheets. */}
      {isMobile && (
        <>
          <Sheet
            open={activePanel === "review"}
            onOpenChange={(open) => !open && setPanel(null)}
          >
            <SheetContent side="right" className="gap-0 data-[side=right]:w-full">
              <SheetHeader>
                <SheetTitle>Review changes</SheetTitle>
                <SheetDescription className="font-mono">
                  <span className="text-diff-add">
                    +{stats.added}
                  </span>{" "}
                  <span className="text-diff-remove">
                    -{stats.removed}
                  </span>{" "}
                  against the saved version
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4">
                <div className="rounded-md border">
                  <DiffList ops={ops} note={newlineNote} />
                </div>
              </div>
              <SheetFooter className="flex-row justify-end gap-2">
                {reviewActions}
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet
            open={activePanel === "history"}
            onOpenChange={(open) => {
              if (!open) {
                setPanel(null);
                setCompare(null);
              }
            }}
          >
            <SheetContent side="right" className="gap-0 data-[side=right]:w-full">
              <SheetHeader>
                <SheetTitle>Version history</SheetTitle>
                <SheetDescription className="font-mono">
                  {file.name}
                </SheetDescription>
              </SheetHeader>
              {compareHeader}
              <div
                className={cn(
                  "flex-1 overflow-y-auto",
                  compare ? "pb-4" : "px-4 pb-4",
                )}
              >
                {compare ? compareBody : historyList}
              </div>
              {compareFooter}
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* Save confirmation: the last look before a version is written. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Review changes</DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {file.name} {diffStatsLine}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] min-h-40 overflow-y-auto rounded-md border">
            <DiffList ops={ops} note={newlineNote} />
          </div>
          <DialogFooter className="items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="skip-save-review"
                checked={skipFutureReviews}
                onCheckedChange={(checked) =>
                  setSkipFutureReviews(checked === true)
                }
              />
              <Label
                htmlFor="skip-save-review"
                className="text-muted-foreground text-xs font-normal"
              >
                Don't show this again
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void confirmSave()} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                Save version
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load warning: only when unsaved edits would be replaced. */}
      <Dialog
        open={pendingLoadId !== null}
        onOpenChange={(open) => !open && setPendingLoadId(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Replace unsaved edits?</DialogTitle>
            <DialogDescription>
              Loading this version replaces your unsaved edits to{" "}
              <span className="font-mono text-xs">{file.name}</span>. The
              current saved version is not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                id="skip-load-warning"
                checked={skipFutureLoadWarnings}
                onCheckedChange={(checked) =>
                  setSkipFutureLoadWarnings(checked === true)
                }
              />
              <Label
                htmlFor="skip-load-warning"
                className="text-muted-foreground text-xs font-normal"
              >
                Don't show this again
              </Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingLoadId(null)}>
                Cancel
              </Button>
              <Button onClick={() => void confirmLoadVersion()}>
                <Import />
                Load version
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

// Diff lines are file content, so they render at the editor's size; the two
// often sit side by side and a size mismatch reads as sloppy.
function WhitespaceWarning({
  lint,
  onClean,
}: {
  lint: ReturnType<typeof lintEnvText>;
  onClean: () => void;
}) {
  const parts: string[] = [];
  const n = lint.trailingSpaceLines.length;
  if (n > 0) {
    parts.push(
      n === 1
        ? `Line ${lint.trailingSpaceLines[0]} has a trailing space`
        : `${n} lines have trailing spaces`,
    );
  }
  if (lint.trailingBlankLines > 0) {
    parts.push(
      lint.trailingBlankLines === 1
        ? "the file ends with a blank line"
        : `the file ends with ${lint.trailingBlankLines} blank lines`,
    );
  }
  // Sentence-case the joined clauses: "3 lines… and the file ends…".
  const message = parts.join(" and ");

  return (
    <div className="border-warning/30 bg-warning/10 text-warning flex items-center gap-2 border-b px-3 py-2 text-xs">
      <TriangleAlert className="size-3.5 shrink-0" />
      <span className="flex-1">
        {message}. Invisible whitespace is saved as-is and can break some
        parsers.
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="text-warning hover:text-warning h-6 shrink-0 px-2"
        onClick={onClean}
      >
        <Eraser className="size-3.5" />
        Clean up
      </Button>
    </div>
  );
}

function DiffList({
  ops,
  note,
}: {
  ops: ReturnType<typeof diffLines>;
  /** Final-newline note (git's "\ No newline at end of file"), if any. */
  note?: string | null;
}) {
  return (
    <div className="font-mono text-sm leading-relaxed">
      {ops.map((op, i) => (
        <div
          key={i}
          data-diff={op.type}
          className={cn(
            "flex gap-2 px-3",
            op.type === "add"
              ? "bg-diff-add/10 text-diff-add"
              : op.type === "remove"
                ? "bg-diff-remove/10 text-diff-remove"
                : "text-muted-foreground",
          )}
        >
          <span className="w-3 shrink-0 text-center opacity-60 select-none">
            {op.type === "add" ? "+" : op.type === "remove" ? "-" : ""}
          </span>
          <span className="break-all whitespace-pre-wrap">{op.text || " "}</span>
        </div>
      ))}
      {note && (
        <div className="text-muted-foreground flex gap-2 px-3">
          <span className="w-3 shrink-0 text-center opacity-60 select-none">
            \
          </span>
          <span className="italic">{note}</span>
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            onClick={onClick}
            aria-label={label}
            className="text-muted-foreground hover:text-foreground"
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
