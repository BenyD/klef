import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

// Terminal transcripts and motion helpers for the landing page.
//
// Every line is what the CLI prints (src/cli/commands, src/cli/output.ts),
// down to the wording. None shows a value, because the CLI never prints one:
// that is the claim the page makes, so an invented line with a secret in it
// would undercut it. SSR-safe: the server renders the first step and every
// label in its final form; motion starts only after mount.

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

const CIPHER = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789*%#?";

/**
 * A label that decrypts into place: it starts as cipher characters and
 * resolves left to right. The server and first paint show the final text,
 * and reduced motion keeps it there, so nothing depends on the animation.
 */
export function useDecrypted(text: string, delay = 0): string {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tick = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        tick += 1;
        setShown(
          text
            .split("")
            .map((ch, i) => (ch === " " || tick > i * 2 ? ch : CIPHER[(i * 11 + tick * 17) % CIPHER.length]))
            .join(""),
        );
        if (tick > text.length * 2) window.clearInterval(timer);
      }, 40);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [text, delay]);
  return shown;
}

export function Decrypt({ text, delay }: { text: string; delay?: number }) {
  const shown = useDecrypted(text, delay);
  // The visible text scrambles; assistive tech reads the real label once.
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="m-sr">{text}</span>
    </>
  );
}

interface Step {
  label: string;
  body: string;
  lines: ReactNode;
}

const STEPS: Step[] = [
  {
    label: "01 Setup",
    body: "Signs this machine in, links the repo, teaches your agents and pulls what is missing.",
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
    body: "Clone your repos on a new Mac, confirm once, and every linked checkout gets its files back.",
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
    body: "Checks key names on Vercel, GitHub and Cloudflare against your files. Read-only, names only.",
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
 * How it works: the steps as a vertical tab list, the chosen step's real
 * output on the ember panel. role="tab" promises arrow keys, so they are
 * implemented, with a roving tabindex so the list is one stop in tab order.
 */
export function StepTabs() {
  const [active, setActive] = useState(1);
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
            <span className="m-label">
              <Decrypt text={s.label} delay={200 + i * 150} />
            </span>
            <span>{s.body}</span>
          </button>
        ))}
      </div>
      <div className="m-grain" role="tabpanel" id={PANEL_ID} aria-labelledby={`m-step-${active}`}>
        {/* Keyed, so switching replays the entrance on the new lines. */}
        <pre key={active} className="m-term">
          {step.lines}
        </pre>
      </div>
    </div>
  );
}
