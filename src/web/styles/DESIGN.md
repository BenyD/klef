# Klef - design language

The tokens in `global.css` and the rules for reaching for them. See them all
side by side at `/dev/design` (dev-only route, both themes at once).

The through-line: Klef holds secrets. The interface should feel **quiet,
exact, and fast** - dense but calm, closer to a terminal someone cared about
than to a consumer app. Lines separate things; shadows only say "this
floats". Nothing decorative moves. Nothing is animated that a person does a
hundred times a day, and everything a person does a hundred times a day has a
key.

## Colour

A cool grey ramp (hue 264, chroma under 0.01), one ember accent, and nothing
else carrying meaning. Semantic tokens only - never a raw hex or a Tailwind
palette colour in a component.

**Two surfaces make the layout.** `--sidebar` is the canvas: navigation, and
the backdrop of auth and setup screens. `--background` is the content panel
that sits on it - white in light mode, one step lighter than the canvas in
dark mode. Cards and popovers step up from there.

| Token                       | For                                            |
| --------------------------- | ---------------------------------------------- |
| `--sidebar`                 | Canvas: sidebar, auth backdrops                |
| `--background`              | Content panel                                  |
| `--card` `--popover`        | Raised surfaces, menus and dialogs             |
| `--muted`                   | Hover and quiet fills                          |
| `--accent`                  | Active and selected rows, pressed toggles      |
| `--sidebar-hover` `--sidebar-accent` | The same two steps on the canvas      |
| `--primary`                 | The one bright fill: the primary action in view, active marks |
| `--brand`                   | Ember as text/icon where the fill can't hold contrast |
| `--muted-foreground`        | Every piece of secondary text                  |
| `--success` `--warning` `--info` `--destructive` | State, never decoration    |
| `--env-*`                   | Environment identity dots                      |
| `--diff-add` `--diff-remove`| Diff gutters and rows                          |
| `--syntax-*`                | Env editor highlighting (keys, quoted values, `export`) |

**One primary per view.** If two buttons on screen are ember, one of them is
wrong. Everything else is `outline`, `secondary` or `ghost`.

`::selection` wears a 32% ember tint and inputs take an ember caret - text
selection is half of what this app is for.

### Contrast

Checked in both themes against the surface each pair actually sits on
(WCAG 2.1: 4.5:1 for text, 3:1 for UI).

| Pair                                   | Light | Dark  |
| -------------------------------------- | ----- | ----- |
| `foreground` / `background`            | 17.7  | 16.4  |
| `muted-foreground` / `background`      | 6.3   | 7.2   |
| `muted-foreground` / `sidebar`         | 5.8   | 7.6   |
| `muted-foreground` / `muted` (hover)   | 5.6   | 6.5   |
| `muted-foreground` / `accent` (active) | 5.1   | 5.8   |
| `muted-foreground` / `sidebar-hover`   | 5.4   | 6.9   |
| `muted-foreground` / `sidebar-accent`  | 4.9   | 6.0   |
| `primary-foreground` / `primary`       | 7.5   | 8.1   |
| `brand` / `background`                 | 5.5   | 9.0   |
| `destructive` / `background`           | 5.2   | 6.5   |
| `success` / `background`               | 4.6   | 8.5   |
| `warning` / `background`               | 4.8   | 9.9   |
| `diff-add` / `background`              | 5.0   | 8.6   |
| `syntax-key` / `background`            | 5.9   | 9.5   |
| `ring` / `background` (UI)             | 5.0   | 8.3   |
| `env-preview` dot / `background` (UI)  | 3.2   | 9.9   |

`--border` and `--input` sit near 1.3-1.5:1 on purpose: they are hairlines,
not the only cue. Every input also has a visible label or placeholder and an
ember focus ring, and no state is shown by a border colour alone.

## Layout

- **One navigation surface.** The sidebar holds everything you move between:
  workspace switcher, search, the project tree with its files, settings. The
  content header only says where you are (breadcrumb) and what you can do
  here. Never put the same switcher in two places.
