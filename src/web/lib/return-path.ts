import { useLocation } from "react-router";

// The in-app path that redirected to /auth, if any (e.g. a workspace URL hit
// while signed out). Only same-origin paths are honored so crafted history
// state can't turn this into an open redirect.
export function useReturnPath(): string | null {
  const { state } = useLocation();
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" &&
    from.startsWith("/") &&
    !from.startsWith("//")
    ? from
    : null;
}
