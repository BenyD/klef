import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { siClaude, siCursor, siGithubcopilot, type SimpleIcon } from "simple-icons";
import { DEFAULT_PROMPT, promptText, type AgentPrompt } from "../lib/agent-prompts.ts";

// The landing page's way of handing a coding agent its first task: a button
// that copies the onboarding prompt from lib/agent-prompts.ts. The prompts
// stay there so their safety rule is tested; this file only copies one.

/**
 * Copies a prompt to the clipboard. The feedback is the glyph alone: it
 * turns into a check that pops in (the span is re-keyed so the animation
 * replays), and the label, if any, stays put.
 */
export function CopyPromptButton({
  prompt,
  className,
  children,
}: {
  prompt: AgentPrompt;
  className?: string;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(promptText(prompt));
      setCopied(true);
      // Long enough to register, short enough that the button is ready again
      // if they switch tabs and copy the other prompt.
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, denied permission). The prompt is
      // selectable text right there, so failing quietly beats an error toast
      // on a marketing page.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={className}
      aria-label={copied ? "Copied" : `Copy the ${prompt.label} prompt`}
      data-copied={copied || undefined}
    >
      {children}
      <span key={copied ? "check" : "copy"} className="m-copy-glyph">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </span>
    </button>
  );
}

const AGENT_MARKS: { icon: SimpleIcon; label: string; own?: boolean }[] = [
  // Claude's mark in its own colour (close to ember); the others follow the
  // text colour, since their brand colour is black.
  { icon: siClaude, label: "Claude Code", own: true },
  { icon: siCursor, label: "Cursor" },
  { icon: siGithubcopilot, label: "GitHub Copilot" },
];

/**
 * The pill in the hero: copies the onboarding prompt, which has an agent
 * take the user from nothing to a linked repo, stopping for the parts only
 * the user can do (signing in, the passphrase, pasting the files).
 */
export function OnboardAgentPill() {
  return (
    <CopyPromptButton prompt={DEFAULT_PROMPT} className="m-agent-pill">
      <span className="m-agent-marks" aria-hidden="true">
        {AGENT_MARKS.map((m) => (
          <span key={m.label} className="m-agent-mark" style={m.own ? { color: `#${m.icon.hex}` } : undefined}>
            <svg viewBox="0 0 24 24" width="12" height="12">
              <path d={m.icon.path} fill="currentColor" />
            </svg>
          </span>
        ))}
      </span>
      Onboard your agent
    </CopyPromptButton>
  );
}
