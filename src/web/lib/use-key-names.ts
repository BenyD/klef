import { useEffect, useRef, useState } from "react";
import { decryptBlob } from "../../shared/crypto.ts";
import type { WorkspaceNode } from "../../shared/api-types.ts";
import { getCurrentVersion } from "../structure-api.ts";
import { useVault } from "../vault-context.ts";
import { detectFormat } from "./config-format.ts";
import { keysOf } from "./env-drift.ts";

/** Key names per file id, for the files whose keys are known so far. */
export type KeyNames = ReadonlyMap<string, readonly string[]>;

/**
 * Key names (never values) of every dotenv file in the workspace, for the
 * command menu. Files are decrypted in the browser only while `active` (the
 * menu is open) and the vault is unlocked; each file's names are cached
 * against its current version id, so reopening the menu only decrypts what
 * changed. The decrypted text is dropped as soon as its names are read, and
 * the cache lives in this component, so locking (which unmounts the vault
 * UI) discards it.
 */
export function useKeyNames(
  workspace: WorkspaceNode | null,
  active: boolean,
): { names: KeyNames; loading: boolean } {
  const { dek } = useVault();
  const cache = useRef(
    new Map<string, { versionId: string; keys: string[] }>(),
  );
  const [names, setNames] = useState<KeyNames>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !dek || !workspace) return;
    let cancelled = false;
    const files = workspace.projects
      .flatMap((p) => p.files)
      .filter(
        (f) =>
          f.currentVersionId !== null && detectFormat(f.name) === "dotenv",
      );
    const stale = files.filter(
      (f) => cache.current.get(f.id)?.versionId !== f.currentVersionId,
    );

    const publish = () =>
      setNames(
        new Map(
          files.flatMap((f) => {
            const hit = cache.current.get(f.id);
            return hit ? [[f.id, hit.keys] as const] : [];
          }),
        ),
      );

    publish();
    setLoading(stale.length > 0);
    if (stale.length === 0) return;
    Promise.all(
      stale.map(async (f) => {
        const { version } = await getCurrentVersion(f.id);
        if (!version) return;
        const text = await decryptBlob(dek, version.blob);
        cache.current.set(f.id, { versionId: version.id, keys: keysOf(text) });
      }),
    )
      // A file that fails to load just has no keys to offer; the menu's
      // file and action search are unaffected.
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        publish();
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, dek, workspace]);

  return { names, loading };
}
