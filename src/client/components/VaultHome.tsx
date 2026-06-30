import { useState } from "react";
import { TopBar } from "./TopBar.tsx";
import { StructureNav, type SelectedFile } from "./StructureNav.tsx";
import { useTree } from "../use-tree.ts";

export function VaultHome({ email }: { email: string }) {
  const { tree, error, reload } = useTree();
  const [selected, setSelected] = useState<SelectedFile | null>(null);

  return (
    <div className="app-shell">
      <TopBar />
      <div className="workbench">
        <aside className="sidebar">
          {error && <p className="bad small">{error}</p>}
          {tree ? (
            <StructureNav
              tree={tree}
              reload={reload}
              selectedFileId={selected?.id ?? null}
              onSelectFile={setSelected}
            />
          ) : (
            <p className="muted small">Loading…</p>
          )}
        </aside>

        <main className="pane">
          {selected ? (
            <FilePanePlaceholder file={selected} />
          ) : (
            <div className="pane-empty">
              <p className="muted">
                Select an env file, or create a workspace → project → file to get
                started.
              </p>
              <p className="muted small">Signed in as {email}.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Replaced in Phase 5 by the real paste → diff → save loop.
function FilePanePlaceholder({ file }: { file: SelectedFile }) {
  return (
    <div className="pane-file">
      <h2 className="pane-title">{file.name}</h2>
      <p className="muted small">
        The paste → in-browser diff → save loop lands here next (Phase 5).
      </p>
    </div>
  );
}
