import type { CSSProperties } from "react";
import { pixelField, type PixelFieldOptions } from "../lib/pixel-field.ts";

/**
 * A scatter of square cells on a grid behind a surface: most breathe, a few
 * step from cell to cell, a few blink. Decorative, so hidden from assistive
 * tech, and still under prefers-reduced-motion (see global.css). The field
 * is `cols` x `rows` cells of `cell` pixels; the caller positions and masks
 * it.
 */
export function PixelField({
  cell = 32,
  className,
  ...options
}: PixelFieldOptions & { cell?: number; className?: string }) {
  const cells = pixelField(options);
  return (
    <div
      className={className ? `klef-px-field ${className}` : "klef-px-field"}
      style={{ "--cell": `${cell}px`, width: options.cols * cell, height: options.rows * cell } as CSSProperties}
      aria-hidden="true"
    >
      {cells.map((c) => (
        <span
          key={`${c.col},${c.row}`}
          className="klef-px-wrap"
          style={{ left: c.col * cell, top: c.row * cell, "--enter": `${c.enter}ms` } as CSSProperties}
        >
          <i
            className={[
              "klef-px",
              `klef-px-${c.tone}`,
              c.blink ? "is-blink" : "",
              c.walk ? `is-mover klef-px-walk-${c.walk.name}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={
              {
                "--floor": c.floor,
                "--peak": c.peak,
                "--dur": `${c.duration}s`,
                "--delay": `${c.delay}s`,
                ...(c.walk ? { "--walk-dur": `${c.walk.duration}s`, "--walk-delay": `${c.walk.delay}s` } : {}),
              } as CSSProperties
            }
          />
        </span>
      ))}
    </div>
  );
}

/** The field behind the canvas screens (splash, sign-in, unlock, CLI connect). */
export function CanvasField() {
  return <PixelField className="klef-canvas-field" cell={32} cols={40} rows={24} count={64} seed={5} />;
}
