import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// Terminal transcripts for the landing page.
//
// Every line is what the CLI prints (src/cli/commands, src/cli/output.ts),
// down to the wording. None shows a value, because the CLI never prints one:
// that is the claim the page makes, so an invented line with a secret in it
// would undercut it. SSR-safe: the server renders the first step in full.

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

export function Out({ tone, children }: { tone?: "ok" | "fg"; children?: ReactNode }) {
  const cls = tone ? `t-line t-${tone}` : "t-line";
  // An empty line still takes a row, like a blank line in a real terminal.
  return <span className={cls}>{children ?? " "}</span>;
}

/** A typed answer at the end of a prompt line. */
export function Yes() {
  return <span className="t-fg">y</span>;
}

interface Step {
  label: string;
  title: string;
  body: string;
  lines: ReactNode;
}

const STEPS: Step[] = [
  {
    label: "01 Setup",
    title: "Link the repo",
    body: "Signs this machine in, links the checkout, teaches your agents and pulls what is missing.",
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
      </>
    ),
  },
  {
    label: "02 Sync",
    title: "Push and pull in one go",
    body: "Pushes what you edited, pulls what changed. Both changed? It writes nothing and shows which keys differ.",
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
    label: "03 Restore",
    title: "A new machine in one command",
    body: "Clone your repos, confirm once, and every linked checkout gets its files back.",
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
    label: "04 Audit",
    title: "Check the platforms",
    body: "Compares key names on Vercel, GitHub and Cloudflare against your files. Read-only, names only.",
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
];

const PANEL_ID = "m-step-panel";

/**
 * How it works: the steps as a vertical tab list in a bordered grid, the
 * chosen step's real output on the tinted panel beside it. role="tab"
 * promises arrow keys, so they are implemented, with a roving tabindex so
 * the list is one stop in tab order.
 */
export function StepTabs() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const step = STEPS[active] as Step;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = STEPS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = active === last ? 0 : active + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="m-split">
      <div className="m-steps" role="tablist" aria-label="How it works" aria-orientation="vertical">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            role="tab"
            id={`m-step-${i}`}
            aria-selected={i === active}
            aria-controls={PANEL_ID}
            tabIndex={i === active ? 0 : -1}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            className="m-step"
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
          >
            <span className="m-label">{s.label}</span>
            <span className="m-step-title">{s.title}</span>
            <span className="m-step-body">{s.body}</span>
          </button>
        ))}
      </div>
      <div className="m-tint" role="tabpanel" id={PANEL_ID} aria-labelledby={`m-step-${active}`}>
        <div className="m-shot m-shot-panel">
          <div className="m-shot-bar">
            <span className="m-shot-dot" />
            <span className="m-shot-dot" />
            <span className="m-shot-dot" />
            <span className="m-shot-title">zsh</span>
          </div>
          {/* Keyed, so switching replays the entrance on the new lines. */}
          <pre key={active} className="m-term">
            {step.lines}
          </pre>
        </div>
      </div>
    </div>
  );
}
