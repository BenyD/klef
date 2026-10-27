import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Check, Terminal, TriangleAlert } from "lucide-react";
import { apiFetch } from "../api-fetch.ts";
import { fetchVault } from "../vault-api.ts";
import { normalizeUserCode } from "../../shared/device-code.ts";
import type { DeviceJwk } from "../../shared/device-seal.ts";
import { getPrfSecret, PasskeyPrfError } from "../lib/passkey-prf.ts";
import { preferredMethod, sealVaultKeyForCli, WrongPassphraseForCliError } from "../lib/cli-unlock.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { PasswordInput } from "./ui/password-input.tsx";

/**
 * Approving a `klef login` from the browser.
 *
 * The code is shown large and compared by eye: the terminal printed one, this
 * page shows one, and they must match. That comparison is the only thing
 * standing between this and someone talking a user into approving *their*
 * login, so the page says so rather than assuming it is obvious.
 *
 * Reached with ?code= prefilled by the CLI, or typed by hand.
 *
 * "Also unlock the CLI on this device" hands the CLI the vault key, end to
 * end: the page recovers it from a passkey or the passphrase (the tab's own
 * key cannot be exported, by design), seals it to the public key the CLI sent,
 * and the server only relays the sealed blob. See lib/cli-unlock.ts.
 */
type Pending =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; userCode: string; label: string; publicJwk: DeviceJwk }
  | { state: "error"; message: string }
  | { state: "approved"; unlocked: boolean }
  | { state: "denied" };

/** How this account can unlock, learned once the request is found. */
type UnlockOffer = { available: false } | { available: true; method: "passkey" | "passphrase" };

/** What the page reaches outside itself for; the dev preview stands these in. */
export interface CliAuthorizeApi {
  fetch: typeof apiFetch;
  vault: typeof fetchVault;
  prf: typeof getPrfSecret;
}

const REAL_API: CliAuthorizeApi = { fetch: apiFetch, vault: fetchVault, prf: getPrfSecret };

export function CliAuthorize({ userId, api = REAL_API }: { userId: string; api?: CliAuthorizeApi }) {
  const [params] = useSearchParams();
  const prefilled = params.get("code") ?? "";
  const [typed, setTyped] = useState(prefilled);
  const [pending, setPending] = useState<Pending>({ state: "idle" });
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<UnlockOffer>({ available: false });
  const [unlockToo, setUnlockToo] = useState(true);
  const [method, setMethod] = useState<"passkey" | "passphrase">("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const look = useCallback(async (raw: string) => {
    const code = normalizeUserCode(raw);
    if (!code) {
      setPending({ state: "error", message: "That code doesn't look right." });
      return;
    }
    setPending({ state: "loading" });
    try {
      const res = await api.fetch(`/api/cli/device/pending/${encodeURIComponent(code)}`);
      const body = (await res.json()) as
        | { ok: true; userCode: string; label: string; publicJwk: DeviceJwk }
        | { ok: false; error: string };
      if (!res.ok || !body.ok) {
        setPending({
          state: "error",
          message: body.ok ? "Something went wrong." : body.error,
        });
        return;
      }
      setPending({ state: "found", userCode: body.userCode, label: body.label, publicJwk: body.publicJwk });
      // Offer to unlock the CLI too, the way this account can unlock: a
      // passkey when one is set up for it, the passphrase otherwise. No vault
      // yet means nothing to hand over.
      try {
        const vault = await api.vault();
        if (vault.exists && vault.keyMaterial) {
          const preferred = preferredMethod(vault.passkeyWraps);
          setOffer({ available: true, method: preferred });
          setMethod(preferred);
        }
      } catch {
        setOffer({ available: false });
      }
    } catch (err) {
      setPending({
        state: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }, [api]);

  useEffect(() => {
    if (prefilled) void look(prefilled);
  }, [prefilled, look]);

  async function decide(deny: boolean) {
    if (pending.state !== "found") return;
    setBusy(true);
    setUnlockError(null);
    try {
      let sealedVaultKey = null;
      const unlocking = !deny && offer.available && unlockToo;
      if (unlocking) {
        try {
          sealedVaultKey = await sealVaultKeyForCli(
            method === "passkey" ? { kind: "passkey" } : { kind: "passphrase", passphrase },
            { publicJwk: pending.publicJwk, userCode: pending.userCode, userId },
            { vault: api.vault, prf: api.prf },
          );
        } catch (err) {
          // Nothing was approved; the user can retry, switch method, or
          // approve without unlocking.
          if (err instanceof PasskeyPrfError && err.code === "cancelled") return;
          setUnlockError(
            err instanceof WrongPassphraseForCliError
              ? "That passphrase didn't unlock your vault."
              : err instanceof PasskeyPrfError
                ? err.message
                : "That couldn't unlock your vault. Try the passphrase, or approve without unlocking.",
          );
          return;
        } finally {
          setPassphrase("");
        }
      }
      const res = await api.fetch("/api/cli/device/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userCode: pending.userCode, deny, sealedVaultKey }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setPending({ state: "error", message: body.error ?? "Something went wrong." });
        return;
      }
      setPending(deny ? { state: "denied" } : { state: "approved", unlocked: sealedVaultKey !== null });
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
        <h1 className="text-xl font-semibold">Connect the Klef CLI</h1>
        <p className="text-muted-foreground text-sm">
          A terminal is asking to sign in as you. Approving it creates an access
          token that can read your encrypted files and their names. On its own it
          cannot decrypt anything; unlocking the CLI below hands it your vault key,
          sealed so that only that terminal can open it.
        </p>
      </div>

      {pending.state === "approved" && (
        <Result
          icon={<Check className="size-4" />}
          title="Approved"
          body={
            pending.unlocked
              ? "Your terminal is signed in and unlocked, and keeps the key on that device. You can close this tab."
              : "Your terminal has the token. You can close this tab."
          }
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
          {offer.available && (
            <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="unlock-cli"
                  checked={unlockToo}
                  onCheckedChange={(checked) => setUnlockToo(checked === true)}
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="unlock-cli">Also unlock the CLI on this device</Label>
                  <p className="text-muted-foreground text-xs">
                    Pull, push and sync then work without your passphrase in that
                    terminal, and in coding agents you run there, until you run{" "}
                    <code className="font-mono">klef lock</code>. The key is sealed
                    to that terminal; the server only passes it on.
                  </p>
                </div>
              </div>
              {unlockToo && method === "passphrase" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cli-passphrase">Master passphrase</Label>
                  <PasswordInput
                    id="cli-passphrase"
                    autoComplete="current-password"
                    aria-invalid={!!unlockError}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                  />
                  {offer.method === "passkey" && (
                    <button type="button" className="text-muted-foreground self-start text-xs underline" onClick={() => setMethod("passkey")}>
                      Use your passkey instead
                    </button>
                  )}
                </div>
              )}
              {unlockToo && method === "passkey" && (
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground text-xs">You'll confirm with your passkey when you approve.</p>
                  <button type="button" className="text-muted-foreground self-start text-xs underline" onClick={() => setMethod("passphrase")}>
                    Use your passphrase instead
                  </button>
                </div>
              )}
              {unlockError && <p className="text-destructive text-sm">{unlockError}</p>}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => void decide(true)}
            >
              Deny
            </Button>
            <Button
              className="flex-1"
              disabled={busy || (offer.available && unlockToo && method === "passphrase" && passphrase === "")}
              onClick={() => void decide(false)}
            >
              {busy ? "Approving..." : offer.available && unlockToo ? "Approve and unlock" : "Approve"}
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
