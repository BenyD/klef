import { Link } from "react-router";
import { MarketingDoc, type DocSection } from "./MarketingDoc.tsx";

const sections: DocSection[] = [
  {
    id: "the-service",
    heading: "The service",
    body: (
      <p>
        Klef at klef.sh is provided free of charge, currently in beta.
        Features may change, and availability is not guaranteed; there is
        no SLA. If you need hard guarantees, you can{" "}
        <a
          href="https://github.com/BenyD/klef"
          target="_blank"
          rel="noreferrer"
        >
          self-host Klef
        </a>{" "}
        on your own Cloudflare account.
      </p>
    ),
  },
  {
    id: "your-keys",
    heading: "Your keys, your responsibility",
    body: (
      <p>
        Klef is <Link to="/security">zero-knowledge by design</Link>: your
        master passphrase and recovery key never reach the server. That
        means if you lose both, your data cannot be recovered by anyone,
        including Klef. Keep the recovery key somewhere safe.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Acceptable use",
    body: (
      <p>
        Use Klef for storing your own environment files and secrets. Do
        not use it to store or distribute illegal content, attack the
        service, attempt to access other users' data, or resell the hosted
        service. Accounts that abuse the service may be removed.
      </p>
    ),
  },
  {
    id: "no-warranty",
    heading: "No warranty",
    body: (
      <p>
        Klef is provided "as is", without warranty of any kind, in line
        with its{" "}
        <a
          href="https://github.com/BenyD/klef/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          AGPL-3.0 license
        </a>
        . To the maximum extent permitted by law, the author is not liable
        for lost data, lost profits, or any indirect or consequential
        damages arising from use of the service. Keep a copy of anything
        you cannot afford to lose.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes",
    body: (
      <p>
        These terms may be updated as Klef evolves; the date above will
        change when they do. Continuing to use the service after a change
        means you accept the new terms.
      </p>
    ),
  },
];

export function Terms() {
  return (
    <MarketingDoc
      title="Terms of service"
      updated="July 5, 2026"
      lead={
        <>
          Klef is a free, open-source, personal tool for syncing encrypted
          .env files. These terms are short because the deal is simple.
        </>
      }
      sections={sections}
    />
  );
}
