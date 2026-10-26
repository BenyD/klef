import { Link } from "react-router";
import { MarketingDoc, type DocSection } from "./MarketingDoc.tsx";

const sections: DocSection[] = [
  {
    id: "what-klef-stores",
    heading: "What Klef stores",
    body: (
      <ul>
        <li>
          <strong>Account details.</strong> When you sign in with Google or
          GitHub, Klef receives your name, email address, and profile
          picture. If you register a passkey, its public key is stored. A
          session cookie keeps you signed in for 30 days.
        </li>
        <li>
          <strong>Vault metadata.</strong> The names of your workspaces,
          projects, and env files are stored in plaintext so the app can
          show navigation before you unlock your vault.
        </li>
        <li>
          <strong>Encrypted content.</strong> The contents of your
          environment files are encrypted in your browser before upload.
          Klef stores only ciphertext and cannot decrypt it. See{" "}
          <Link to="/security">how the encryption works</Link>.
        </li>
        <li>
          <strong>CLI access tokens.</strong> If you use the CLI, Klef stores
          a hash of each token with its name, when it was created, and when
          it was last used. The token itself is shown once and never stored.
        </li>
      </ul>
    ),
  },
  {
    id: "what-klef-does-not-do",
    heading: "What Klef does not do",
    body: (
      <ul>
        <li>No analytics, tracking scripts, or ads.</li>
        <li>No third-party scripts or CDN fonts; assets are self-hosted.</li>
        <li>No selling, sharing, or mining of your data.</li>
        <li>No plaintext secrets on the server, ever, by construction.</li>
        <li>
          No reading your Vercel, GitHub or Cloudflare accounts.{" "}
          <code>klef audit</code> runs your own CLIs on your machine, and
          nothing it sees is sent to Klef.
        </li>
      </ul>
    ),
  },
  {
    id: "where-data-lives",
    heading: "Where data lives",
    body: (
      <>
        <p>
          Klef runs on Cloudflare Workers with data stored in Cloudflare D1.
          Cloudflare acts as the hosting provider and processes traffic
          according to its own privacy terms. Because content is end-to-end
          encrypted, neither Klef nor Cloudflare can read your files.
        </p>
        <p>
          On your own devices, the browser keeps the unlocked key until
          auto-lock, and the CLI keeps its access token in your OS keychain (or a private
          file where there is no keychain).
          Neither leaves your machine.
        </p>
      </>
    ),
  },
  {
    id: "deleting-your-data",
    heading: "Deleting your data",
    body: (
      <p>
        Deleting a file or project removes its versions from the database.
        To delete your account and everything in it, open an issue on{" "}
        <a
          href="https://github.com/BenyD/klef/issues"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>{" "}
        or reach out via{" "}
        <a href="https://beny.one" target="_blank" rel="noreferrer">
          beny.one
        </a>
        , and it will be removed promptly.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes",
    body: (
      <p>
        If this policy changes, the date above will be updated. The policy
        is versioned with the{" "}
        <a
          href="https://github.com/BenyD/klef"
          target="_blank"
          rel="noreferrer"
        >
          source code
        </a>
        , so every change is public and diffable.
      </p>
    ),
  },
];

export function Privacy() {
  return (
    <MarketingDoc
      title="Privacy policy"
      updated="October 26, 2026"
      lead={
        <>
          Klef is built so that it cannot read your data. This page describes
          the little it does collect, in plain language.
        </>
      }
      sections={sections}
    />
  );
}
