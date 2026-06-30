import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, History, Loader2, Save, Undo2 } from "lucide-react";
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
import type { SelectedFile } from "./StructureNav.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Textarea } from "./ui/textarea.tsx";

interface Props {
  file: SelectedFile;
  onSaved: () => void;
}

// The heart of Klef: paste → decrypt current in-browser → diff → save. The
// server only ever sees opaque blobs across this whole flow.
export function FilePane({ file, onSaved }: Props) {
  const { dek } = useVault();
  const [stored, setStored] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<VersionSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setJustSaved(false);
    getCurrentVersion(file.id)
      .then(async ({ version }) => {
        const text = version && dek ? await decryptBlob(dek, version.blob) : "";
        if (cancelled) return;
        setStored(text);
        setDraft(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
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
    setError(null);
    try {
      const blob = await encryptBlob(dek, draft);
      await saveVersion(file.id, blob);
      setStored(draft);
      setJustSaved(true);
      onSaved();
      if (history) await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
  }

  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    try {
      await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Load an older version into the editor as the draft; the diff vs current
  // shows what restoring would change, and Save makes it the new version.
  async function loadVersion(versionId: string) {
    if (!dek) return;
    try {
      const { version } = await getVersion(file.id, versionId);
      setDraft(await decryptBlob(dek, version.blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-lg font-medium">{file.name}</h2>
        <div className="flex items-center gap-1.5">
          {changed ? (
            <span className="mr-1 font-mono text-sm">
              <span className="text-emerald-600">+{stats.added}</span>{" "}
              <span className="text-rose-600">−{stats.removed}</span>
            </span>
          ) : (
            justSaved && (
              <span className="text-muted-foreground mr-1 flex items-center gap-1 text-sm">
                <Check className="size-3.5 text-emerald-600" />
                Saved
              </span>
            )
          )}
          <Button variant="ghost" size="sm" onClick={copyToClipboard} disabled={loading}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="ghost" size="sm" onClick={exportFile} disabled={loading}>
            <Download />
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void toggleHistory()}
            disabled={loading}
            className={history ? "bg-accent" : undefined}
          >
            <History />
            History
          </Button>
          {changed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(stored)}
              disabled={saving}
            >
              <Undo2 />
              Discard
            </Button>
          )}
          <Button size="sm" onClick={() => void onSave()} disabled={!changed || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "Saving…" : "Save version"}
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive mb-3 text-sm">{error}</p>}

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Decrypting…
        </div>
      ) : (
        <>
          <Textarea
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste your .env contents here…"
            className="min-h-80 font-mono text-sm leading-relaxed"
          />

          {changed && (
            <section className="mt-6">
              <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                Changes
              </h3>
              <div className="overflow-hidden rounded-md border font-mono text-xs leading-relaxed">
                {ops.map((op, i) => (
                  <div
                    key={i}
                    data-diff={op.type}
                    className={`flex gap-2 px-3 ${
                      op.type === "add"
                        ? "bg-emerald-50 text-emerald-700"
                        : op.type === "remove"
                          ? "bg-rose-50 text-rose-700"
                          : "text-muted-foreground"
                    }`}
                  >
                    <span className="w-3 shrink-0 text-center opacity-60 select-none">
                      {op.type === "add" ? "+" : op.type === "remove" ? "−" : ""}
                    </span>
                    <span className="break-all whitespace-pre-wrap">
                      {op.text || " "}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {history && (
            <section className="mt-6">
              <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                Version history
              </h3>
              {history.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No saved versions yet.
                </p>
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
