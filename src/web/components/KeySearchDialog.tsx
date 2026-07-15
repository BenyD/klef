import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "../lib/utils.ts";
import { decryptBlob } from "../../shared/crypto.ts";
import { getCurrentVersion } from "../structure-api.ts";
import { detectFormat } from "../lib/config-format.ts";
import {
  buildKeyIndex,
  searchKeys,
  type KeyFile,
  type KeyMatch,
} from "../lib/key-index.ts";
import { useEnvMeta } from "../lib/env-meta.ts";
import { useVault } from "../vault-context.ts";
import type {
  EnvFileNode,
  ProjectNode,
  WorkspaceNode,
} from "../../shared/api-types.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";

// Searches every dotenv file's keys across the vault: "where is
// STRIPE_SECRET_KEY set?". Files are decrypted in the browser on open and the
// index is discarded on close; only key names are shown, never values.
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
  const { dek } = useVault();
  const envMeta = useEnvMeta();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<KeyMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // fileId → the objects onSelectFile needs to open it.
  const [nav, setNav] = useState<Map<string, { project: ProjectNode; file: EnvFileNode }>>(
    new Map(),
  );

  useEffect(() => {
    if (!open || !dek) return;
    let cancelled = false;
    setQuery("");
    setIndex(null);
    setError(null);

    const targets: {
      workspace: WorkspaceNode;
      project: ProjectNode;
      file: EnvFileNode;
    }[] = [];
    for (const w of workspaces) {
      for (const p of w.projects) {
        for (const f of p.files) {
          if (detectFormat(f.name) === "dotenv") {
            targets.push({ workspace: w, project: p, file: f });
          }
        }
      }
    }

    Promise.all(
      targets.map(async ({ workspace, project, file }): Promise<KeyFile> => {
        const { version } = await getCurrentVersion(file.id);
        const text = version ? await decryptBlob(dek, version.blob) : "";
        return {
          fileId: file.id,
          fileName: file.name,
          project: project.name,
          workspace: workspace.name,
          environment: file.environment,
          text,
        };
      }),
    )
      .then((keyFiles) => {
        if (cancelled) return;
        setIndex(buildKeyIndex(keyFiles));
        setNav(
          new Map(targets.map((t) => [t.file.id, { project: t.project, file: t.file }])),
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, dek, workspaces]);

  const results = useMemo(
    () => (index ? searchKeys(index, query) : []),
    [index, query],
  );

  function openLocation(fileId: string) {
    const entry = nav.get(fileId);
    if (entry) {
      onClose();
      onSelectFile(entry.project, entry.file);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Search keys</DialogTitle>
          <DialogDescription>
            Find which files define a key across every workspace. Values stay
            hidden.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Key name, e.g. STRIPE_SECRET_KEY"
            className="pl-8 font-mono"
          />
        </div>

        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : !index ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Decrypting your files…
          </div>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            {index.length === 0
              ? "No dotenv keys to search yet."
              : "No keys match."}
          </p>
        ) : (
          <div className="-mx-1 max-h-[55vh] overflow-y-auto px-1">
            {results.map((match) => (
              <div key={match.key} className="py-1.5">
                <div className="flex items-baseline gap-2 px-1">
                  <span className="font-mono text-sm font-medium">
                    {match.key}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {match.locations.length}{" "}
                    {match.locations.length === 1 ? "file" : "files"}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-col">
                  {match.locations.map((loc) => {
                    const meta = loc.environment
                      ? envMeta(loc.environment)
                      : null;
                    return (
                      <button
                        key={loc.fileId}
                        type="button"
                        onClick={() => openLocation(loc.fileId)}
                        className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors"
                      >
                        {meta ? (
                          <span
                            className={cn("size-1.5 rounded-full", meta.dot)}
                          />
                        ) : (
                          <span className="size-1.5" />
                        )}
                        <span className="text-muted-foreground truncate">
                          {loc.workspace} / {loc.project} /
                        </span>
                        <span className="truncate font-mono">
                          {loc.fileName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
