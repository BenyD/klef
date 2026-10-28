import { useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  ChevronDown,
  Copy,
  Download,
  MoonIcon,
  Save,
  SunIcon,
  Trash2,
} from "lucide-react";
import { Badge } from "./ui/badge.tsx";
import { Skeleton, SkeletonText } from "./ui/skeleton.tsx";
import { Spinner } from "./ui/spinner.tsx";
import { EditorSkeleton, OverviewSkeleton } from "./skeletons.tsx";
import { SettingRowsSkeleton } from "./settings-layout.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Input } from "./ui/input.tsx";
import { Kbd } from "./ui/kbd.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet.tsx";
import { Switch } from "./ui/switch.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.tsx";

/**
 * Dev-only gallery for the design language (/dev/design), sibling to the toast
 * lab. The route is only registered when import.meta.env.DEV, so this never
 * ships. It exists so motion, elevation and type can be judged side by side in
 * both themes - the details this file shows off are exactly the ones that are
 * invisible when you only ever see one of them at a time.
 */

// Swatches render inside a .light and a .dark subtree at once, so the two
// palettes are judged against each other rather than from memory.
const SURFACES = [
  { token: "sidebar", fg: "sidebar-foreground", use: "Canvas, navigation" },
  { token: "background", fg: "foreground", use: "Content panel" },
  { token: "card", fg: "card-foreground", use: "Cards, raised rows" },
  { token: "popover", fg: "popover-foreground", use: "Menus, dialogs" },
  { token: "muted", fg: "muted-foreground", use: "Hover, quiet fills" },
  { token: "primary", fg: "primary-foreground", use: "The one accent" },
];

const INKS = [
  { token: "foreground", use: "Text" },
  { token: "muted-foreground", use: "Secondary text" },
  { token: "brand", use: "Accent as text" },
  { token: "success", use: "Saved, matching" },
  { token: "warning", use: "Needs a look" },
  { token: "destructive", use: "Deletes, errors" },
  { token: "info", use: "Notices" },
  { token: "syntax-key", use: "Env keys" },
  { token: "syntax-string", use: "Quoted values" },
  { token: "diff-add", use: "Added lines" },
  { token: "diff-remove", use: "Removed lines" },
];

