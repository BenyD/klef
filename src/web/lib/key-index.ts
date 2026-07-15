// A searchable index of which env files define which keys. Built from
// decrypted text in the browser (the server never sees keys), so a user can
// answer "where is STRIPE_SECRET_KEY set?" across the whole vault. Reuses the
// same key extraction as drift; the future CLI's `klef find` reuses this too.

import { keysOf } from "./env-drift.ts";

export interface KeyFile {
  fileId: string;
  fileName: string;
  project: string;
  workspace: string;
  environment: string | null;
  text: string;
}

export interface KeyLocation {
  fileId: string;
  fileName: string;
  project: string;
  workspace: string;
  environment: string | null;
}

export interface KeyMatch {
  key: string;
  locations: KeyLocation[];
}

/**
 * Index files by key: every key mapped to the files that define it, sorted by
 * key. A file contributes its location once per distinct key it holds.
 */
export function buildKeyIndex(files: KeyFile[]): KeyMatch[] {
  const byKey = new Map<string, KeyLocation[]>();
  for (const f of files) {
    const location: KeyLocation = {
      fileId: f.fileId,
      fileName: f.fileName,
      project: f.project,
      workspace: f.workspace,
      environment: f.environment,
    };
    for (const key of keysOf(f.text)) {
      const list = byKey.get(key);
      if (list) list.push(location);
      else byKey.set(key, [location]);
    }
  }
  return [...byKey.entries()]
    .map(([key, locations]) => ({ key, locations }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Case-insensitive substring search over the indexed keys. An empty query
 * returns everything, so a freshly opened search shows the full key list.
 */
export function searchKeys(index: KeyMatch[], query: string): KeyMatch[] {
  const q = query.trim().toLowerCase();
  if (q === "") return index;
  return index.filter((m) => m.key.toLowerCase().includes(q));
}
