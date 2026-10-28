import { useState } from "react"

import { cn } from "@/lib/utils"

// Tailwind's animate-pulse cycle. Every skeleton starts at the same point
// in it, so a placeholder that remounts (the shell handing over to the
// app's own skeleton) keeps pulsing in step instead of jumping.
const PULSE_MS = 2000

function usePulsePhase() {
  const [delay] = useState(() =>
    typeof performance === "undefined"
      ? undefined
      : `${-(performance.now() % PULSE_MS)}ms`
  )
  return delay
}

/**
 * A block placeholder. Size it to the element it stands in for (a 16px icon
 * is `size-4`, a 28px control `h-7`), so nothing moves when content lands.
 * Decorative: the region it sits in carries aria-busy and a LoadingStatus.
 */
function Skeleton({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  const delay = usePulsePhase()
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
      style={{ animationDelay: delay, ...style }}
      {...props}
    />
  )
}

/**
 * A line of text that hasn't arrived. Inline, so it sits in its parent's
 * line box: inside a `text-sm` label it is exactly one 20px line tall, the
 * same as the words that replace it. Give it a width. As a direct flex item
 * it has no line box of its own, so wrap it in a span there.
 */
function SkeletonText({
  className,
  style,
  ...props
}: React.ComponentProps<"span">) {
  const delay = usePulsePhase()
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "inline-block h-[0.75em] max-w-full rounded-sm bg-muted align-middle motion-safe:animate-pulse",
        className
      )}
      style={{ animationDelay: delay, ...style }}
      {...props}
    />
  )
}

export { Skeleton, SkeletonText }
