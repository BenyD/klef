import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
/** Stable across tab changes, because only one panel is ever in the DOM. */
const PANEL_ID = "agent-prompt-panel";

export function AgentPrompts() {
  const [activeId, setActiveId] = useState(AGENT_PROMPTS[0]?.id ?? "");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(
    0,
    AGENT_PROMPTS.findIndex((p) => p.id === activeId),
  );
  const active = AGENT_PROMPTS[activeIndex] as AgentPrompt;

  /**
   * role="tab" promises arrow-key navigation, so it has to be implemented:
   * arrows move and wrap, Home/End jump to the ends, and focus follows the
   * selection. Paired with the roving tabindex below, which keeps the tab strip
   * a single stop in the page's tab order rather than one stop per tab.
   */
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = AGENT_PROMPTS.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowRight") next = activeIndex === last ? 0 : activeIndex + 1;
    else if (event.key === "ArrowLeft") next = activeIndex === 0 ? last : activeIndex - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;

    event.preventDefault();
    const target = AGENT_PROMPTS[next];
    if (!target) return;
    setActiveId(target.id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="marketing-section marketing-agent" id="agents">
      <h2>Hand it to your agent</h2>
      <p className="marketing-section-lead">
        Copy a prompt into Claude Code, Cursor, or whatever you use. Each one
        ends with a rule telling the agent not to print your secrets.
      </p>

      <div className="marketing-agent-card">
        <div className="marketing-agent-tabs" role="tablist" aria-label="Agent prompts">
          {AGENT_PROMPTS.map((prompt, index) => (
            <button
              key={prompt.id}
              type="button"
              role="tab"
              id={`agent-tab-${prompt.id}`}
              aria-selected={prompt.id === active.id}
              // One panel is rendered at a time, so every tab controls that
              // same element. Pointing at a per-tab id would dangle for
              // whichever tab isn't currently selected.
              aria-controls={PANEL_ID}
              tabIndex={prompt.id === active.id ? 0 : -1}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              className="marketing-agent-tab"
              onClick={() => setActiveId(prompt.id)}
              onKeyDown={onTabKeyDown}
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
          id={PANEL_ID}
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
