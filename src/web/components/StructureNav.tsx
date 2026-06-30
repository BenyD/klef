import { useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, FileText, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import type { VaultTree } from "../../shared/api-types.ts";
import * as api from "../structure-api.ts";
import { Input } from "./ui/input.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";

export interface SelectedFile {
  id: string;
  name: string;
}

interface Props {
  tree: VaultTree;
  reload: () => Promise<void>;
  selectedFileId: string | null;
  onSelectFile: (file: SelectedFile | null) => void;
}

type Kind = "workspace" | "project" | "file";

const renamers: Record<Kind, (id: string, name: string) => Promise<unknown>> = {
  workspace: api.renameWorkspace,
  project: api.renameProject,
  file: api.renameFile,
};
const deleters: Record<Kind, (id: string) => Promise<unknown>> = {
  workspace: api.deleteWorkspace,
  project: api.deleteProject,
  file: api.deleteFile,
};

export function StructureNav({ tree, reload, selectedFileId, onSelectFile }: Props) {
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: Kind;
    id: string;
    name: string;
  } | null>(null);

  const run = async (op: Promise<unknown>) => {
    await op;
    await reload();
  };

  function startRename(id: string, current: string) {
    setEditing({ id, value: current });
  }
  async function commitRename(kind: Kind) {
    const next = editing?.value.trim();
    const id = editing?.id;
    setEditing(null);
    if (id && next) await run(renamers[kind](id, next));
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    setPendingDelete(null);
    onSelectFile(null);
    await run(deleters[kind](id));
  }

  const nameCell = (kind: Kind, id: string, node: ReactNode) =>
    editing?.id === id ? (
      <Input
        value={editing.value}
        onChange={(e) => setEditing({ id, value: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commitRename(kind);
          }
          if (e.key === "Escape") setEditing(null);
        }}
        onBlur={() => void commitRename(kind)}
        autoFocus
        className="h-6 px-1.5 text-sm"
      />
    ) : (
      node
    );

  return (
    <nav className="flex flex-col gap-1 text-sm">
      {tree.workspaces.length === 0 && (
        <p className="text-muted-foreground px-2 py-1.5 text-sm">
          No workspaces yet — create one to start.
        </p>
      )}

      {tree.workspaces.map((w) => (
        <div key={w.id} className="mb-1">
          <Row>
            <Folder className="text-muted-foreground size-3.5 shrink-0" />
            {nameCell(
              "workspace",
              w.id,
              <span className="truncate font-medium">{w.name}</span>,
            )}
            <Controls>
              <Ctrl title="Rename workspace" onClick={() => startRename(w.id, w.name)}>
                <Pencil className="size-3.5" />
              </Ctrl>
              <Ctrl
                title="Delete workspace"
                onClick={() => setPendingDelete({ kind: "workspace", id: w.id, name: w.name })}
              >
                <Trash2 className="size-3.5" />
              </Ctrl>
            </Controls>
          </Row>

          <div className="mt-0.5 ml-2 flex flex-col gap-0.5 border-l pl-2">
            {w.projects.map((p) => (
              <div key={p.id}>
                <Row>
                  <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                  {nameCell(
                    "project",
                    p.id,
                    <span className="truncate">{p.name}</span>,
                  )}
                  <Controls>
                    <Ctrl title="Rename project" onClick={() => startRename(p.id, p.name)}>
                      <Pencil className="size-3.5" />
                    </Ctrl>
                    <Ctrl
                      title="Delete project"
                      onClick={() => setPendingDelete({ kind: "project", id: p.id, name: p.name })}
                    >
                      <Trash2 className="size-3.5" />
                    </Ctrl>
                  </Controls>
                </Row>

                <div className="ml-2 flex flex-col gap-0.5 border-l pl-2">
                  {p.files.map((f) => (
                    <Row key={f.id} active={f.id === selectedFileId}>
                      <FileText className="text-muted-foreground size-3.5 shrink-0" />
                      {nameCell(
                        "file",
                        f.id,
                        <button
                          className="truncate text-left"
                          onClick={() => onSelectFile({ id: f.id, name: f.name })}
                        >
                          {f.name}
                        </button>,
                      )}
                      <Controls>
                        <Ctrl title="Rename file" onClick={() => startRename(f.id, f.name)}>
                          <Pencil className="size-3.5" />
                        </Ctrl>
                        <Ctrl
                          title="Delete file"
                          onClick={() => setPendingDelete({ kind: "file", id: f.id, name: f.name })}
                        >
                          <Trash2 className="size-3.5" />
                        </Ctrl>
                      </Controls>
                    </Row>
                  ))}
                  <InlineAdd
                    label="file"
                    placeholder=".env.local"
                    onAdd={(name) => run(api.createFile(p.id, name))}
                  />
                </div>
              </div>
            ))}
            <InlineAdd
              label="project"
              placeholder="project name"
              onAdd={(name) => run(api.createProject(w.id, name))}
            />
          </div>
        </div>
      ))}

      <InlineAdd
        label="workspace"
        placeholder="workspace name"
        prominent
        onAdd={(name) => run(api.createWorkspace(name))}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === "file"
                ? "This permanently deletes the file and all its saved versions."
                : `This permanently deletes the ${pendingDelete?.kind} and everything inside it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}

function Row({
  children,
  active,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={`group flex h-7 items-center gap-1.5 rounded-md px-1.5 ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
      }`}
    >
      {children}
    </div>
  );
}

function Controls({ children }: { children: ReactNode }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
      {children}
    </div>
  );
}

function Ctrl({
  title,
  onClick,
  children,
  hidden,
}: {
  title: string;
  onClick: () => void;
  children?: ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="text-muted-foreground hover:bg-background hover:text-foreground flex size-6 items-center justify-center rounded"
    >
      {children}
    </button>
  );
}

function InlineAdd({
  label,
  placeholder,
  onAdd,
  prominent,
}: {
  label: string;
  placeholder: string;
  onAdd: (name: string) => Promise<void> | void;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    await onAdd(name);
    setValue("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex h-7 items-center gap-1.5 rounded-md px-1.5 text-left text-xs ${
          prominent
            ? "text-foreground mt-1 font-medium"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Plus className="size-3.5" />
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="px-1 py-0.5">
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value.trim() && setOpen(false)}
        className="h-7 text-sm"
      />
    </form>
  );
}
