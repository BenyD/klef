import { useState, type FormEvent } from "react";
import { useVault } from "../vault-context.ts";
import { AuthShell } from "./AuthShell.tsx";
import { Button } from "./ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "./ui/field.tsx";
import { Input } from "./ui/input.tsx";
import { PasswordInput } from "./ui/password-input.tsx";

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
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Unlock your vault
          </CardTitle>
          <CardDescription>
            Enter your master passphrase to decrypt your vault.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="unlock">
                  {mode === "passphrase" ? "Master passphrase" : "Recovery key"}
                </FieldLabel>
                {mode === "passphrase" ? (
                  <PasswordInput
                    id="unlock"
                    autoComplete="current-password"
                    aria-invalid={!!error}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <Input
                    id="unlock"
                    type="text"
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={!!error}
                    placeholder="KLEF-XXXXX-XXXXX"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    autoFocus
                  />
                )}
                {error && <FieldError>{error}</FieldError>}
              </Field>
              <Button type="submit" className="w-full" disabled={busy || !value}>
                {busy ? "Unlocking..." : "Unlock"}
              </Button>
            </FieldGroup>
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
