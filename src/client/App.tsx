import { useSession } from "./auth.ts";
import { LoginScreen } from "./components/LoginScreen.tsx";
import { SignedIn } from "./components/SignedIn.tsx";

export function App() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <main className="shell narrow">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <SignedIn
      user={{ email: session.user.email, name: session.user.name ?? "" }}
    />
  );
}
