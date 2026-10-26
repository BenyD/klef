import { Skeleton } from "./ui/skeleton.tsx";

/**
 * Shown while the session and vault resolve on reload. Mirrors the real
 * shell (sidebar on the canvas, inset content panel with a breadcrumb header,
 * project list) so the page appears instantly in place instead of flashing
 * the splash screen. The sidebar is drawn open; that is the default state.
 */
export function AppShellSkeleton() {
  return (
    <div className="bg-sidebar flex h-svh">
      <div className="hidden w-60 shrink-0 flex-col gap-1 p-2 md:flex">
        <div className="flex h-8 items-center gap-2 px-1.5">
          <Skeleton className="size-5 rounded-[5px]" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex h-7 items-center gap-2 px-2">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
        <Skeleton className="mx-2 mt-3 mb-1 h-3 w-14" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex h-7 items-center gap-2 px-2">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      <div className="bg-background flex min-w-0 flex-1 flex-col md:my-2 md:mr-2 md:rounded-lg md:border">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
          <Skeleton className="size-5 rounded-md" />
          <Skeleton className="h-3.5 w-28" />
        </header>

        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-7 w-28 rounded-md" />
          </div>
          <div className="flex flex-col gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