- **Lists before cards.** Projects and files are rows: 32px tall, one line,
  metadata right-aligned in `muted-foreground`. Cards are for things that are
  read as a unit (a recovery key, an empty state), not for collections.
- **Density.** Rows are `h-8`, toolbar controls `h-7`, the content header
  `h-11`. Page gutters are `px-4` on phones and `px-6` from `sm`.
- The content panel sits inset on the canvas with a 1px border and
  `rounded-lg` from `md` up; on phones it runs edge to edge.

## Spacing

Everything sits on a 4px grid (Tailwind's default steps). Reach for these and
nothing in between:

| Step  | px | For                                                       |
| ----- | -- | --------------------------------------------------------- |
| `0.5` | 2  | Between adjacent interactive rows (see below)             |
| `1`   | 4  | Icon to keycap, chip internals                            |
| `2`   | 8  | Icon to label, padding inside rows and menus              |
| `3`   | 12 | Between sidebar sections; toolbar gutters                 |
| `4`   | 16 | Between groups on a page; dialog padding; phone gutters   |
| `6`   | 24 | Page heading to content; dialog body on wide screens      |
| `8`   | 32 | Page gutters from `sm`, page top                          |

- **Rows never touch.** Any stack of hoverable rows (sidebar menus and the
  tree, dropdown and context menus, selects, comboboxes, the command menu)
  keeps 2px between rows: `gap-0.5` on a flex list, or the adjacent-row rule
  the menu primitives carry. Without it a hovered row merges with the active
  one above it into a single slab.
- Rows divided by hairlines (the overview's file lists, the key finder's
  projects) are the exception: the rule separates them.
- **The tree indents to the label.** Files sit under their project's name,
  not its icon: the sub-list's rule lines up with the icon's centre and the
  file names with the project name.

## Interaction states

Three quiet steps, the same in every list, each visibly apart from the one
before it in both themes. Hover never equals active.

| State              | Content panel | Canvas (sidebar)  |
| ------------------ | ------------- | ----------------- |
| Rest               | none          | none              |
| Hover              | `bg-muted`    | `bg-sidebar-hover` |
| Active / selected  | `bg-accent`   | `bg-sidebar-accent` + `font-medium` |
| Focus (keyboard)   | 2px ring in `--ring` (ember), on top of any fill | |

Hovering an active row keeps it active: the fill doesn't step back down.
Pressed toggles (filters, segmented controls) use the active step.

## Keyboard

Every frequent action has a key, shown next to it (menu item, tooltip or
`Kbd`). Shortcuts never animate.

| Keys          | Action                    |
| ------------- | ------------------------- |
| `⌘K`          | Command menu              |
| `⌘B`          | Toggle the sidebar        |
| `⌘S`          | Save the open file        |
| `⌘⇧L`         | Lock the vault            |
| `⌥1`-`⌥9`     | Jump to an open tab (9 is the last) |
| `⌥[` `⌥]`     | Previous / next tab       |
| `⌥W`          | Close the tab             |

Tab keys use Option/Alt because the browser keeps `⌘1`-`9`, `⌘W` and `⌃Tab`
for its own tabs and never hands them to the page.

## Motion

One named curve per job. If a new animation needs a curve that isn't here, the
question is usually whether it should animate at all.

| Token           | Curve                            | For                                    |
| --------------- | -------------------------------- | -------------------------------------- |
| `--ease-out`    | `cubic-bezier(0.16, 1, 0.3, 1)`  | Entering, leaving, travelling          |
| `--ease-quick`  | `cubic-bezier(0.2, 0, 0, 1)`     | Hover, press, icon swaps               |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)`   | Movement that rests at both ends       |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | The one overshoot (the theme glyph) |

| Token              | Value   | For                                  |
| ------------------ | ------- | ------------------------------------ |
| `--duration-fast`  | 120ms   | State flips, tooltips, menus leaving |
| `--duration-base`  | 180ms   | Menus, dialogs, switch thumbs        |
| `--duration-slow`  | 260ms   | Sheets, screen hand-offs             |

Rules:

- **Leaving is faster than arriving.** A dialog enters at `base` and exits at
  `fast`; the user has already decided by then.
- **Never `transition-all`.** Use `transition-interactive` (the utility in
  `global.css`) for a control that answers to hover and press, or name the
  properties.
- **Nothing past 300ms.** Longer stops reading as feedback and starts reading
  as waiting.
- **Never animate a keyboard action.** The command palette and lock shortcut
  open instantly, on purpose.
- Durations are used as `duration-(--duration-base)` in classes -
  `--duration-*` is not a Tailwind theme namespace, so `duration-base` would
  silently do nothing.
- JS-driven motion (WAAPI, inline styles) imports the mirrors in
  `lib/motion.ts`; `lib/motion.test.ts` holds them to the CSS.

## Elevation

Borders separate; shadows only float. Three layers, and in dark mode each
leads with a top-edge highlight, because a cast shadow alone can't separate
two near-black surfaces.

| Utility          | For                                                |
| ---------------- | -------------------------------------------------- |
| `shadow-raised`  | Cards - resting on the page (barely there)         |
| `shadow-overlay` | Menus, selects, comboboxes, toasts - floating over it |
| `shadow-modal`   | Dialogs, sheets - the only thing that matters      |

Every floating surface also keeps a 1px edge (`ring-1 ring-foreground/10` or
`border`). Rows and panels on the page get a border and no shadow at all.

## Type

Inter for the interface, JetBrains Mono for anything the user pasted.

| Utility     | Size / line | For                                       |
| ----------- | ----------- | ----------------------------------------- |
| `text-xs`   | 12 / 16     | Metadata, counts, kbd hints               |
| `text-sm`   | 13 / 20     | The interface: rows, menus, buttons, body |
| `text-base` | 16 / 24     | Inputs on phones only (stops iOS zoom)    |
| `text-lg`   | 17 / 24     | Dialog and section titles                 |
| `text-xl`   | 20 / 28     | Page titles                               |

- **Nothing below 12px, nothing in between.** No `text-[11px]`,
  `text-[0.8rem]` or other one-offs: if a size isn't in the table, the design
  is asking for a weight or colour change instead.
- Weights: 400 body, 500 for anything you can click or that labels a group,
  600 only for page titles and the workspace name. Nothing bolder (the 404
  wordmark is the one exception).
- Hierarchy, top to bottom: page title (`text-xl` 600), section label
  (`text-xs` 500 `muted-foreground`, like "Projects"), row text (`text-sm`),
  meta (`text-xs` `muted-foreground`). File and key names are mono at
  `text-xs`, which matches the optical size of 13px Inter.
- Headings get their tracking from the base layer; don't add
  `tracking-tight` on top.
- Muted text is `text-muted-foreground`, never `text-foreground/60` or an
  opacity on top of muted: opacity drops a pair below 4.5:1 without the
  contrast table noticing. Decorative glyphs (the `=` in the key table,
  breadcrumb chevrons) are the only exception.
- `truncate` sits on line heights of at least 1.25, so descenders on g, j,
  p and y are never clipped.
- Headings pull tracking in to `-0.014em` and use `text-wrap: balance`; body
  copy uses `text-wrap: pretty`.
- Inter runs with `cv01` and `cv08` (flagged 1, serifed I), so `l`, `I` and
  `1` never collide in a key name.
- **Ligatures are off** in mono. A value has to read back exactly as typed -
  `!=` is two characters, not a glyph.
- Numbers that change in place take `tabular-nums`, so a counter never reflows
  the row it sits in. Badges, `kbd` and `<time>` get it from the base layer.
- Timestamps are `<time dateTime={...}>`, not a bare span.

## Radius

`--radius: 0.375rem`, with `sm`/`md`/`lg`/`xl` derived from it. Nested
surfaces step down: `rounded-xl` dialog, `rounded-lg` panel and control,
`rounded-md` row.
