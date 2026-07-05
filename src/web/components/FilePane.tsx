import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Copy, Download, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { decryptBlob, encryptBlob } from "../../shared/crypto.ts";
import { diffLines, diffStats, isUnchanged } from "../../shared/diff.ts";
import {
  getCurrentVersion,
  getVersion,
  listVersions,
  saveVersion,
  type VersionSummary,
} from "../structure-api.ts";
import { useVault } from "../vault-session.tsx";
import type { SelectedFile } from "../vault-types.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "./ui/empty.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

interface Props {
  file: SelectedFile;
  onSaved: () => void;
}

// The heart of Klef: paste, decrypt current in-browser, diff, save. The server
// only ever sees opaque blobs across this whole flow.
export function FilePane({ file, onSaved }: Props) {
  const { dek } = useVault();
  const [stored, setStored] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("editor");
  const [history, setHistory] = useState<VersionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTab("editor");
    setHistory(null);
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
  const changed = !isUnchanged(stored, draft);

  const refreshHistory = useCallback(async () => {
    setHistory((await listVersions(file.id)).versions);
  }, [file.id]);

  async function onSave() {
    if (!dek || !changed) return;
    setSaving(true);
    try {
      const blob = await encryptBlob(dek, draft);
      await saveVersion(file.id, blob);
      setStored(draft);
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

  async function onTabChange(value: string) {
    setTab(value);
    if (value === "history" && !history) {
      try {
        await refreshHistory();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    }
  }

  // Load an older version into the editor as the draft; the diff vs current
  // shows what restoring would change, and Save makes it the new version.
  async function loadVersion(versionId: string) {
    if (!dek) return;
    try {
      const { version } = await getVersion(file.id, versionId);
      setDraft(await decryptBlob(dek, version.blob));
      setTab("editor");
      toast.info("Loaded into editor. Save to restore.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-mono text-sm">
          {changed ? (
            <>
              <span className="text-emerald-600">+{stats.added}</span>{" "}
              <span className="text-rose-600">-{stats.removed}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No unsaved changes</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <IconAction label="Copy" onClick={copyToClipboard}>
            <Copy />
          </IconAction>
          <IconAction label="Export" onClick={exportFile}>
            <Download />
          </IconAction>
          {changed && (
            <IconAction label="Discard changes" onClick={() => setDraft(stored)}>
              <RotateCcw />
            </IconAction>
          )}
          <Button size="sm" onClick={() => void onSave()} disabled={!changed || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save version
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={onTabChange} className="flex flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="changes">
            Changes
            {changed && (
              <Badge variant="secondary" className="ml-1.5 font-normal">
                {stats.added + stats.removed}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" keepMounted className="mt-3 flex-1">
          <Textarea
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste your .env contents here..."
            className="h-full min-h-80 font-mono text-sm leading-relaxed"
          />
        </TabsContent>

        <TabsContent value="changes" keepMounted className="mt-3 flex-1">
          {changed ? (
            <div className="overflow-hidden rounded-md border font-mono text-xs leading-relaxed">
              {ops.map((op, i) => (
                <div
                  key={i}
                  data-diff={op.type}
                  className={`flex gap-2 px-3 ${
                    op.type === "add"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : op.type === "remove"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                        : "text-muted-foreground"
                  }`}
                >
                  <span className="w-3 shrink-0 text-center opacity-60 select-none">
                    {op.type === "add" ? "+" : op.type === "remove" ? "-" : ""}
                  </span>
                  <span className="break-all whitespace-pre-wrap">
                    {op.text || " "}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No changes</EmptyTitle>
                <EmptyDescription>
                  Edit the file in the editor to see a line-by-line diff here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </TabsContent>

        <TabsContent value="history" keepMounted className="mt-3 flex-1">
          {!history ? (
            <Skeleton className="h-24 w-full" />
          ) : history.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No versions yet</EmptyTitle>
                <EmptyDescription>Saved versions will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y rounded-md border">
              {history.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="text-muted-foreground flex items-center gap-2 text-sm">
                    {new Date(v.createdAt).toLocaleString()}
                    {v.isCurrent && (
                      <Badge variant="secondary" className="font-normal">
                        current
                      </Badge>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadVersion(v.id)}
                  >
                    Load into editor
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
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
          <Button variant="ghost" size="icon" onClick={onClick} aria-label={label}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
