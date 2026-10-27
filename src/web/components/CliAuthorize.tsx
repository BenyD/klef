import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Check, Terminal, TriangleAlert } from "lucide-react";
import { apiFetch } from "../api-fetch.ts";
import { fetchVault } from "../vault-api.ts";
import { normalizeUserCode } from "../../shared/device-code.ts";
import type { DeviceJwk } from "../../shared/device-seal.ts";
import { getPrfSecret, PasskeyPrfError } from "../lib/passkey-prf.ts";
import { preferredMethod, sealVaultKeyForCli, WrongPassphraseForCliError } from "../lib/cli-unlock.ts";
import { KlefMark } from "./KlefMark.tsx";
import { CanvasField } from "./PixelField.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
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
 * login, so the page says so in one line rather than assuming it is obvious.
 *
 * Same canvas and card as the sign-in page, since it is the next thing a
 * terminal sends you to. Reached with ?code= prefilled by the CLI, or typed
 * by hand.
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

  const look = useCallback(
    async (raw: string) => {
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
    },
    [api],
  );

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

  const asking = pending.state === "idle" || pending.state === "error" || pending.state === "loading";
  const unlocking = offer.available && unlockToo;

  return (
    <main className="klef-screen klef-canvas bg-sidebar flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <CanvasField />
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="text-foreground">
        <KlefMark className="size-9" accent="var(--primary)" />
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Terminal className="text-muted-foreground size-4" aria-hidden="true" />
            Connect the CLI
          </CardTitle>
          <CardDescription>
            {pending.state === "approved"
              ? pending.unlocked
                ? "Your terminal is signed in and unlocked."
                : "Your terminal is signed in."
              : pending.state === "denied"
                ? "Nothing was created."
                : "A terminal wants to sign in as you."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {pending.state === "approved" && (
            <Result icon={<Check className="size-4" />} title="Approved">
              {pending.unlocked
                ? "It keeps the key on that device. You can close this tab."
                : "You can close this tab."}
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

              {offer.available && (
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="unlock-cli"
                      checked={unlockToo}
                      onCheckedChange={(checked) => setUnlockToo(checked === true)}
                    />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="unlock-cli">Also unlock the CLI on this device</Label>
                      <p className="text-muted-foreground text-xs">
                        Sync runs there without your passphrase until you run{" "}
                        <code className="font-mono">klef lock</code>. The key is
                        sealed to that terminal.
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
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-2"
                          onClick={() => setMethod("passkey")}
                        >
                          Use your passkey instead
                        </button>
                      )}
                    </div>
                  )}
                  {unlockToo && method === "passkey" && (
                    <div className="flex flex-col gap-1">
                      <p className="text-muted-foreground text-xs">
                        You'll confirm with your passkey when you approve.
                      </p>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-2"
                        onClick={() => setMethod("passphrase")}
                      >
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
                  disabled={busy || (unlocking && method === "passphrase" && passphrase === "")}
                  onClick={() => void decide(false)}
                >
                  {busy ? "Approving..." : unlocking ? "Approve and unlock" : "Approve"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                On its own the token reaches ciphertext and names only.
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
