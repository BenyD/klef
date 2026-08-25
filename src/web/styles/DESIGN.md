# Klef - design language

The tokens in `global.css` and the rules for reaching for them. See them all
side by side at `/dev/design` (dev-only route, both themes).

The through-line: Klef holds secrets. The interface should feel **quiet,
exact, and fast** - closer to a terminal that someone cared about than to a
consumer app. Nothing decorative moves. Nothing is animated that a person does
a hundred times a day.

## Colour

Warm stone neutrals (Tailwind's stone ramp), one ember accent, and nothing
else carrying meaning. Semantic tokens only - never a raw hex or a Tailwind
palette colour in a component.

| Token                       | For                                            |
| --------------------------- | ---------------------------------------------- |
| `--primary`                 | The one bright fill: primary actions, active   |
| `--brand`                   | Ember as text/icon where the fill can't hold contrast |
| `--muted-foreground`        | Every piece of secondary text                  |
| `--success` `--warning` `--info` `--destructive` | State, never decoration    |
| `--env-*`                   | Environment identity dots                      |
| `--diff-add` `--diff-remove`| Diff gutters and rows                          |

`::selection` wears a 32% ember tint and inputs take an ember caret - text
selection is half of what this app is for.

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

Three layers. Higher surfaces cast a **longer, softer** shadow, never a darker
one. In dark mode each also takes a top-edge highlight, because a cast shadow
alone can't separate two near-black surfaces.

| Utility          | For                                                |
| ---------------- | -------------------------------------------------- |
| `shadow-raised`  | Cards, tooltips - resting on the page              |
| `shadow-overlay` | Menus, selects, comboboxes, toasts - floating over it |
| `shadow-modal`   | Dialogs, sheets - the only thing that matters      |

Every floating surface also keeps `ring-1 ring-foreground/10` as its edge.

## Type

Inter for the interface, JetBrains Mono for anything the user pasted.

- Headings pull tracking in to `-0.014em` and use `text-wrap: balance`; body
  copy uses `text-wrap: pretty`.
- **Ligatures are off** in mono. A value has to read back exactly as typed -
  `!=` is two characters, not a glyph.
- Numbers that change in place take `tabular-nums`, so a counter never reflows
  the row it sits in. Badges, `kbd` and `<time>` get it from the base layer.
- Timestamps are `<time dateTime={...}>`, not a bare span.

## Radius

`--radius: 0.375rem`, with `sm`/`md`/`lg`/`xl` derived from it. Nested
surfaces step down: `rounded-xl` container, `rounded-lg` control, `rounded-md`
row.
