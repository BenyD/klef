import { useRef, type UIEvent } from "react";
import { cn } from "../lib/utils.ts";
import { tokenizeEnvLine, type EnvToken } from "../lib/env-syntax.ts";

// Syntax colors: keys cool, string values warm, chrome muted. Chosen apart
// from the diff greens/reds and the env dots so nothing collides.
const TOKEN_CLASS: Record<EnvToken["type"], string> = {
  comment: "text-muted-foreground",
  export: "text-violet-600 dark:text-violet-400",
  key: "text-sky-700 dark:text-sky-400",
  eq: "text-muted-foreground",
  value: "text-foreground",
  string: "text-amber-600 dark:text-amber-400",
  text: "text-foreground",
};

// Both layers must wrap identically; any divergence misaligns the caret.
const TYPOGRAPHY =
  "p-3 font-mono text-sm leading-relaxed break-words whitespace-pre-wrap";

/**
 * A highlighted env editor: a real textarea (transparent text, visible caret)
 * over a colorized mirror. Keeps native editing, selection, and undo; the
 * mirror repaints per keystroke and follows the textarea's scroll.
 */
export function EnvCodeEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const mirrorRef = useRef<HTMLDivElement>(null);

  function syncScroll(e: UIEvent<HTMLTextAreaElement>) {
    const t = e.currentTarget;
    const mirror = mirrorRef.current;
    if (mirror) {
      mirror.scrollTop = t.scrollTop;
      mirror.scrollLeft = t.scrollLeft;
    }
  }

  return (
    <div
      className={cn(
        "border-input focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 relative overflow-hidden rounded-md border transition-colors dark:bg-input/30",
        className,
      )}
    >
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden",
          TYPOGRAPHY,
        )}
      >
        {value === "" && placeholder ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          value.split("\n").map((line, i) => (
            <span key={i}>
              {tokenizeEnvLine(line).map((token, j) => (
                <span key={j} className={TOKEN_CLASS[token.type]}>
                  {token.text}
                </span>
              ))}
              {"\n"}
            </span>
          ))
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(
          "caret-foreground placeholder:text-transparent relative block h-full w-full resize-none bg-transparent text-transparent outline-none",
          TYPOGRAPHY,
        )}
      />
    </div>
  );
}
