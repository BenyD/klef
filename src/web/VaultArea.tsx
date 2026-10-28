// Everything behind sign-in, in its own chunk: the vault provider (and with
// it the crypto), plus the screens VaultGate picks between. App.tsx keeps the
// session check in the entry chunk so it runs while this one downloads.

import { useRef } from "react";
import { VaultProvider } from "./vault-session.tsx";
import { useVault } from "./vault-context.ts";
import { Onboarding } from "./components/Onboarding.tsx";
import { UnlockScreen } from "./components/UnlockScreen.tsx";
import { VaultHome } from "./components/VaultHome.tsx";
import { AppShellSkeleton } from "./components/AppShellSkeleton.tsx";

export function VaultArea({
  userId,
  name,
  email,
  image,
}: {
  userId: string;
  name: string;
  email: string;
  image?: string | null;
}) {
  return (
    <VaultProvider userId={userId}>
      <VaultGate name={name} email={email} image={image} />
    </VaultProvider>
  );
}

// Authenticated: route by vault state (the crypto "unlock" gate).
function VaultGate({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  const { status } = useVault();
  // Whether a screen of its own (unlock, setup) came before the vault. Only
  // then is VaultHome a hand-off worth animating; straight from the boot
  // skeleton it should fill in where that skeleton stood.
  const handedOff = useRef(false);
  if (status === "locked" || status === "needs-setup") handedOff.current = true;
  switch (status) {
    case "loading":
      // VaultHome drawn as placeholders: on reload the shell is there at
      // once and fills in, rather than a loading screen of its own.
      return <AppShellSkeleton />;
    case "needs-setup":
      return <Onboarding email={email} />;
    case "locked":
      return <UnlockScreen />;
    case "unlocked":
      return (
        <VaultHome
          name={name}
          email={email}
          image={image}
          animateIn={handedOff.current}
        />
      );
    case "error":
      return <VaultLoadError />;
  }
}

// A transient fetch failure must not read as "no vault yet"; offer a retry
// instead of dropping an existing user into the setup wizard.
function VaultLoadError() {
  const { retryLoad } = useVault();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          Couldn't load your vault
        </h1>
        <p className="text-muted-foreground text-sm">
          Check your connection and try again. Nothing was changed.
        </p>
      </div>
      <button
        type="button"
        onClick={retryLoad}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center rounded-lg px-4 text-sm font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
