import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { useTheme } from "next-themes";
import { useSession } from "./auth.ts";
import { useReturnPath } from "./lib/return-path.ts";
import { shouldLoadDocs } from "./lib/docs-route.ts";
import { lazyPage } from "./lib/lazy-page.tsx";
import { MARKETING_PAGES } from "./lib/seo.ts";
import { prefetchAppData } from "./app-prefetch.ts";
import { Splash } from "./components/Splash.tsx";
import { AppShellSkeleton } from "./components/AppShellSkeleton.tsx";
import { NotFound } from "./components/NotFound.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { Toaster } from "./components/ui/sonner.tsx";

// Each page is its own chunk, so the landing page doesn't download the vault
// and /app doesn't download the marketing site. main.tsx preloads the current
// route's chunk before the first render (see preloadRoute).
const Landing = lazyPage(() => import("./components/Landing.tsx").then((m) => m.Landing));
const Compare = lazyPage(() => import("./components/Compare.tsx").then((m) => m.Compare));
const Pricing = lazyPage(() => import("./components/Pricing.tsx").then((m) => m.Pricing));
const Security = lazyPage(() => import("./components/Security.tsx").then((m) => m.Security));
const Terms = lazyPage(() => import("./components/Terms.tsx").then((m) => m.Terms));
const Privacy = lazyPage(() => import("./components/Privacy.tsx").then((m) => m.Privacy));
const Why = lazyPage(() => import("./components/Why.tsx").then((m) => m.Why));
const AuthPage = lazyPage(() => import("./components/AuthPage.tsx").then((m) => m.AuthPage));
const CliAuthorize = lazyPage(() =>
  import("./components/CliAuthorize.tsx").then((m) => m.CliAuthorize),
);
const VaultArea = lazyPage(() => import("./VaultArea.tsx").then((m) => m.VaultArea));
const ToastLab = lazyPage(() => import("./components/ToastLab.tsx").then((m) => m.ToastLab));
const CliLab = lazyPage(() => import("./components/CliLab.tsx").then((m) => m.CliLab));
const DesignLab = lazyPage(() => import("./components/DesignLab.tsx").then((m) => m.DesignLab));

const MARKETING: Record<string, { preload: () => Promise<void> }> = {
  "/": Landing,
  "/compare": Compare,
  "/pricing": Pricing,
  "/security": Security,
  "/terms": Terms,
  "/privacy": Privacy,
  "/about": Why,
};

/**
 * Start loading the chunk the route at `pathname` renders. main.tsx awaits
 * this before the first render: a prerendered marketing page keeps its markup
 * on screen until its chunk is in, and the app starts its chunk while the
 * session check runs. Never rejects; a failed chunk surfaces when it renders.
 */
export function preloadRoute(pathname: string): Promise<void> {
  const path = pathname.replace(/\/+$/, "") || "/";
  const page =
    MARKETING[path] ??
    (path === "/auth" ? AuthPage : path === "/cli" ? CliAuthorize : null);
  if (page) return page.preload().catch(() => {});
  if (path.startsWith("/docs") || path.startsWith("/dev/")) return Promise.resolve();
  // /app and workspace URLs: don't hold the first render for the app chunk;
  // the skeleton shows while it and the session load side by side.
  void VaultArea.preload().catch(() => {});
  return Promise.resolve();
}

const TITLES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MARKETING_PAGES).map(([path, page]) => [path, page.title])),
  "/cli": "Connect the CLI - Klef",
  "/auth": "Sign in - Klef",
  "/app": "Vault - Klef",
};

// Keep document.title in sync with the route and reset scroll on navigation
// (SPA — index.html only sets the landing title). Unknown paths are workspace
// URLs (/:wsSlug); VaultHome refines those with the workspace name once the
// tree loads.
function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = TITLES[pathname] ?? "Vault - Klef";
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// global.css owns color-scheme (:root/.dark). next-themes' boot script leaves
// a stale inline color-scheme on <html> that outranks the stylesheet and can
// disagree with the theme class (light scrollbars on a dark page); strip it.
function OwnColorScheme() {
  useEffect(() => {
    document.documentElement.style.removeProperty("color-scheme");
  }, []);
  return null;
}

