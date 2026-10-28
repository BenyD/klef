import { useDelayedLoading } from "../lib/use-delayed-loading.ts";
import { Spinner } from "./ui/spinner.tsx";
import { LoadingStatus } from "./ui/loading-status.tsx";

/**
 * The bare canvas, while a session check decides which screen comes next on
 * /auth and /cli (the sign-in card, the CLI card, or a redirect into the
 * app), and while /docs hands over to the static site. All of those sit on
 * this same canvas, so the wait reads as the next screen arriving rather
 * than as a screen of its own. A spinner appears only if the wait outlasts
 * a beat; usually it never does.
 */
export function PendingScreen() {
  const slow = useDelayedLoading(true);
  return (
    <div
      aria-busy="true"
      className="bg-sidebar text-muted-foreground flex min-h-svh items-center justify-center"
    >
      <LoadingStatus>Loading</LoadingStatus>
      {slow && <Spinner />}
    </div>
  );
}
