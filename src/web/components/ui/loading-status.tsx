import { cn } from "@/lib/utils"

/**
 * What a loading region announces to screen readers: a polite live region
 * with visually hidden text. Pair it with aria-busy on the region and
 * decorative skeletons or spinners inside.
 */
function LoadingStatus({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("sr-only", className)}
      {...props}
    >
      {children}
    </span>
  )
}

export { LoadingStatus }
