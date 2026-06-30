import { signOut } from "../auth.ts";

interface Props {
  user: { email: string; name: string };
}

// The "one concise explainer screen" from the onboarding flow: it teaches the
// two-gate model (login vs unlock) right after first sign-in, before vault
// setup (which lands in Phase 3).
export function SignedIn({ user }: Props) {
  return (
    <main className="shell narrow">
      <header className="topbar">
        <strong>Klef</strong>
        <button className="btn ghost small" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <section className="card">
        <h2 className="welcome">You’re in{user.name ? `, ${user.name}` : ""}.</h2>
        <p>Klef keeps two gates separate — this is the whole idea:</p>
        <ol className="gates">
          <li>
            <span className="gate-num">1</span>
            <div>
              <strong>Login</strong> — done. It gets you into the app.
            </div>
          </li>
          <li>
            <span className="gate-num">2</span>
            <div>
              <strong>Unlock</strong> — a master passphrase you’ll set next. It
              decrypts your secrets in this browser and <em>never</em> reaches
              our servers. Lose it and even we can’t recover your data.
            </div>
          </li>
        </ol>
        <p className="muted small">
          Signed in as {user.email}. Vault setup (passphrase + recovery key) is
          the next build phase.
        </p>
      </section>
    </main>
  );
}
