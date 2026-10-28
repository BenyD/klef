import { STRAND_PATHS } from "../lib/strand.ts";

// Klef brand mark, "Strand": three bars woven into an asterisk, the way a
// hidden value is drawn, each passing over the one before it. The last bar
// can take the accent colour: the strand that is yours. The geometry, and
// why the weave is cut into the paths rather than masked, lives in
// lib/strand.ts; the brand package is generated from the same numbers.
//
// Each bar sits in its own <g>, so a strand can be styled or animated on
// its own. The viewBox leaves a
// margin around the 100-unit grid so the mark fills its box the way the
// previous one did and existing layouts keep their proportions.
export function KlefMark({
  className,
  accent,
}: {
  className?: string;
  /** Colour for the last bar; the others use currentColor. */
  accent?: string;
}) {
  return (
    <svg viewBox="-8 -8 116 116" className={className} aria-hidden="true">
      {STRAND_PATHS.map((d, i) => (
        <g key={i}>
          <path d={d} fill={i === STRAND_PATHS.length - 1 && accent ? accent : "currentColor"} />
        </g>
      ))}
    </svg>
  );
}
