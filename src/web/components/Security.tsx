import { Link } from "react-router";
import { MarketingDoc, type DocSection } from "./MarketingDoc.tsx";

const sections: DocSection[] = [
  {
    id: "what-the-server-sees",
    heading: "What the server can and cannot see",
    body: (
      <>
        <p>
          Zero-knowledge is a specific claim, so here is exactly where the
          line sits. The server stores your account details (the name and
          email from Google sign-in or your passkey), the names of your
          workspaces, projects, and files (so the app can show navigation
          before you unlock), and opaque encrypted blobs.
        </p>
        <p>
          The server never sees the contents of your environment files, your
          master passphrase, your recovery key, or any encryption key capable
          of decrypting your data. There is nothing to leak and nothing to
          subpoena: a full copy of the database contains no secrets in
          plaintext.
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
          your passphrase just re-wraps one key instead of re-encrypting
          every file. All key material lives as non-extractable WebCrypto
          keys in memory, and locking your vault clears it without signing
          you out.
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
        design; there is no reset that Klef could perform, because Klef
        never has the keys.
      </p>
    ),
  },
  {
    id: "sign-in-vs-unlock",
    heading: "Sign-in is not the same as unlocking",
    body: (
      <p>
        Signing in (Google or passkeys) proves who you are to the server
        and fetches your ciphertext. Unlocking derives keys from your
        passphrase and happens entirely in the browser. A stolen session
        gets an attacker ciphertext only.
      </p>
    ),
  },
  {
    id: "honest-limitations",
    heading: "Honest limitations",
    body: (
      <p>
        Workspace, project, and file names are stored in plaintext for
        navigation, so avoid putting secrets in names. And like any web
        app, you trust the code the server delivers; Klef mitigates this
        the only honest way: the{" "}
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
    ),
  },
];

export function Security() {
  return (
    <MarketingDoc
      title="How Klef keeps your secrets secret"
      lead={
        <>
          Klef is a zero-knowledge, end-to-end-encrypted sync tool for .env
          files. Every environment file is encrypted in your browser before it
          is uploaded, and decrypted in your browser after it is downloaded.
          The server only ever stores ciphertext it cannot read.
        </>
      }
      sections={sections}
    >
      <div className="marketing-page-cta">
        <Link to="/auth" className="m-btn m-btn-primary">
          Get started
        </Link>
        <a
          href="https://github.com/BenyD/klef"
          target="_blank"
          rel="noreferrer"
          className="m-btn m-btn-outline"
        >
          Read the source
        </a>
      </div>
    </MarketingDoc>
  );
}
