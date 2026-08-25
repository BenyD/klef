import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import {
  AGENT_PROMPTS,
  promptText,
  type AgentPrompt,
} from "../lib/agent-prompts.ts";

/**
 * Copy-paste prompts for coding agents.
 *
 * SSR-safe for the prerender: the first tab renders on the server, and the
 * only browser API (the clipboard) is touched inside a click handler.
 */
export function AgentPrompts() {
  const [activeId, setActiveId] = useState(AGENT_PROMPTS[0]?.id ?? "");
  const active =
    AGENT_PROMPTS.find((p) => p.id === activeId) ?? (AGENT_PROMPTS[0] as AgentPrompt);

  return (
    <section className="marketing-section marketing-agent" id="agents">
      <h2>Hand it to your agent</h2>
      <p className="marketing-section-lead">
        Copy a prompt into Claude Code, Cursor, or whatever you use. Each one
        ends with a rule telling the agent not to print your secrets.
      </p>

      <div className="marketing-agent-card">
        <div className="marketing-agent-tabs" role="tablist" aria-label="Agent prompts">
          {AGENT_PROMPTS.map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              role="tab"
              id={`agent-tab-${prompt.id}`}
              aria-selected={prompt.id === active.id}
              aria-controls={`agent-panel-${prompt.id}`}
              className="marketing-agent-tab"
              onClick={() => setActiveId(prompt.id)}
            >
              {prompt.label}
            </button>
          ))}
          <CopyPromptButton
            prompt={active}
            className="marketing-agent-copy"
          />
        </div>

        <div
          role="tabpanel"
          id={`agent-panel-${active.id}`}
          aria-labelledby={`agent-tab-${active.id}`}
          className="marketing-agent-panel"
        >
          <p className="marketing-agent-desc">{active.description}</p>
          <pre className="marketing-agent-prompt">{promptText(active)}</pre>
        </div>
      </div>
    </section>
  );
}

/**
 * Copies a prompt to the clipboard. Shared by the hero CTA and the prompt
 * panel, which differ only in styling — so the "Copied" feedback, the failure
 * handling, and the label can't drift between the two.
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
      aria-label={`Copy the ${prompt.label} prompt`}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : (children ?? "Copy")}
    </button>
  );
}
