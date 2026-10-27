import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { RootProvider } from "fumadocs-ui/provider/react-router";
import SearchDialog from "@/components/search";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* next-themes, with the app's own `theme` key and `.dark` class, so
            a choice made on klef.sh carries into /docs and back. */}
        <RootProvider search={{ SearchDialog }} theme={{ storageKey: "theme", attribute: "class" }}>
          {children}
        </RootProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
