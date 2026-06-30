import { useState } from "react";
import { KeyRound } from "lucide-react";
import { signInWithGoogle } from "../auth.ts";
import { Button } from "./ui/button.tsx";
import { Card, CardContent } from "./ui/card.tsx";

export function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle(); // redirects to Google on success
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl">
          <KeyRound className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Klef</h1>
          <p className="text-muted-foreground mt-1.5 max-w-xs text-sm text-balance">
            Zero-knowledge env sync. Your keys never leave this browser.
          </p>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={onGoogle}
            disabled={busy}
          >
            <GoogleMark />
            {busy ? "Redirecting…" : "Continue with Google"}
          </Button>
          {error && (
            <p className="text-destructive text-sm">
              Couldn’t start sign-in: {error}
            </p>
          )}
          <p className="text-muted-foreground text-xs leading-relaxed">
            Signing in only creates your account. Your secrets are encrypted with
            a separate passphrase that never touches our servers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.9 36.5 44 31 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
