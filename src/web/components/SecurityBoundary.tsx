// Where encryption happens, drawn as two zones and the line between them,
// Shared by the landing page and
// /security, so the two cannot disagree.
export function SecurityBoundary() {
  return (
    <div className="m-boundary">
      <div>
        <p className="m-zone-label">Your device</p>
        <ol className="m-chain">
          <li>
            <span className="m-chain-k">Passphrase</span>
            <span className="m-chain-v">typed by you, never sent</span>
          </li>
          <li>
            <span className="m-chain-k">Argon2id</span>
            <span className="m-chain-v">turns it into a key</span>
          </li>
          <li>
            <span className="m-chain-k">AES-256-GCM</span>
            <span className="m-chain-v">encrypts each .env file</span>
          </li>
        </ol>
      </div>

      <div className="m-line">
        <span>Only ciphertext crosses this line</span>
      </div>

      <div>
        <p className="m-zone-label">Klef server</p>
        <ul className="m-chain">
          <li>
            <span className="m-chain-k">Ciphertext</span>
            <span className="m-chain-v">every version of every file</span>
          </li>
          <li>
            <span className="m-chain-k">Wrapped key</span>
            <span className="m-chain-v">useless without your passphrase</span>
          </li>
          <li>
            <span className="m-chain-k">Names</span>
            <span className="m-chain-v">of workspaces, projects and files</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
