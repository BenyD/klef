import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Boxes,
  CircleAlert,
  Fingerprint,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { workspaceSlug } from "../../shared/slug.ts";
import { authClient } from "../auth.ts";
import { isPasskeyCancel } from "../lib/passkey-cancel.ts";
import { isStaleSession, staleSessionToast } from "../lib/stale-session.ts";
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
import { useVault, WrongPassphraseError } from "../vault-context.ts";
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
import {
  discoverIcon,
  resolveIconUrl,
  settleIcon,
} from "../lib/project-icon.ts";
import { passkeyLabel } from "../../shared/passkey-provider.ts";
import {
  ENVIRONMENTS,
  type PresetEnvironment,
  type WorkspaceNode,
} from "../../shared/api-types.ts";
import { useIsMobile } from "../hooks/use-mobile.ts";
import { AccessTokensPanel } from "./AccessTokensPanel.tsx";
import { RecoveryKeyPanel } from "./RecoveryKeyPanel.tsx";
import {
  SettingNote,
  SettingRow,
  SettingsPage,
  SettingsSection,
} from "./settings-layout.tsx";
import { StrengthMeter } from "./StrengthMeter.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
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
import { Switch } from "./ui/switch.tsx";
import { PasswordInput } from "./ui/password-input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";
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
// (passkeys, passphrase, auto-lock, recovery key). Workspace = the data,
// including its destructive actions — those live only here, not in the
// sidebar switcher.
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
  // min-w-0 lets the panel shrink inside the vertical tab row; without it a
  // wide child would push the whole dialog past its max width and clip. Each
  // page brings its own sticky heading and padding (settings-layout.tsx).
  const panelClass = "min-w-0 max-h-[65svh] overflow-y-auto sm:max-h-none";
  // Linear-style settings: a quiet nav column on the canvas colour, the
  // section filling the rest. Rows fill when active instead of growing a bar.
  const navItem =
    "h-7 flex-none justify-start gap-2 px-2 font-normal text-muted-foreground after:hidden hover:bg-sidebar-hover data-active:bg-sidebar-accent! data-active:font-medium data-active:text-foreground sm:w-full";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // The close button rides above each page's sticky header.
        className="gap-0 overflow-hidden p-0 sm:max-w-3xl [&>[data-slot=dialog-close]]:z-20"
      >
        <Tabs
          orientation={isMobile ? "horizontal" : "vertical"}
          value={tab}
          onValueChange={(value) => onTabChange(value as SettingsTab)}
          // min-w-0: as a grid item the tabs would otherwise widen to fit the
          // phone tab strip and push every page past the dialog's edge.
          className="min-w-0 gap-0 sm:h-[min(40rem,85svh)]"
        >
          <div className="bg-sidebar flex shrink-0 flex-col gap-1 border-b p-2 sm:w-48 sm:border-r sm:border-b-0 sm:p-3">
            <DialogTitle className="px-2 pt-1 pb-1 text-sm font-semibold sm:pb-2">
              Settings
            </DialogTitle>
            <TabsList
              variant="line"
              className="no-scrollbar w-full justify-start gap-0.5 overflow-x-auto p-0 sm:flex-col sm:items-stretch"
            >
              <TabsTrigger value="profile" className={navItem}>
                <UserRound />
                Profile
              </TabsTrigger>
              <TabsTrigger value="preferences" className={navItem}>
                <SlidersHorizontal />
                Preferences
              </TabsTrigger>
              <TabsTrigger value="security" className={navItem}>
                <ShieldCheck />
                Security
              </TabsTrigger>
              <TabsTrigger value="workspace" className={navItem}>
                <Boxes />
                Workspace
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="profile" className={panelClass}>
            <SettingsPage title="Profile" description="How you appear in Klef.">
              <ProfileSection name={name} email={email} image={image} />
              <DeleteAccountSection email={email} />
            </SettingsPage>
          </TabsContent>

          <TabsContent value="preferences" className={panelClass}>
            <SettingsPage
              title="Preferences"
              description="Saved on this device only."
            >
              <PreferencesSection />
            </SettingsPage>
          </TabsContent>

          <TabsContent value="security" className={panelClass}>
            {/* Signing in (passkeys) and unlocking (the vault) stay in
                separate sections: auth is not unlock. */}
            <SettingsPage
              title="Security"
              description="How you sign in, and how your vault unlocks and locks."
            >
              <PasskeysSection />
              <VaultSection />
              <AccessTokensPanel />
              <RecoverySection email={email} />
            </SettingsPage>
          </TabsContent>

          <TabsContent value="workspace" className={panelClass}>
            <SettingsPage
              title="Workspace"
              description="Settings for the workspace you're in."
            >
              <WorkspaceSection
                workspace={workspace}
                onRename={onRenameWorkspace}
                onUpdateIcon={onUpdateWorkspaceIcon}
              />
              <DangerZone
                workspace={workspace}
                canDelete={canDeleteWorkspace}
                onDelete={() => {
                  onOpenChange(false);
                  onRequestDeleteWorkspace();
                }}
              />
            </SettingsPage>
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
    <form onSubmit={submit}>
      <SettingsSection title="Account">
        <SettingRow
          leading={
            <Avatar className="size-10">
              {preview && (
                <AvatarImage src={preview} alt="" referrerPolicy="no-referrer" />
              )}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          }
          label={displayName.trim() || email}
          hint={email}
          control={
            <>
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
                size="sm"
                onClick={() => photoFileRef.current?.click()}
              >
                <Upload />
                {preview ? "Replace photo" : "Upload photo"}
              </Button>
              {preview && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove photo"
                  title="Remove photo"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={removePhoto}
                >
                  <Trash2 />
                </Button>
              )}
            </>
          }
        />
        <SettingRow
          label="Display name"
          hint="Shown in the sidebar and menus."
          htmlFor="settings-name"
          control={
            <Input
              id="settings-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={saveName}
              className="h-8 sm:w-56"
            />
          }
        />
      </SettingsSection>
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
      if (isStaleSession(res.error)) {
        staleSessionToast("Deleting your account");
      } else {
        toast.error(res.error.message ?? "Couldn't delete account");
      }
      return;
    }
    // The account is gone; don't leave its cached DEK behind in IndexedDB.
    await clearDek();
    window.location.assign("/");
  }

  return (
    <SettingsSection title="Danger zone" tone="danger">
      <SettingRow
        label="Delete account"
        hint="Deletes your account and every workspace in it."
        control={
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setOpen(true)}
          >
            Delete account
          </Button>
        }
      />
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
              variant="destructive-solid"
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
    </SettingsSection>
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
  // The icon picker (paste a link or upload) lives in its own dialog so the
  // settings panel stays a tidy preview + button — no wide field to overflow.
  const [iconOpen, setIconOpen] = useState(false);

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
    <form onSubmit={submit} className="min-w-0">
      <SettingsSection title="General">
        <SettingRow
          label="Name"
          // Renaming moves the workspace's address with it.
          hint={
            workspace
              ? `Address: ${window.location.host}/${workspaceSlug(workspace.name, workspace.id)}`
              : undefined
          }
          htmlFor="settings-workspace"
          control={
            <Input
              id="settings-workspace"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              onBlur={() => void save()}
              disabled={!workspace}
              className="h-8 sm:w-56"
            />
          }
        />
        <SettingRow
          label="Icon"
          hint="Shown in the sidebar and the workspace switcher."
          leading={<WorkspaceIcon workspace={workspace} size="md" className="size-10" />}
          control={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!workspace}
                onClick={() => setIconOpen(true)}
              >
                <Upload />
                {workspace?.icon ? "Change icon" : "Add icon"}
              </Button>
              {workspace?.icon && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove icon"
                  title="Remove icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={removeIcon}
                >
                  <Trash2 />
                </Button>
              )}
            </>
          }
        />
      </SettingsSection>
      {workspace && (
        <WorkspaceIconDialog
          open={iconOpen}
          onOpenChange={setIconOpen}
          workspace={workspace}
          onSave={onUpdateIcon}
        />
      )}
    </form>
  );
}

