import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

/**
 * For actions and short indeterminate waits (a button submitting, a decrypt).
 * Decorative: say what is happening in text, a LoadingStatus, or aria-busy
 * on the control. Reduced motion slows it rather than stopping it, so it
 * still reads as working, not stuck.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden="true"
      className={cn(
        "size-4 animate-spin motion-reduce:[animation-duration:2.5s]",
        className
      )}
      {...props}
    />
  )
}

export { Spinner }
