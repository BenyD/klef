import { useEffect, useMemo, useState } from "react";
import { Check, Columns3, Loader2, Minus, TriangleAlert } from "lucide-react";
import { cn } from "../lib/utils.ts";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty.tsx";
import { decryptBlob } from "../../shared/crypto.ts";
import { getCurrentVersion } from "../structure-api.ts";
import {
  compareEnvs,
  type DriftColumn,
  type DriftFile,
} from "../lib/env-drift.ts";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";

// Compares the dotenv files in a project, all decrypted in the browser. The
// Keys tab shows which keys each environment has; the Values tab shows only
// the keys that differ, with each environment's value. Nothing decrypted ever
// leaves the browser. Non-dotenv files are skipped (their keys don't parse the
// same way); the drift engine and the CLI share the same comparison.
//
// Table note: the scroll container needs `border-separate` on the table, an
// opaque background on the header cells, and sticky on the `th`s themselves.
// Chrome ignores `position: sticky` on collapsed-border table headers, and a
// translucent header lets rows show through while scrolling.
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
            Which keys each environment in {project?.name} has, and where
            values differ. Everything decrypts only in your browser.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{error}</span>
          </div>
        ) : !report ? (
          <div
            role="status"
            aria-live="polite"
            className="text-muted-foreground flex items-center gap-2 py-8 text-sm"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Decrypting environments…
          </div>
        ) : report.columns.length < 2 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Columns3 />
              </EmptyMedia>
              <EmptyTitle>Nothing to compare yet</EmptyTitle>
              <EmptyDescription>
                Add at least two dotenv files to this project to compare their
                keys.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Tabs defaultValue="keys" className="gap-3">
            <TabsList>
              <TabsTrigger value="keys">Keys</TabsTrigger>
              <TabsTrigger value="values">Values</TabsTrigger>
            </TabsList>

            <TabsContent value="keys" className="flex flex-col gap-3">
              <p className="text-sm text-pretty">
                {report.drifted.length === 0 ? (
                  <span className="text-success">
                    No drift. Every environment has the same keys.
                  </span>
                ) : (
                  <span className="text-warning">
                    <span className="tabular-nums">
                      {report.drifted.length}
                    </span>{" "}
                    {report.drifted.length === 1 ? "key" : "keys"} missing from
                    some environments.
                  </span>
                )}
              </p>

              <div className="max-h-[60vh] overflow-auto rounded-lg border">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <DriftHead columns={report.columns} envMeta={envMeta} />
                  <tbody className="[&>tr:last-child>td]:border-b-0">
                    {report.rows.map((row) => (
                      <tr key={row.key} className="hover:bg-muted/30">
                        <td className="border-b px-3 py-1.5 font-mono text-xs">
                          {row.key}
                        </td>
                        {row.present.map((present, i) => (
                          <td
                            key={report.columns[i]!.id}
                            className={cn(
                              "border-b px-3 py-1.5 text-center",
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
            </TabsContent>

            <TabsContent value="values" className="flex flex-col gap-3">
              {report.diff.length === 0 ? (
                <p className="text-success text-sm text-pretty">
                  No differences. Every environment has the same keys and
                  values.
                </p>
              ) : (
                <>
                  <p className="text-sm text-pretty">
                    <span className="text-warning">
                      <span className="tabular-nums">{report.diff.length}</span>{" "}
                      {report.diff.length === 1 ? "key differs" : "keys differ"}{" "}
                      across environments.
                    </span>
                  </p>

                  <div className="max-h-[60vh] overflow-auto rounded-lg border">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <DriftHead columns={report.columns} envMeta={envMeta} />
                      <tbody className="[&>tr:last-child>td]:border-b-0">
                        {report.diff.map((row) => (
                          <tr key={row.key} className="hover:bg-muted/30">
                            <td className="border-b px-3 py-1.5 font-mono text-xs">
                              {row.key}
                            </td>
                            {row.values.map((value, i) => (
                              <td
                                key={report.columns[i]!.id}
                                className={cn(
                                  "border-b px-3 py-1.5 text-center",
                                  value === null && "bg-warning/10",
                                )}
                              >
                                {value === null ? (
                                  <Minus className="text-warning/70 mx-auto size-3.5" />
                                ) : value === "" ? (
                                  <span className="text-muted-foreground text-xs italic">
                                    empty
                                  </span>
                                ) : (
                                  <span
                                    className="inline-block max-w-56 truncate align-bottom font-mono text-xs"
                                    title={value}
                                  >
                                    {value}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Only keys that differ appear here. Values decrypt in this
                    browser and never reach the server.
                  </p>
                </>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DriftHead({
  columns,
  envMeta,
}: {
  columns: DriftColumn[];
  envMeta: (environment: string) => { label: string; dot: string };
}) {
  return (
    <thead>
      <tr>
        <th className="bg-background sticky top-0 z-10 border-b px-3 py-2 text-left font-medium">
          Key
        </th>
        {columns.map((col) => {
          const meta = envMeta(col.label);
          return (
            <th
              key={col.id}
              className="bg-background sticky top-0 z-10 border-b px-3 py-2 text-center font-medium whitespace-nowrap"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
