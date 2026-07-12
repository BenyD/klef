import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, CircleAlert, Fingerprint } from "lucide-react";
import { KlefMark } from "./KlefMark.tsx";
import {
  signInWithGitHub,
  signInWithGoogle,
  signInWithPasskey,
} from "../auth.ts";
import { isPasskeyCancel } from "../lib/passkey-cancel.ts";
import { useReturnPath } from "../lib/return-path.ts";
import { Button, buttonVariants } from "./ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

export function AuthPage() {
  const navigate = useNavigate();
  // Where to land after auth: the workspace URL that bounced here, or /app.
  const returnPath = useReturnPath() ?? "/app";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth: the provider redirects away on success, so only failures return.
  async function onOAuth(start: (callbackURL: string) => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await start(returnPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function onPasskeySignIn() {
    setBusy(true);
    setError(null);
    const res = await signInWithPasskey();
    if (res?.error) {
      if (!isPasskeyCancel(res.error)) {
        setError(res.error.message ?? "Couldn't sign in with a passkey");
      }
      setBusy(false);
      return;
    }
    navigate(returnPath);
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-10">
      <Link
        to="/"
        className={`${buttonVariants({ variant: "ghost", size: "sm" })} text-muted-foreground absolute top-4 left-4`}
      >
        <ArrowLeft />
        Back
      </Link>
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link to="/" aria-label="Klef home">
        <div className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl">
          <KlefMark className="size-6" />
        </div>
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Welcome to Klef
          </CardTitle>
          <CardDescription>Sign in or create your account.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void onOAuth(signInWithGoogle)}
              disabled={busy}
            >
              <GoogleMark />
              Continue with Google
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void onOAuth(signInWithGitHub)}
              disabled={busy}
            >
              <GitHubMark />
              Continue with GitHub
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-sm">or</span>
            <span className="bg-border h-px flex-1" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => void onPasskeySignIn()}
            disabled={busy}
          >
            <Fingerprint />
            Sign in with a passkey
          </Button>
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground w-full text-center text-xs leading-relaxed">
            By continuing, you agree to Klef's{" "}
            <Link
              to="/terms"
              className="hover:text-foreground underline underline-offset-2"
            >
              Terms
            </Link>{" "}
            and{" "}
            <Link
              to="/privacy"
              className="hover:text-foreground underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </CardFooter>
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

function GitHubMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