// Keep the tab icon in step with the active theme. The default /favicon.svg
// only tracks the OS via prefers-color-scheme; an explicit in-app toggle can
// diverge from it, so swap in the matching static variant here.
function ThemeFavicon() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    link?.setAttribute("href", `/favicon-${resolvedTheme}.svg`);
  }, [resolvedTheme]);
  return null;
}

function AppArea() {
  const { data: session, isPending } = useSession();
  const { pathname } = useLocation();
  if (isPending) return <AppShellSkeleton />;
  // Remember where the user was headed (e.g. /my-team) so sign-in returns there.
  if (!session) return <Navigate to="/auth" replace state={{ from: pathname }} />;
  // Start the vault and tree requests now, alongside the app chunk, rather
  // than one after another once it has mounted. Idempotent per user.
  prefetchAppData(session.user.id);
  return (
    <VaultArea
      userId={session.user.id}
      name={session.user.name}
      email={session.user.email}
      image={session.user.image}
    />
  );
}

/** The CLI approval page, behind the same gate as the app itself. */
function CliRoute() {
  const { data: session, isPending } = useSession();
  const { pathname, search } = useLocation();
  if (isPending) return <Splash />;
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: `${pathname}${search}` }} />;
  }
  return <CliAuthorize userId={session.user.id} />;
}

/** /docs is a static site beside the SPA; see lib/docs-route.ts. */
function DocsRoute() {
  const loadedUrl = performance.getEntriesByType("navigation")[0]?.name;
  const leave = shouldLoadDocs(loadedUrl, window.location.href);
  useEffect(() => {
    if (leave) window.location.reload();
  }, [leave]);
  return leave ? <Splash /> : <NotFound />;
}

function AuthRoute() {
  const { data: session, isPending } = useSession();
  const from = useReturnPath();
  if (isPending) return <Splash />;
  if (session) return <Navigate to={from ?? "/app"} replace />;
  return <AuthPage />;
}

// What shows while a route's chunk loads. Marketing pages are preloaded before
// the first render and later navigations run in a transition (the old page
// stays up), so in practice this is the app's skeleton on a cold /app load.
function RouteFallback() {
  const { pathname } = useLocation();
  if (pathname === "/auth" || pathname === "/cli") return <Splash />;
  if (pathname in MARKETING) return null;
  return <AppShellSkeleton />;
}

export function App() {
  return (
    <TooltipProvider delay={200}>
      <RouteTitle />
      <OwnColorScheme />
      <ThemeFavicon />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/security" element={<Security />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/about" element={<Why />} />
          <Route path="/docs/*" element={<DocsRoute />} />
          <Route path="/auth" element={<AuthRoute />} />
          <Route path="/app" element={<AppArea />} />
          {/* Approving a `klef login`. Signed-in only, and deliberately not a
              marketing route: it grants a credential. */}
          <Route path="/cli" element={<CliRoute />} />
          {import.meta.env.DEV && (
            <Route path="/dev/toasts" element={<ToastLab />} />
          )}
          {import.meta.env.DEV && (
            <Route path="/dev/design" element={<DesignLab />} />
          )}
          {import.meta.env.DEV && <Route path="/dev/splash" element={<Splash />} />}
          {import.meta.env.DEV && (
            <Route path="/dev/cli" element={<CliLab />} />
          )}
          {/* Workspace home: klef.sh/<workspace-slug>. Marketing routes above
              win first; reserved slugs are rejected at workspace creation. */}
          <Route path="/:wsSlug" element={<AppArea />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
    </TooltipProvider>
  );
}
