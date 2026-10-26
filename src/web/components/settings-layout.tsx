import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";

// The settings dialog's layout, Linear-style: each page has one sticky
// heading, then sections; a section is a title over a bordered card, and
// every setting in it is a row with its label and a one-line hint on the
// left and its control on the right. One heading level per group, one line
// of help per setting. Anything longer belongs in the flow it explains.

/** A settings page: sticky title and one-line summary, then its sections. */
export function SettingsPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-popover sticky top-0 z-10 border-b py-3 pr-12 pl-4 sm:py-4 sm:pl-6">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">{description}</p>
      </header>
      <div className="flex flex-col gap-8 p-4 sm:p-6">{children}</div>
    </div>
  );
}

/**
 * A titled group of rows in one bordered card. `action` sits at the right of
 * the title (e.g. "Add passkey"); `tone="danger"` tints the card for
 * destructive settings and keeps them visibly apart.
 */
export function SettingsSection({
  title,
  description,
  action,
  tone = "default",
  id,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "danger";
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-2">
      <div className="flex min-h-7 items-end justify-between gap-4">
        <div className="min-w-0">
          <h3
            className={cn(
              "text-sm font-medium",
              tone === "danger" && "text-destructive",
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="text-muted-foreground text-xs">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div
        className={cn(
          "bg-card divide-y overflow-hidden rounded-lg border",
          tone === "danger" && "border-destructive/30 divide-destructive/20",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: label and a one-line hint on the left, the control on the
 * right. On phones the control drops under the label rather than squeezing
 * it. `children` renders under the row (an expanded form, a list), inside
 * the same card cell.
 */
export function SettingRow({
  label,
  hint,
  htmlFor,
  control,
  leading,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  /** Ties the label to the control for screen readers and clicks. */
  htmlFor?: string;
  control?: ReactNode;
  /** An icon or avatar before the label. */
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-3", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="flex min-w-0 flex-col">
            <Label htmlFor={htmlFor} className="text-sm font-medium">
              {label}
            </Label>
            {hint && (
              <span className="text-muted-foreground text-xs">{hint}</span>
            )}
          </div>
        </div>
        {control && (
          <div className="flex shrink-0 items-center gap-2">{control}</div>
        )}
      </div>
      {children}
    </div>
  );
}

/** A quiet single-line row inside a card: loading and empty states. */
export function SettingNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground px-4 py-3 text-sm">{children}</p>
  );
}
