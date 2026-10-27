import { KlefMark } from "./KlefMark.tsx";
import { PixelField } from "./PixelField.tsx";

/**
 * The loading screen, shown while a session resolves on /auth and /cli and
 * while /docs hands over to the static site. The app's canvas, the woven
 * asterisk weaving itself (one loop after another, see global.css), the
 * wordmark under it, a hairline that says something is happening, and the
 * pixel field breathing around the edge. Quiet on purpose: it is on screen
 * for a few hundred milliseconds. Reduced motion shows the finished mark,
 * no line and a still field.
 */
export function Splash() {
  return (
    <div
      className="klef-splash bg-sidebar flex min-h-svh flex-col items-center justify-center gap-5"
      role="status"
      aria-label="Loading"
    >
      <PixelField className="klef-splash-field" cell={32} cols={40} rows={24} count={64} seed={5} />
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
