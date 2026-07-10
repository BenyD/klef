import { Check } from "lucide-react";

// Live strength feedback for any new secret: the onboarding passphrase,
// sign-up passwords, and password changes all share the same meter so
// "Strong" means the same thing everywhere.

// Contextual strength levels on the semantic tokens: destructive (weak) ->
// warning (fair/good) -> success (strong).
const STRENGTH = [
  { label: "Weak", bar: "bg-destructive", text: "text-destructive" },
  { label: "Weak", bar: "bg-destructive", text: "text-destructive" },
  { label: "Fair", bar: "bg-warning", text: "text-warning" },
  { label: "Good", bar: "bg-warning", text: "text-warning" },
  { label: "Strong", bar: "bg-success", text: "text-success" },
] as const;

// Each satisfied check fills one strength segment (guidance only; the 8-char
// minimum is also enforced by the schema). Shown as a live checklist so the
// path to "Strong" is explicit.
const CHECKS = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "14+ characters", test: (p: string) => p.length >= 14 },
  {
    label: "Upper & lowercase",
    test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  {
    label: "Number or symbol",
    test: (p: string) => /\d/.test(p) || /[^A-Za-z0-9]/.test(p),
  },
] as const;

export function StrengthMeter({ value }: { value: string }) {
  const passed = CHECKS.filter((c) => c.test(value)).length;
  // Anything typed but too weak still reads as at least one red segment.
  const score = value ? Math.max(1, passed) : 0;
  const level = STRENGTH[score] ?? STRENGTH[1];
  return (
    <div className="mt-1 flex flex-col gap-2">
      {value !== "" && (
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  n <= score ? level.bar : "bg-border"
                }`}
              />
            ))}
          </div>
          <span className={`w-10 text-right text-xs ${level.text}`}>
            {level.label}
          </span>
        </div>
      )}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
        {CHECKS.map((c) => {
          const ok = value !== "" && c.test(value);
          return (
            <li
              key={c.label}
              className={`flex items-center gap-1.5 text-xs transition-colors ${
                ok ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {ok ? (
                <Check className="size-3 text-success" />
              ) : (
                <span
                  className="border-border size-3 shrink-0 rounded-full border"
                  aria-hidden="true"
                />
              )}
              {c.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
