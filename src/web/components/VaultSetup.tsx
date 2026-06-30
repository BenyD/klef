import { useState, type FormEvent } from "react";
import { Check, Copy, Download } from "lucide-react";
import { useVault } from "../vault-session.tsx";
import { AuthShell } from "./AuthShell.tsx";
import { Button } from "./ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { Label } from "./ui/label.tsx";
import { PasswordInput } from "./ui/password-input.tsx";

const MIN_LENGTH = 8;

export function VaultSetup() {
  const { runSetup, finishSetup } = useVault();
  const [step, setStep] = useState<"passphrase" | "recovery">("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases don’t match.");
      return;
    }
    setBusy(true);
    try {
      setRecoveryKey(await runSetup(passphrase));
      setStep("recovery");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    void navigator.clipboard?.writeText(recoveryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob(
      [
        `Klef recovery key\n\n${recoveryKey}\n\n`,
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
  }

  return (
    <AuthShell>
      {step === "passphrase" ? (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Set your master passphrase</CardTitle>
            <CardDescription>
              This encrypts your vault in this browser. We can't reset it, so
              choose something strong you'll remember.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="passphrase">Master passphrase</Label>
                <PasswordInput
                  id="passphrase"
                  autoComplete="new-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirm">Confirm passphrase</Label>
                <PasswordInput
                  id="confirm"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Creating your vault…" : "Create vault"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Save your recovery key</CardTitle>
            <CardDescription>
              Shown once. It's the only way back if you forget your passphrase.
              We can't recover it for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <pre className="bg-muted rounded-md border p-4 text-center font-mono text-sm tracking-wide break-all whitespace-pre-wrap">
              {recoveryKey}
            </pre>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={copy}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={download}
              >
                <Download />
                Download
              </Button>
            </div>
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                style={{ accentColor: "var(--primary)" }}
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              <span>
                I’ve saved my recovery key.
              </span>
            </label>
            <Button className="w-full" disabled={!saved} onClick={finishSetup}>
              Enter my vault
            </Button>
          </CardContent>
        </Card>
      )}
    </AuthShell>
  );
}
