import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import { KlefMark } from "./KlefMark.tsx";
import { signOut } from "../auth.ts";
import { clearDek } from "../dek-store.ts";
import { Button } from "./ui/button.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

// Centered layout for the post-login, pre-unlock screens (vault setup, unlock).
export function AuthShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  async function onSignOut() {
    await clearDek();
    await signOut();
    navigate("/");
  }

  return (
    <div className="klef-screen bg-sidebar relative flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => void onSignOut()}
        >
          <LogOut />
          Sign out
        </Button>
      </div>

      <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
        <KlefMark className="size-5" />
        <h1 className="sr-only">Klef</h1>
      </div>

      {children}
    </div>
  );
}
