import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// Terminal transcripts for the landing page.
//
// Every line is what the CLI prints (src/cli/commands, src/cli/output.ts),
// down to the wording. None shows a value, because the CLI never prints one:
// that is the claim the page makes, so an invented line with a secret in it
// would undercut it. SSR-safe: the first command renders on the server and
// the rest is plain React state.

export function Transcript({ children }: { children: ReactNode }) {
  return <pre className="m-term-body">{children}</pre>;
}

export function Cmd({ children }: { children: ReactNode }) {
  return (
    <span className="t-line">
      <span className="t-prompt" aria-hidden="true">
        ${" "}
      </span>
      <span className="t-fg">{children}</span>
    </span>
  );
}

export function Out({
  tone,
  children,
}: {
  tone?: "ok" | "fg";
  children?: ReactNode;
}) {
  const cls = tone ? `t-line t-${tone}` : "t-line";
  // An empty line still takes a row, like a blank line in a real terminal.
  return <span className={cls}>{children ?? " "}</span>;
}

/** A typed answer at the end of a prompt line. */
export function Yes() {
  return <span className="t-fg">y</span>;
}

interface Command {
  verb: string;
  does: string;
  lines: ReactNode;
}

const COMMANDS: Command[] = [
  {
    verb: "setup",
    does: "Sign in, link, teach your agents, pull",
    lines: (
      <>
        <Cmd>npx @klefsh/cli setup</Cmd>
        <Out>Step 1 of 4: signed in as you@example.com.</Out>
        <Out>Step 2 of 4: linked to personal / lensdrop (2 files).</Out>
        <Out>Step 3 of 4: instructions for Claude Code and Cursor.</Out>
        <Out>  Create  ./.claude/skills/klef/SKILL.md</Out>
        <Out>  Create  ./.cursor/rules/klef.mdc</Out>
        <Out>
          Write 2 files? [y/N] <Yes />
        </Out>
        <Out>Step 4 of 4: pull .env.local, .env.production.</Out>
        <Out tone="ok">Wrote 14 variables to .env.local</Out>
        <Out tone="ok">Wrote 9 variables to .env.production</Out>
      </>
    ),
  },
  {
    verb: "sync",
    does: "Push or pull, whichever side changed",
    lines: (
      <>
        <Cmd>klef sync</Cmd>
        <Out>.env.local       edited here</Out>
        <Out>.env.production  changed in the vault</Out>
        <Out>About to push .env.local: 14 variables (+1 lines)</Out>
        <Out>
          Push? [y/N] <Yes />
        </Out>
        <Out tone="ok">Pushed 14 variables (+1 lines) to .env.local (version 3f9a2c1d).</Out>
        <Out tone="ok">Wrote 9 variables to .env.production</Out>
      </>
    ),
  },
  {
    verb: "pull",
    does: "Write the vault's copy to disk, mode 0600",
    lines: (
      <>
        <Cmd>klef pull</Cmd>
        <Out tone="ok">Wrote 14 variables to .env.local</Out>
      </>
    ),
  },
  {
    verb: "restore",
    does: "Every linked checkout on a new Mac",
    lines: (
      <>
        <Cmd>klef restore ~/Developer</Cmd>
        <Out>Linked checkouts under /Users/you/Developer:</Out>
        <Out>  lensdrop  personal / lensdrop  (.env.local, .env.production)</Out>
        <Out>  klef  personal / klef  (.env.local, .env.production)</Out>
        <Out>
          Restore these 2? [y/N] <Yes />
        </Out>
        <Out />
        <Out tone="fg">lensdrop</Out>
        <Out tone="ok">  Wrote 14 variables to .env.local</Out>
        <Out tone="ok">  Wrote 9 variables to .env.production</Out>
      </>
    ),
  },
  {
    verb: "audit",
    does: "Key names on Vercel, GitHub, Cloudflare",
    lines: (
      <>
        <Cmd>klef audit vercel</Cmd>
        <Out tone="fg">Vercel Production  (.env.production)</Out>
        <Out>  only on Vercel: OLD_FLAG</Out>
        <Out>  only in .env.production: SENTRY_DSN</Out>
        <Out>  in both: 12</Out>
      </>
    ),
  },
  {
    verb: "unlock",
    does: "One passphrase for the next commands",
    lines: (
      <>
        <Cmd>klef unlock</Cmd>
        <Out>Master passphrase: </Out>
        <Out>Unlocked. Locks after 15 minutes without use, or on `klef lock`.</Out>
      </>
    ),
  },
];

const PANEL_ID = "m-cmd-panel";

/**
 * The CLI section's card: the verbs as a vertical tab list, the chosen one's
 * output beside it. role="tab" promises arrow keys, so they are implemented,
 * with a roving tabindex so the list is one stop in the tab order.
 */
export function CommandTable() {
  const [active, setActive] = useState(1);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const command = COMMANDS[active] as Command;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = COMMANDS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = active === last ? 0 : active + 1;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = active === 0 ? last : active - 1;
    } else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="m-cmds">
      <div className="m-cmd-list" role="tablist" aria-label="Commands" aria-orientation="vertical">
        {COMMANDS.map((c, i) => (
          <button
            key={c.verb}
            type="button"
            role="tab"
            id={`m-cmd-${c.verb}`}
            aria-selected={i === active}
            aria-controls={PANEL_ID}
            tabIndex={i === active ? 0 : -1}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            className="m-cmd"
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
          >
            <span className="m-cmd-verb">{c.verb}</span>
            <span className="m-cmd-does">{c.does}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={`m-cmd-${command.verb}`}
        className="m-panel m-cmd-out"
      >
        {/* Keyed, so switching replays the entrance on the new lines. */}
        <pre key={command.verb} className="m-term-body">
          {command.lines}
        </pre>
        <p className="m-zero">
          <span className="m-dot" aria-hidden="true" />
          Values printed: 0
        </p>
      </div>
    </div>
  );
}
