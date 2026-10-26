import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// Terminal transcripts for the landing page.
//
// Every line is what the CLI prints (src/cli/commands, src/cli/output.ts),
// down to the wording. None shows a value, because the CLI never prints one:
// that is the claim the page makes, so an invented line with a secret in it
// would undercut it. SSR-safe: the first tab renders on the server and the
// rest is plain React state.

export function Terminal({
  title,
  compact,
  className,
  children,
}: {
  title?: ReactNode;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure
      className={["m-term", compact && "m-term-compact", className]
        .filter(Boolean)
        .join(" ")}
    >
      {title && (
        <figcaption className="m-term-bar">
          <span className="m-term-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="m-term-title">{title}</span>
        </figcaption>
      )}
      <pre className="m-term-body">{children}</pre>
    </figure>
  );
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

interface Demo {
  id: string;
  label: string;
  /** Where the command runs, shown in the title bar. */
  cwd: string;
  lines: ReactNode;
}

const DEMOS: Demo[] = [
  {
    id: "sync",
    label: "sync",
    cwd: "~/Developer/lensdrop",
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
    id: "setup",
    label: "setup",
    cwd: "~/Developer/lensdrop",
    lines: (
      <>
        <Cmd>npx @klefsh/cli setup</Cmd>
        <Out>Step 1 of 4: signed in as you@example.com.</Out>
        <Out>
          Step 2 of 4: linked to personal / lensdrop (2 files). Wrote .klef.json, which is safe to
          commit.
        </Out>
        <Out>Step 3 of 4: instructions for Claude Code and Cursor.</Out>
        <Out>  Create  ./.claude/skills/klef/SKILL.md</Out>
        <Out>  Create  ./.cursor/rules/klef.mdc</Out>
        <Out>
          Write 2 files? [y/N] <Yes />
        </Out>
        <Out>Step 4 of 4: pull .env.local, .env.production.</Out>
        <Out>Master passphrase: </Out>
        <Out>
          Unlocked. Locks after 15 minutes without use, or on `npx @klefsh/cli lock`.
        </Out>
        <Out tone="ok">Wrote 14 variables to .env.local</Out>
        <Out tone="ok">Wrote 9 variables to .env.production</Out>
        <Out tone="ok">Done. New Claude Code and Cursor sessions in this repo already know how to use Klef.</Out>
      </>
    ),
  },
  {
    id: "restore",
    label: "restore",
    cwd: "~ (a new Mac)",
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
    id: "audit",
    label: "audit",
    cwd: "~/Developer/lensdrop",
    lines: (
      <>
        <Cmd>klef audit</Cmd>
        <Out tone="fg">Vercel Production  (.env.production)</Out>
        <Out>  only on Vercel: OLD_FLAG</Out>
        <Out>  only in .env.production: SENTRY_DSN</Out>
        <Out>  in both: 12</Out>
        <Out />
        <Out tone="fg">GitHub repository secrets  (.env.production)</Out>
        <Out>  only on GitHub: DEPLOY_HOOK</Out>
        <Out>  in both: 4</Out>
      </>
    ),
  },
];

const PANEL_ID = "m-demo-panel";

/**
 * The hero's product shot: one terminal, a tab per command. role="tab"
 * promises arrow keys, so they are implemented, with a roving tabindex so the
 * strip is one stop in the tab order.
 */
export function TerminalDemo() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const demo = DEMOS[active] as Demo;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = DEMOS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (event.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="m-demo">
      <div className="m-demo-bar">
        <span className="m-term-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <div className="m-demo-tabs" role="tablist" aria-label="CLI examples">
          {DEMOS.map((d, i) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              id={`m-demo-tab-${d.id}`}
              aria-selected={i === active}
              aria-controls={PANEL_ID}
              tabIndex={i === active ? 0 : -1}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              className="m-demo-tab"
              onClick={() => setActive(i)}
              onKeyDown={onKeyDown}
            >
              klef {d.label}
            </button>
          ))}
        </div>
        <span className="m-demo-cwd">{demo.cwd}</span>
      </div>
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={`m-demo-tab-${demo.id}`}
        className="m-demo-panel"
      >
        {/* Keyed, so switching tabs replays the entrance on the new lines. */}
        <pre key={demo.id} className="m-term-body m-demo-body">
          {demo.lines}
        </pre>
      </div>
      <div className="m-demo-foot">
        <span className="m-demo-dot" aria-hidden="true" />
        Values printed: 0
      </div>
    </div>
  );
}
