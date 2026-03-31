# UI Style Guidelines — Hydrofoil CFD App

> These guidelines are extracted from the existing codebase. All agents and contributors must follow these patterns exactly. Do not introduce new design patterns, component libraries, or Tailwind classes outside of this system.

---

## 1. Colour System

### Background & Surface

- Page/app background: `bg-[#0d1518]` or semantic equivalent
- Component surfaces: use layered opacity over the base dark — `bg-accent/5`, `bg-white/[0.03]`
- Never use white or light backgrounds

### Accent Colours

These are custom tokens defined in the Tailwind config. Always use the token, never the raw hex:

| Token                 | Usage                                                      |
| --------------------- | ---------------------------------------------------------- |
| `text-accent-cyan`    | Primary icons, active indicators, section headers          |
| `text-accent-glow`    | Running / pending / meshing status states                  |
| `text-accent-emerald` | Completed / success status states                          |
| `text-accent-rose`    | Failed / error status states                               |
| `text-accent`         | General accent — borders, backgrounds via opacity modifier |

### Opacity Modifiers

Colour opacity is always applied via Tailwind's slash modifier, never via a separate `opacity-` class:

```
✅ bg-accent/10       border-accent/25      text-accent/15
❌ bg-accent opacity-10
```

Common opacity scale in use: `/5`, `/10`, `/15`, `/25`

---

## 2. Typography

### Scale

| Class       | Usage                                                                             |
| ----------- | --------------------------------------------------------------------------------- |
| `text-xs`   | Primary UI text, item names, run IDs                                              |
| `text-2xs`  | Secondary/metadata text — dates, file paths, sublabels                            |
| `hud-label` | Section header labels (custom utility class — always use this, never recreate it) |

### Weight

- `font-medium` — item names, interactive labels
- `font-mono` — numeric values, counts, IDs (e.g. run counts, frame numbers)
- Never use `font-bold` for UI chrome — reserve for data callouts only

### Colour

- Primary readable text: `text-slate-200` or `text-slate-300`
- Secondary / metadata: `text-slate-400`
- Muted / disabled: `text-slate-600`
- Active / selected: `text-slate-100`
- Hover transition: `text-slate-400 hover:text-slate-200` — always pair these together

### Truncation

Long strings (names, file paths) must always use `truncate`. Never allow text to wrap inside list items or buttons.

---

## 3. Spacing & Layout

### Container Padding

- Section containers: `p-3`
- Between sections: `gap-5` (via `flex flex-col gap-5`)
- Between items in a list: `gap-1`
- Between icon and label in a row: `gap-2`
- Within a button/item: `px-2.5 py-2`
- Within a compact info block: `px-2 py-1.5`

### Section Dividers

Use a single `<div>` with `h-px bg-hud-border` — never use `<hr>` or borders on parent elements:

```tsx
<div className="h-px bg-hud-border" />
```

---

## 4. Interactive Elements (Buttons & List Items)

### Base Pattern

All clickable list items follow this exact structure:

```
rounded-md border transition-all duration-200
```

### Unselected / Default State

```
border-transparent
text-slate-400
hover:bg-white/[0.03] hover:border-hud-border hover:text-slate-200
```

### Selected / Active State

```
bg-accent/10 border border-accent/25 text-slate-100
```

### Rules

- Always use `text-left w-full` on buttons that act as list items
- Always include `transition-all duration-200` on interactive elements
- Use `group` on the button and `group-hover:` on child text for compound hover effects
- Never use `cursor-pointer` — buttons are implicitly pointer

---

## 5. Status Indicators

Status is always shown as a combination of a filled dot icon + a text label. Use Lucide's `Circle` with `fill-current`:

```tsx
<Circle
  className={`h-2 w-2 fill-current ${statusDotColor(status)} ${statusDotAnim(status)}`}
/>
```

### Colour mapping (must use `statusDotColor` utility or equivalent):

| Status                          | Class                 |
| ------------------------------- | --------------------- |
| `RUNNING`, `MESHING`, `PENDING` | `text-accent-glow`    |
| `COMPLETED`                     | `text-accent-emerald` |
| `FAILED`                        | `text-accent-rose`    |
| unknown                         | `text-slate-600`      |

### Animation:

- Active states (`RUNNING`, `MESHING`, `PENDING`): add `animate-pulse`
- Terminal states: no animation

---

## 6. Icons

- Icon library: **Lucide React** exclusively — do not introduce other icon sets
- Section header icons: `h-3.5 w-3.5` with `text-accent-cyan`
- Status icons: `h-2 w-2`
- Loading spinners: Lucide `Loader2` with `h-3 w-3 animate-spin`
- Icons always sit inline in a `flex items-center gap-2` row alongside their label

---

## 7. Info / Metadata Blocks

Compact data display blocks (e.g. "Active asset" callout) follow this pattern:

```
px-2 py-1.5 rounded-md bg-accent/5 border border-accent/15
```

With an internal structure of:

- Label line: `text-2xs text-slate-500`
- Value line: `text-xs font-medium text-slate-200 truncate`

---

## 8. Loading & Empty States

### Loading state

Always show inline with a spinner — never use skeleton loaders or placeholder blocks:

```tsx
<div className="flex items-center gap-2 text-2xs text-slate-600">
  <Loader2 className="h-3 w-3 animate-spin" />
  Loading…
</div>
```

### Empty state

Plain muted text, no illustrations or heavy UI:

```tsx
<div className="text-2xs text-slate-600 px-1">No items yet.</div>
```

Both states must only render when their respective data array is empty — do not show loading state if data already exists (e.g. on a background refresh).

---

## 9. Scrollbars

Apply `scrollbar-dark` custom utility class to any scrollable container. Never use default browser scrollbars or `overflow-auto` without this class.

---

## 10. Custom Utility Classes (Do Not Recreate)

These classes are defined globally. Use them as-is — never inline their equivalent Tailwind:

| Class                                                         | Purpose                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| `hud-label`                                                   | Section header label styling                            |
| `scrollbar-dark`                                              | Dark-themed custom scrollbar                            |
| `hud-border`                                                  | Border colour token used for dividers and hover borders |
| `text-2xs`                                                    | Font size below Tailwind's built-in `text-xs`           |
| `accent-cyan`, `accent-glow`, `accent-emerald`, `accent-rose` | Colour tokens                                           |

---

## 11. What Not To Do

- ❌ Do not use `rounded-lg` or `rounded-xl` — use `rounded-md` at most for interactive items
- ❌ Do not use `shadow-*` for depth — use border + background opacity instead
- ❌ Do not use `font-bold` for labels or chrome
- ❌ Do not hardcode hex colours inline — use the token system
- ❌ Do not use `opacity-` as a standalone class — use the `/` modifier on the colour
- ❌ Do not introduce new component libraries (no MUI, Radix, Chakra, etc.)
- ❌ Do not use `<hr>` — use the `h-px bg-hud-border` div pattern
- ❌ Do not allow text to overflow — always `truncate` names and paths
- ❌ Do not animate terminal states — only pulse/spin for active/loading states
