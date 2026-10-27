import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AccessTokenSummary } from "../../shared/api-types.ts";
import {
  DEFAULT_EXPIRY,
  describeExpiry,
  describeLastUsed,
  displayToken,
  EXPIRY_OPTIONS,
  expiryLabel,
  tokenState,
} from "../lib/access-tokens.ts";
import { createToken, listTokens, revokeToken } from "../tokens-api.ts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { Button } from "./ui/button.tsx";
import { SettingNote, SettingRow, SettingsSection } from "./settings-layout.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";

/**
 * Personal access tokens for the CLI and MCP server.
 *
 * Worth stating plainly in the UI, because it is the unusual part: a token is
 * an *auth* credential only. It reaches ciphertext and plaintext names, and
 * stops there — decryption needs the passphrase, which never leaves the
 * client. A leaked token cannot reveal a secret value.
 */
export function AccessTokensPanel() {
  const [tokens, setTokens] = useState<AccessTokenSummary[] | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setTokens(await listTokens());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load tokens");
      setTokens([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SettingsSection
      title="Access tokens"
      // The one detail worth keeping: a token is identity, not a key.
      description="For the CLI and MCP server. Tokens can't decrypt your data."
      action={
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus />
          New token
        </Button>
      }
    >
      {tokens === null ? (
        <SettingNote>Loading tokens...</SettingNote>
      ) : tokens.length ? (
        tokens.map((token) => (
          <TokenRow key={token.id} token={token} onRevoked={refresh} />
        ))
      ) : (
        <SettingNote>No access tokens yet.</SettingNote>
      )}

      <CreateTokenDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={refresh}
      />
    </SettingsSection>
  );
}

function TokenRow({
  token,
  onRevoked,
}: {
  token: AccessTokenSummary;
  onRevoked: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = tokenState(token);

  async function revoke() {
    setBusy(true);
    try {
      await revokeToken(token.id);
      toast.success("Token revoked");
      onRevoked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke token");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <SettingRow
      leading={
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
          <KeyRound className="text-muted-foreground size-4" />
        </span>
      }
      label={token.name}
      hint={
        <span className="flex flex-wrap gap-x-3">
          <span className="font-mono">{displayToken(token.prefix)}</span>
          <span
            className={
              state === "expired"
                ? "text-destructive"
                : state === "expiring"
                  ? "text-warning"
                  : undefined
            }
          >
            {describeExpiry(token)}
          </span>
          <span>{describeLastUsed(token)}</span>
        </span>
      }
      control={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Revoke ${token.name}`}
          title="Revoke"
          className="text-muted-foreground hover:text-destructive"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
        </Button>
      }
    >
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything signed in with <strong>{token.name}</strong> stops
              working immediately. Your data is untouched, and you can create a
              new token any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={revoke} disabled={busy}>
              {busy ? "Revoking..." : "Revoke token"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingRow>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<string>(DEFAULT_EXPIRY);
  const [busy, setBusy] = useState(false);
  // The plaintext token, held only until this dialog closes. The server keeps
  // just its hash, so there is no second chance to show it.
  const [minted, setMinted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setName("");
    setExpiry(DEFAULT_EXPIRY);
    setMinted(null);
    setCopied(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    try {
      const days = EXPIRY_OPTIONS.find((o) => o.value === expiry)?.days ?? null;
      const { token } = await createToken(trimmed, days);
      setMinted(token);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create token");
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!minted) return;
    void navigator.clipboard?.writeText(minted);
    setCopied(true);
    toast.success("Token copied");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{minted ? "Your new token" : "New access token"}</DialogTitle>
        </DialogHeader>

        {minted ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Copy it now. It won't be shown again.
            </p>
            <code className="bg-muted block overflow-x-auto rounded-md px-3 py-2 font-mono text-xs">
              {minted}
            </code>
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy token"}
            </Button>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Laptop CLI"
                maxLength={100}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                So you can tell your tokens apart later.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="token-expiry">Expires</Label>
              <Select
                value={expiry}
                onValueChange={(v) => setExpiry(v ?? DEFAULT_EXPIRY)}
              >
                <SelectTrigger id="token-expiry">
                  {/* Base UI renders the raw value unless given children, which
                      showed "90" and "never" in place of the option labels. */}
                  <SelectValue>{expiryLabel(expiry)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Creating..." : "Create token"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
