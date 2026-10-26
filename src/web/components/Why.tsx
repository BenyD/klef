import { Link } from "react-router";
import { MarketingLayout } from "./MarketingLayout.tsx";

// Personal note from the maker. Plain prose page (no TOC), linked from the
// footer as "Why Klef".
export function Why() {
  return (
    <MarketingLayout>
      <main className="marketing-page">
        <p className="m-kicker">About</p>
        <h1>Why Klef</h1>
        <p className="marketing-page-lead">
          A short note on why this exists, from the person who built it.
        </p>

        <section>
          <p>
            Every project has a .env file, and mine lived in the worst
            places: chat messages to myself, notes apps, folders named
            keys-final. Setting up a new machine meant hunting them all down
            again, one by one.
          </p>
          <p>
            The tools that solve this either want a team plan or want my
            secrets sitting in plaintext on their server. Neither felt right
            for a personal tool. Secrets should be boring: one place, always
            in sync, readable by no one else.
          </p>
          <p>
            So Klef encrypts everything on your device before it uploads. The
            server stores ciphertext and cannot decrypt it. That is not a
            policy promise, it is{" "}
            <Link to="/security">how the thing is built</Link>.
          </p>
          <p>
            These days most of my code is written with Claude Code and
            Cursor, so the CLI is built to be handed to an agent: it syncs
            the files, never prints a value, and leaves the passphrase to
            me.
          </p>
          <p>
            Klef is{" "}
            <a
              href="https://github.com/BenyD/klef"
              target="_blank"
              rel="noreferrer"
            >
              open source
            </a>
            , self-hostable on your own Cloudflare account, and free to use. I
            use it every day. If it is useful to you too, even
            better.
          </p>
          <p className="marketing-why-sig">
            <a
              href="https://beny.one"
              target="_blank"
              rel="noreferrer"
              className="marketing-credit"
            >
              <img src="/beny.png" alt="" className="marketing-credit-avatar" />
              Beny Dishon K
            </a>
          </p>
        </section>
      </main>
    </MarketingLayout>
  );
}
