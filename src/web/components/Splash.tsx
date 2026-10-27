import { KlefMark } from "./KlefMark.tsx";

/**
 * The loading screen, shown while a session resolves on /auth and /cli and
 * while /docs hands over to the static site. The app's canvas, the woven
 * asterisk weaving itself (one loop after another, see global.css), the
 * wordmark under it, and a hairline that says something is happening. Quiet
 * on purpose: it is on screen for a few hundred milliseconds. Reduced motion
 * shows the finished mark and no line.
 */
export function Splash() {
  return (
    <div
      className="klef-splash bg-sidebar flex min-h-svh flex-col items-center justify-center gap-5"
      role="status"
      aria-label="Loading"
    >
      <div className="klef-splash-mark text-foreground">
        <KlefMark className="size-10" accent="var(--primary)" />
      </div>
      <span className="text-foreground text-lg font-semibold tracking-[-0.03em]" aria-hidden="true">
        klef
      </span>
      <span className="klef-splash-line" aria-hidden="true" />
    </div>
  );
}
