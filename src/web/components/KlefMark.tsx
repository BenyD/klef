// Klef brand mark: the masked value. Secrets render as asterisks, so the
// asterisk is the mark. Drawn locally (not lucide) so the geometry stays ours:
// six even spokes, radius 7.1, heavier stroke than lucide's Asterisk.
export function KlefMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 4.9v14.2" />
      <path d="M5.85 8.45 18.15 15.55" />
      <path d="M18.15 8.45 5.85 15.55" />
    </svg>
  );
}
