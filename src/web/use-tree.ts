import { useCallback, useEffect, useState } from "react";
import type { VaultTree } from "../shared/api-types.ts";
import { getTree } from "./structure-api.ts";
import { takePrefetchedTree } from "./app-prefetch.ts";

export function useTree() {
  const [tree, setTree] = useState<VaultTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (request: Promise<VaultTree>) => {
    try {
      setTree(await request);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const reload = useCallback(() => load(getTree()), [load]);

  useEffect(() => {
    // The first load reuses the request AppArea started with the session.
    void load(takePrefetchedTree() ?? getTree());
  }, [load]);

  // Loading = first fetch still in flight. Callers must not render empty
  // states from a null tree, or they flash before the data arrives.
  return { tree, loading: tree === null && error === null, error, reload };
}
