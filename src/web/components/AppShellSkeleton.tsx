import { useState } from "react";
import { readLayoutHint } from "../lib/layout-hint.ts";
import { ShellSkeleton } from "./skeletons.tsx";
import { LoadingStatus } from "./ui/loading-status.tsx";

/**
 * Shown while the session, the app chunk and the vault resolve on a cold
 * load of /app or a workspace URL. It is VaultHome drawn as placeholders,
 * in the shape this device last saw (project and file counts, expanded
 * projects, an open file; see lib/layout-hint.ts), so the real screen lands
 * in place. The sidebar is drawn open; that is the default state.
 */
export function AppShellSkeleton() {
  const [hint] = useState(readLayoutHint);
  return (
    <div aria-busy="true">
      <LoadingStatus>Loading your vault</LoadingStatus>
      <ShellSkeleton hint={hint} />
    </div>
  );
}
