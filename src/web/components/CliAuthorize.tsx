import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Check, Terminal, TriangleAlert } from "lucide-react";
import { apiFetch } from "../api-fetch.ts";
import { normalizeUserCode } from "../../shared/device-code.ts";
import { KlefMark } from "./KlefMark.tsx";
import { CanvasField } from "./PixelField.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

/**
 * Approving a `klef login` from the browser.
 *
 * The code is shown large and compared by eye: the terminal printed one, this
 * page shows one, and they must match. That comparison is the only thing
 * standing between this and someone talking a user into approving *their*
 * login, so the page says so in one line rather than assuming it is obvious.
 *
 * Same canvas and card as the sign-in page, since it is the next thing a
 * terminal sends you to. Reached with ?code= prefilled by the CLI, or typed
 * by hand.
 */
type Pending =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; userCode: string; label: string }
  | { state: "error"; message: string }
  | { state: "approved" }
  | { state: "denied" };

export function CliAuthorize() {
  const [params] = useSearchParams();
  const prefilled = params.get("code") ?? "";
  const [typed, setTyped] = useState(prefilled);
  const [pending, setPending] = useState<Pending>({ state: "idle" });
  const [busy, setBusy] = useState(false);

  const look = useCallback(async (raw: string) => {
    const code = normalizeUserCode(raw);
    if (!code) {
      setPending({ state: "error", message: "That code doesn't look right." });
      return;
    }
    setPending({ state: "loading" });
    try {
      const res = await apiFetch(`/api/cli/device/pending/${encodeURIComponent(code)}`);
      const body = (await res.json()) as
        | { ok: true; userCode: string; label: string }
        | { ok: false; error: string };
      if (!res.ok || !body.ok) {
        setPending({
          state: "error",
          message: body.ok ? "Something went wrong." : body.error,
        });
        return;
      }
      setPending({ state: "found", userCode: body.userCode, label: body.label });
    } catch (err) {
      setPending({
        state: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }, []);

  useEffect(() => {
    if (prefilled) void look(prefilled);
  }, [prefilled, look]);

  async function decide(deny: boolean) {
    if (pending.state !== "found") return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/cli/device/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode: pending.userCode, deny }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setPending({ state: "error", message: body.error ?? "Something went wrong." });
        return;
      }
      setPending({ state: deny ? "denied" : "approved" });
    } finally {
      setBusy(false);
    }
  }

  const asking = pending.state === "idle" || pending.state === "error" || pending.state === "loading";

  return (
    <main className="klef-screen klef-canvas bg-sidebar flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <CanvasField />
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
        <KlefMark className="size-5" />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Terminal className="text-muted-foreground size-4" aria-hidden="true" />
            Connect the CLI
          </CardTitle>
          <CardDescription>
            {pending.state === "approved"
              ? "Your terminal is signed in."
              : pending.state === "denied"
                ? "Nothing was created."
                : "A terminal wants to sign in as you."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {pending.state === "approved" && (
            <Result icon={<Check className="size-4" />} title="Approved">
              You can close this tab.
            </Result>
          )}

          {pending.state === "denied" && (
            <Result icon={<TriangleAlert className="size-4" />} title="Denied">
              If that wasn't you, there is nothing else to do.
            </Result>
          )}

          {asking && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void look(typed);
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="cli-code">Code from your terminal</Label>
                <Input
                  id="cli-code"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="WDJB-MJHT"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="text-center font-mono text-lg tracking-widest"
                />
              </div>
              {pending.state === "error" && (
                <p className="text-destructive text-sm">{pending.message}</p>
              )}
              <Button type="submit" disabled={pending.state === "loading" || !typed.trim()}>
                {pending.state === "loading" ? "Checking..." : "Continue"}
              </Button>
            </form>
          )}

          {pending.state === "found" && (
            <>
              <div className="bg-muted/50 flex flex-col items-center gap-1 rounded-lg border px-4 py-5">
                <span className="font-mono text-2xl tracking-widest">{pending.userCode}</span>
                <span className="text-muted-foreground text-xs">{pending.label}</span>
              </div>
              <p className="text-muted-foreground text-sm">
                Approve only if this matches the code in your terminal.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void decide(true)}
                >
                  Deny
                </Button>
                <Button className="flex-1" disabled={busy} onClick={() => void decide(false)}>
                  {busy ? "Approving..." : "Approve"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                The token can fetch your encrypted files. Reading them still
                needs your passphrase, which stays on your machine.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Result({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="bg-muted/50 flex flex-col gap-1 rounded-lg border px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </span>
      <p className="text-muted-foreground text-sm">{children}</p>
    </div>
  );
}
