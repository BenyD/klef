import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react"

/* Type chip shown above the title. Each toast variant sets --toast-accent
   on the container; the chip derives its tint from it. */
function ToastChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-(--toast-accent)/25 bg-(--toast-accent)/8 px-1.5 py-0.5 font-mono text-[10px]/4 font-medium tracking-[0.12em] text-(--toast-accent) uppercase">
      {icon}
      {label}
    </span>
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      icons={{
        success: <ToastChip icon={<CircleCheckIcon className="size-3" />} label="Success" />,
        info: <ToastChip icon={<InfoIcon className="size-3" />} label="Info" />,
        warning: <ToastChip icon={<TriangleAlertIcon className="size-3" />} label="Warning" />,
        error: <ToastChip icon={<OctagonXIcon className="size-3" />} label="Error" />,
        loading: (
          <ToastChip icon={<Loader2Icon className="size-3 animate-spin" />} label="Working" />
        ),
        close: <XIcon className="size-3.5" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          /* The child-fade rule replicates sonner's collapsed-stack behavior
             (hide content of toasts behind the front one), which its own CSS
             only applies to styled toasts. */
          /* Wrapping row, not a column: chip and content span full width so
             cancel + action land together on the last row. The background
             mixes a hint of the type accent into the card. */
          toast:
            "group/toast relative flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border bg-[color-mix(in_oklab,var(--popover),var(--toast-accent,var(--popover))_6%)] p-3 pr-8 font-sans text-popover-foreground shadow-lg [&[data-expanded=false][data-front=false]>*]:opacity-0",
          content: "flex w-full flex-col gap-0.5",
          title: "text-sm/snug font-medium",
          /* !important where sonner ships un-gated dark-theme rules that
             would otherwise out-specificity these classes. */
          description: "text-sm/snug text-muted-foreground!",
          icon: "flex w-full",
          /* sonner centers .sonner-loader absolutely via an un-gated rule;
             put the loading chip back in flow like the other type chips. */
          loader: "relative! top-auto! left-auto! w-full transform-none!",
          actionButton:
            "mt-0.5 inline-flex h-7 shrink-0 items-center justify-center rounded-md bg-primary px-2.5 text-[0.8rem] font-medium whitespace-nowrap text-primary-foreground transition-all outline-none select-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px",
          cancelButton:
            "mt-0.5 inline-flex h-7 shrink-0 items-center justify-center rounded-md border border-border bg-background px-2.5 text-[0.8rem] font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
          closeButton:
            "absolute top-2 right-2 rounded-sm border-0! bg-transparent! p-1 text-muted-foreground! opacity-0 transition-opacity outline-none group-hover/toast:opacity-100 hover:text-foreground! focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50",
          success: "[--toast-accent:var(--success)]",
          error: "[--toast-accent:var(--destructive)]",
          warning: "[--toast-accent:var(--warning)]",
          /* No `default` accent: sonner applies classNames.default to every
             toast, so a fallback there would override the per-type accents
             (same specificity, later in the generated stylesheet). Untyped
             toasts render no chip, so none is needed. */
          info: "[--toast-accent:var(--foreground)]",
          loading: "[--toast-accent:var(--muted-foreground)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
