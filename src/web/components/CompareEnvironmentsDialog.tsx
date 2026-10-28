import { useEffect, useMemo, useState } from "react";
import { Check, Columns3, Minus, TriangleAlert } from "lucide-react";
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
} from "../../shared/env-drift.ts";
import { detectFormat } from "../lib/config-format.ts";
import { envLabel } from "../lib/env-meta.ts";
import { effectiveEnvironment } from "../../shared/env-from-name.ts";
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
import { Skeleton, SkeletonText } from "./ui/skeleton.tsx";
import { LoadingStatus } from "./ui/loading-status.tsx";

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
  const fileNames = new Map(project?.files.map((f) => [f.id, f.name]) ?? []);
  const [files, setFiles] = useState<DriftFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !dek) return;
    let cancelled = false;
    setFiles(null);
    setError(null);

    // Only dotenv files take part; label each column by the environment the
    // file stands for (its label, else what its name says), or its filename
    // when neither says anything.
    const dotenv = project.files.filter(
      (f) => detectFormat(f.name) === "dotenv",
    );
    Promise.all(
      dotenv.map(async (f) => {
        const { version } = await getCurrentVersion(f.id);
        const text = version ? await decryptBlob(dek, version.blob) : "";
        return {
          id: f.id,
          label: effectiveEnvironment(f.name, f.environment) ?? f.name,
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
            Keys across {project?.name}'s environments, and where values
            differ. Decrypted in your browser only.
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
          <CompareSkeleton
            columns={
              project?.files.filter((f) => detectFormat(f.name) === "dotenv")
                .length ?? 0
            }
          />
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
                  <DriftHead
                    columns={report.columns}
                    fileNames={fileNames}
                  />
                  <tbody className="[&>tr:last-child>td]:border-b-0">
                    {report.rows.map((row) => (
                      <tr key={row.key} className="hover:bg-muted">
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
                  Some differences are meant to be, like a debug flag only
                  in development.
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
                      <DriftHead
                    columns={report.columns}
                    fileNames={fileNames}
                  />
                      <tbody className="[&>tr:last-child>td]:border-b-0">
                        {report.diff.map((row) => (
                          <tr key={row.key} className="hover:bg-muted">
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
                    Only keys that differ are listed.
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
  fileNames,
}: {
  columns: DriftColumn[];
  /** File id to name: the second line, since two files can share an environment. */
  fileNames: ReadonlyMap<string, string>;
}) {
  return (
    <thead>
      <tr>
        <th className="bg-background sticky top-0 z-10 border-b px-3 py-2 text-left font-medium">
          Key
        </th>
        {columns.map((col) => {
          const name = fileNames.get(col.id);
          return (
            <th
              key={col.id}
              className="bg-background sticky top-0 z-10 border-b px-3 py-2 text-center font-medium whitespace-nowrap"
            >
              <span className="flex flex-col items-center">
                {envLabel(col.label)}
                {name && name !== col.label && (
                  <span className="text-muted-foreground font-mono text-xs font-normal">
                    {name}
                  </span>
                )}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

/**
 * The Keys tab while the files decrypt: tab switch, summary line, and the
 * table with a column per dotenv file (known before decrypting) and rows of
 * the same 28px height as the real ones.
 */
function CompareSkeleton({ columns }: { columns: number }) {
  // Fewer than two files ends in the empty state, not a table.
  if (columns < 2) {
    return (
      <div aria-busy="true" className="py-8">
        <LoadingStatus>Decrypting environments</LoadingStatus>
      </div>
    );
  }
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <LoadingStatus>Decrypting environments</LoadingStatus>
      {/* TabsList: Keys / Values */}
      <Skeleton className="h-8 w-[8.25rem] rounded-lg" />
      <p className="text-sm">
        <SkeletonText className="w-64" />
      </p>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="border-b px-3 py-2 text-left font-medium">Key</th>
              {Array.from({ length: columns }, (_, i) => (
                <th key={i} className="border-b px-3 py-2 text-center">
                  <SkeletonText className="w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr:last-child>td]:border-b-0">
            {Array.from({ length: 6 }, (_, r) => (
              <tr key={r}>
                <td className="border-b px-3 py-1.5 font-mono text-xs">
                  <SkeletonText className={r % 3 ? "w-28" : "w-36"} />
                </td>
                {Array.from({ length: columns }, (_, i) => (
                  <td key={i} className="border-b px-3 py-1.5">
                    <Skeleton className="mx-auto size-3.5 rounded-sm" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
