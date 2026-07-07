import { Link } from "react-router";
import { CipherField, Scramble } from "./Splash.tsx";
import { buttonVariants } from "./ui/button.tsx";

/**
 * Catch-all route: anything that isn't a page or a workspace URL. Borrows the
 * splash's visual language: an ambient ciphertext field with the "404"
 * decrypting out of cipher glyphs.
 */
export function NotFound() {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <div className="klef-screen relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4">
      {!reduced && <CipherField />}

      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        {reduced ? (
          <span className="tracking-wordmark text-foreground font-mono text-5xl font-bold">
            404
          </span>
        ) : (
          <Scramble
            value="404"
            mode="reveal"
            className="tracking-wordmark text-foreground font-mono text-5xl font-bold"
          />
        )}
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight">
            Page not found
          </h1>
          <p className="text-muted-foreground text-sm">
            There's nothing at this address.
          </p>
        </div>
        <Link to="/" className={buttonVariants()}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
