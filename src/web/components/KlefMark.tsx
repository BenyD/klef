import { useId } from "react";

// Klef brand mark: the woven asterisk. Three loops knot into the six points
// of an asterisk, the way a hidden value is drawn, each passing over the one
// before it. The top loop can take the accent colour: the strand that is
// yours. The over/under gaps are cut out with masks rather than painted in a
// background colour, so the mark sits on any surface in `currentColor`.
//
// Geometry on a 100-unit square: each loop is a 24 x 76 stadium drawn with a
// 9-unit stroke, rotated 0, 60 and 120 degrees about the centre. A loop is
// cut by every loop drawn after it, widened to an 18-unit band: that band is
// the gap either side of the crossing strand.
const LOOP = { x: 38, y: 12, width: 24, height: 76, rx: 12 };
const ANGLES = [0, 60, 120];

export function KlefMark({
  className,
  accent,
}: {
  className?: string;
  /** Colour for the top loop; the others use currentColor. */
  accent?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <defs>
        {ANGLES.slice(0, -1).map((_, i) => (
          <mask key={i} id={`${id}-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <rect width="100" height="100" fill="white" />
            {ANGLES.slice(i + 1).map((a) => (
              <rect key={a} {...LOOP} stroke="black" strokeWidth="18" transform={`rotate(${a} 50 50)`} />
            ))}
          </mask>
        ))}
      </defs>
      {/* The mask goes on a wrapping group: on the rotated rect itself it
          would be rotated along with the loop. */}
      {ANGLES.map((a, i) => (
        <g key={a} mask={i < ANGLES.length - 1 ? `url(#${id}-${i})` : undefined}>
          <rect
            {...LOOP}
            stroke={i === ANGLES.length - 1 && accent ? accent : "currentColor"}
            strokeWidth="9"
            transform={`rotate(${a} 50 50)`}
          />
        </g>
      ))}
    </svg>
  );
}
