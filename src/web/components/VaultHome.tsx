import { useState } from "react";
import { FolderTree } from "lucide-react";
import { TopBar } from "./TopBar.tsx";
import { StructureNav, type SelectedFile } from "./StructureNav.tsx";
import { FilePane } from "./FilePane.tsx";
import { useTree } from "../use-tree.ts";

export function VaultHome({ email }: { email: string }) {
  const { tree, error, reload } = useTree();
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  return (
    <div className="flex h-svh flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r p-3">
          {error && <p className="text-destructive px-2 text-sm">{error}</p>}
          {tree ? (
            <StructureNav
              tree={tree}
              reload={reload}
              selectedFileId={selected?.id ?? null}
              onSelectFile={setSelected}
            />
          ) : (
            <p className="text-muted-foreground p-2 text-sm">Loading…</p>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <FilePane key={selected.id} file={selected} onSaved={reload} />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-xl">
                  <FolderTree className="size-5" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Select an env file, or create a workspace → project → file to get
                  started.
                </p>
                <p className="text-muted-foreground/70 text-xs">
                  Signed in as {email}.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