function Palette({ theme }: { theme: "light" | "dark" }) {
  return (
    <div
      className={`${theme} bg-sidebar text-foreground flex flex-col gap-3 rounded-xl border p-3`}
    >
      <span className="text-muted-foreground text-xs font-medium capitalize">
        {theme}
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {SURFACES.map((s) => (
          <div
            key={s.token}
            className="flex h-14 flex-col justify-between rounded-md border p-2"
            style={{
              background: `var(--${s.token})`,
              color: `var(--${s.fg})`,
            }}
          >
            <span className="font-mono text-[11px]">--{s.token}</span>
            <span className="text-[11px] opacity-80">{s.use}</span>
          </div>
        ))}
      </div>
      <div className="bg-background flex flex-col gap-1 rounded-md border p-2">
        {INKS.map((ink) => (
          <div key={ink.token} className="flex items-center gap-2 text-xs">
            <span
              className="w-36 shrink-0 font-mono"
              style={{ color: `var(--${ink.token})` }}
            >
              --{ink.token}
            </span>
            <span className="text-muted-foreground truncate">{ink.use}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CURVES = [
  {
    name: "--ease-out",
    css: "var(--ease-out)",
    use: "Entering, leaving, travelling",
  },
  { name: "--ease-quick", css: "var(--ease-quick)", use: "Hover, press, swap" },
  {
    name: "--ease-in-out",
    css: "var(--ease-in-out)",
    use: "Movement that rests at both ends",
  },
  { name: "--ease-spring", css: "var(--ease-spring)", use: "The one overshoot" },
];

const DURATIONS = [
  { name: "--duration-fast", value: "120ms", use: "State flips, tooltips" },
  { name: "--duration-base", value: "180ms", use: "Menus, dialogs, thumbs" },
  { name: "--duration-slow", value: "260ms", use: "Sheets, screen hand-offs" },
];

const ELEVATION = [
  { name: "shadow-raised", use: "Cards, tooltips - resting on the page" },
  { name: "shadow-overlay", use: "Menus, selects, toasts - floating over it" },
  { name: "shadow-modal", use: "Dialogs, sheets - the only thing that matters" },
];

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export function DesignLab() {
  const { resolvedTheme, setTheme } = useTheme();
  // Toggling this replays every motion sample at once, so curves are compared
  // against each other rather than against a memory of the last one.
  const [run, setRun] = useState(false);

  return (
    <div className="klef-screen mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">
            Design language
          </h1>
          <p className="text-muted-foreground text-sm">
            Every token the app's surfaces are built from, in one place. Flip
            the theme and check both.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          Theme
        </Button>
      </header>

      <Section
        title="Colour"
        hint="Cool greys and one ember accent. Every text pair here holds 4.5:1 or better; see DESIGN.md for the numbers."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Palette theme="light" />
          <Palette theme="dark" />
        </div>
      </Section>

      <Section
        title="Motion"
        hint="One curve per job. Press play and watch them race - the differences only show side by side."
      >
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          onClick={() => setRun((r) => !r)}
        >
          Play
        </Button>
        <div className="flex flex-col gap-2">
          {CURVES.map((curve) => (
            <div key={curve.name} className="flex items-center gap-3">
              <span className="w-32 shrink-0 font-mono text-xs">
                {curve.name}
              </span>
              <div className="bg-muted relative h-6 flex-1 overflow-hidden rounded-md">
                <div
                  className="bg-primary absolute top-1 bottom-1 left-1 w-6 rounded-sm"
                  style={{
                    transitionProperty: "translate",
                    transitionDuration: "var(--duration-slow)",
                    transitionTimingFunction: curve.css,
                    translate: run ? "calc(100cqw - 3.5rem) 0" : "0 0",
                    containerType: "inline-size",
                  }}
                />
              </div>
              <span className="text-muted-foreground w-52 shrink-0 text-xs">
                {curve.use}
              </span>
            </div>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {DURATIONS.map((d) => (
            <div
              key={d.name}
              className="ring-border flex flex-col gap-0.5 rounded-lg p-3 text-xs ring-1"
            >
              <span className="font-mono">{d.name}</span>
              <span className="tabular-nums">{d.value}</span>
              <span className="text-muted-foreground">{d.use}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Elevation"
        hint="Higher surfaces cast a longer, softer shadow - never a darker one. In dark mode each layer also catches light on its top edge."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {ELEVATION.map((e) => (
            <div
              key={e.name}
              className={`bg-popover flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10 ${e.name}`}
            >
              <span className="font-mono text-xs">{e.name}</span>
              <span className="text-muted-foreground text-xs">{e.use}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Controls"
        hint="Press one and hold: every control answers on the same curve, and pressable things push down 1px."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button>
            <Save />
            Save version
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">
            <Download />
            Outline
          </Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">
            <Trash2 />
            Destructive
          </Button>
          <Button variant="destructive-solid">Delete for good</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button size="default">default</Button>
          <Button size="lg">lg</Button>
          <Button size="icon-xs" aria-label="Copy">
            <Copy />
          </Button>
          <Button size="icon-sm" aria-label="Copy">
            <Copy />
          </Button>
          <Button size="icon" aria-label="Copy">
            <Copy />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Default</Badge>
          <Badge variant="secondary">12 keys</Badge>
          <Badge variant="outline">outline</Badge>
          <Switch defaultChecked />
          <Switch />
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <Input className="w-48" placeholder="Workspace name" />
          <Select defaultValue="production">
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="development">Development</SelectItem>
              <SelectItem value="preview">Preview</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Tabs defaultValue="editor" className="w-fit">
          <TabsList>
            <TabsTrigger value="editor">Code</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>
          <TabsContent value="editor" />
          <TabsContent value="table" />
        </Tabs>
      </Section>

      <Section
        title="Loading"
        hint="Skeletons for content-shaped waits, drawn with the real component's containers so nothing moves when it lands. Spinners for actions and short decrypts, shown only past 200ms and then for at least 500ms. The fast request below never shows one."
      >
        <LoadingSamples />
      </Section>

      <Section
        title="Overlays"
        hint="Menus open from their trigger and leave faster than they arrive; modals scale from their centre."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
              Dialog
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this environment?</DialogTitle>
                <DialogDescription>
                  Every version of every file in it goes with it. This cannot be
                  undone.
                </DialogDescription>
              </DialogHeader>
              {/* Nested, because Base UI renders no backdrop for a child
                  dialog: the parent has to recede on its own, and the only
                  way to see whether it does is to open one inside another. */}
              <Dialog>
                <DialogTrigger render={<Button variant="outline" size="sm" />}>
                  Open a nested dialog
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nested dialog</DialogTitle>
                    <DialogDescription>
                      The dialog behind this one should step back and dim. If
                      its text reads through around these edges, the
                      data-nested-dialog-open treatment on DialogContent has
                      stopped working.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter showCloseButton />
                </DialogContent>
              </Dialog>
              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>
              Sheet
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Review changes</SheetTitle>
                <SheetDescription className="font-mono">
                  web/.env.production
                </SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Menu
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                <DropdownMenuLabel>web/.env.production</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Copy />
                Copy contents
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Download />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive">
                <Trash2 />
                Delete file
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger render={<Button variant="outline" />}>
              Tooltip
            </TooltipTrigger>
            <TooltipContent>
              Copy contents <Kbd>⌘C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Card</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Rests on the page: a hairline ring plus the shortest of the three
            shadows.
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Type"
        hint="Inter for the interface, JetBrains Mono for anything the user pasted - ligatures off, so a value reads back exactly as it was typed."
      >
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">Sync your .env files</h1>
          <h2 className="text-xl font-semibold">Version history</h2>
          <h3 className="text-base font-medium">Recovery key</h3>
          <p className="max-w-prose text-sm">
            Body copy sits at 13px with pretty wrapping, so a paragraph never
            leaves a single word stranded on its own line.
          </p>
          <p className="text-muted-foreground max-w-prose text-xs">
            Secondary copy, one step down in size and colour.
          </p>
          <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs">
            {"DATABASE_URL=postgres://localhost/app\nRETRIES=3 # 1 != l, 0 != O"}
          </pre>
          <p className="font-mono text-xs tabular-nums">
            0123456789 - tabular figures, so counters never shift the layout
          </p>
        </div>
      </Section>
    </div>
  );
}

// A request of a given length, so the delayed spinner's two thresholds can be
// felt: the quick one finishes before a spinner is due, the slow one shows it.
function FakeRequest({ ms, label }: { ms: number; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={() => {
        setBusy(true);
        window.setTimeout(() => setBusy(false), ms);
      }}
    >
      <Save />
      {label}
    </Button>
  );
}

function LoadingSamples() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <FakeRequest ms={120} label="Fast save (120ms)" />
        <FakeRequest ms={1500} label="Slow save (1.5s)" />
        <Spinner className="text-muted-foreground" />
        <Spinner className="text-muted-foreground size-3" />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Skeleton className="size-8" />
        <span>
          Text line: <SkeletonText className="w-24" />
        </span>
        <span className="text-xs">
          <SkeletonText className="w-16" />
        </span>
      </div>
      <div className="bg-card divide-y overflow-hidden rounded-lg border">
        <SettingRowsSkeleton label="Loading rows" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <EditorSkeleton />
      </div>
      <div className="flex rounded-lg border">
        <OverviewSkeleton hint={{ files: [2, 1] }} />
      </div>
    </>
  );
}
