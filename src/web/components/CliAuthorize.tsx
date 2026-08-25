import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Check, Terminal, TriangleAlert } from "lucide-react";
import { apiFetch } from "../api-fetch.ts";
import { normalizeUserCode } from "../../shared/device-code.ts";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

/**
 * Approving a `klef login` from the browser.
 *
 * The code is shown large and compared by eye: the terminal printed one, this
 * page shows one, and they must match. That comparison is the only thing
 * standing between this and someone talking a user into approving *their*
 * login, so the page says so rather than assuming it is obvious.
 *
 * Reached with ?code= prefilled by the CLI, or typed by hand.
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

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <span className="bg-muted flex size-9 items-center justify-center rounded-lg">
          <Terminal className="size-4" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Connect the Klef CLI</h1>
        <p className="text-muted-foreground text-sm">
          A terminal is asking to sign in as you. Approving it creates an access
          token that can read your encrypted files and their names. It cannot
          decrypt anything: that still needs your master passphrase, which never
          leaves your machine.
        </p>
      </div>

      {pending.state === "approved" && (
        <Result
          icon={<Check className="size-4" />}
          title="Approved"
          body="Your terminal has the token. You can close this tab."
        />
      )}

      {pending.state === "denied" && (
        <Result
          icon={<TriangleAlert className="size-4" />}
          title="Denied"
          body="Nothing was created. If that wasn't you asking, no action is needed."
        />
      )}

      {(pending.state === "idle" ||
        pending.state === "error" ||
        pending.state === "loading") && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void look(typed);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="cli-code">Enter the code from your terminal</Label>
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
        <div className="flex flex-col gap-4">
          <div className="bg-card flex flex-col items-center gap-1 rounded-xl border p-4">
            <span className="text-muted-foreground text-xs">Code shown in your terminal</span>
            <span className="font-mono text-2xl tracking-widest">{pending.userCode}</span>
            <span className="text-muted-foreground text-xs">from {pending.label}</span>
          </div>
          <p className="text-muted-foreground text-sm">
            Only approve this if that code matches the one your own terminal is
            showing. If you didn't start this, deny it.
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
        </div>
      )}
    </main>
  );
}

function Result({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-4">
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </span>
      <p className="text-muted-foreground text-sm">{body}</p>
    </div>
  );
}
