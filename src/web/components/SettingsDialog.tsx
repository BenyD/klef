import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Fingerprint,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { authClient, isPasskeyCancel } from "../auth.ts";
import { AvatarCropDialog } from "./AvatarCropDialog.tsx";
import { WorkspaceIcon } from "./WorkspaceIcon.tsx";
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
import { clearDek } from "../dek-store.ts";
import { PasskeyPrfError } from "../lib/passkey-prf.ts";
import { VaultWriteError } from "../vault-api.ts";
import { useVault } from "../vault-context.ts";
import {
  AUTO_LOCK_OPTIONS,
  setAutoLockMinutes,
  useAutoLockMinutes,
} from "../lib/auto-lock.ts";
import {
  getEnvLabelOverrides,
  setConfirmLoadVersion,
  setConfirmSaveReview,
  setEnvLabelOverride,
  useConfirmLoadVersion,
  useConfirmSaveReview,
} from "../lib/preferences.ts";
import { ENV_META } from "../lib/env-meta.ts";
import { passkeyProviderName } from "../lib/passkey-provider.ts";
import {
  ENVIRONMENTS,
  type PresetEnvironment,
  type WorkspaceNode,
} from "../../shared/api-types.ts";
import { useIsMobile } from "../hooks/use-mobile.ts";
import { LockShortcutKeys } from "./LockShortcutKeys.tsx";
import { RecoveryKeyPanel } from "./RecoveryKeyPanel.tsx";
import { StrengthMeter } from "./StrengthMeter.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
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
import { Switch } from "./ui/switch.tsx";
import { PasswordInput } from "./ui/password-input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";
import { Separator } from "./ui/separator.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";

export type SettingsTab = "profile" | "preferences" | "security" | "workspace";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  name: string;
  email: string;
  image?: string | null;
  workspace: WorkspaceNode | null;
  /** False while this is the account's only workspace. */
  canDeleteWorkspace: boolean;
  onRenameWorkspace: (name: string) => Promise<void>;
  /** Persists an uploaded workspace icon (data URL) or clears it with null. */
  onUpdateWorkspaceIcon: (icon: string | null) => Promise<void>;
  /** Opens the delete confirmation (the dialog closes itself first). */
  onRequestDeleteWorkspace: () => void;
}

