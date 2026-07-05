import { useCallback, useEffect, useState } from "react";
import type { VaultTree } from "../shared/api-types.ts";
import { getTree } from "./structure-api.ts";

export function useTree() {
  const [tree, setTree] = useState<VaultTree | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTree(await getTree());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Loading = first fetch still in flight. Callers must not render empty
  // states from a null tree, or they flash before the data arrives.
  return { tree, loading: tree === null && error === null, error, reload };
}
