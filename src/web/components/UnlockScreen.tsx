import { useState, type FormEvent } from "react";
import { VaultWriteError } from "../vault-api.ts";
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
import { StrengthMeter } from "./StrengthMeter.tsx";

export function UnlockScreen() {
  const { unlock, recoverAndReset } = useVault();
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [value, setValue] = useState("");
  // Recovery implies the passphrase is lost, so that mode also collects its
  // replacement and both happen in one submit.
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (mode === "recovery") {
      if (newPassphrase.length < 8) {
        setFieldError("Use at least 8 characters");
        return;
      }
      if (newPassphrase !== confirm) {
        setFieldError("Passphrases don't match");
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === "passphrase") await unlock(value);
      else await recoverAndReset(value, newPassphrase);
      // On success the vault status flips to "unlocked" and this screen unmounts.
    } catch (err) {
      // A write failure means the recovery key was RIGHT; don't blame it.
      setError(
        err instanceof VaultWriteError
          ? "Your new passphrase couldn't be saved. Check your connection and try again."
          : mode === "passphrase"
            ? "That passphrase didn't work."
            : "That recovery key didn't work.",
      );
      setBusy(false);
    }
  }

  function switchMode(next: "passphrase" | "recovery") {
    setMode(next);
    setValue("");
    setNewPassphrase("");
    setConfirm("");
    setError(null);
    setFieldError(null);
  }

  return (
    <AuthShell>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold tracking-tight">
            Unlock your vault
          </CardTitle>
          <CardDescription>
            {mode === "passphrase"
              ? "Enter your master passphrase to decrypt your vault."
              : "Enter your recovery key and choose a new master passphrase."}
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
              {mode === "recovery" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="new-passphrase">
                      New master passphrase
                    </FieldLabel>
                    <PasswordInput
                      id="new-passphrase"
                      autoComplete="new-password"
                      aria-invalid={!!fieldError}
                      value={newPassphrase}
                      onChange={(e) => setNewPassphrase(e.target.value)}
                    />
                    <StrengthMeter value={newPassphrase} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirm-passphrase">
                      Confirm passphrase
                    </FieldLabel>
                    <PasswordInput
                      id="confirm-passphrase"
                      autoComplete="new-password"
                      aria-invalid={!!fieldError}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                    {fieldError && <FieldError>{fieldError}</FieldError>}
                  </Field>
                </>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={
                  busy ||
                  !value ||
                  (mode === "recovery" && (!newPassphrase || !confirm))
                }
              >
                {busy
                  ? "Unlocking..."
                  : mode === "passphrase"
                    ? "Unlock"
                    : "Reset passphrase and unlock"}
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
