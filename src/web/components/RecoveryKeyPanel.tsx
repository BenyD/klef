import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button.tsx";
import { PasswordInput } from "./ui/password-input.tsx";

/**
 * A freshly generated recovery key with every way to save it. The field
 * carries real credential semantics (form + username + new-password), so
 * password managers attach their own save UI to it; Copy and Download
 * cover the manual route.
 */
export function RecoveryKeyPanel({
  recoveryKey,
  email,
}: {
  recoveryKey: string;
  email: string;
}) {
  function copy() {
    void navigator.clipboard?.writeText(recoveryKey);
    toast.success("Recovery key copied");
  }

  function download() {
    const blob = new Blob(
      [
        `Klef recovery key\n\n${recoveryKey}\n\n`,
        "Keep this somewhere safe and private. It's the only way back into your\n",
        "vault if you forget your passphrase. Klef can't reset it for you.\n",
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
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => e.preventDefault()}>
        {/* Visually hidden (not display:none) so managers still read it. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={email}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
        <PasswordInput
          name="password"
          autoComplete="new-password"
          spellCheck={false}
          readOnly
          value={recoveryKey}
          aria-label="Recovery key"
          className="h-10 text-center font-mono text-sm tracking-wide"
        />
      </form>
      <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
