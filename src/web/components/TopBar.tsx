import { KeyRound, Lock, LogOut } from "lucide-react";
import { signOut } from "../auth.ts";
import { useVault } from "../vault-session.tsx";
import { Button } from "./ui/button.tsx";

// Workbench header. Shows a Lock action only when the vault is unlocked.
export function TopBar() {
  const { status, lock } = useVault();
  return (
    <header className="flex shrink-0 items-center justify-between border-b px-5 py-3">
      <div className="flex items-center gap-2">
        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
          <KeyRound className="size-3.5" />
        </div>
        <span className="font-semibold tracking-tight">Klef</span>
      </div>
      <div className="flex items-center gap-1">
        {status === "unlocked" && (
          <Button variant="ghost" size="sm" onClick={lock}>
            <Lock />
            Lock
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => void signOut()}
        >
          <LogOut />
          Sign out
        </Button>
      </div>
    </header>
  );
}
