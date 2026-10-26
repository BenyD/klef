import { Link } from "react-router";
import { MarketingDoc, type DocSection } from "./MarketingDoc.tsx";
import { SecurityBoundary } from "./SecurityBoundary.tsx";

// The prose version of SECURITY.md. When a claim here changes, change it
// there too: that file is the one reviewers read.
const sections: DocSection[] = [
  {
    id: "what-the-server-sees",
    heading: "What the server can and cannot see",
    body: (
      <>
        <p>
          Zero-knowledge is a specific claim, so here is exactly where the
          line sits. The server stores your account details (the name and
          email from Google or GitHub sign-in, or your passkey's public key),
          the names of your workspaces, projects, and files (so the app can
          show navigation before you unlock), hashes of your CLI access
          tokens, and opaque encrypted blobs.
        </p>
        <p>
          The server never sees the contents of your environment files, the
          key names inside them, your master passphrase, your recovery key,
          or any key capable of decrypting your data. A full copy of the
          database contains no secret in plaintext.
        </p>
      </>
    ),
  },
  {
    id: "envelope-encryption",
    heading: "Envelope encryption",
    body: (
      <>
        <p>
          Your files are not encrypted directly with your passphrase.
          Instead, Klef uses envelope encryption with two keys:
        </p>
        <ul>
          <li>
            A random <strong>data encryption key (DEK)</strong> is generated
            for your account. Every environment file is encrypted with it
            using AES-256-GCM, with a fresh random 96-bit nonce per save.
          </li>
          <li>
            A <strong>key encryption key (KEK)</strong> is derived from your
            master passphrase with Argon2id (19 MiB memory, 2 iterations,
            per-account random salt), falling back to PBKDF2-SHA-256 with
            600,000 iterations where WASM is unavailable. The KEK is used
            only to wrap the DEK.
          </li>
        </ul>
        <p>
          The server stores the wrapped DEK, never the DEK itself. Changing
          your passphrase re-wraps one key instead of re-encrypting every
          file. The browser and the CLI run the same code, so a file pushed
          from a terminal is encrypted exactly as one pasted in the app.
        </p>
      </>
    ),
  },
  {
    id: "recovery-key",
    heading: "The recovery key",
    body: (
      <p>
        At vault setup, Klef generates a 128-bit recovery key
        (<code>KLEF-XXXXX-...</code>) and shows it exactly once. A second
        copy of the DEK is wrapped under a key derived from it, so you can
        regain access if you forget your passphrase. If you lose both the
        passphrase and the recovery key, your data is unrecoverable by
        design: there is no reset Klef could perform, because Klef never has
        the keys.
      </p>
    ),
  },
  {
    id: "sign-in-vs-unlock",
    heading: "Sign-in is not the same as unlocking",
    body: (
      <p>
        Signing in with Google, GitHub, or a passkey proves who you are to
        the server and fetches your ciphertext. Unlocking derives keys from
        your passphrase and happens entirely on your device. A stolen
        session gets an attacker ciphertext and names, nothing more.
      </p>
    ),
  },
  {
    id: "staying-unlocked",
    heading: "Staying signed in and staying unlocked",
    body: (
      <>
        <p>
          Sign-in lasts 30 days and slides forward while you use it. To spare
          you the passphrase on every reload, the browser keeps the unlocked
          key in IndexedDB as a non-extractable key: page code can ask it to
          decrypt but cannot read its bytes. It is kept only until auto-lock
          (15 idle minutes by default), and locking or signing out deletes it.
        </p>
        <p>
          <strong>Keep unlocked on this device</strong> is an opt-in on the
          unlock screen that stretches auto-lock to 7 days for that browser.
          The trade-off, stated plainly: while it is on, anyone who can use
          that browser profile, or code running on Klef's site there, can
          decrypt your vault without the passphrase. They still cannot export
          the key, and nothing about it reaches the server. Leave it off on
          shared machines.
        </p>
      </>
    ),
  },
  {
    id: "the-cli",
    heading: "The CLI and your agent",
    body: (
      <>
        <p>
          The CLI signs in with an access token, which is an auth credential
          and nothing more: it reaches ciphertext and names, and cannot
          decrypt. It also cannot mint or revoke tokens, approve another
          sign-in, rewrite key material, or delete anything. Only a hash of
          each token is stored.
        </p>
        <ul>
          <li>
            <strong>It never prints a secret value.</strong> There is no{" "}
            <code>klef get</code> and no <code>--print</code>.{" "}
            <code>pull</code> writes the file at mode 0600 and reports a
            count, and errors are redacted on the way out.
          </li>
          <li>
            <strong>It reads the passphrase from your terminal</strong>, never
            from stdin, a flag, or an environment variable, and refuses to
            prompt where it cannot turn off echo. A process that runs the CLI,
            such as a coding agent, can neither supply it nor see it.
          </li>
          <li>
            <strong>
              <code>klef unlock</code> works like <code>ssh-agent</code>.
            </strong>{" "}
            A background process holds the key in memory, answers encrypt and
            decrypt requests on a socket only your user can reach, and locks
            after 15 idle minutes, or the <code>--for</code> time you chose
            (at most 7 days). While it is unlocked, any process running as you
            can use it.
          </li>
          <li>
            <strong>
              <code>pull</code> and <code>push</code> stay in the working
              directory.
            </strong>{" "}
            Absolute paths and <code>../</code> are refused, so an agent
            cannot choose where plaintext lands.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "sync-and-restore",
    heading: "Sync and restore",
    body: (
      <ul>
        <li>
          <code>diff</code> and <code>sync</code> print key names, never
          values.
        </li>
        <li>
          <strong>A pull never overwrites an edit.</strong> <code>sync</code>{" "}
          pulls only over a file that is unchanged since it last matched the
          vault. If both sides changed, nothing is written to either.
        </li>
        <li>
          The record of what matched holds a version id, a timestamp and a
          size per file, not a hash of its contents, which for a short env
          file could be a fingerprint of its values.
        </li>
        <li>
          <code>restore</code> lists every checkout it found and the project
          it asks for, and decrypts nothing until you confirm. It only pulls.
        </li>
      </ul>
    ),
  },
  {
    id: "platform-audit",
    heading: "Auditing Vercel, GitHub and Cloudflare",
    body: (
      <p>
        <code>klef audit</code> compares key names in your local files with
        what Vercel, GitHub Actions and Cloudflare Workers hold. It runs only
        listing commands through your own <code>vercel</code>,{" "}
        <code>gh</code> and <code>wrangler</code> sign-ins, prints names only,
        and needs no unlock. Klef never reads their tokens and never writes
        to those platforms.
      </p>
    ),
  },
  {
    id: "honest-limitations",
    heading: "Honest limitations",
    body: (
      <>
        <p>Klef does not protect against:</p>
        <ul>
          <li>
            A compromised device: a keylogger, a malicious browser extension,
            or malware reading memory while the vault is unlocked.
          </li>
          <li>A weak passphrase, brute-forced offline.</li>
          <li>
            A file after <code>klef pull</code> writes it. It is an ordinary
            file on your disk from then on.
          </li>
          <li>
            Names. Workspace, project, and file names are plaintext, so keep
            secrets out of them.
          </li>
        </ul>
        <p>
          And like any web app, you trust the code the server delivers. Klef
          mitigates this the only honest way: the{" "}
          <a
            href="https://github.com/BenyD/klef"
            target="_blank"
            rel="noreferrer"
          >
            entire codebase is open source
          </a>{" "}
          under AGPL-3.0, the crypto parameters are published constants, and
          you can self-host the whole thing on your own Cloudflare account.
        </p>
      </>
    ),
  },
];

export function Security() {
  return (
    <MarketingDoc
      kicker="Security"
      title="How Klef keeps your secrets secret"
      lead={
        <>
          Klef is an end-to-end encrypted sync tool for .env files. Every file
          is encrypted on your device, in the browser or the CLI, before it is
          uploaded, and decrypted there after it is downloaded. The server
          only ever stores ciphertext it cannot read.
        </>
      }
      intro={<SecurityBoundary />}
      sections={sections}
    >
      <div className="marketing-page-cta">
        <Link to="/auth" className="m-btn m-btn-primary">
          Get started free
        </Link>
        <a
          href="https://github.com/BenyD/klef/blob/main/SECURITY.md"
          target="_blank"
          rel="noreferrer"
          className="m-link-quiet"
        >
          Read SECURITY.md
        </a>
      </div>
    </MarketingDoc>
  );
}
