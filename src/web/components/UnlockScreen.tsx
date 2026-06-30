import { useState, type FormEvent } from "react";
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
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

export function UnlockScreen() {
  const { unlock, recover } = useVault();
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "passphrase") await unlock(value);
      else await recover(value);
      // On success the vault status flips to "unlocked" and this screen unmounts.
    } catch {
      setError(
        mode === "passphrase"
          ? "Incorrect passphrase."
          : "That recovery key didn’t work.",
      );
      setBusy(false);
    }
  }

  function switchMode(next: "passphrase" | "recovery") {
    setMode(next);
    setValue("");
    setError(null);
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Unlock your vault</CardTitle>
          <CardDescription>
            Enter your master passphrase to decrypt your secrets in this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="unlock">
                {mode === "passphrase" ? "Master passphrase" : "Recovery key"}
              </Label>
              <Input
                id="unlock"
                type={mode === "passphrase" ? "password" : "text"}
                spellCheck={false}
                autoComplete={mode === "passphrase" ? "current-password" : "off"}
                placeholder={mode === "recovery" ? "KLEF-XXXXX-XXXXX-…" : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !value}>
              {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </form>
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground mt-2 h-auto w-full font-normal"
            onClick={() =>
              switchMode(mode === "passphrase" ? "recovery" : "passphrase")
            }
          >
            {mode === "passphrase"
              ? "Forgot your passphrase? Use your recovery key"
              : "Use your passphrase instead"}
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
