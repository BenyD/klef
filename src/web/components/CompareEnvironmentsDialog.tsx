import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Minus } from "lucide-react";
import { cn } from "../lib/utils.ts";
import { decryptBlob } from "../../shared/crypto.ts";
import { getCurrentVersion } from "../structure-api.ts";
import { compareEnvs, type DriftFile } from "../lib/env-drift.ts";
import { detectFormat } from "../lib/config-format.ts";
import { useEnvMeta } from "../lib/env-meta.ts";
import { useVault } from "../vault-context.ts";
import type { ProjectNode } from "../../shared/api-types.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";

// Compares the dotenv files in a project by key presence, all decrypted in the
// browser. Values are never fetched into the view, only which keys each
// environment has. Non-dotenv files are skipped (their keys don't parse the
// same way); the drift engine and the CLI share the same comparison.
export function CompareEnvironmentsDialog({
  project,
  onClose,
}: {
  project: ProjectNode | null;
  onClose: () => void;
}) {
  const { dek } = useVault();
  const envMeta = useEnvMeta();
  const [files, setFiles] = useState<DriftFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !dek) return;
    let cancelled = false;
    setFiles(null);
    setError(null);

    // Only dotenv files take part; label each column by its environment, or
    // its filename when unlabeled.
    const dotenv = project.files.filter(
      (f) => detectFormat(f.name) === "dotenv",
    );
    Promise.all(
      dotenv.map(async (f) => {
        const { version } = await getCurrentVersion(f.id);
        const text = version ? await decryptBlob(dek, version.blob) : "";
        return {
          id: f.id,
          label: f.environment ?? f.name,
          text,
        } satisfies DriftFile;
      }),
    )
      .then((loaded) => {
        if (!cancelled) setFiles(loaded);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [project, dek]);

  const report = useMemo(
    () => (files ? compareEnvs(files) : null),
    [files],
  );

  return (
    <Dialog open={project !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compare environments</DialogTitle>
          <DialogDescription>
            Which keys each environment in {project?.name} has. Values stay
            hidden.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : !report ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Decrypting environments…
          </div>
        ) : report.columns.length < 2 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Add at least two dotenv files to this project to compare them.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {report.drifted.length === 0 ? (
                <span className="text-success">
                  No drift. Every environment has the same keys.
                </span>
              ) : (
                <span className="text-warning">
                  {report.drifted.length}{" "}
                  {report.drifted.length === 1 ? "key" : "keys"} missing from
                  some environments.
                </span>
              )}
            </p>

            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Key</th>
                    {report.columns.map((col) => {
                      const meta = envMeta(col.label);
                      return (
                        <th
                          key={col.id}
                          className="px-3 py-2 text-center font-medium whitespace-nowrap"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                meta.dot,
                              )}
                            />
                            {meta.label}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                      <tr
                        key={row.key}
                        className="border-t hover:bg-muted/30"
                      >
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {row.key}
                        </td>
                        {row.present.map((present, i) => (
                          <td
                            key={report.columns[i]!.id}
                            className={cn(
                              "px-3 py-1.5 text-center",
                              !present && "bg-warning/10",
                            )}
                          >
                            {present ? (
                              <Check className="text-success mx-auto size-3.5" />
                            ) : (
                              <Minus className="text-warning/70 mx-auto size-3.5" />
                            )}
                          </td>
                        ))}
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.drifted.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Some differences are intentional (a debug flag only in
                development, say). This just surfaces them.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