// Profile = the person (avatar, display name). Security = secrets and locking
// (password, auto-lock, recovery key). Workspace = the data, including its
// destructive actions — those live only here, not in the sidebar switcher.
export function SettingsDialog({
  open,
  onOpenChange,
  tab,
  onTabChange,
  name,
  email,
  image,
  workspace,
  canDeleteWorkspace,
  onRenameWorkspace,
  onUpdateWorkspaceIcon,
  onRequestDeleteWorkspace,
}: SettingsDialogProps) {
  // Landscape layout with a left tab rail on desktop; on phones the dialog is
  // near-square, so the rail folds back into a horizontal strip up top.
  const isMobile = useIsMobile();
  const panelClass =
    "flex max-h-[60svh] flex-col gap-6 overflow-y-auto sm:min-h-96 sm:pr-1";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs
          orientation={isMobile ? "horizontal" : "vertical"}
          value={tab}
          onValueChange={(value) => onTabChange(value as SettingsTab)}
          className="sm:gap-6"
        >
          <TabsList
            variant={isMobile ? "default" : "line"}
            className="w-full sm:w-36 sm:shrink-0"
          >
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className={panelClass}>
            <ProfileSection name={name} email={email} image={image} />
            <Separator />
            <DeleteAccountSection email={email} />
          </TabsContent>

          <TabsContent value="preferences" className={panelClass}>
            <PreferencesSection />
          </TabsContent>

          <TabsContent value="security" className={panelClass}>
            <PasswordSection />
            <Separator />
            <PasskeysSection />
            <Separator />
            <PasskeyUnlockSection />
            <Separator />
            <SecuritySection />
            <Separator />
            <PassphraseSection />
            <Separator />
            <RecoverySection email={email} />
          </TabsContent>

          <TabsContent value="workspace" className={panelClass}>
            <WorkspaceSection
              workspace={workspace}
              onRename={onRenameWorkspace}
              onUpdateIcon={onUpdateWorkspaceIcon}
            />
            <Separator />
            <DangerZone
              workspace={workspace}
              canDelete={canDeleteWorkspace}
              onDelete={() => {
                onOpenChange(false);
                onRequestDeleteWorkspace();
              }}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProfileSection({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  const [displayName, setDisplayName] = useState(name);
  // Either the existing image (Google photo URL) or a fresh upload (data URL).
  const [imageUrl, setImageUrl] = useState(image ?? "");
  const photoFileRef = useRef<HTMLInputElement>(null);
  // Object URL of a freshly picked file, shown in the crop dialog.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  // Auto-save baseline: what the server currently has, so a blur with no real
  // change (or a session refresh echoing our own write) doesn't re-save.
  const savedRef = useRef({ name, image: image ?? "" });

  useEffect(() => {
    setDisplayName(name);
    setImageUrl(image ?? "");
    savedRef.current = { name, image: image ?? "" };
  }, [name, image]);

  const preview = imageUrl.trim();
  const initial = (displayName.trim() || email).charAt(0).toUpperCase();

  async function persist(nextName: string, nextImage: string) {
    if (
      nextName === savedRef.current.name &&
      nextImage === savedRef.current.image
    ) {
      return;
    }
    const res = await authClient.updateUser({
      name: nextName,
      image: nextImage || null,
    });
    if (res.error) {
      toast.error(res.error.message ?? "Couldn't update profile");
    } else {
      savedRef.current = { name: nextName, image: nextImage };
      toast.success("Profile updated");
    }
  }

  function saveName() {
    const trimmed = displayName.trim();
    // An emptied field just reverts; there's nothing sensible to save.
    if (!trimmed) {
      setDisplayName(savedRef.current.name);
      return;
    }
    void persist(trimmed, preview);
  }

  function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // An object URL keeps the full-size original out of memory-hungry base64;
    // the cropper reads straight from the blob.
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function onCropped(dataUrl: string) {
    setImageUrl(dataUrl);
    closeCrop();
    await persist(displayName.trim() || savedRef.current.name, dataUrl);
  }

  function removePhoto() {
    setImageUrl("");
    void persist(displayName.trim() || savedRef.current.name, "");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    saveName();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          {preview && (
            <AvatarImage src={preview} alt="" referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="text-base">{initial}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {displayName.trim() || email}
          </span>
          <span className="text-muted-foreground truncate text-sm">
            {email}
          </span>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-name">Display name</Label>
        <Input
          id="settings-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={saveName}
        />
      </div>
      <div className="grid gap-2">
        <Label>Profile picture</Label>
        <div className="flex items-center gap-2">
          <input
            ref={photoFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickPhoto(e)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => photoFileRef.current?.click()}
          >
            <Upload />
            {preview ? "Replace photo" : "Upload photo"}
          </Button>
          {preview && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={removePhoto}
            >
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
      </div>
      {cropSrc && (
        <AvatarCropDialog
          key={cropSrc}
          src={cropSrc}
          onCancel={closeCrop}
          onCropped={onCropped}
        />
      )}
    </form>
  );
}

// Account deletion: type-to-confirm, then one server-side DELETE that
// cascades through every table. On success we hard-navigate to the marketing
// page; the full reload drops the vault keys held in memory.
function DeleteAccountSection({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    const res = await authClient.deleteUser();
    if (res.error) {
      setBusy(false);
      toast.error(res.error.message ?? "Couldn't delete account");
      return;
    }
    // The account is gone; don't leave its cached DEK behind in IndexedDB.
    await clearDek();
    window.location.assign("/");
  }

  return (
    <div className="border-destructive/30 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Delete account</h3>
        <p className="text-muted-foreground text-sm">
          Deletes your account and every workspace in it.
        </p>
      </div>
      <div>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setOpen(true)}
        >
          Delete account
        </Button>
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) setConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account, workspaces, projects, and
              files. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="delete-account-confirm">
              Type "{email}" to confirm
            </Label>
            <Input
              id="delete-account-confirm"
              autoComplete="off"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={
                busy || confirmText.trim().toLowerCase() !== email.toLowerCase()
              }
              onClick={() => void deleteAccount()}
            >
              {busy ? "Deleting..." : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("Use at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords don't match");
      return;
    }
    setBusy(true);
    const res = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message ?? "Couldn't change password");
    } else {
      toast.success("Password changed");
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Change password</h3>
        <p className="text-muted-foreground text-sm">
          Not your master passphrase. Changing it signs you out everywhere
          else.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-current">Current password</Label>
        <PasswordInput
          id="settings-current"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-new">New password</Label>
        <PasswordInput
          id="settings-new"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <StrengthMeter value={next} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-confirm">Confirm new password</Label>
        <PasswordInput
          id="settings-confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit" disabled={busy || !current || !next || !confirm}>
          {busy ? "Changing..." : "Change password"}
        </Button>
      </div>
    </form>
  );
}

function WorkspaceSection({
  workspace,
  onRename,
  onUpdateIcon,
}: {
  workspace: WorkspaceNode | null;
  onRename: (name: string) => Promise<void>;
  onUpdateIcon: (icon: string | null) => Promise<void>;
}) {
  const [wsName, setWsName] = useState(workspace?.name ?? "");
  const busyRef = useRef(false);
  const iconFileRef = useRef<HTMLInputElement>(null);
  // Object URL of a freshly picked file, shown in the crop dialog.
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  function onPickIcon(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function onCropped(dataUrl: string) {
    closeCrop();
    try {
      await onUpdateIcon(dataUrl);
      toast.success("Workspace icon updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function removeIcon() {
    onUpdateIcon(null)
      .then(() => toast.success("Workspace icon removed"))
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : String(err)),
      );
  }

  useEffect(() => {
    setWsName(workspace?.name ?? "");
  }, [workspace?.id, workspace?.name]);

  // Auto-save on blur (and Enter); an emptied field just reverts.
  async function save() {
    if (!workspace || busyRef.current) return;
    const trimmed = wsName.trim();
    if (!trimmed) {
      setWsName(workspace.name);
      return;
    }
    if (trimmed === workspace.name) return;
    busyRef.current = true;
    try {
      await onRename(trimmed);
      toast.success("Workspace renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Workspace</h3>
        <p className="text-muted-foreground text-sm">
          The workspace you're currently in.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-workspace">Workspace name</Label>
        <Input
          id="settings-workspace"
          value={wsName}
          onChange={(e) => setWsName(e.target.value)}
          onBlur={() => void save()}
          disabled={!workspace}
        />
      </div>
      <div className="grid gap-2">
        <Label>Icon</Label>
        <div className="flex items-center gap-3">
          <WorkspaceIcon workspace={workspace} size="md" />
          <input
            ref={iconFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickIcon}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!workspace}
            onClick={() => iconFileRef.current?.click()}
          >
            <Upload />
            {workspace?.icon ? "Replace icon" : "Upload icon"}
          </Button>
          {workspace?.icon && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={removeIcon}
            >
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
      </div>
      {cropSrc && (
        <AvatarCropDialog
          key={cropSrc}
          src={cropSrc}
          onCancel={closeCrop}
          onCropped={onCropped}
        />
      )}
    </form>
  );
}

// Login passkeys (the auth gate, not the vault): list, add, rename, remove.
// The list refetches automatically; the passkey client pokes its atom after
// every register/update/delete round-trip.
function PasskeysSection() {
  const { data: passkeys, isPending, refetch } = authClient.useListPasskeys();
  const [adding, setAdding] = useState(false);

  // The list atom caches for the app's lifetime and only auto-refreshes on
  // the auth client's own passkey calls. Passkeys created elsewhere (the
  // signup flow, another tab) would never appear, so refresh on every show.
  useEffect(() => {
    refetch();
  }, [refetch]);

  async function add() {
    setAdding(true);
    const res = await authClient.passkey.addPasskey();
    setAdding(false);
    if (res?.error) {
      if (!isPasskeyCancel(res.error)) {
        toast.error(res.error.message ?? "Couldn't add passkey");
      }
      return;
    }
    toast.success("Passkey added");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Passkeys</h3>
        <p className="text-muted-foreground text-sm">
          Sign in with Face ID, Touch ID, or a hardware key.
        </p>
      </div>
      {isPending ? (
        <p className="text-muted-foreground text-sm">Loading passkeys...</p>
      ) : passkeys?.length ? (
        <>
          <ul className="flex flex-col gap-2">
            {passkeys.map((pk) => (
              <PasskeyRow key={pk.id} passkey={pk} />
            ))}
          </ul>
          <div>
            <Button variant="outline" onClick={add} disabled={adding}>
              <Plus />
              {adding ? "Waiting for your device..." : "Add passkey"}
            </Button>
          </div>
        </>
      ) : (
        <Empty className="bg-muted/40 gap-3 border border-dashed py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Fingerprint />
            </EmptyMedia>
            <EmptyTitle>No passkeys yet</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={add}
              disabled={adding}
            >
              <Plus />
              {adding ? "Waiting for your device..." : "Add passkey"}
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}

function PasskeyRow({
  passkey,
}: {
  passkey: {
    id: string;
    name?: string;
    createdAt?: Date;
    backedUp: boolean;
    aaguid?: string | null;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(passkey.name ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const added = passkey.createdAt
    ? new Date(passkey.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  async function rename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    const res = await authClient.passkey.updatePasskey({
      id: passkey.id,
      name: trimmed,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message ?? "Couldn't rename passkey");
      return;
    }
    setEditing(false);
    toast.success("Passkey renamed");
  }

  async function remove() {
    setBusy(true);
    const res = await authClient.passkey.deletePasskey({ id: passkey.id });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message ?? "Couldn't remove passkey");
      return;
    }
    toast.success("Passkey removed");
  }

  return (
    <li className="flex items-center gap-3 rounded-md border p-3">
      <Fingerprint className="text-muted-foreground size-4 shrink-0" />
      {editing ? (
        <form onSubmit={rename} className="flex flex-1 items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Passkey name"
          />
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setName(passkey.name ?? "");
            }}
          >
            Cancel
          </Button>
        </form>
      ) : confirming ? (
        <div className="flex flex-1 items-center justify-between gap-2">
          <span className="text-sm">Remove this passkey?</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={remove}
              disabled={busy}
            >
              Remove
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Unnamed passkeys fall back to their authenticator's product
                name (from the AAGUID) before the generic label. */}
            <span className="truncate text-sm font-medium">
              {passkey.name?.trim() ||
                passkeyProviderName(passkey.aaguid) ||
                "Passkey"}
            </span>
            <span className="text-muted-foreground text-xs">
              {added ? `Added ${added}` : "Added"}
              {passkey.backedUp ? ", synced" : ", this device only"}
            </span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            aria-label="Rename passkey"
          >
            <Pencil />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setConfirming(true)}
            aria-label="Remove passkey"
          >
            <Trash2 />
          </Button>
        </>
      )}
    </li>
  );
}

// Vault unlock via passkey (WebAuthn PRF). Separate from login passkeys:
// enabling wraps the DEK under a secret only that passkey can re-derive, so
// each one is enabled individually and needs the passphrase once (the live
// DEK is non-extractable, so a re-wrap can't reuse it).
function PasskeyUnlockSection() {
  const { passkeyWraps, enrollPasskey, removePasskeyUnlock } = useVault();
  const { data: passkeys } = authClient.useListPasskeys();
  const [enablingId, setEnablingId] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enrolled = new Set(passkeyWraps.map((w) => w.passkeyId));
  const list = passkeys ?? [];

  function startEnable(id: string) {
    setEnablingId(id);
    setPassphrase("");
    setError(null);
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    const pk = list.find((p) => p.id === enablingId);
    if (!pk || !passphrase) return;
    setBusy(true);
    setError(null);
    try {
      await enrollPasskey(passphrase, {
        id: pk.id,
        credentialId: pk.credentialID,
      });
      setEnablingId(null);
      setPassphrase("");
      toast.success("This passkey can now unlock your vault");
    } catch (err) {
      if (err instanceof PasskeyPrfError) {
        if (err.code !== "cancelled") setError(err.message);
      } else if (err instanceof VaultWriteError) {
        setError("Couldn't save. Check your connection and try again.");
      } else {
        setError("That passphrase didn't work.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await removePasskeyUnlock(id);
      toast.success("Passkey unlock removed");
    } catch {
      toast.error("Couldn't remove passkey unlock");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Passkey unlock</h3>
        <p className="text-muted-foreground text-sm">
          Unlock your vault with a passkey instead of typing your passphrase.
          Your passphrase and recovery key keep working.
        </p>
      </div>
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Add a passkey above first.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((pk) => (
            <li key={pk.id} className="flex items-center gap-3 text-sm">
              <Fingerprint className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {pk.name?.trim() || passkeyProviderName(pk.aaguid) || "Passkey"}
              </span>
              {enrolled.has(pk.id) ? (
                <>
                  <span className="text-success text-xs font-medium">
                    Unlock enabled
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(pk.id)}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || enablingId === pk.id}
                  onClick={() => startEnable(pk.id)}
                >
                  Enable
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {enablingId !== null && (
        <form onSubmit={enable} className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label htmlFor="settings-passkey-unlock-passphrase">
              Master passphrase
            </Label>
            <PasswordInput
              id="settings-passkey-unlock-passphrase"
              autoComplete="current-password"
              aria-invalid={!!error}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !passphrase}>
              {busy ? "Waiting for your passkey..." : "Confirm and enable"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setEnablingId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// Per-device behavior toggles (localStorage, not vault data).
function PreferencesSection() {
  const confirmSave = useConfirmSaveReview();
  const confirmLoad = useConfirmLoadVersion();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Editor</h3>
        <p className="text-muted-foreground text-sm">
          How saving behaves on this device.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="settings-confirm-save">
            Review changes before saving
          </Label>
          <p className="text-muted-foreground text-sm">
            Shows the diff to confirm each time you save a version.
          </p>
        </div>
        <Switch
          id="settings-confirm-save"
          checked={confirmSave}
          onCheckedChange={setConfirmSaveReview}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="settings-confirm-load">
            Warn before replacing unsaved edits
          </Label>
          <p className="text-muted-foreground text-sm">
            Asks to confirm when loading a version would overwrite edits you
            have not saved.
          </p>
        </div>
        <Switch
          id="settings-confirm-load"
          checked={confirmLoad}
          onCheckedChange={setConfirmLoadVersion}
        />
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <h3 className="text-sm font-medium">Environment labels</h3>
        <p className="text-muted-foreground text-sm">
          Rename the built-in labels on this device. Leave a field empty to
          use the default.
        </p>
      </div>
      {ENVIRONMENTS.map((env) => (
        <EnvLabelField key={env} env={env} />
      ))}
    </div>
  );
}

function EnvLabelField({ env }: { env: PresetEnvironment }) {
  const [text, setText] = useState(() => getEnvLabelOverrides()[env] ?? "");
  const meta = ENV_META[env];
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
      <Label
        htmlFor={`settings-env-label-${env}`}
        className="flex items-center gap-2 font-normal"
      >
        <span
          className={`size-1.5 shrink-0 rounded-full ${meta.dot}`}
          aria-hidden="true"
        />
        {meta.label}
      </Label>
      <Input
        id={`settings-env-label-${env}`}
        value={text}
        maxLength={32}
        placeholder={meta.label}
        onChange={(e) => {
          setText(e.target.value);
          setEnvLabelOverride(env, e.target.value || null);
        }}
      />
    </div>
  );
}

function SecuritySection() {
  const minutes = useAutoLockMinutes();
  const current = AUTO_LOCK_OPTIONS.find((o) => o.minutes === minutes);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Auto-lock</h3>
        <p className="text-muted-foreground text-sm">
          Locks the vault when you're idle. Lock instantly with the lock
          button
          <span className="max-sm:hidden">
            {" "}
            or <LockShortcutKeys />
          </span>
          .
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-auto-lock">Lock after</Label>
        <Select
          value={String(minutes)}
          onValueChange={(v) => setAutoLockMinutes(Number(v))}
        >
          <SelectTrigger id="settings-auto-lock" className="w-full">
            <SelectValue>{current?.label ?? "After 15 minutes"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {AUTO_LOCK_OPTIONS.map((option) => (
              <SelectItem key={option.minutes} value={String(option.minutes)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Rotate the recovery key for users who lost theirs (e.g. skipped saving it
// during onboarding). Requires the master passphrase; the new key is shown
// once and the old one stops working.
// Change the master passphrase (the unlock gate, not the account password).
// Only the DEK wrapping is redone; blobs and the recovery key are untouched.
function PassphraseSection() {
  const { changePassphrase } = useVault();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("Passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      await changePassphrase(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Passphrase changed");
    } catch {
      toast.error("That passphrase didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Master passphrase</h3>
        <p className="text-muted-foreground text-sm">
          Changes what unlocks your vault everywhere. Your recovery key keeps
          working.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-passphrase-current">Current passphrase</Label>
        <PasswordInput
          id="settings-passphrase-current"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-passphrase-new">New passphrase</Label>
        <PasswordInput
          id="settings-passphrase-new"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <StrengthMeter value={next} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-passphrase-confirm">
          Confirm new passphrase
        </Label>
        <PasswordInput
          id="settings-passphrase-confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit" disabled={busy || !current || !next || !confirm}>
          {busy ? "Changing..." : "Change passphrase"}
        </Button>
      </div>
    </form>
  );
}

function RecoverySection({ email }: { email: string }) {
  const { rotateRecovery } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    try {
      const key = await rotateRecovery(passphrase);
      setNewKey(key);
      setPassphrase("");
    } catch {
      toast.error("That passphrase didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // The id lets the recovery-key banner deep-link here (open + scroll).
    <div id="settings-recovery" className="flex scroll-mt-2 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Recovery key</h3>
        <p className="text-muted-foreground text-sm">
          Generates a new recovery key. The old one stops working immediately.
        </p>
      </div>
      {newKey ? (
        <div className="flex flex-col gap-3">
          <RecoveryKeyPanel recoveryKey={newKey} email={email} />
          <p className="text-muted-foreground text-xs">
            You'll only see it once, so save it before closing settings.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="settings-rotate-passphrase">
              Master passphrase
            </Label>
            <PasswordInput
              id="settings-rotate-passphrase"
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" disabled={busy || !passphrase}>
              {busy ? "Generating..." : "Generate new recovery key"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function DangerZone({
  workspace,
  canDelete,
  onDelete,
}: {
  workspace: WorkspaceNode | null;
  canDelete: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="border-destructive/30 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Delete workspace</h3>
        <p className="text-muted-foreground text-sm">
          {workspace
            ? `Deletes "${workspace.name}" and everything inside it.`
            : "No workspace to delete."}
        </p>
      </div>
      <div>
        <Button
          type="button"
          variant="destructive"
          disabled={!workspace || !canDelete}
          onClick={onDelete}
        >
          Delete workspace
        </Button>
        {workspace && !canDelete && (
          <p className="text-muted-foreground mt-2 text-xs">
            You can't delete your only workspace. Create another one first.
          </p>
        )}
      </div>
    </div>
  );
}
