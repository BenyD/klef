import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "./ui/button.tsx";

interface ErrorBoundaryState {
  error: Error | null;
  /** Correlation id shown to the user and attached to telemetry. */
  digest: string | null;
  /** React component stack of the crash; rendered on screen in dev only. */
  componentStack: string | null;
}

/**
 * Last-resort catch for render crashes (the SPA equivalent of Next's
 * error.tsx): shows a recoverable screen instead of a blank page. Uses plain
 * anchors, not router links, so it still works if routing itself broke.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
    digest: null,
    componentStack: null,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Boundary-caught errors never reach window.onerror, so error trackers
    // must be called from here. The digest correlates what the user sees
    // with the captured event, e.g. once PostHog lands:
    //   posthog.captureException(error, { digest });
    const digest = crypto.randomUUID().slice(0, 8);
    this.setState({ digest, componentStack: info.componentStack ?? null });
    console.error(`[${digest}]`, error, info.componentStack ?? "");
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          error={this.state.error}
          digest={this.state.digest}
          componentStack={this.state.componentStack}
          onRetry={() =>
            this.setState({ error: null, digest: null, componentStack: null })
          }
        />
      );
    }
    return this.props.children;
  }
}

// In production the raw error stays in the console only (with the digest);
// on screen it would just be noise, and it can reference user data. In dev
// the full stack is rendered inline so crashes are debuggable at a glance.
function ErrorScreen({
  error,
  digest,
  componentStack,
  onRetry,
}: {
  error: Error;
  digest: string | null;
  componentStack: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-lg">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-sm">
          The page crashed. Your vault data is safe.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload page
        </Button>
        <Button onClick={onRetry}>Try again</Button>
      </div>
      {digest && (
        <p className="text-muted-foreground/70 font-mono text-xs">
          Digest: {digest}
        </p>
      )}
      {import.meta.env.DEV && (
        <pre className="bg-muted/50 max-h-80 w-full max-w-2xl overflow-auto rounded-lg border p-4 text-left font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {error.stack ?? `${error.name}: ${error.message}`}
          {componentStack && (
            <span className="text-muted-foreground">
              {"\n\nComponent stack:"}
              {componentStack}
            </span>
          )}
        </pre>
      )}
    </div>
  );
}
