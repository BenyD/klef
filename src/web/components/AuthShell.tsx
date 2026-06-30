import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { KeyRound, LogOut } from "lucide-react";
import { signOut } from "../auth.ts";
import { Button } from "./ui/button.tsx";

// Centered layout for the post-login, pre-unlock screens (vault setup, unlock).
export function AuthShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  async function onSignOut() {
    await signOut();
    navigate("/");
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-10">
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10 absolute top-4 right-4"
        onClick={() => void onSignOut()}
      >
        <LogOut />
        Sign out
      </Button>

      <div className="flex flex-col items-center gap-3">
        <div className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl">
          <KeyRound className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Klef</h1>
      </div>

      {children}
    </div>
  );
}
