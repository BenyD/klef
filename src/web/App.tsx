import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { useTheme } from "next-themes";
import { useSession } from "./auth.ts";
import { useReturnPath } from "./lib/return-path.ts";
import { VaultProvider } from "./vault-session.tsx";
import { useVault } from "./vault-context.ts";
import { Landing } from "./components/Landing.tsx";
import { Security } from "./components/Security.tsx";
import { Terms } from "./components/Terms.tsx";
import { Privacy } from "./components/Privacy.tsx";
import { Why } from "./components/Why.tsx";
import { AuthPage } from "./components/AuthPage.tsx";
import { Onboarding } from "./components/Onboarding.tsx";
import { UnlockScreen } from "./components/UnlockScreen.tsx";
import { VaultHome } from "./components/VaultHome.tsx";
import { Splash } from "./components/Splash.tsx";
import { ToastLab } from "./components/ToastLab.tsx";
import { AppShellSkeleton } from "./components/AppShellSkeleton.tsx";
import { NotFound } from "./components/NotFound.tsx";
import { TooltipProvider } from "./components/ui/tooltip.tsx";
import { Toaster } from "./components/ui/sonner.tsx";

const TITLES: Record<string, string> = {
  "/": "Klef - Zero-knowledge .env sync",
  "/security": "Security - Klef",
  "/terms": "Terms - Klef",
  "/privacy": "Privacy - Klef",
  "/about": "Why Klef",
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

// Authenticated: route by vault state (the crypto "unlock" gate).
function VaultGate({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  const { status } = useVault();
  switch (status) {
    case "loading":
      // Skeleton, not the splash: on reload the shell should appear in
      // place instantly rather than flashing a brand moment.
      return <AppShellSkeleton />;
    case "needs-setup":
      return <Onboarding email={email} />;
    case "locked":
      return <UnlockScreen />;
    case "unlocked":
      return <VaultHome name={name} email={email} image={image} />;
  }
}

function AppArea() {
  const { data: session, isPending } = useSession();
  const { pathname } = useLocation();
  if (isPending) return <AppShellSkeleton />;
  // Remember where the user was headed (e.g. /my-team) so sign-in returns there.
  if (!session) return <Navigate to="/auth" replace state={{ from: pathname }} />;
  return (
    <VaultProvider userId={session.user.id}>
      <VaultGate
        name={session.user.name}
        email={session.user.email}
        image={session.user.image}
      />
    </VaultProvider>
  );
}

function AuthRoute() {
  const { data: session, isPending } = useSession();
  const from = useReturnPath();
  if (isPending) return <Splash />;
  if (session) return <Navigate to={from ?? "/app"} replace />;
  return <AuthPage />;
}

export function App() {
  return (
    <TooltipProvider delay={200}>
      <RouteTitle />
      <OwnColorScheme />
      <ThemeFavicon />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/security" element={<Security />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/about" element={<Why />} />
        <Route path="/auth" element={<AuthRoute />} />
        <Route path="/app" element={<AppArea />} />
        {import.meta.env.DEV && (
          <Route path="/dev/toasts" element={<ToastLab />} />
        )}
        {/* Workspace home: klef.sh/<workspace-slug>. Marketing routes above
            win first; reserved slugs are rejected at workspace creation. */}
        <Route path="/:wsSlug" element={<AppArea />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}
