import { Skeleton } from "./ui/skeleton.tsx";

/**
 * Shown while the session and vault resolve on reload. Mirrors the real
 * dashboard shell (topbar + icon rail + overview grid) so the page appears
 * instantly in place instead of flashing the splash screen.
 */
export function AppShellSkeleton() {
  return (
    <div className="flex h-svh flex-col">
      <header className="bg-background flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <Skeleton className="size-6 rounded-md" />
        <Skeleton className="h-4 w-28" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg sm:w-48 md:w-56" />
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-6 rounded-full" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="bg-sidebar hidden w-12 shrink-0 flex-col items-center gap-2 border-r py-3 md:flex">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="size-7 rounded-md" />
          ))}
        </div>

        <div className="flex-1 px-4 py-6 sm:px-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
