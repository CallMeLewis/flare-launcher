# Flare Launcher design

The visual rules the launcher follows. It's a dense utility, not a marketing site: no landing-page sections, hero art or scroll animations.

## Style

Dark Mode (OLED) with Data-Dense Dashboard layout, plus a matching light theme. Settings > Launcher picks Light, Dark or System (the default, following the computer). Flat surfaces separated by 1px borders, no shadows, gradients or glow.

## Colour

Tokens live in `src/globals.css`. Use the tokens, never raw hex in components.

Light is the `:root` set and dark the `.dark` set; the class goes on `<html>`. Light values keep text at WCAG AA (4.5:1) on every surface, which is why primary and the status colours are a shade darker than in dark.

| Role | Dark | Light | Use |
|---|---|---|---|
| background | `#0B1120` | `#FFFFFF` | App background, table |
| card | `#0F172A` | `#F8FAFC` | Sidebar, detail panel |
| popover | `#111827` | `#FFFFFF` | Menus, dialogs, toasts |
| muted / accent | `#1E293B` | `#F1F5F9` | Hover surfaces |
| border | `#1E293B` | `#E2E8F0` | Dividers |
| input | `#334155` | `#CBD5E1` | Field borders |
| foreground | `#F1F5F9` | `#0F172A` | Primary text |
| muted-foreground | `#94A3B8` | `#475569` | Secondary text |
| primary | `#22C55E` | `#15803D` | Play button, selection, focus ring |
| success | `#4ADE80` | `#15803D` | Installed, good ping |
| warning | `#FBBF24` | `#B45309` | Full server, missing mod, favourite, fair ping |
| danger | `#F87171` | `#DC2626` | Poor ping, errors |

Green means "good to go" and is reserved for that. Colour never carries meaning alone: pair it with a number, icon or label.

## Typography

- Fira Sans 400/500/600 for interface text. Base size 13px in the table, 14px elsewhere, 11–12px for labels.
- Fira Code for data: player counts, ping, time, addresses, versions. Apply the `data` utility, which also sets tabular figures and turns ligatures off.
- Fonts are bundled through `@fontsource`. The app makes no font requests.

## Density

- Table rows 36px, header 32px, toolbar controls 32px.
- 8px gaps between controls, 16px panel padding.
- Sidebar 192px, detail panel 400px, window minimum 1120×640.
- Layout widths are in CSS pixels, so the interface size setting moves the breakpoints: below 1280px the sidebar folds to icons and the detail panel narrows to 340px; below 1024px the Time column hides and the panel is 300px. 1536px and up widens the stat columns. Table rows stripe faintly to help follow long rows.

## Interaction

- Virtualise any list over 50 items.
- Every interactive element has a visible focus ring and a hover state, with 100–150ms colour transitions. Respect `prefers-reduced-motion`.
- Sortable headers set `aria-sort`. Icon-only buttons have an `aria-label`.
- Truncated text exposes the full value through `title`.
- Loading shows skeleton rows. Empty states say what happened and offer the next action.
