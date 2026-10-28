import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Check,
  Copy,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { AccessTokenSummary } from "../../shared/api-types.ts";
import {
  DEFAULT_EXPIRY,
  describeCreated,
  describeExpiry,
  describeLastUsed,
  displayToken,
  EXPIRY_OPTIONS,
  expiryLabel,
  isUnused,
  sortTokens,
  tokenState,
} from "../lib/access-tokens.ts";
import {
  createToken,
  listTokens,
  renameToken,
  revokeToken,
} from "../tokens-api.ts";
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
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { SettingNote, SettingRow, SettingsSection } from "./settings-layout.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";

/** How many names the bulk-revoke confirmation spells out before "and N more". */
const LISTED_IN_CONFIRM = 5;

/**
 * Personal access tokens for the CLI and MCP server.
 *
 * Worth stating plainly in the UI, because it is the unusual part: a token is
 * an *auth* credential only. It reaches ciphertext and plaintext names, and
 * stops there — decryption needs the passphrase, which never leaves the
 * client. A leaked token cannot reveal a secret value.
 *
 * Most tokens come from `klef login`, one per machine, so the list is sorted
 * by last use and flags the ones gone quiet: the usual question here is
 * "which of these is a laptop I no longer have?".
 */
export function AccessTokensPanel() {
  const [tokens, setTokens] = useState<AccessTokenSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [clearing, setClearing] = useState(false);

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

  const now = new Date();
  const sorted = useMemo(() => (tokens ? sortTokens(tokens) : null), [tokens]);
  const unused = sorted?.filter((t) => isUnused(t, now)) ?? [];

  function replace(updated: AccessTokenSummary) {
    setTokens((list) =>
      list ? list.map((t) => (t.id === updated.id ? updated : t)) : list,
    );
  }

  function drop(ids: string[]) {
    setTokens((list) => (list ? list.filter((t) => !ids.includes(t.id)) : list));
  }

  return (
    <SettingsSection
      title="Access tokens"
      // The one detail worth keeping: a token is identity, not a key.
      description="How the CLI and MCP server sign in. A token can't decrypt your data."
      action={
        <div className="flex items-center gap-2">
          {unused.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setClearing(true)}>
              Revoke unused ({unused.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New token
          </Button>
        </div>
      }
    >
      {sorted === null ? (
        <SettingNote>Loading tokens...</SettingNote>
      ) : sorted.length ? (
        sorted.map((token) => (
          <TokenRow
            key={token.id}
            token={token}
            unused={isUnused(token, now)}
            now={now}
            onRenamed={replace}
            onRevoked={() => drop([token.id])}
          />
        ))
      ) : (
        <SettingNote>
          No access tokens yet. Run <code className="font-mono">klef login</code>{" "}
          in a terminal, or create one here.
        </SettingNote>
      )}

      {sorted !== null && sorted.length > 0 && (
        <p className="text-muted-foreground px-4 py-2.5 text-xs">
          Each <code className="font-mono">klef login</code> adds a token named
          after its machine, and <code className="font-mono">klef logout</code>{" "}
          revokes it.
        </p>
      )}

      <CreateTokenDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={refresh}
      />
      <RevokeUnusedDialog
        open={clearing}
        onOpenChange={setClearing}
        tokens={unused}
        onDone={(revoked) => {
          drop(revoked);
          void refresh();
        }}
      />
    </SettingsSection>
  );
}

function TokenRow({
  token,
  unused,
  now,
  onRenamed,
  onRevoked,
}: {
  token: AccessTokenSummary;
  unused: boolean;
  now: Date;
  onRenamed: (token: AccessTokenSummary) => void;
  onRevoked: () => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "confirm">("view");
  const [name, setName] = useState(token.name);
  const [busy, setBusy] = useState(false);
  const state = tokenState(token, now);

  const leading = (
    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
      <KeyRound className="text-muted-foreground size-4" />
    </span>
  );

  async function rename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === token.name) {
      setMode("view");
      return;
    }
    setBusy(true);
    try {
      onRenamed(await renameToken(token.id, trimmed));
      setMode("view");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rename token");
    } finally {
      setBusy(false);
    }
  }

  function cancelRename() {
    setName(token.name);
    setMode("view");
  }

  async function revoke() {
    setBusy(true);
    try {
      await revokeToken(token.id);
      toast.success(`Revoked ${token.name}`);
      onRevoked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't revoke token");
      setBusy(false);
      setMode("view");
    }
  }

  if (mode === "rename") {
    return (
      <SettingRow leading={leading} label="Rename token">
        <form
          onSubmit={rename}
          className="flex items-center gap-2"
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Escape") {
              // Keep Escape from also closing the settings dialog.
              e.stopPropagation();
              cancelRename();
            }
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Token name"
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={cancelRename}>
            Cancel
          </Button>
        </form>
      </SettingRow>
    );
  }

  if (mode === "confirm") {
    return (
      <SettingRow
        leading={leading}
        label={`Revoke ${token.name}?`}
        hint="Whatever signs in with it stops working on its next request. Your data is untouched."
        control={
          <>
            <Button
              size="sm"
              variant="destructive"
              onClick={revoke}
              disabled={busy}
            >
              {busy ? "Revoking..." : "Revoke"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setMode("view")}
            >
              Cancel
            </Button>
          </>
        }
      />
    );
  }

  return (
    <SettingRow
      leading={leading}
      label={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{token.name}</span>
          {state === "expired" ? (
            <Badge variant="destructive">Expired</Badge>
          ) : (
            unused && (
              <Badge variant="secondary" title="Not used in 90 days">
                Unused
              </Badge>
            )
          )}
        </span>
      }
      hint={
        <span className="flex flex-wrap gap-x-3">
          <span className="font-mono">{displayToken(token.prefix)}</span>
          <span>{describeLastUsed(token, now)}</span>
          <span>{describeCreated(token, now)}</span>
          {/* "Never expires" on every login token is noise; say it only
              when there is a date to say. */}
          {token.expiresAt !== null && state !== "expired" && (
            <span className={state === "expiring" ? "text-warning" : undefined}>
              {describeExpiry(token, now)}
            </span>
          )}
        </span>
      }
      control={
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Actions for ${token.name}`}
                className="text-muted-foreground"
              >
                <MoreHorizontal />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem
              onClick={() => {
                setName(token.name);
                setMode("rename");
              }}
            >
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setMode("confirm")}
            >
              <Trash2 />
              Revoke
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}

/**
 * Clear out what `isUnused` flags in one go. Spells out what goes, since a
 * flag is a guess: a CI token used quarterly would look abandoned too.
 */
function RevokeUnusedDialog({
  open,
  onOpenChange,
  tokens,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokens: AccessTokenSummary[];
  onDone: (revoked: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const listed = tokens.slice(0, LISTED_IN_CONFIRM);
  const more = tokens.length - listed.length;

  async function revokeAll() {
    setBusy(true);
    const results = await Promise.allSettled(
      tokens.map((t) => revokeToken(t.id).then(() => t.id)),
    );
    const revoked = results.flatMap((r) =>
      r.status === "fulfilled" ? [r.value] : [],
    );
    const failed = tokens.length - revoked.length;
    if (revoked.length) {
      toast.success(
        `Revoked ${revoked.length} ${revoked.length === 1 ? "token" : "tokens"}`,
      );
    }
    if (failed) {
      toast.error(
        `Couldn't revoke ${failed} ${failed === 1 ? "token" : "tokens"}. Try again.`,
      );
    }
    setBusy(false);
    onOpenChange(false);
    onDone(revoked);
  }

  const count = `${tokens.length} unused ${tokens.length === 1 ? "token" : "tokens"}`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {count}?</AlertDialogTitle>
          <AlertDialogDescription>
            These have expired or haven't been used in 90 days. Anything still
            signed in with one will have to sign in again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="bg-muted flex flex-col gap-1 rounded-md px-3 py-2 text-sm">
          {listed.map((t) => (
            <li key={t.id} className="flex justify-between gap-3">
              <span className="truncate">{t.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {describeLastUsed(t)}
              </span>
            </li>
          ))}
          {more > 0 && (
            <li className="text-muted-foreground text-xs">and {more} more</li>
          )}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={revokeAll}
            disabled={busy || tokens.length === 0}
          >
            {busy ? "Revoking..." : `Revoke ${tokens.length}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
