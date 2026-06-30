import { useState, type FormEvent, type ReactNode } from "react";
import type { VaultTree } from "../../shared/api-types.ts";
import * as api from "../structure-api.ts";

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

export function StructureNav({ tree, reload, selectedFileId, onSelectFile }: Props) {
  const run = async (op: Promise<unknown>) => {
    await op;
    await reload();
  };

  return (
    <nav className="tree">
      {tree.workspaces.length === 0 && (
        <p className="muted small">No workspaces yet — create one to start.</p>
      )}

      {tree.workspaces.map((w) => (
        <div key={w.id} className="tree-ws">
          <div className="tree-row tree-head">
            <span className="tree-name">{w.name}</span>
            <span className="tree-controls">
              <IconBtn
                title="Rename workspace"
                onClick={() => {
                  const name = prompt("Rename workspace", w.name);
                  if (name) void run(api.renameWorkspace(w.id, name));
                }}
              >
                ✎
              </IconBtn>
              <IconBtn
                title="Delete workspace"
                onClick={() => {
                  if (confirm(`Delete "${w.name}" and everything in it?`)) {
                    onSelectFile(null);
                    void run(api.deleteWorkspace(w.id));
                  }
                }}
              >
                ×
              </IconBtn>
            </span>
          </div>

          {w.projects.map((p) => (
            <div key={p.id} className="tree-proj">
              <div className="tree-row">
                <span className="tree-name tree-proj-name">{p.name}</span>
                <span className="tree-controls">
                  <IconBtn
                    title="Rename project"
                    onClick={() => {
                      const name = prompt("Rename project", p.name);
                      if (name) void run(api.renameProject(p.id, name));
                    }}
                  >
                    ✎
                  </IconBtn>
                  <IconBtn
                    title="Delete project"
                    onClick={() => {
                      if (confirm(`Delete project "${p.name}" and its files?`)) {
                        onSelectFile(null);
                        void run(api.deleteProject(p.id));
                      }
                    }}
                  >
                    ×
                  </IconBtn>
                </span>
              </div>

              {p.files.map((f) => (
                <div
                  key={f.id}
                  className={`tree-row tree-file ${f.id === selectedFileId ? "active" : ""}`}
                >
                  <button
                    className="tree-name file-name"
                    onClick={() => onSelectFile({ id: f.id, name: f.name })}
                  >
                    {f.name}
                  </button>
                  <span className="tree-controls">
                    <IconBtn
                      title="Rename file"
                      onClick={() => {
                        const name = prompt("Rename file", f.name);
                        if (name) void run(api.renameFile(f.id, name));
                      }}
                    >
                      ✎
                    </IconBtn>
                    <IconBtn
                      title="Delete file"
                      onClick={() => {
                        if (confirm(`Delete "${f.name}"?`)) {
                          if (f.id === selectedFileId) onSelectFile(null);
                          void run(api.deleteFile(f.id));
                        }
                      }}
                    >
                      ×
                    </IconBtn>
                  </span>
                </div>
              ))}

              <InlineAdd
                label="file"
                placeholder=".env.local"
                onAdd={(name) => run(api.createFile(p.id, name))}
              />
            </div>
          ))}

          <InlineAdd
            label="project"
            placeholder="project name"
            onAdd={(name) => run(api.createProject(w.id, name))}
          />
        </div>
      ))}

      <InlineAdd
        label="workspace"
        placeholder="workspace name"
        prominent
        onAdd={(name) => run(api.createWorkspace(name))}
      />
    </nav>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className="icon-btn" title={title} onClick={onClick} type="button">
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
        className={`tree-add ${prominent ? "prominent" : ""}`}
        onClick={() => setOpen(true)}
        type="button"
      >
        + {label}
      </button>
    );
  }

  return (
    <form className="tree-add-form" onSubmit={submit}>
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
      />
    </form>
  );
}
