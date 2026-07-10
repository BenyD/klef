import { useRef, useState } from "react";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type BannerVariant = "info" | "success" | "warning" | "error";

const ICONS: Record<BannerVariant, typeof InfoIcon> = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  error: OctagonXIcon,
};

/* Same accent scheme as the toasts (ui/sonner.tsx): the variant sets
   --banner-accent and every tinted piece derives from it. */
const ACCENTS: Record<BannerVariant, string> = {
  info: "[--banner-accent:var(--foreground)]",
  success: "[--banner-accent:var(--success)]",
  warning: "[--banner-accent:var(--warning)]",
  error: "[--banner-accent:var(--destructive)]",
};

const storageKey = (id: string) => `klef-banner-${id}`;

// localStorage may be unavailable (private mode, test env); the banner then
// shows again next load, which is harmless.
function isDismissed(id: string) {
  try {
    return localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

function persistDismissal(id: string) {
  try {
    localStorage.setItem(storageKey(id), "1");
  } catch {
    // Still hides for this session via state.
  }
}

/**
 * Full-width announcement strip for the app shell. Passing `id` makes the
 * dismissal stick (localStorage), so an announcement stays gone once closed;
 * omit it for banners that should return on reload.
 */
export function Banner({
  variant = "info",
  id,
  className,
  children,
}: {
  variant?: BannerVariant;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [dismissed, setDismissed] = useState(() => !!id && isDismissed(id));
  const ref = useRef<HTMLDivElement>(null);
  if (dismissed) return null;

  const Icon = ICONS[variant];

  function dismiss() {
    if (id) persistDismissal(id);
    const el = ref.current;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!el || reduced || typeof el.animate !== "function") {
      setDismissed(true);
      return;
    }
    // Collapse in place so the layout below slides up with it. Padding and
    // border must reach zero too: with border-box they'd otherwise hold the
    // strip open at height 0.
    el.style.overflow = "hidden";
    const anim = el.animate(
      [
        { height: `${el.offsetHeight}px`, opacity: 1 },
        {
          height: "0px",
          opacity: 0,
          paddingTop: "0px",
          paddingBottom: "0px",
          borderBottomWidth: "0px",
        },
      ],
      /* fill holds the collapsed end state through the gap between the
         animation finishing and React unmounting; without it the strip
         snaps back to full height for a frame. */
      { duration: 250, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
    );
    anim.onfinish = () => setDismissed(true);
  }

  return (
    <div
      ref={ref}
      role="status"
      className={cn(
        "relative flex w-full shrink-0 items-center justify-center gap-2 border-b bg-[color-mix(in_oklab,var(--background),var(--banner-accent)_8%)] px-10 py-2 text-sm",
        /* Hairline diagonal stripes in the accent (Supabase-style) so the
           strip reads as an announcement, not permanent chrome. */
        "[background-image:repeating-linear-gradient(45deg,color-mix(in_oklab,var(--banner-accent)_7%,transparent)_0px,color-mix(in_oklab,var(--banner-accent)_7%,transparent)_1px,transparent_1px,transparent_9px)]",
        ACCENTS[variant],
        className,
      )}
    >
      {/* Pinned to the first text line (not the block's center), so the strip
          still reads right when the message wraps to two lines. */}
      <span className="mt-px inline-flex shrink-0 items-center self-start rounded-sm border border-(--banner-accent)/25 bg-(--banner-accent)/10 p-0.5 text-(--banner-accent)">
        <Icon className="size-3" />
      </span>
      <div className="text-left">{children}</div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/30 absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 transition-colors outline-none focus-visible:ring-2"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
