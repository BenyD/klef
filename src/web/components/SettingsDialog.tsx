import { useEffect, useState, type FormEvent } from "react";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "../auth.ts";
import { useVault } from "../vault-session.tsx";
import {
  AUTO_LOCK_OPTIONS,
  setAutoLockMinutes,
  useAutoLockMinutes,
} from "../lib/auto-lock.ts";
import type { WorkspaceNode } from "../../shared/api-types.ts";
import { useIsMobile } from "../hooks/use-mobile.ts";
import { LockShortcutKeys } from "./LockShortcutKeys.tsx";
import { StrengthMeter } from "./StrengthMeter.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar.tsx";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
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

export type SettingsTab = "profile" | "security" | "workspace";

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
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className={panelClass}>
            <ProfileSection name={name} email={email} image={image} />
          </TabsContent>

          <TabsContent value="security" className={panelClass}>
            <PasswordSection />
            <Separator />
            <SecuritySection />
            <Separator />
            <RecoverySection />
          </TabsContent>

          <TabsContent value="workspace" className={panelClass}>
            <WorkspaceSection
              workspace={workspace}
              onRename={onRenameWorkspace}
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
  const [imageUrl, setImageUrl] = useState(image ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(name);
    setImageUrl(image ?? "");
  }, [name, image]);

  const preview = imageUrl.trim();
  const initial = (displayName.trim() || email).charAt(0).toUpperCase();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error("Enter a display name");
      return;
    }
    setBusy(true);
    const res = await authClient.updateUser({
      name: trimmed,
      image: preview || null,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message ?? "Couldn't update profile");
    } else {
      toast.success("Profile updated");
    }
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
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="settings-image">Photo URL</Label>
        <Input
          id="settings-image"
          type="url"
          placeholder="https://example.com/me.png"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      </div>
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save profile"}
        </Button>
      </div>
    </form>
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
          Your login password — separate from your master passphrase. Changing
          it signs you out everywhere else.
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
}: {
  workspace: WorkspaceNode | null;
  onRename: (name: string) => Promise<void>;
}) {
  const [wsName, setWsName] = useState(workspace?.name ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWsName(workspace?.name ?? "");
  }, [workspace?.id, workspace?.name]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = wsName.trim();
    if (!workspace || !trimmed || trimmed === workspace.name) return;
    setBusy(true);
    try {
      await onRename(trimmed);
      toast.success("Workspace renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
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
          disabled={!workspace}
        />
      </div>
      <div>
        <Button
          type="submit"
          disabled={
            busy ||
            !workspace ||
            !wsName.trim() ||
            wsName.trim() === workspace.name
          }
        >
          {busy ? "Saving..." : "Rename workspace"}
        </Button>
      </div>
    </form>
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
          Lock the vault after a period of inactivity. You can always lock
          instantly with the lock button or <LockShortcutKeys />.
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
function RecoverySection() {
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
      toast.error("Incorrect passphrase.");
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!newKey) return;
    void navigator.clipboard?.writeText(newKey);
    toast.success("Recovery key copied");
  }

  function download() {
    if (!newKey) return;
    const blob = new Blob(
      [
        `Klef recovery key\n\n${newKey}\n\n`,
        "Keep this somewhere safe and private. It is the ONLY way back into your\n",
        "vault if you forget your passphrase. Klef cannot recover it for you.\n",
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "klef-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Recovery key downloaded");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Recovery key</h3>
        <p className="text-muted-foreground text-sm">
          Lost your recovery key? Generate a new one. The old key stops working
          immediately.
        </p>
      </div>
      {newKey ? (
        <div className="flex flex-col gap-3">
          <pre className="bg-muted rounded-md border p-4 text-center font-mono text-sm tracking-wide break-all whitespace-pre-wrap">
            {newKey}
          </pre>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={copy}
            >
              <Copy />
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={download}
            >
              <Download />
              Download
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Shown once. Save it before closing settings.
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
            ? `Permanently deletes "${workspace.name}" and every project, file, and version inside it.`
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
