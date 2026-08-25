import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Plus, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AccessTokenSummary } from "../../shared/api-types.ts";
import {
  DEFAULT_EXPIRY,
  describeExpiry,
  describeLastUsed,
  displayToken,
  EXPIRY_OPTIONS,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty.tsx";
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Access tokens</h3>
        <p className="text-muted-foreground text-sm">
          Let the Klef CLI and MCP server reach your vault. A token proves who
          you are — it can't decrypt anything, because that still needs your
          master passphrase on your own machine.
        </p>
      </div>

      {tokens === null ? (
        <p className="text-muted-foreground text-sm">Loading tokens...</p>
      ) : tokens.length ? (
        <>
          <ul className="flex flex-col gap-2">
            {tokens.map((token) => (
              <TokenRow key={token.id} token={token} onRevoked={refresh} />
            ))}
          </ul>
          <div>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus />
              New token
            </Button>
          </div>
        </>
      ) : (
        <Empty className="bg-muted/40 gap-3 border border-dashed py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Terminal />
            </EmptyMedia>
            <EmptyTitle>No access tokens yet</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus />
              New token
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <CreateTokenDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={refresh}
      />
    </div>
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
    <li className="flex items-center gap-3 rounded-md border px-3 py-2">
      <KeyRound className="text-muted-foreground size-4 shrink-0" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{token.name}</span>
        <span className="text-muted-foreground truncate font-mono text-xs">
          {displayToken(token.prefix)}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden flex-col items-end sm:flex">
          <span
            className={
              state === "expired"
                ? "text-destructive text-xs"
                : state === "expiring"
                  ? "text-xs text-amber-600 dark:text-amber-500"
                  : "text-muted-foreground text-xs"
            }
          >
            {describeExpiry(token)}
          </span>
          <span className="text-muted-foreground text-xs">
            {describeLastUsed(token)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Revoke ${token.name}`}
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          <Trash2 />
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
            <AlertDialogDescription>
              Anything signed in with <strong>{token.name}</strong> stops
              working immediately. Your data is untouched — you can create a new
              token any time.
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
    </li>
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
              Copy this now — it won't be shown again. Klef stores only a hash
              of it, so nobody, including us, can recover it later.
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
                  <SelectValue />
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