// Pick a workspace icon by pasting a link (site, GitHub, or image URL, resolved
// to a favicon/avatar the same private way projects derive theirs) or uploading
// an image. Kept in its own modal so the settings panel needs only a button.
function WorkspaceIconDialog({
  open,
  onOpenChange,
  workspace,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: WorkspaceNode;
  onSave: (icon: string | null) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [iconInput, setIconInput] = useState("");
  const [iconUpload, setIconUpload] = useState<string | null>(null);
  const [iconDiscovered, setIconDiscovered] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const iconGuess =
    iconUpload ?? (iconInput.trim() ? resolveIconUrl(iconInput) : null);
  // What Save commits; falls back to the current icon so the tile still shows.
  const pendingIcon = iconDiscovered ?? iconGuess;
  const preview = pendingIcon ?? workspace.icon ?? null;

  // Reset every time the dialog opens so a prior draft doesn't linger.
  useEffect(() => {
    if (open) {
      setIconInput("");
      setIconUpload(null);
      setIconDiscovered(null);
      setCropSrc(null);
    }
  }, [open]);

  // A /favicon.ico guess is just a convention; many sites only declare icons
  // in their HTML head. Ask the Worker to look once the input settles.
  useEffect(() => {
    setIconDiscovered(null);
    if (!iconGuess?.endsWith("/favicon.ico")) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void discoverIcon(iconGuess.slice(0, -"favicon.ico".length)).then(
        (found) => {
          if (!cancelled && found) setIconDiscovered(found);
        },
      );
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [iconGuess]);

  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function save() {
    if (!pendingIcon || busy) return;
    setBusy(true);
    try {
      // A fast type-and-save can beat the debounced discovery; settle first
      // so the committed icon matches what the preview would have shown.
      await onSave(await settleIcon(iconGuess, iconDiscovered));
      toast.success("Workspace icon updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Workspace icon</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <WorkspaceIcon
              workspace={{ name: workspace.name, icon: preview }}
              size="md"
            />
            <p className="text-muted-foreground min-w-0 text-sm">
              Paste a link or upload an image. It loads straight from its own
              site, so Klef never stores a copy elsewhere.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="workspace-icon-url">Link</Label>
            <div className="flex min-w-0 items-center gap-2">
              <Input
                id="workspace-icon-url"
                autoFocus
                placeholder="Site, GitHub, or image URL"
                value={iconInput}
                onChange={(e) => {
                  setIconInput(e.target.value);
                  setIconUpload(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Upload image"
                onClick={() => fileRef.current?.click()}
              >
                <Upload />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!pendingIcon || busy}
            onClick={() => void save()}
          >
            {busy ? "Saving..." : "Save icon"}
          </Button>
        </DialogFooter>
        {cropSrc && (
          <AvatarCropDialog
            key={cropSrc}
            src={cropSrc}
            onCancel={closeCrop}
            onCropped={(dataUrl) => {
              setIconUpload(dataUrl);
              setIconInput("");
              closeCrop();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
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
      if (isStaleSession(res.error)) {
        staleSessionToast("Adding a passkey");
      } else if (!isPasskeyCancel(res.error)) {
        toast.error(res.error.message ?? "Couldn't add passkey");
      }
      return;
    }
    toast.success("Passkey added");
  }

  return (
    <SettingsSection
      title="Passkeys"
      description="Sign in with Face ID, Touch ID or a security key."
      action={
        <Button variant="outline" size="sm" onClick={add} disabled={adding}>
          <Plus />
          {adding ? "Waiting for your device..." : "Add passkey"}
        </Button>
      }
    >
      {isPending ? (
        <SettingNote>Loading passkeys...</SettingNote>
      ) : passkeys?.length ? (
        passkeys.map((pk) => <PasskeyRow key={pk.id} passkey={pk} />)
      ) : (
        <SettingNote>
          No passkeys yet. Add one to sign in without Google or GitHub.
        </SettingNote>
      )}
    </SettingsSection>
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
    credentialID: string;
  };
}) {
  // Vault unlock via passkey (WebAuthn PRF), distinct from the sign-in role
  // above: enabling wraps the DEK under a secret only this passkey can
  // re-derive, so each one is enabled individually and needs the passphrase
  // once (the live DEK is non-extractable, so a re-wrap can't reuse it).
  const { passkeyWraps, enrollPasskey, removePasskeyUnlock } = useVault();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(passkey.name ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const unlockEnabled = passkeyWraps.some((w) => w.passkeyId === passkey.id);

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

  function startEnableUnlock() {
    setEnabling(true);
    setPassphrase("");
    setUnlockError(null);
  }

  async function enableUnlock(e: FormEvent) {
    e.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setUnlockError(null);
    try {
      await enrollPasskey(passphrase, {
        id: passkey.id,
        credentialId: passkey.credentialID,
      });
      setEnabling(false);
      setPassphrase("");
      toast.success("This passkey can now unlock your vault");
    } catch (err) {
      if (err instanceof WrongPassphraseError) {
        setUnlockError("That passphrase didn't work.");
      } else if (err instanceof PasskeyPrfError) {
        if (err.code !== "cancelled") setUnlockError(err.message);
      } else if (err instanceof VaultWriteError) {
        setUnlockError("Couldn't save. Check your connection and try again.");
      } else {
        console.error("Passkey enrollment failed:", err);
        setUnlockError("Couldn't enable passkey unlock. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function disableUnlock() {
    try {
      await removePasskeyUnlock(passkey.id);
      toast.success("Passkey unlock turned off");
    } catch {
      toast.error("Couldn't turn off passkey unlock");
    }
  }

  const label = passkeyLabel(passkey.name, passkey.aaguid);
  const leading = (
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
          <Fingerprint className="text-muted-foreground size-4" />
        </span>
  );

  if (enabling) {
    return (
      <SettingRow
        leading={leading}
        label={label}
        hint="Turn on unlocking with this passkey"
      >
        <form onSubmit={enableUnlock} className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`passkey-unlock-${passkey.id}`}>
              Master passphrase
            </Label>
            <p className="text-muted-foreground text-xs">
              The passphrase from the unlock screen, not your account
              password. Your device asks for the passkey right after.
            </p>
            <PasswordInput
              id={`passkey-unlock-${passkey.id}`}
              autoComplete="current-password"
              aria-invalid={!!unlockError}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
            />
            {unlockError && (
              <p className="text-destructive text-sm">{unlockError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !passphrase}>
              {busy ? "Waiting for your passkey..." : "Confirm and turn on"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setEnabling(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SettingRow>
    );
  }

  if (editing) {
    return (
      <SettingRow leading={leading} label="Rename passkey">
        <form onSubmit={rename} className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            aria-label="Passkey name"
            className="h-8"
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
      </SettingRow>
    );
  }

  if (confirming) {
    return (
      <SettingRow
        leading={leading}
        label={`Remove ${label}?`}
        hint="You won't be able to sign in or unlock with it again."
        control={
          <>
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
          </>
        }
      />
    );
  }

  return (
    <SettingRow
      leading={leading}
      label={label}
      hint={`${added ? `Added ${added}` : "Added"}, ${
        passkey.backedUp ? "synced" : "this device only"
      }`}
      control={
        <>
          <label className="text-muted-foreground flex items-center gap-2 text-xs">
            Unlocks vault
            <Switch
              size="sm"
              checked={unlockEnabled}
              disabled={busy}
              aria-label={`Unlock your vault with ${label}`}
              onCheckedChange={(checked) => {
                if (checked) startEnableUnlock();
                else void disableUnlock();
              }}
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Actions for ${label}`}
                  className="text-muted-foreground"
                >
                  <MoreHorizontal />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirming(true)}
              >
                <Trash2 />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );
}

// Per-device behavior toggles (localStorage, not vault data).
function PreferencesSection() {
  const confirmSave = useConfirmSaveReview();
  const confirmLoad = useConfirmLoadVersion();
  return (
    <>
      <SettingsSection title="Editor">
        <SettingRow
          label="Review changes before saving"
          hint="Show the diff each time you save a version."
          htmlFor="settings-confirm-save"
          control={
            <Switch
              id="settings-confirm-save"
              checked={confirmSave}
              onCheckedChange={setConfirmSaveReview}
            />
          }
        />
        <SettingRow
          label="Warn before replacing unsaved edits"
          hint="Ask before loading a version over edits you haven't saved."
          htmlFor="settings-confirm-load"
          control={
            <Switch
              id="settings-confirm-load"
              checked={confirmLoad}
              onCheckedChange={setConfirmLoadVersion}
            />
          }
        />
      </SettingsSection>
      <SettingsSection
        title="Environment labels"
        description="Rename the built-in labels. Leave one empty for the default."
      >
        {ENVIRONMENTS.map((env) => (
          <EnvLabelField key={env} env={env} />
        ))}
      </SettingsSection>
    </>
  );
}

function EnvLabelField({ env }: { env: PresetEnvironment }) {
  const [text, setText] = useState(() => getEnvLabelOverrides()[env] ?? "");
  const meta = ENV_META[env];
  return (
    <SettingRow
      label={
        <span className="flex items-center gap-2">
          <span
            className={`size-1.5 shrink-0 rounded-full ${meta.dot}`}
            aria-hidden="true"
          />
          {meta.label}
        </span>
      }
      htmlFor={`settings-env-label-${env}`}
      control={
        <Input
          id={`settings-env-label-${env}`}
          value={text}
          maxLength={32}
          placeholder={meta.label}
          onChange={(e) => {
            setText(e.target.value);
            setEnvLabelOverride(env, e.target.value || null);
          }}
          className="h-8 sm:w-56"
        />
      }
    />
  );
}

// The unlock side of security: the passphrase and how long the vault stays
// open. Both are about the vault, not the account sign-in above them.
function VaultSection() {
  return (
    <SettingsSection title="Vault">
      <PassphraseRow />
      <AutoLockRow />
    </SettingsSection>
  );
}

function AutoLockRow() {
  const minutes = useAutoLockMinutes();
  const current = AUTO_LOCK_OPTIONS.find((o) => o.minutes === minutes);
  return (
    <SettingRow
      label="Auto-lock"
      // Lock-now lives in the account menu and on the sidebar's lock button,
      // each with its shortcut, so the hint stays one line.
      hint="Locks when idle, and between visits on this device."
      htmlFor="settings-auto-lock"
      control={
        <Select
          value={String(minutes)}
          onValueChange={(v) => setAutoLockMinutes(Number(v))}
        >
          <SelectTrigger id="settings-auto-lock" size="sm" className="w-44">
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
      }
    />
  );
}

// Change the master passphrase (the unlock gate, not the account password).
// Only the DEK wrapping is redone; blobs and the recovery key are untouched.
function PassphraseRow() {
  const { changePassphrase, lock } = useVault();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

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
      toast.success("Passphrase changed");
      close();
    } catch {
      toast.error("That passphrase didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingRow
      label="Master passphrase"
      hint="Unlocks your vault. Your recovery key keeps working after a change."
      control={
        !open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Change
          </Button>
        )
      }
    >
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="settings-passphrase-current">
              Current passphrase
            </Label>
            <PasswordInput
              id="settings-passphrase-current"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
            />
            {/* The recovery reset lives on the unlock screen; locking is how
                you get there while signed in. */}
            <p className="text-muted-foreground text-sm">
              Forgot it?{" "}
              <button
                type="button"
                onClick={lock}
                className="text-foreground underline underline-offset-2"
              >
                Lock your vault
              </button>{" "}
              and reset it with your recovery key.
            </p>
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
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={busy || !current || !next || !confirm}
            >
              {busy ? "Changing..." : "Change passphrase"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </SettingRow>
  );
}

function RecoverySection({ email }: { email: string }) {
  const { rotateRecovery } = useVault();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setPassphrase("");
    } catch {
      toast.error("That passphrase didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // The id lets the recovery-key banner deep-link here (open + scroll).
    // Danger-toned: generating a new key kills the old one on the spot.
    <SettingsSection id="settings-recovery" title="Recovery key" tone="danger">
      <SettingRow
        label="Generate a new recovery key"
        hint="Your current key stops working the moment you do."
        control={
          !open &&
          !newKey && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setOpen(true)}
            >
              Generate new key
            </Button>
          )
        }
      >
        {newKey ? (
          <div className="flex flex-col gap-3">
            <RecoveryKeyPanel recoveryKey={newKey} email={email} />
            <p className="text-muted-foreground text-xs">
              You'll only see it once, so save it before closing settings.
            </p>
          </div>
        ) : open ? (
          // Inline confirm step; settings is already a dialog, so the
          // warning must not stack another one on top.
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Your current recovery key stops working the moment the new one
              is generated. If you lose the new key and forget your
              passphrase, Klef can't get your vault back.
            </span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="settings-rotate-passphrase">
              Master passphrase
            </Label>
            <PasswordInput
              id="settings-rotate-passphrase"
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !passphrase}>
              {busy ? "Generating..." : "Generate new recovery key"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setPassphrase("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
        ) : null}
      </SettingRow>
    </SettingsSection>
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
    <SettingsSection title="Danger zone" tone="danger">
      <SettingRow
        label="Delete workspace"
        hint={
          !workspace
            ? "No workspace to delete."
            : canDelete
              ? `Deletes "${workspace.name}" and everything inside it.`
              : "You can't delete your only workspace. Create another first."
        }
        control={
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={!workspace || !canDelete}
            onClick={onDelete}
          >
            Delete workspace
          </Button>
        }
      />
    </SettingsSection>
  );
}
