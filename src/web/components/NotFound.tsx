import { Link } from "react-router";
import { KlefMark } from "./KlefMark.tsx";
import { buttonVariants } from "./ui/button.tsx";

/**
 * Catch-all route: anything that isn't a page or a workspace URL. The same
 * canvas and mark as the splash, with the one line that matters.
 */
export function NotFound() {
  return (
    <div className="klef-screen bg-sidebar flex min-h-svh flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="text-muted-foreground">
          <KlefMark className="size-10" accent="var(--primary)" />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground font-mono text-xs tracking-wordmark" aria-hidden="true">
            404
          </p>
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="text-muted-foreground text-sm">
            There's nothing at this address.
          </p>
        </div>
        <Link to="/" className={buttonVariants({ variant: "outline" })}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
