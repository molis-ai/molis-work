---
name: Molis Work Soft Workbench
description: A pearl desk holding one continuous white work surface, a resident bottom bar for navigation and conversation, graphite actions, copper focus and quiet motion.
colors:
  desk: "#eeefef"
  paper: "#ffffff"
  surface-soft: "#fafaf9"
  rail: "#f5f5f3"
  ink: "#292a2c"
  ink-soft: "#5c5d60"
  muted: "#636569"
  faint: "#6a6c70"
  line: "#e9e9e7"
  line-strong: "#d5d6d4"
  nav-hover: "ink 5%"
  nav-active: "ink 8%"
  nav-press: "ink 11%"
  action: "#292a2c"
  action-hover: "#3d3e41"
  action-ink: "#ffffff"
  accent: "#93604b"
  accent-strong: "#7a4d3a"
  accent-soft: "#f6eee8"
  green: "#42775d"
  amber: "#8a5c18"
  red: "#b03d45"
  scrim: "rgba(21, 23, 29, .16)"
  popover: "#ffffff"
  on-accent: "#ffffff"
  dark-desk: "#1c1d20"
  dark-paper: "#242528"
  dark-surface-soft: "#292a2d"
  dark-rail: "#2e2f32"
  dark-ink: "#f0efed"
  dark-ink-soft: "#c0beba"
  dark-muted: "#a2a19e"
  dark-faint: "#979693"
  dark-line: "#36373b"
  dark-line-strong: "#4c4d50"
  dark-nav-hover: "ink 7%"
  dark-nav-active: "ink 11%"
  dark-nav-press: "ink 15%"
  dark-action: "#ecebe8"
  dark-action-hover: "#ffffff"
  dark-action-ink: "#252628"
  dark-accent: "#d6a18a"
  dark-accent-strong: "#e8c0ad"
  dark-accent-soft: "#382f2b"
  dark-green: "#8db99d"
  dark-amber: "#d9b67b"
  dark-red: "#ee858c"
  dark-scrim: "rgba(0, 0, 0, .5)"
  dark-popover: "#2c2d31"
  tone-progress: "{colors.accent}"
  tone-attention: "{colors.amber}"
  tone-blocked: "{colors.red}"
  tone-done: "{colors.green}"
  tone-quiet: "{colors.faint}"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI Variable Text, Segoe UI, PingFang SC, Hiragino Sans GB, Microsoft YaHei UI, Microsoft YaHei, Noto Sans CJK SC, Source Han Sans SC, Inter Variable, Inter, Noto Sans SC, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-.011em"
  control:
    fontSize: "13px"
    fontWeight: 500
  item-title:
    fontSize: "13px"
    fontWeight: 500
  heading:
    fontWeight: 600
    letterSpacing: "-.02em"
  display:
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.03em"
  onboarding-question:
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.035em"
  caption:
    fontSize: "12px"
    fontWeight: 400
  mono:
    fontFamily: "ui-monospace, SF Mono, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace"
rounded:
  tag: "6px"
  control: "8px"
  row: "10px"
  card: "12px"
  sheet: "14px"
  composer: "15px"
  dialog: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  content: "16px"
  lg: "24px"
  xl: "32px"
sizes:
  control: "32px"
  control-compact: "28px"
  control-touch: "44px"
  row: "32px"
  row-two-line: "40px"
  dock: "76px"
  dock-phone: "116px"
  dock-button: "38px"
  composer: "50px"
  sheet-inset: "14px"
motion:
  press: "130ms"
  hover: "130ms"
  move: "250ms"
  arrive: "420ms"
  moment: "640ms"
  ease-quint: "cubic-bezier(.22, 1, .36, 1)"
  ease-spring: "cubic-bezier(.2, 1.35, .4, 1)"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    fontWeight: 500
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "{sizes.control}"
    shadow: "shadow-soft"
  button-secondary:
    backgroundColor: "control-fill (ink 4%)"
    textColor: "{colors.ink}"
    fontWeight: 500
    rounded: "{rounded.control}"
    height: "{sizes.control}"
  input:
    backgroundColor: "{colors.paper}"
    border: "1px ink 12%"
    focus: "border accent 55% + 3px accent halo 16%"
    rounded: "{rounded.control}"
    height: "{sizes.control}"
  choice-selected:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    check: "12px, springs in"
    rounded: "{rounded.control}"
  directory-selected:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.ink}"
    fontWeight: 500
    rounded: "{rounded.row}"
    leadingBar: "none"
  segmented-control:
    trackBackgroundColor: "control-fill (ink 4%)"
    trackBorder: "none"
    currentBackgroundColor: "{colors.paper}"
    currentShadow: "shadow-soft"
    fontWeight: 500
  work-sheet:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.sheet}"
    shadow: "surface-shadow"
  dock-current:
    backgroundColor: "{colors.paper}"
    shadow: "shadow-soft"
    mark: "3px {colors.accent} dot"
    rounded: "11px"
  composer:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.composer}"
    height: "{sizes.composer}"
    shadow: "shadow-raised"
  dialog:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.dialog}"
    border: "none"
    shadow: "shadow"
---

# Design System: Molis Work Soft Workbench

## Overview

**Creative North Star: "A personal work surface with room to think"**

Molis Work is a personal workbench for finding current work, reading its facts and taking the next action. Since 2026-09-28 its visual language is the **Soft Workbench**: a pearl-grey desk, one continuous white work surface lying on it, graphite for what you do and copper for where you are. The approved prototype in [`docs/design/soft-workbench/`](docs/design/soft-workbench/README.md) is the reference; this document is the normative production spec, and the rollout record is [specs/archive/soft-workbench-rollout](specs/archive/soft-workbench-rollout/spec.md) with its [inventory](specs/archive/soft-workbench-rollout/inventory.md). [PRODUCT.md](PRODUCT.md) remains the authority for product behaviour and [docs/SSOT-MATRIX.md](docs/SSOT-MATRIX.md) for who owns each fact; this document records their visual expression.

Shared controls, palette and icons are the `mw-*` HTML Slot primitives in `@molis-ai/molis-work-design-system`. Authors and agents use the component board at `/__ui/catalog` and [`packages/design-system/README.md`](packages/design-system/README.md); shared-control work must match that board. Visible OS chrome — system selects, colour wells, date/time popups, `alert`/`confirm` — is not a product control. Motion, icon colour and arrival are part of a change, not a later pass. The development contract is in [CLI 与开发](docs/cli-and-development.md#前端与控件板) and [ui-craft-floor](specs/ui-craft-floor/spec.md).

**Key characteristics**

- **Desk and surface.** The titlebar and the bottom bar are the desk. All work lies on one white sheet with 14px corners and a shadow you feel more than see. Split panes are separate sheets on the same desk. Plugin directories are columns inside the sheet, never a second chrome.
- **One global navigation.** There is no global left sidebar. The resident bottom bar carries the Dock, the unified conversation (the Assistant with its plugin switcher), the personal residents and the project button.
- **Tone before outline.** Ordinary content separates by spacing, weight and the occasional hairline. Only raised things cast a shadow: the composer, the current Dock item, menus, dialogs, sheets and toasts. A floating layer never also draws a heavy outline.
- **Graphite does, copper points.** The primary action and a selected choice are graphite. Focus, links, work in progress and the small detail of a selection are copper. Colour otherwise says status only; plugins carry no identity colour, except as their tab group's colour on the tab strip.
- **Weight before decoration.** Hierarchy comes from size and three weights — 600 titles, 500 controls and item titles, 400 reading — before a new colour or container.
- **Movement answers the operation.** Presses give and spring back, state changes take 250ms, arrivals rise a few pixels over 420ms, menus grow from their control and sheets from their edge. Reduced motion removes all of it.
- **Real state and explicit actions.** Unavailable capabilities stay visibly unavailable, errors keep input and offer a retry, and demos say they are demos.

## Where the rules live

| Concern | Source |
| --- | --- |
| Colour, surface, status, shadow and scrim tokens | `packages/design-system/src/palette.ts` → `renderShellTokens(theme)` |
| Corners, focus, motion, icon sizes | `renderShapeTokens()` (safe in late layers) |
| Control height and padding | `renderControlMetrics()` — declared only by early layers so compact (28px) and touch (44px) rules win |
| Font stacks and weight roles | `packages/design-system/src/typeface.ts` (`FONT_STACK`, `MONO_FONT_STACK`, `TYPEFACE_STYLES`) |
| `mw-*` primitives | `packages/design-system/src/styles/primitives.ts` and `src/primitives/*` |
| Final expression layer: desk, sheet, bottom bar geometry, depth, motion, moments | `packages/design-system/src/styles/craft-finish.ts` (`CRAFT_FINISH_STYLES`, last on every page) |
| Ways out and back: cover chip close, bar trays | `apps/workbench/src/styles/navigation-flow.ts` (`NAVIGATION_FLOW_STYLES`, right after the final layer on the workbench and settings pages) |
| Navigation behaviour: history, covers, the bar's second press, kept page state | `apps/workbench/src/scripts/client/tab-workspace.ts`, `tab-workspace-ops.ts`; the rules in [specs/archive/page-interaction-flow](specs/archive/page-interaction-flow/spec.md) |
| The one list of global settings categories | `apps/workbench/src/settings-sections.ts` |
| The way in (chooser, opening, Welcome, new-project journey, update page) | `apps/workbench/src/arrival/` (the shared frame, the chooser and its brief), `src/styles/arrival.ts`, `src/context-onboarding-renderer.ts`, `src/scripts/context-onboarding.ts`; its parts are the `arrival` components in `packages/design-system/src/primitives/arrival.ts` and `styles/arrival-components.ts` |
| Component board | `/__ui/catalog` (sections below) and `/__ui/catalog/bar` (the real bottom bar) |
| Plugin glyphs / state rings | `packages/design-system/src/icons.ts` (`PLUGIN_ICON`), `state-ring-states.ts` and `state-ring.ts` |
| Guards for the fixed scales (glyphs, durations and curves, loops, type steps, browser defaults, scrims) | `tests/soft-workbench-refinement.test.ts` |

A later layer never re-declares a colour or metric with a different number. New rules do not use `!important` or a per-plugin override to win over an earlier rule; where an older `!important` rule conflicts with this spec, it is removed at its source (older layers still carry some that do not conflict). Plugin styles take colours from the shared tokens (`var(--paper)`, `var(--ink)`, `var(--accent)` …); literal values remain only for shadows, the terminal palette, onboarding's scoped `--ob-*` light and user content such as a deck's own colours. The plugin-builder and the generated-plugin renderer follow the same rule.

## Colors

### Neutral

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--desk` (`--page`, `--nav-bg`) | `#eeefef` | `#1c1d20` | Titlebar, bottom bar, the space around sheets |
| `--paper` (`--surface`, `--panel`, `--canvas`) | `#ffffff` | `#242528` | The work sheet, dialogs, menus, the composer; `--canvas` is a full-pane canvas inside the sheet |
| `--surface-soft` | `#fafaf9` | `#292a2d` | Plugin directory columns, inner blocks, pane tab strips |
| `--rail` (`--wash`) | `#f5f5f3` | `#2e2f32` | Local groups, read-only fields, secondary buttons at rest |
| `--ink` | `#292a2c` | `#f0efed` | Titles and body |
| `--ink-soft` | `#5c5d60` | `#c0beba` | Directory titles, secondary copy, glyphs |
| `--muted` / `--faint` | `#636569` / `#6a6c70` | `#a2a19e` / `#979693` | Captions, counts, placeholders (`--faint` is the WCAG floor on paper) |
| `--line` / `--line-strong` | `#e9e9e7` / `#d5d6d4` | `#36373b` / `#4c4d50` | Hairlines where a boundary carries meaning |
| `--nav-hover` / `--nav-active` / `--nav-press` | ink 5 / 8 / 11% | ink 7 / 11 / 15% | Row hover, selected row, press — composite over any surface |

Body copy uses ink or ink-soft, never muted. Do not stack extra opacity on faint or muted type. Every text token meets 4.5:1 on its own surface in both themes (checked separately for Light and Dark). Browser defaults never show through: `accent-color`, `caret-color`, `::selection`, `mark`, `::placeholder` and autofill all take tokens, and there is no system blue anywhere in the interface.

**Layers.** Light: desk → paper, with floating things on the same white separated by `--lift-3` alone. Dark shows three distinct layers — desk `#1c1d20`, paper `#242528`, and `--popover` `#2c2d31` for menus, popovers, dialogs and the Assistant panel — edged by a light ring instead of a heavier shadow.

### Primary

Graphite `--action` (`#292a2c`, Dark `#ecebe8`) with `--action-ink` fills the primary button, a selected choice, the selected Home day, a selected canvas node or board card, the toast and the tooltip. Hover uses `--action-hover`. There is exactly one filled primary per decision.

Copper `--accent` (`#93604b`, Dark `#d6a18a`) marks keyboard focus, text links, work in progress (`--tone-progress`), the Dock's current dot, the Home now-line and a field's focus halo. `--accent-soft` is its wash (new-item landing, copper tags). The historical names `--blue`, `--blue-dark`, `--blue-soft` and `--focus` resolve to copper so older consumers follow automatically. Copper never fills a primary button.

### Status

`--green` marks completion, `--amber` attention and remaining work, `--red` a failed result. The shared state ring uses graphite for neutral states and `--status-interruption` (warm brown) for interrupted work. Partial completion combines green and amber; a result requiring review uses an amber ring and a small exclamation point. Existing status labels retain their domain wording and tone. A status is always a label or glyph plus its colour, never colour alone.

### Plugin identity

Plugins carry no identity colour on screen, with one exception: on the tab strip a plugin's automatic tab group takes the plugin's `MW_PLUGINS[].hue` (see Grouped work tabs; specs/plugin-tab-groups). Every `--plugin-*` resolves to `--ink-soft`, so existing consumers (icons, kind labels, washes, `--plugin-tint`, `--station-tint`) stay valid and calm. A plugin is recognised by its glyph, its name and where it sits. Each plugin has exactly one glyph, listed in `PLUGIN_ICON` (`packages/design-system/src/icons.ts`) and identical in its Manifest, the Dock, the switcher, tabs, the market, its empty state and search; no two plugins share one, and the AI mark (sparkles) is never a plugin identity. A low-saturation tint behind plugin glyphs was evaluated and rejected: with six to twenty glyphs on one screen it spends more colour than the rest of the interface put together. Outside the tab strip, `MW_PLUGINS[].hue` remains data for the catalog, not a rendering rule. The reading-surface family (`--content-*`, Shelf's `--da-*`) aliases these same tokens; only the terminal canvas keeps its own palette. The five `--mark-*` file-kind tones (PDF, text, image, link, folder) remain as small classification chips beside a label.

## Typography

**Face.** The system sans: SF Pro / PingFang SC on macOS, Segoe UI / Microsoft YaHei on Windows. Self-hosted Inter Variable and Noto Sans SC Regular remain offline fallbacks only. `font-synthesis-weight: none`, so a missing weight never renders as faux bold. `--font-mono` (`MONO_FONT_STACK`) is for commands, identifiers, code and measured values.

**Weights.** Three roles, exposed as variables:

- `--weight-title` **600** — page and dialog headings, the onboarding question, section titles, the Home date.
- `--weight-control` **500** — buttons, tabs, segmented choices, selected rows, item titles, `strong`, `th`, `dt`.
- `--weight-body` **400** — reading, captions, field values, placeholders.

`TYPEFACE_STYLES` sets these on `:where()` selectors with no `!important`; a component that needs a role uses the variable. There is no global weight override.

**Scale.** Eight fixed steps and no fluid sizes: **11 / 12 / 13 / 15 / 17 / 20 / 24 / 30px**, and a page uses at most four of them. Body 13px / 1.5 at `-.011em`. Captions, counts and meta 12px; 11px only for the smallest group labels. Directory titles 13px. Section and dialog titles 15px / 600. Page headings 24px / 600 at `-.02em` (20px on phones); display (Home heading, a Goal document title, onboarding question, settings heading) 30px / 600 at `-.03em`. Reading bodies use 13–15px with 1.6–1.8 line height, bounded to 76ch. Fields use 16px at 760px and below so iOS does not zoom. Only content itself goes above 30px (a Pages document title, the onboarding greeting word). `tests/soft-workbench-refinement.test.ts` enforces the steps.

**Roles.** A size belongs to a role, never to a component, so one kind of thing reads the same on every page (user 2026-10-22). Each step down the list is a step back in attention: the eye meets size first, weight second and contrast third, and it goes to the largest, darkest thing before it reads anything.

| Role | Size / weight / colour | What it is | Why |
| --- | --- | --- | --- |
| Display | 30 / 600, ink | Home's day heading, a document's title, the onboarding question | Content that is the page itself; one per page, so there is no doubt where reading starts. |
| Page heading | 24 / 600, ink (20 on phones) | A plugin page's name, a settings page | Says where you are. 1.85 × the body, the one jump big enough to read as "a different level" at a glance; it sits apart and does not compete with the list. |
| Record title | 20 / 600, ink | The title of an opened item (an Inbox reference, an artifact, a Feed message) | The thing you opened, a step below the page you are on and above its sections. |
| Section and dialog title | 15 / 600, ink | A group's heading, a dialog's question, an empty state's line | One step above the body, separated by weight more than size, so a page keeps few levels. |
| Item name | 13 / 500, ink | A row's or card's title, the selected item, `strong` | The thing you scan for. Body size, so a long list stays calm; the weight makes the names a column the eye runs down (the left edge of an F-shaped scan). |
| Action | 13 / 500, ink or ink-soft (a link copper) | Every button's words, a link button, a card header's quiet action, a menu item | What you can do. The same size as names, so an action never shouts over the content, and the same everywhere, so an action is recognised by its shape before its words. |
| Body and field value | 13 / 400, ink (reading 13–15 / 1.6–1.8) | Text to read, what you typed | Long reading wants a regular weight and room between lines, not a bigger size. |
| Long reading | 15–17 / 400 (a note or Shelf reading in serif at 17 / 2) | A note's body, a document being read | A page meant for reading, not scanning: larger and looser so the eye can stay for paragraphs. |
| Tool on content | 12 / 500 | The context toolbar's tools | It floats over the words being worked on and must not outweigh them. |
| View choice | 12 / 500, muted until chosen | Segmented options, filters, sort | How you look at the page, not what you do on it: a step quieter than actions so the page's weight stays on the content and its one primary action. |
| Fact | 12 / 400, muted | Time, count, source, the state's word, a description line | Read when needed. Smaller and lighter than the name it qualifies, so a row reads name → state → facts in that order. |
| Group label | 11–12 / 500, muted | A fold's or column's label, a kbd hint | Structure, not content: present but not read first. |

Two neighbouring steps 1px apart (12 and 13) cannot tell levels apart by size alone (below the ~15 % difference the eye sees as "bigger"), so they always differ in weight or colour too; a page that needs a third distinction uses the next role, not a 14px in between. A **mark takes its words' role**: a state ring beside a 13px name is 15px, beside a 12px fact 14px (Order). A mark taller than its words is seen before them, pre-attentively, and turns the row's focus from the thing to its state; at their height the name leads and the state qualifies it, which is the order the row is read in.

Status copy stays direct and specific. Timeline events use human-readable labels rather than raw event names; original IDs and sources remain available as secondary facts. Interface language changes between Chinese and English without rewriting user titles or record bodies. A count is filled into a whole sentence, and in English the word that follows it agrees with it ("1 staged file", "2 staged files"), through `{count|one|other}` in the plugin SDK's `fillMessage`. Switching language keeps the page, any open Settings, the split panes and their layout; English text that runs longer wraps inside its control rather than spilling out of it.

## Layout

**Desk and sheet.** On desktop the window is the titlebar (`--desktop-titlebar-height`), the work area and the bottom bar (`--dock-h` 76px). `.tab-workspace` leaves `--sheet-inset` (14px) of desk on the right; each pane and the exclusive cover (market, settings) is a sheet with 14px corners on `--paper` with `--sheet-shadow`. Split panes are separate sheets with a desk gap between them; the focused pane's sheet reads a step deeper. Pages inside the sheet do not draw a second card. Embedded panes and widths ≤ 600px keep no inset.

**Plugin stage.** A plugin's own page reads as one centred column up to 960px wide (at least 32px from the sheet's edges), 32px from the top: the page heading (the surface's own name, 24px / 600) with one sentence under it on the left and the page's actions on the right, on the heading's line, then the list. The first create action is the page's one graphite button; an empty state repeating it uses the secondary style. Opening an item turns the list into a `--surface-soft` side column beside the item. Directories (Goals tree, Feed sources) are `--surface-soft` columns inside the sheet, 240px by default (220px at ≤ 1050px), resizable, with a saved project-local width; double-click restores the default. The directory scrolls on its own without a visible scrollbar.

**Scroll ownership.** The shell stays within one viewport. Tabs and primary toolbars stay in place while lists, readers, board columns and long forms scroll inside their own regions. Long content remains reachable at narrow widths and in split panes without shrinking text or introducing document scrolling.

**Breakpoints.**

- **≥ 1020px of home width:** Home shows its margin (note, things at hand) beside the day column; the board shows six columns when the pane is ≥ 840px.
- **≤ 1050px:** directory default 220px.
- **≤ 900px:** the composer hides its shortcut hint.
- **≤ 760px:** form and reader actions use 44px targets; settings stack; only the focused pane is shown.
- **≤ 600px (phone):** no sheet inset; the directory becomes a drawer with scrim, inert background and focus loop; the bottom bar becomes two rows (`--dock-h` 116px) — the composer on the first row (search stays in it as an icon), the Dock menu, Home, the +N fold (it gives way to 项目首页 below 356px when a directory button shares the row; the switcher lists what the Dock does not), the residents and the project button on the second — and popovers open full-width above it.
- **≤ 560px tall:** writing gets the height: the bar tightens to 52px (a 40px composer, 34px Dock buttons) with a fine pointer and to 60px (a 50px composer, 44px Dock buttons) with a coarse one, steps aside entirely while a Goal record form is open (on phones too), and the record menu opens as a sheet above the bar. At ≤ 640px tall the Goal terminal view's rail scrolls as one column and keeps at least 240px for the timeline.

**Density.** Standard is the default: 32px controls, 32px directory rows, 40px two-line rows. Compact (`html[data-density="compact"]`) uses 28 / 28 / 36. Phones and coarse pointers use 44px controls in either density, a small button (`mw-btn--sm`) of any variant included. Density changes row height and padding only; type, colour and corners stay the same.

**Tabs and panes.** Each pane owns a tab strip in the titlebar row. A plugin's own page is its plugin tab — one per pane, opened by the Dock, the switcher or a link, and current while the pane shows that page; a record opened on that page (a note, a document, a Goal from the Goals list, a Feed message) opens in place, and the page keeps it — with its scroll — when the pane goes elsewhere and comes back; after a reload the page reopens the record it had open. A record tab is a work object kept at hand: a Session, an Inbox item, anything opened from another place (Home, search, the Assistant, a link), or a record ⌘/Ctrl- or middle-clicked on its plugin's page, which opens without leaving the page. Opening one inserts a new durable tab; existing tabs keep their identity. Closing the tab being looked at returns to where the pane was before it. Each pane keeps a history of its places — plugin pages and the records opened on them, tabs, and the covers opened over it down to the settings category — for this browser session, so it survives a reload; the titlebar arrows, ⌘[ / ⌘] (Alt+← / Alt+→ elsewhere) and the mouse side buttons walk it. Unpinned tabs hug their title up to 172px and share the remaining width equally when they overflow, down to 72px on desktop and 98px on narrow or touch (the title, a 44px target, and the 44px close mark fit in it). A plugin's tab and its loose record tabs form that plugin's group, in the plugin's colour, with the plugin tab first; closing the plugin tab closes the group, and the strip offers the way back for six seconds (⌘⇧T / Ctrl+Shift+T after that). Users may also group tabs with a named chip; a tab in a user group leaves its plugin's group. A binary layout tree supports nested horizontal and vertical splits; split panes are separate sheets with a desk gap, a grip appears on hover, focus or drag, and the focused pane carries a faint copper edge. Tabs, focus and layout persist per project on this device and never become Goal truth. At 760px and below only the focused pane is shown, with window selectors to switch focus. At narrow widths or with a coarse pointer, tabs, group labels, the cover chip and its close mark, Close and Split use 44px targets, and so does a split pane's close, whose strip keeps its room.

**Side panel.** The platform side panel (讨论 · 浏览器 · 文件 · plugin views) is one more sheet on the desk, not a floating card: the same 14px corners and sheet shadow, no outline, its top and bottom lining up exactly with the work sheet, the desk's 14px on its right like the left of the work sheet, and the split gutter — 8px — between the two. Opening it moves the work sheet's edge by that gutter and nothing else. The width grip lives in that gutter and shows only on hover, focus or drag. Below 760px it is a bottom sheet above the bar with 8px at its sides.

**Titlebar status.** After the tabs the titlebar ends with what waits on the person, each shown only while there is something: 后台任务 (Coding sessions running or waiting, with a count) and the plugin-notification bell (plugin events whose delivery needs a skip-or-retry decision, with a count and the copper waiting dot). The bell opens the plugin market through its Dock menu entry and brings its 待核对的插件通知 section into view with focus on its heading. On phones the bell sits on the history row, so the titlebar never gains a row for it.

**Goal workspace.** An opened Goal fills its pane's sheet beneath the tabs: no further inset and no extra shadow. A compact toolbar keeps Back on the left. Runtime owns the flexible main column; a closable 300px rail holds Goal information and the inline timeline, and below an 840px Goal-workspace width that rail overlays the work at up to 330px. Reading and recording keep fixed headings and actions with internally scrolling content.

**Settings.** Global and project settings open in the workbench as covers over the panes. Global settings are one grouped list shared by the cover and the independent page (本机 · AI · 工具与接入 · 系统 · 插件): a plugin's settings page is placed by the order its Manifest gives the view and joins the group of the host page it follows. Every `/settings/*` link inside the workbench opens in the cover; 能力 opens its own cover from the same list. 角色 (Characters) is a settings page: its roles open their prompts in the same cover, and Back returns to 角色. Direct `/settings*` and `/projects/{id}/settings*` URLs render the same content as an independent page with a category column and a centred 760px document of grouped cards on `--surface-soft`. At 760px and below categories become return-plus-links above the content, forms stack and content padding becomes 24px 20px 48px. The project index is a full-page arrival surface with its own brand, search and device-settings entry.

Native window drag regions and fullscreen-aware safe insets remain platform-owned. Tabs, buttons and resizers stay outside native system controls and are never drag regions. Overlay traffic lights sit in the titlebar (`trafficLightPosition.y = 10`); the titlebar's box starts after that inset.

## The bottom bar

There is no global sidebar; the work spans the window and one resident bar at its foot carries every global entry. The `navigator` slot id is unchanged: a plugin that contributes `navigator` appears in the plugin switcher and can be kept in the Dock.

- **Trays.** On desktop widths the left group and the person's own group each sit in a tray as tall as the composer: a recessed tone (ink 4% with a 6% inner edge, `--r-composer` corners, 6px padding), never raised, so the composer stays the one raised thing and the current entry still reads as a paper tile lifted out of its tray. Phones keep the two groups on their own row without trays.
- **Left — switcher and Dock.** The **plugin switcher** comes first and names what the work area shows: one plugin, a cover (设置, 插件市场…) by its own name, or one chip per pane when split, the focused pane's chip raised. Its list opens with a head — ⌘K search and, beside it, the market and the studio as two `mw-btn--secondary` buttons (插件市场 with a dot when updates wait, 插件创作工作台; they wrap under search where the room runs out, and on a window the head stays while the list scrolls under it) — then every plugin a project could have, once, grouped by purpose, with the current entry in `--nav-active`. A plugin the project has reads in full ink and opens when pressed; one it does not have is `--faint` and opens nothing. Each entry ends in two `mw-btn` icon buttons (the floor's size, 32px, or 28px compact) that are there only while the entry is looked at (hover or focus): a pin that keeps it in the Dock (secondary while not kept, primary and upright while kept; Shelf's and 灵光's are fixed on, Goals cannot be removed) and a plus that becomes a red trash can once the plugin is in the project (`--red`; filled solid red while a removal is being asked) — adding or removing happens in place, with a removal asked once in the entry's second line. The row yields to the buttons as DropAgent's directory rows do (its text gives up room for them at once, 80px for two 32px buttons (72px at 28px compact); the buttons ease in over `--dur-hover`, sliding 8px over `--dur-move`, the second 32ms after the first); at rest a kept plugin carries only a small pin, and without a pointer the buttons stay (44px each on a phone or with a coarse pointer, and the row keeps their room). Every plugin changes in place — Feed's section of the directory with its source directory, and Coding's row in the settings list, come and go live too; a plugin that could not would bring the page back once, its state saved first (specs/archive/plugin-picker-dock). The Dock follows: 项目首页 first, then the chosen plugins as 38px glyph buttons. The current item is a paper tile with `--lift-1` and a 3px copper dot beneath; others are transparent until hover. What does not fit folds into a trailing +N button whose list rises above it, and folds again when the window, the right group or the switcher's name changes width. The switcher gives way to the Dock: 项目首页 always keeps its room, and so does +N unless the two do not fit side by side on a phone's second row (below 356px, beside a directory button), where +N goes and the switcher lists every plugin; a long name ends in an ellipsis, and below 1040px the switcher is its grid glyph alone (the current plugin tab above the page still names where you are). The left column never gets narrower than the switcher glyph, 项目首页 and +N with the tray's padding.
- **Centre — the unified conversation.** One 50px white composer pill (`--r-composer` 15px, `--lift-2`): the resident Assistant, only an input. A search with no hit is asked of the Assistant, whose answer rises above the composer headed by the question.
- **Right — residents and project.** Shelf, 灵光 and the discussion button (group and direct chat in a split beside the work) share one tray; then the project button — the project monogram (a 40px target on a fine-pointer window, 44px on a phone or any coarse pointer) on a solid hue chosen from the project id, also used on the chooser's rows and in the project menu. Its menu holds the projects, 管理项目, 项目设置, then who you are, 能力 and 设置. Every row in that menu is 34px with a 20px leading slot, and 44px on a phone or with a coarse pointer.

Every Dock glyph, resident button and switcher entry opens its plugin through the same entry, so navigation has one path. The bar is a set of switches: pressed again while its plugin is showing, a Dock glyph or resident puts back the place the pane had before it (the latest earlier place in the pane's history that belongs to something else; the project's home when there is none). 项目首页 is where panes start and is not a switch. A menu entry that opened a cover (设置, 项目设置, 能力, 插件市场) is marked current while its cover is up and closes it when chosen again. Menus from the bar rise from it, anchored at the edge nearest their control. Tooltips are graphite, sit above the bar, appear only where a name is hidden, and name the shortcut: ⌥1…⌥9 for the first nine Dock glyphs, ignored while typing, in a terminal, or with a dialog or popover open.

**Where am I.** The personal space omits the generic Home titlebar entry because its permanent bottom HOME control already owns that destination. Goals uses the plugin tab group described above, including tabs for concrete Goals. When a pane shows a plugin's own page, that plugin's tab is current; pressed again, it returns the page to its list. When market, capabilities or settings covers the panes, a cover chip (插件市场 / 能力 / 设置 / 项目设置) leads the strip with its own close button; Esc (outside a field, menu or dialog), the titlebar Back and the entry that opened it close it too, and the panes show exactly what they showed. While a cover is up the switcher and the window title name the cover, and no Dock entry claims to be current beneath it. Cover chips are not tabs: they never group or share width.

## Order

What sits together lines up, so a page reads tidy before anyone reads a word (user 2026-10-22, VUX-46 to VUX-50).

- **A mark is as tall as its words.** A state ring, dot or badge mark beside words is the words' size: `renderStateRing` without a `size` follows its text (`1em + 2px`, its stroke scaled to the size), so a ring beside a 12px caption is 14px and one beside a 13px title is 15px. No page sets a ring's size for its row; a size is given only where the ring stands alone (the board's specimen, a large empty mark). It centres on the first line of its words, not on a two-line block.
- **An icon beside words is their size or one step up** (Iconography): 12–16px beside 12–15px words, 20px only beside 17–20px words or standing alone (the Dock, an empty-state mark). A leading icon centres on its words' first line; a trailing chevron centres on its row.
- **Peers are one height, one line, one gap.** Buttons that sit together (a header's actions, a dialog footer, a part's actions) take one size: the variant never changes a button's height (`mw-btn--secondary` small is 28px like a small primary or ghost). Their gap is 8px, 4px inside a compact group, and 2px only between icon buttons or in a packed toolbar. A page header's actions sit on the heading's line. One larger target in a row is deliberate and rare: the bar's send.
- **Words take the scale** (Typography): 11 / 12 / 13 / 15 / 17 / 20 / 24 / 30px, at most four on a page; no 10, 13.5 or 14px. Code, fields and an editor's own canvas keep their sizes.
- **Corners take the scale** (Corners): 4 for a mark, 6 a tag, 8 a control, 10 a row, 12 a card, 14 a sheet, 16 a dialog, a capsule or a circle; a box around a rounded part is concentric with it. No 5, 7 or 9px. Density and theme change no corner and repaint no status.
- **Information has a place.** A list page is heading, one sentence, actions, then the list in one column; a row is lead mark, title, facts, then trailing actions, in that order on every plugin's page.

`tests/visual-order.e2e.test.ts` reads the project page, thirteen plugin pages, settings and the component board in light, and the pages that lay out differently in dark, compact density and on a touch phone, and fails on a mark, an icon, a font size, a corner or a row of buttons out of order (the audit is `tests/fixtures/order-audit.ts`; the few places it leaves out are listed there with why).

## Elevation & depth

| Step | Token | Used by |
| --- | --- | --- |
| Surface | `--sheet-shadow` (`--surface-shadow`) | The work sheet on the desk |
| Lift 1 | `--lift-1` (`--shadow-soft`) | Current tab, segmented thumb, current Dock item, primary button, raised canvas tools |
| Lift 2 | `--lift-2` (`--shadow-raised`) | The composer, inner sheets, hovered cards |
| Lift 3 | `--lift-3` (`--shadow`) | Menus, popovers, dialogs, edge sheets, toasts, a dragged node or tab |

Light shadows are diffuse and low-contrast (≤ 20% at the far layer); Dark shadows are deeper with a 1px 5–6% white ring standing in for the edge. Every modal and attached editor dims with one `--scrim` (Light `rgba(21,23,29,.16)`, Dark `rgba(0,0,0,.5)`) and no blur. Dialogs, menus, popovers, edge sheets and every filter panel are borderless in both themes — the lift is the boundary (Dark's `--shadow` carries the light ring). Never nest a card inside a card; the sheet is already the surface. Directory rows are flat; a selected row takes the `--nav-active` fill without a leading bar. Goal work and records stay flat and continuous with their pane.

## Shapes

A mark smaller than a control (check box, keycap, a drawn line or bar) 4px · `--r-tag` 6px (status tags, file-kind chips) · `--r-control` 8px (buttons, fields, choices, segmented tracks) · `--r-row` 10px (directory and stage rows, menu items) · `--r-card` 12px (cards, canvas nodes, board cards, grouped settings) · `--r-sheet` 14px (work sheets, inner sheets, the onboarding window uses its own 18px) · `--r-composer` 15px · `--r-dialog` 16px (dialogs, edge sheets on their open side). Dock buttons are 11px tiles; avatars and the project monogram are circles. No other corner: a box that holds a rounded part at an inset takes that part's corner plus the inset (the segmented track is its 6px thumb plus 4px padding, 10px), so the two curves stay concentric; a line thinner than its corner is a capsule. Density, theme and pointer never change a corner.

Status presentation uses the shared twelve-segment state ring (`renderStateRing` or `renderStatusMark({ state, label })`) in directories, stage lists, boards and the canvas. The library covers 43 business states with 21 visual families; aliases share their appearance, while the caller keeps its own meaning and label. Ordinary work in progress is still; actual execution moves. A completed Agent round does not mean that its Goal is done. Known progress may supply a fraction; absent progress never implies a measured percentage. State changes keep the segments and transition to the new arrangement. Reduced motion, hidden pages and offscreen icons stop continuous drawing. Action icons, selection controls, object types and measured progress bars retain their own forms. Elsewhere a status tag is a borderless soft wash at 6px corners, never an outlined or stadium pill.

## Iconography

One curated Lucide library on a 24 grid supplies navigation, action and object icons; state marks use the shared segmented ring. Four sizes: **12** (beside captions and counts), **14** (inline, menus, small buttons), **16** (buttons, row leads, tabs) and **20** (Dock, residents, the empty-state mark), as `--icon-xs` … `--icon-lg`. Stroke is 2 at 16px and below and 1.6 at 20px. A glyph and its label share a centre line with 6–8px between them. Chrome glyphs are `--ink-soft`, current glyphs `--ink`. Do not introduce a second icon family, filled glyphs or emoji.

- **Plugins:** one glyph each, from `PLUGIN_ICON` (see Plugin identity).
- **States:** `STATE_RING_FAMILIES` owns the 21 ring appearances; `STATE_RING_LABELS` lists their 43 presentation aliases. Existing `status-*` icon calls use this same renderer. The state section on the board demonstrates the real component and its transitions.
- **Empty states:** one picture — two sheets of abstract paper lying across each other with the plugin's 20px glyph on the front sheet (`mw-empty__mark`). No plugin draws its own illustration.

The component board's 图标清单 shows all of these.

## Motion

| Token | Value | For |
| --- | --- | --- |
| `--dur-press` | 130ms | Press give on buttons, choices, Dock items (scale .97 → spring back) |
| `--dur-hover` | 130ms | Tone steps on rows and buttons |
| `--dur-move` | 250ms | State changes: segmented thumb travel, switch knob, disclosure, selection; a menu growing from its control (4px, .97) and a dialog rising in (8px, .98), each leaving the same way over `--dur-hover` |
| `--dur-arrive` | 420ms | Arrivals: a work surface's first reveal rises 7px from 40% opacity (showing it again is a `--dur-hover` cross-fade); edge sheets slide in |
| `--dur-moment` | 640ms | The two moments below |
| `--dur-reveal` | 90ms | Newly written words of a reply still being written, with `--ease-reveal` `cubic-bezier(.215,.61,.355,1)` (out-cubic): opacity from 0 and a 2px blur, once |

These four durations and two curves, and the one reveal pair kept for newly written text, are the only ones in the product; older curve names (`--ease-swift`, `--ease-out`, `--ease-standard`, `--ease-settle`) alias them. Motion animates `transform` and `opacity` only, so nothing reflows while it plays, with three bounded exceptions: `filter` only in that reveal (`.mw-fresh`, the design system's `molisStreamText`; no other element and no backdrop blurs), the width of the slot a dragged tab leaves (`tab-drag-slot.ts`: one element, only while dragging, user 2026-10-21), and the content height of a natural-height fold (`grid-template-rows` on a one-body fold's outer row; `block-size` to `auto` through `interpolate-size` on the other chevron folds, where the engine has it, at once elsewhere). The reveal plays on words that grew while the reply is being written, from the grapheme the old text ended in, a few pieces at a time; code, rewritten text, a reopen, a hidden page and reduced motion show at once, and a finished piece goes back to plain text. The board compares it at 2px with the 6px upper bound. Motion never blocks input (exits use `transition-behavior: allow-discrete`). It answers a real state change only: a work surface rises once, the first time it is revealed (`is-arriving`), and showing it again is a 130ms cross-fade; a list cascades (at most 12 rows) the first time it appears, never on a refresh, a re-render or switching back; a card redrawn in place (a round's card whose words changed) does not rise again; a disclosure rises only when the person just opened it. Nothing loops except a loading indicator. The component board's 动效标本 has a clickable specimen of each of the twelve moments: press, hover, menu, dialog in and out, edge sheet, tab switch, segmented thumb, first list arrival, row expand, page or plugin switch, toast and completion.

Curves: `--ease-quint` `cubic-bezier(.22,1,.36,1)` for arrivals and moves; `--ease-spring` `cubic-bezier(.2,1.35,.4,1)` for a press's return, a check landing and the segmented thumb settling. Menus grow from their trigger (bar menus rise from the bar) and close back toward it on the short clock; edge sheets slide from their edge, dialogs rise and scale in and settle back out, the scrim only fades. Entrances are four keyframes, written once in the design system's `styles/motion.ts`: `craft-rise` (something arrives: a surface's first reveal, a reading, a result, a card or a step; 7px from 40%, so words never blink), `craft-fade-in` (shown again, or a layer that only appears), `craft-drop` and `craft-rise-from-bar` (a menu below or above its control), plus the dialog recipe in `coss-controls.ts`. A page or plugin animates with these names and writes no rise, drop or fade of its own; durations are the `--dur-*` tokens (the older `--motion-*` names are aliases for old plugins, not for new rules). A control that opens a popover never scales, so its menu cannot shift. Nothing rises, tilts or spins on hover. Home's event rows cascade only on first arrival or a day change, never on a background refresh. Toasts are a graphite capsule with a success or failure mark above the bar; failure nudges once. Checks draw themselves; a pressed switch knob stretches before it lands.

**Moments.** Only two things get one. When the open Goal turns 已完成, its mark pops and a ring with a few sparks leaves it (opening an already-completed Goal never does). When a new Goal, a newly pulled message, a new Inbox entry, a new issue or a record a plugin component has just added first appears, its row carries one `--accent-soft` wash that fades over `--dur-moment` (at most three per update): the one rule `[data-craft-new]`, set by the page or by `molisCraft.land(row)`. Opening a project settles the bar and the sheet in once per page. Plugins may call `molisCraft.celebrate(element)` and `molisCraft.land(element)`; both are presentation only.

Under `prefers-reduced-motion`, and under automation (`navigator.webdriver`), nothing in the final layer or onboarding moves: transitions take 0s, so a new size or position is there the moment the state changes, and focus still moves.

## Focus and accessibility

Keyboard focus is `--focus-stroke`: a 2px copper outline at a 1px offset (`--focus-stroke-inset`), on every button, tab, row, summary and link. Fields — `mw-input`, `mw-textarea` and the `mw-select` trigger — answer focus with a full copper border (3:1 or better on its surface) and a 3px copper halo at 16% (`FIELD_FOCUS`) instead of the stroke, and an input group turns from wash to white. A control never shows both. Writing surfaces marked `data-plain-field` answer with a copper underline instead of a box. Focus never relies on colour change alone and is never removed.

Every interactive target is at least 32px on desktop (28px compact) and 44px on phones and coarse pointers, with one scoped exception below. What the strip and the bar open is a target too: on a phone or with a coarse pointer a button, a summary, an input or a link in their lists, menus, notices and offers (the "+" menu and the choosers, the materials' remove mark, the notices' buttons, the switcher's pin and add buttons, the Dock's "+N" list, the project menu, the strip's open-plugin, layout, tab and group menus with a group's name field and colour swatches, the opened Assistant panel with its tab bar, its list of all works, the details of a work and the controls a conversation can hold) and every `mw-menu` item are 44px; a fine-pointer desktop window keeps the sizes they have there (a 34px menu row; a colour swatch is a 32px target with an 18px dot drawn inside it, 44px with a coarse pointer), and none of those lists holds a control under the 32px floor (28px compact) except, on a fine-pointer desktop only, the opened Assistant panel: its tab bar's 28px buttons and 20px close mark, and its body's 22–28px controls, are a known gap (specs/BACKLOG.md BL-127). Text on paper meets 4.5:1 down to `--faint`. The directory, tab strip and plugin switcher have full keyboard paths (Arrow, Home, End); dialogs trap focus, close on Escape and return focus to their opener. Status uses text or a glyph besides colour.

**Exception: the desktop window's chrome.** The title bar's tab strip and the bottom bar are the two places that stay denser than the floor, and only in a fine-pointer window: touch sizing goes by the input, not by the width. Any window whose pointer is coarse (`pointer: coarse`: a phone, a phone held sideways, a tablet) has 44px targets in the strip and the bar at every width and height. The exception covers a fine-pointer window wider than 760px for the strip and wider than 600px for the bar; a fine-pointer window at or below those widths is laid out as the phone is, and its targets are 44px too. In the strip, tabs and the cover chip are 24–26px tall, the history, open-plugin and layout buttons 26–32px, and the close marks of a tab and of a cover chip 22px and 20px. In the bar, the Dock, resident and switcher buttons are 38px tall, the project mark 40px, and the Assistant line's input 28px, attach 30×28px and send 34px, and its chips 28px tall (the work's chip and its 28px mark for starting a new work instead, materials, attention, and the executor, Character and mode choosers); in a short fine-pointer window (`max-height: 560px` above 600px wide) the Dock, resident and switcher buttons are 34px tall and the composer is 40px instead of 50px. These sizes are the exception's floor, not a licence: nothing in the strip is smaller than 20px, nothing in the bar is shorter than 28px, and the input, attach and send are never narrower than 28px. The chips beside the input share the room the pill has: in a fine-pointer window narrower than about 900px a crowded line squeezes them (materials, the Character, the mode) narrower than 28px, never shorter. No other surface may cite this exception.

**Touch windows.** Everywhere the exception does not apply, everything named above is a 44px target: the strip's tabs, the cover chip, its close mark, close, open-plugin and layout buttons, history buttons, and in the bar the switcher, Dock, resident, discussion and project buttons and the Assistant line's input, attach, send and chips (the work's chip with its mark, materials, attention, executor, Character, mode), 44px tall and 44px wide, and the rows of the Assistant's "+" menu 44px tall. A coarse-pointer short window keeps those 44px buttons and a 50px composer, so its bar is 60px tall instead of 52px. The phone bar's targets touch one another (no gap), so its second row is an exact sum: seven targets need 308px, the widest screen, a plugin or cover with a directory button (eight targets), 352px (356px with the tray's own 4px), and the bar's 8px side padding and 4px column gap come on top (375px for eight). Narrower than 375px the gap and the side padding give way, so the row reaches the window's edge (the Assistant line above it keeps its place): eight fit from 356px and seven from 312px. A narrower phone never overlaps the targets, shrinks one or pushes one off the edge: the Dock gives up its pins from the end, and when even 项目首页 and the "+N" button do not fit beside the directory button (below 356px) the "+N" button goes too. 项目首页 never folds, and the switcher lists every plugin, the kept ones included, so nothing the Dock drops is lost. The opened Assistant panel's tab bar is a row of 44px targets too (the work's tab and its close mark, new work, all works, details, minimize), 50px tall, and keeps the tab room for a title down to 320px. The panel's body is 44px as well: the list of all works, the details of a work (the blocks' headings, the actions, the Character picker's button, the usage field and its save button, the hint to add a file) and what a conversation holds (a reply's copy button, a code block's copy and unfold buttons, a question's choices and fields, the approval buttons, a step list's summary, the next-step chips). A link inside a sentence is as wide as its words and 44px tall (padding above and below, which takes no line room); an object chip inside a sentence keeps its look and answers to a finger over an area 44px tall and at least 44px wide. A record tab in a narrow or touch strip is at least 98px wide, so its title and its close mark are both 44px; home and plugin tabs keep their names.

In a touch window the Assistant line holds inside its pill from 320px and never squeezes a chip under 44px. When the work's chip, its materials, a notice and the choosers do not all fit after the quiet parts have narrowed, the island marks the line crowded (`data-crowded`) and takes parts off in steps, each only when the line still overruns without it: the choosers first (executor, Character, mode; the side pane carries who does it, the Character and the mode), then the work chip's mark (the panel's tab bar starts a new work too), then the materials and the notice, which become the first rows of the "+" menu, open the same lists, and are pointed to by a dot on the "+". The input, attach and send are never taken off. The island measures the line with its chips on it even while the phone hides them for typing, so tapping into the input and away leaves the steps as they were. A fine-pointer window wider than 600px takes none of these steps; it squeezes its chips, as the exception above says. A work shows a Character only when it is not a Coding work and the mode only when it is, so the choosers that go first are that one chooser: a phone of 390px loses it only in the crowd (a chosen Character on a work with materials and a notice, or a Coding work's mode once materials and a notice show too) and nothing else; at 360px the work chip's mark goes as well while materials and a notice show; a 320px phone and a phone held sideways at 667px or less move the materials and the notice into the "+".

`tests/touch-targets.e2e.test.ts` measures touch windows at 320, 350, 360, 375 and 390px wide on the project's home, a plugin's page and the project's settings (the second row's targets neither overlap nor leave the window, 项目首页 stays on the Dock, and what the Dock folds is in its "+N" list or the switcher), the contents of every popover the bar opens at 390, 360 and 1024px, the strip's menus, the opened Assistant panel's tab bar and its body (the details of a work, the list of all works, and every kind of control the island makes, read from the script the page runs) at 320, 360, 390, 852 and 1024px, 640, 667, 740 and 852px wide held sideways, and 1024×768, and fine-pointer windows at 1280, 700 and 620, in light and dark, with and without a current work, with each chip of the Assistant line shown and with the crowds a work can show (a Character, or a Coding work's mode, with materials and a notice), where the touch line must stay inside its pill, take parts off only as far as it must, keep what it takes off in the "+" menu (with its dot), and come back as it was after a tap into the input and away, and the fine-pointer line takes no steps. At 1280px with a mouse it puts the pointer on a switcher row of each kind and measures the pin and add buttons that show, and the swatches of a group's menu as 32px targets around 18px dots.

Do not ship operating-system chrome as the product UI. A closed select may look like `mw-select`; opening it reveals `mw-menu`. Colour, date and time picking, range and destructive confirmations use `mw-*` (calendar, slider, alert dialog). A native `<dialog>` may keep Escape and focus trapping; its skin is still `mw-*`. File picking may keep a hidden `input[type=file]` behind `mw-btn`. Known leftovers are listed in [ui-craft-floor](specs/ui-craft-floor/spec.md) and must not be copied.

## Components

### Buttons

- **Primary** (`mw-btn--primary`): graphite fill, `--action-ink`, 500 weight, 8px corners, 32px, `--lift-1`; hover `--action-hover`. One per decision.
- **Secondary** (`mw-btn--secondary`): borderless `--control-fill` wash, ink text; hover one step deeper. Its size is the button's own (`--sm` 28, default 32, `--lg` 36), like every variant.
- **Ghost** (`mw-btn--ghost`): transparent until hover (`--nav-hover`), press `--nav-press`.
- **Link** (`mw-btn--link`): copper text, underline on hover.
- **Danger** (`mw-btn--danger`): red fill with page-coloured text, for the step that actually destroys something (usually inside an alert dialog). `mw-btn--danger-outline` is red text with a faint red boundary for a destructive entry point.
- Icon-only buttons carry an accessible name and a tooltip. Disabled buttons stay visible at reduced contrast; a loading button keeps its width and shows a spinner.

Toolbars never use a filled primary; a stage empty state may offer one. Form footers pair Cancel (secondary or ghost) on the left with the specific Submit on the right; explanations sit outside that group.

### Choice

`mw-choice` is the selectable option used by onboarding, appearance settings and any single- or multi-select group of short options. At rest it is a borderless wash; hover deepens it; selected (`aria-pressed` / `aria-current`) is graphite with a 12px check that springs in. Selection is never communicated by lighting or colour alone. `renderChoice({ label, icon, selected, href })` renders it; `mw-choice-group` lays a group out with 8px gaps.

### Fields

`mw-input`, `mw-textarea` and `mw-select` sit on paper with a 1px ink-12% border, 8px corners and 32px height; hover darkens the border; focus is the copper halo. `mw-input-group` and number fields keep the boundary on the shell: a wash at rest that turns white on focus. Errors set `aria-invalid`, turn the border red and show the message below with `mw-field__error`; input is kept. `mw-select` opens `mw-menu`, never the OS list. Sliders use a 4px track with a graphite fill and a paper thumb. Checkboxes are 16px with a graphite fill and a drawn check; switches have a paper knob on a graphite track when on.

### Segmented control

One segmented control serves view switches, settings choices and the locale switch: a borderless `--control-fill` track, 10px corners and 4px padding concentric with a 6px paper thumb, with `--lift-1` on the current choice at 500 weight. The thumb travels between slots over 250ms on the spring curve, taking each slot's width; without script it simply appears on the current slot.

### Directory rows

`mw-dir-row` owns row chrome: 32px single-line (40px two-line), 10px corners, 8px inline padding, `--nav-hover` on hover, `--nav-active` with an `--ink` title when selected, no leading bar. Titles are 13px / 500 (the item-title role) in `--ink-soft`; captions and counts 12px / 400 `--faint`. Group headings are 11px / 500 `--faint`, with more space above than below. Collection folds share one grammar: caret, mark, title, count. Status marks are 12–16px shared state rings beside the domain label and must not outrank the title.

### The way in's parts

These parts exist for the way in and are on the board's 到达 section with a specimen each. `mw-wordmark` is the product's name set letter by letter (one decorative span per letter under one accessible name) with a typing caret; `mw-caption` is the pausable AI line that cycles a few phrases and settles on one (a button, never under 24px tall). `mw-steps` is the short-line progress: a 24px bar per step, done in copper tint, current in copper. `mw-goal-track` draws one segment per goal — done, in play, to do — with the names beneath, thinned to the count when crowded (past seven the names go and the count stays). `mw-bar-context` names the thing in view in the bar's start block (its mark, its name, one line of caption) and `mw-bar-status` is the bar's centre when it speaks (a tile, a title, a caption, the shared spinner while it works). `mw-file-kind`, `mw-file-row` and `mw-file-group` list materials: a kind chip coloured by extension, a name, a size and a state; a group has a head with its own check (mixed when only some are chosen), a count and a remove. `mw-brief` is the project brief: kicker, title, description, the focus on a warm card, and two sections. `mw-btn__key` puts the key a button answers to on it (`↵`) and is never drawn on an icon-only button.

### Menus, popovers and tooltips

`mw-menu` and popovers are paper (`--popover` in Dark) with `--lift-3`, no border, 12px corners, 8px padding and 34px items, 44px on a phone or with a coarse pointer (8px corners, 16px `--ink-soft` glyphs, `--nav-hover` hover and keyboard focus, `--nav-active` current). They grow from their trigger over 250ms. Floating menus keep their CSS size cap and only shrink to fit. Tooltips are graphite with `--action-ink` text and 6px corners.

### Context toolbar

The bar that sits next to what the person has in hand (`mw-ctx`; the component board's 情境浮条 section is its specimen). It is the one place the ranked actions are shown: the workbench draws it in the work area, and a split pane draws its own from the plan the top document sends it. It replaces the row that sat above the Assistant's input, and Pages' own format bar and writing menu; a selection in Pages shows its tools on the left of this bar. One line, no wrapping: the plugin's tools on the left, fixed in place and separated by a hairline, then at most three recommended actions, 更多, and ✦助理. It is a `--popover` paper with `--lift-2` (`--shadow-raised`), no border, 8px corners and 4px padding, and it rises 130ms (`--dur-fast`) unless reduced motion is asked for. Its buttons are ghost buttons at the shared control height — 32px, 28px in compact density, 44px on a phone or with a coarse pointer — with 6px corners and 12px type; a pressed tool is `--nav-active`; there is never a filled primary in it. Its menu (更多, and 格式 when the tools fold) and the small form under it (a link's address, a comment) are popovers: `--lift-3`, 12px corners, 34px items (44px coarse). The bar never takes focus from the editor — a press on it is `preventDefault`ed; ⌘. moves into it, the arrow keys move along it, Esc puts it away and returns the focus. In a pane narrower than 480px it keeps two actions and ✦ stands alone; when the tools do not fit they fold into 格式 ▾. It is placed by the design system's one placement (`placeFloating`; the bar carries its above/below part: above the selection, below when there is no room or the pointer is a finger) and keeps its left edge still while the context stays the same. It appears once a selection has been steady for 350ms, not while one is being dragged or composed; a caret alone shows nothing and ⌘. brings the bar up for it. A result the person is waiting for (a candidate rewrite) stays in its panel when they select something else, and a form that belongs to the selection (a link's address) goes away with it. Another plugin's action carries that plugin's name beside its label.

### Dialogs and sheets

Creating or picking an item opens a centred modal — New Goal, Feed task configuration, Session add, the Frame picker — at `min(560px, 100vw - 48px)` wide, as tall as its content up to `min(100dvh - 96px, 720px)`, with a fixed header and action footer and one scrolling body between them. Dialogs are paper, borderless, 16px corners, `--lift-3`, over the shared scrim; at 760px and below they inset 12px. ⌘/Ctrl+Enter submits the open modal. Editing an existing Session's relations and the Handoff editor stay attached to the right edge as sheets (16px corners on the open side). Native focus trapping, Escape, cancellation and focus return remain. A dialog taller than the viewport keeps its footer sticky. A menu opened inside a dialog may overflow the dialog rather than be clipped.

### Toasts, alerts and empty states

Toasts are one component, `.mw-toast` (`renderToast`; styles in the design system's primitives): a graphite capsule above the bottom bar, or at the foot of the plugin stage that shows it, with a success or failure glyph (`data-mw-state` `done` or `failed`; a plain note has none), as wide as their words up to the window less 16px on each side (never half the window), the glyph on the first line. A failure that has a diagnostic ID carries a 诊断编号 button after the message, or under it when the line is full, in the toast's ink and underlined; it is a link inside a sentence, so on phones and coarse pointers it is 44px tall by padding above and below that takes no line room. An undo or a follow-up is a `.mw-toast__action` in the toast's own ink after the words (the first of several is `--primary`, a faint wash); a completion card (made, moved, imported) is the same toast with a title, a line under it and its follow-ups. A toast rises in from 12px at .97 over `--dur-move` and leaves over `--dur-hover`; a failure nudges once after it lands. The host places it centred by inset and auto margins, never by `transform`, so the arrival and the nudge never fight the placement. A plugin never styles its own toast colours, radius or motion. `mw-alert` is a soft status wash with a glyph, a title and a retry or next action. `mw-empty` is a centred block — the paper mark, a 15px / 600 title, 13px body up to 34em — offering only a real available action. Its actions are secondary buttons 8px apart: the page's one graphite button is its header's create, so an empty state draws a graphite one only where the page shows no other (a phone, where the header's create folds away). A reading pane with nothing open (Feed's reader, the Files companion) is the same centred block. Directory empty states are the same block left-aligned inside the column.

**Loading.** One rule: content whose shape is known (a list, cards) shows a static `mw-skeleton` placeholder; anything else shows `.mw-loading`, a quiet line with a small spinner that appears only once the wait passes 250ms, so a fast load never flashes. Skeletons never shimmer; under reduced motion the spinner is still.

**Failure.** A list or section that cannot be read says so where the content would be — `mw-empty mw-empty--error`: the paper mark with a red glyph, what failed, the reason, and **重试**. A failure is never only a line in a panel the person cannot see, and never an empty list that looks like "nothing yet".

### Tables and cards

`mw-card` is paper with a `--line` hairline and 12px corners where a card is needed at all; `mw-table` uses hairline rows and 500-weight headers. Settings documents group rows into cards on the sheet; plugins do not wrap sections in cards by default.

## The way in

The screens a person passes through on the way into the work — the **project chooser** (`/`, the first page of every day), the **opening** and two **Welcome** questions of a first run, the **new-project journey**, and the **update page** — are one frame and one stylesheet (`/assets/molis-work-arrival.css`): a titlebar, a stage and the resident bar. Only what is inside the stage changes from screen to screen; the titlebar and the bar never move. The pages are separate documents, so the way from one to the next is a page load into the same frame. Everything on them is an `mw-*` component; the page sheet only lays them out. Gradients live only in the opening's and Welcome's ambient light and the goal card's warm light.

- **The frame.** The **titlebar** carries the mark and its wordmark, the caption on the chooser, and what is within reach (后台任务, 能力, 设置); on the Welcome questions it keeps only the theme switch, and on the opening it is empty so the large wordmark has the screen. The **stage** is the pearl desk with one white sheet on it (the chooser's directory stands on the desk beside its sheet). The **bar** is the workbench's own bar — the same height, trays and 50px pill — with its three blocks given to the screen in view: *start* is the way back, the steps, or the thing being looked at; *centre* is the Assistant on the chooser and a status (`mw-bar-status`) elsewhere; *end* is the actions, the primary one carrying the key it answers to (`↵`). On a phone the bar is two rows: the status above, the way back and the actions below.
- **The chooser.** The directory on the desk lists the personal space first, then the projects by when each was last opened, with a search (⌘K from anywhere) and a one-line caption each; ↑ ↓ Home End move, Enter goes in, a double click goes in. The project last opened is preselected, so opening Molis Work and pressing Enter continues where the person was. The sheet beside it is the **project brief** of the project in view: its title, the sentence that introduces it (or what is missing — never a guess), the goal in play on a goal track with its count, what is next and what just happened, read from the same public readers Home uses. The bar says which project is in view ("预览中 · 回车进入"), the Assistant speaks for it (a draft is kept per project), and the end offers 新建项目 and 进入项目 ↵. A brief that cannot be read says so where it would be and the project still opens; an empty search offers the words as a new project (and the way in is shown as unavailable); a project list that cannot be read says so beside the personal space, which is still what the sheet shows; a Home with no project opens on the personal space and offers to begin the first one. A moving selection asks the Host for nothing until it has rested on a project for a moment.
- **The opening and Welcome** are for a person who has never opened the product. The opening is a screen of its own: the wordmark types large over the ambient light, the caption cycles beneath, and the way on, **开始 ↵**, arrives a moment after the name has been typed (any key or click ends the typing at once; a first Enter only does that). Then 语言 and 外观 are one question at a time, each a real preference (language goes through `/locale`; theme and density through the shared handlers) with a mini preview of the workbench beside it. A returning person gets a light opening on each cold start instead: the wordmark types once in the titlebar and the caption cycles; nothing waits on them.
- **The journey** turns existing materials into a project: 来源 → 确认 → 模型 → 整理 → 开始 (a first run begins with 语言 and 外观, so seven short-line steps instead of five). Sources are directory rows that open where they are to take their own settings; what has been added is listed on the right grouped by source (`mw-file-group`), name and size only until reading starts. 确认 is the files in scope, on the right. Continuing from the files lands on 模型, in the same two columns: the question on the left, the provider choices and the key on the right, and no file list. Going back from 模型 returns to those files. It reads and saves through the model settings capability; the settings page is not opened. 整理 is the Host reading, which the person may leave and come back to; 开始 is the name, the editable summary and the todo drafts beside a preview of the project as the chooser will show it. 空白开始 is one question — the name — with the same preview.
- **The real flow is unchanged.** Back, skip (稍后再说 on a first run, 返回项目 otherwise), retry, resume after reload, source reselection, reading without a model, the review with an editable name and summary, and saving the project all use the existing journey API and ids. Preferences are saved as they are chosen. Account authorization is performed by the provider, never simulated.
- **Choices** are `mw-choice`: graphite with a check when selected. **Transitions** inside the stage are directional: the step that is leaving fades back over 130ms, and the step that is entering slides in from the right when going forward and from the left when going back, 420ms on `--ease-quint`; focus moves to the new title. Enter continues when focus is not in a field.
- **Narrow screens.** At ≤ 980px the Welcome questions lose their preview; at ≤ 760px the chooser's directory and sheet stack (the directory capped so the brief keeps most of the stage) and the journey's two columns stack; at ≤ 600px the bar is two rows and the Welcome heading steps down. Reduced motion, and automation, remove the typing and every slide; the screens simply appear.

## Component board

`/__ui/catalog` is built from the production renderers and styles. Sections: 色板 (desk, surface, soft, wash, line; graphite, copper, status), 字体 (role specimens at 600/500/400), 空间 · 层次 · 动效 (lifts, corners, motion table, the desk–sheet–bar diagram), buttons, choice, fields, segmented, checks and switches, menus and popovers, dialogs and sheets, directory rows, status, toasts and alerts, empty states, **到达** (the way in's parts, below), icons, **图标清单** (every plugin's glyph, the state glyphs, sizes and strokes, and the empty / loading / failed trio), **动效标本** (one clickable specimen per motion moment), and **compositions**: list + detail split, toolbar + filter menu, form with errors, a menu inside a dialog, long content with nested scroll, and narrow width with density. `/__ui/catalog/bar` renders the real bottom bar (Dock, switcher, composer, residents, project menu) with the workbench stylesheet. A shared control, state or motion that meets the bar belongs on the board.

## Components in the workbench

### Directory and project search

Destinations are plugin section headers: icon and label, with a disclosure control when the plugin has a list. Flat tone and stronger text mark the current plugin. Lists nest under their plugin and may stay expanded together. Plugin lists that occupy the second column share the `mw-dir` panel and `mw-dir-row` grammar: Directory rows are single-line (32px, 28px compact), with a title and compact status mark, nested under collection folds that use the same caret, mark, title and count as Goals’ 当前; Inbox and Artifact lists use 40px two-line rows (36px compact) with a title, one secondary fact and a trailing status mark; Feed’s 全部 is the same collection fold as Goals’ 当前 — caret, mark, title and count — with source tasks nested inside as single-line rows that keep a trailing health mark; last-fetch lives in task configuration; Feed add sits above those folds. Settings categories use the same single-line row with a neutral icon. Row type, chrome and selection follow **Directory rows** above; row chrome lives only on `mw-dir-row` and spans any trailing action. Selected captions use `--muted`. The tools row is the plugin name plus icon actions. Leftover plugin row classes must not carry a second height, selection tint or padding. Create actions sit as a full-width add control at row height; Feed places it above the collection folds. Empty states describe the missing content and offer only a real available action. The Goals tree keeps its own hierarchy widget and does not use this row. The Goals directory keeps a full-width New Goal control with the status filter on its right; the live tree, archive and trash live as collection folds in the Goals stage list, with target / archive / trash marks.

Search (⌘K, from the composer or the directory) opens a palette above the bottom bar grouped by plugin and navigates to the selected object. It remains available with the directory collapsed or on a phone. The project button's menu keeps project switching, 管理项目 and 项目设置 distinct; 设置 there opens global device settings. Plugin market remains project-local activation, with search, installed icons, text filters and catalog rows; enabling Feed also enables Inbox.

### Plugin stage lists

When a plugin fills the stage (no item open), its list reads like the prototype's pages: one centred column up to 960px, the page heading drawn from the surface's own label (a CSS variable set once on the shell, so a plugin that re-renders its list keeps it; it is drawn text only, because the tab and the surface label already name the page), and the page's actions at the right of the heading. The first create action is the page's one graphite button; secondary actions are ghost buttons with a leading Lucide mark. Rows are at least 44px with a hover wash and 8px corners; folds read as quiet section labels 18px apart. When an item is open, the list becomes the `--surface-soft` side column and its create action returns to the soft wash. Editors that are a single form sit in a centred column inside a full-width scroller (Forms 52rem, Dataset 72rem); a note (灵光) is a writing page — a 24px document title and body text at 15px / 1.85 in a 46rem column, fields that show a wash on hover and the shared focus ring. Search sits inside its field (leading mark, ≤420px) and filters follow on the same row as `mw-select` at their natural width. Stage empty states use `mw-empty` (see above) at up to 30em so Chinese copy does not break mid-phrase. The selected row, including a Goal row, is the neutral `--nav-active` fill; plugins add no identity tint. Every detail view returns with the same rotated chevron in `plugin-stage-back`; a kicker that shares the back button's row starts after it, like a breadcrumb. Stage and dialog checkboxes are `mw-check`, date fields open the calendar from a calendar mark, and a dialog taller than the viewport keeps its footer (the submit action) sticky at the bottom. List dates follow the interface language (9月23日 / Sep 23). Every disclosure (`details`) uses one grammar: the OS triangle is hidden and a 12px chevron rotates from right to down (`mw-disclosure`, or the owner's own caret); remove, move-up and move-down controls are icon-only ghost buttons with `x` / `chevron-up` / `chevron-down` marks and an accessible name, never typed glyphs (×, ↑, ↓). Floating menus keep their CSS size cap (the Pages slash menu is a 380px scroller placed below the caret) and only shrink further to fit the stage. The Dock and the plugin switcher list are each one Tab stop: the current entry is tabbable, and Arrow/Home/End move between entries.

### Workflow chains

A workflow is edited as the chain itself: plugins are stations (hairline cards marked by the plugin's glyph; `--station-tint` now resolves to neutral ink), and each gap holds a handoff pill — Function, AI or 手动 — plus a small `+`. Every edit (drop a plugin into a gap, pick one from the gap's popover, change a handoff, move or remove a station) saves at once; there is no separate save step. A handoff that cannot run yet (a Function with no rule, an AI with no instruction or no text model) is drawn dashed in amber with an alert mark, and a line under the chain names each one. It never looks connected. Plugins that cannot join yet are counted, never shown as disabled chips. An open run keeps the vertical chain in a 232px column on the left, with check / dot / ring marks for done / current / not reached. The main area embeds the station's own plugin view with this run's item, under one bar that says what the next handoff will do. On a phone the vertical chain becomes a horizontal strip above the plugin. Both views are patched in place rather than redrawn. Continuing, opening the manual form or saving never reloads the embedded plugin or drops scroll and focus. Motion only says what changed. A station arrives with a settle, slides to its new place, or leaves quickly; the gap a drag would land in makes room with a copper insertion mark. A handoff in progress runs down its line; once handed over, the check lands, the line fills and the next plugin fades in over the last one. Removing a station, or a move that resets configured handoffs, offers 撤销 in the notice; ⌘Z does the same in the editor.

### Grouped work tabs

Tabs use independent rounded surfaces and the plugin's Lucide icon; the current tab is paper with `--lift-1`. A group is a tinted run on the desk (its colour at 10%, 15% while it holds the current tab, `--r-row` corners) holding its tabs; inside it the plugin tab's name and every icon take the group's colour, record titles a darker mix of it, and the current tab adds a 2px colour mark under its title. Text in a group keeps 4.5:1 against the tint in both themes. Home and plugin tabs keep their names; record tabs hug their title up to 172px and share the remaining strip width equally when they overflow; selection changes tone, not geometry. Preview tabs keep the same width with italic titles. A user group is named by a small solid label in its colour, or a dot when unnamed; collapsing hides every tab in that group, including the current one. A plugin group collapses from its plugin tab's menu down to the plugin tab with a count of what it holds. Pinned tabs stay at the left of their pane, show only an icon (36px desktop, 44px touch) and cannot join a group. Right-click or Shift+F10 exposes pin/unpin, close and group actions. The plus menu opens enabled plugin pages as committed tabs and offers the same current-tab actions for touch. Pin state survives reload, moving and split copies; an existing destination tab keeps its own preference when merging duplicates. Ordinary tabs reserve close-button space; inactive fine-pointer closes reveal on hover or focus, while touch closes remain visible. Menus use the shared 130ms entrance, disabled with reduced motion.

Native tab triggers support Arrow keys, Home and End to move and select; Delete closes a closable tab. Rerendering restores trigger focus. Collapsing a group hides its tabs until the chip is opened again. The focused pane synchronizes the active Goal title and directory selection without rebinding terminals. Opening or restoring a Goal tab loads that Goal's actual body, not only its title. Current tabs scroll into view after selection and viewport changes. Dragging reorders or moves tabs across panes and into or out of groups; Alt/Option copies. While the pointer is on the strip, other tabs slide to the order `moveTab` will commit and a same-width slot marks the landing place; dropping at a pane edge still splits with the dragged tab. The split control opens a layout menu with left, right, above and below options. Separators support pointer/keyboard resizing and double-click equalization. Closing a pane closes its tabs and expands the remaining layout; closing the final workspace tab restores home.

Same-plugin panes contain independently usable content. Loaded content windows stay mounted when tabs move or panes merge, preserving their unsubmitted input. Navigation inside an embedded content window delegates new tab selection to its parent, allowing A → B → A to return to the original content. Same-pane focus changes do not move or reload the work surface. Splitting preserves the current Frame/work view; an explicit “打开 Frame” action selects Frame even when that Goal’s existing tab last showed work. This live-document continuity is separate from persisted layout restoration; it does not promise that unsubmitted forms survive a page refresh.

### Goal canvas, board and work area

The dependency canvas uses real Goal/active relation data. Arrows run from provider to consumer; parent membership is separate. Completed nodes remain visible but quieter. Clicking a canvas node, a kanban card, or a stage-list row opens that Goal's Frame and selects it; the node's open control still expands the existing work surface. Panning, zooming, node positions and collapse/restore remain local view state.

A Goal opens as a document first (概览): a centred 880px column with the Goal's mark, its title at 28px / 600, the outcome, the current status callout, requirements and the timeline, whose events expand in place. 终端 is one switch away in the Goal header (a two-segment toggle, icon-only on phones). A Goal with a live terminal session opens in 终端; otherwise it opens in 概览, and when a terminal session appears for a Goal whose view was never chosen, the view follows it once. 打开工作区 on a Goal's frame is an explicit request for the work area and opens 终端. The choice is remembered per Goal. Forms and readers (a concern, a requirement, an old event) take the whole document area while open, with their footer in reach even in a 400px-tall window. In the narrow Goal list beside an open Goal, entries are two lines (title, then state) at 52px.

The Goals mother page switches between list, canvas and board. An empty canvas keeps New Goal in the stage chrome and centers a two-line status on the dotted field: there are no Goals yet, and Goals and dependencies will appear here as nodes. It does not repeat the create control. The list is the same Goal tree as the former directory, stretched across the stage so Goal IDs, status, child progress and prerequisites stay visible. The list and the board start below the floating stage chrome by the control height (52px on a window, more with 44px touch controls). On a phone a row keeps its title and status; the title comes first, and a long status gives way at 45% and is read whole from its tooltip. Board columns show counts derived from their actual items and a visible empty-column message. On a desktop pane 840px or wider the six columns share the available width so the board itself does not scroll horizontally. When the Goal board pane is narrower than 840px, the same six groups stack as a collapsible list on the pane’s paper surface: 32px rows, a real chevron, state rings shared by group and row, one-line titles, and a single vertical scroll. Collapsed group headers hug their content. Empty groups remain as headers, start collapsed, and hide the empty-column sentence. Opening a card uses the same Goal content. Vertical wheel input over an overflowing card column scrolls that column, including at its ends; horizontal gestures and Shift-wheel move the board horizontally only while six columns are showing and the board actually overflows. In the stacked list, vertical wheel reads the list. Vertical wheel over headers, gaps or non-overflowing columns can move the board horizontally when columns are showing. Zoom gestures and the open Goal work area retain their own behavior. The expanded workspace keeps full-height Runtime and optional information/timeline. When terminal is the only available work mode, the duplicate Conversation/Terminal mode bar is omitted.

Goal information reads live `readState` and prioritizes actual unmet requirements, pending decisions and blockers with their relevant entry points. An existing dependency alone is not presented as a completion blocker. Historical bodies start collapsed on ordinary entry; explicit selection, deep links and restored reading can expand the original event inline without replacing current facts. Relation body headings remain secondary to the main document heading. Requirements, pending decisions, concerns and older history retain their real data and retry behavior. 目标与要求 includes purpose, scope, decisions, material references and the relations-and-rules deck (关联与约束). 完成要求 shows current requirements, read-only historical criteria and exact Artifact versions. These views never calculate completion themselves.

### Frame content picker

Empty and populated Frames offer “添加已有内容”. Its viewport-contained dialog searches and filters the current project’s loaded Feed, Inbox, Session and Artifact references by source. Existing owner loaders read the selected content. Already-added items are disabled and labeled; empty projects and unmatched searches have distinct explanations. Adding stores only project/Goal-local canvas references and positions, retained after reload; it does not create a domain object. Search receives focus, Cancel returns to the opener, and adding focuses the new block. Cross-pane dragging remains available.

### Runtime and domain ownership

Work owns Session/PTY identity and terminals. Opening, selecting or closing a Goal never starts, sends to, destroys or rebinds execution. The empty terminal surface offers a local Add terminal action that opens the existing chooser, focuses its first available choice and returns focus on Cancel. Users explicitly add/start a terminal. Parent Goals can record integration in their own Runtime; a parent's completion is never derived from its children. Only the terminal canvas uses its independent Follow interface/Light/Dark palette.

Session creation and association share a readable dialog heading, with the mode switch separate from Close; on mobile, the mode switch sits below the title. The first-use creation action uses the shared primary style and an aligned plus icon. Artifact reading distinguishes no project results, available results with no selected version, and an unavailable exact version; each state describes the actual next step.

Goals retains event writing and domain decisions; Working directories retain their path health and explicit Project relationships; Artifacts retains owner-rendered exact versions and downloads. Inbox owns attention with an entry reason, related object and next action. Feed owns source-message facts and source tasks. Shelf is a personal DropAgent-shaped ingest surface: its directory, preview, command bar, confirm strip and drop veil keep DropAgent's structure but use the shared Soft Workbench tokens through `--da-*` — a `--surface-soft` directory, graphite primary, copper focus, links and on-states. File-kind labels sit beside the name as small filled chips in the five `--mark-*` tones (PDF clay, Markdown/text slate, image plum, link/site blue, folder ochre). Returning from a plugin detail uses the same top-left chevron inset as the Goal work toolbar; the detail itself is not a centred card. The bar, titlebar and other plugins are the same Soft Workbench. Source migration, credential handling and promotion semantics remain in their existing owners; shared chrome does not change these contracts.

### Home, Feed and settings

Home follows the prototype's composition inside one centred column (up to 1280px), and is paced to fit one screen: a quiet day shows everything without scrolling, and a busy one scrolls only through its list of events. The heading is 今天的工作 (or the chosen date) at 30px / 600 with one quiet line under it — the greeting by the local clock (早上好 · 中午好 · 下午好 · 晚上好 · 夜深了), the date, the day's count and whether something needs you — and the month at the right. Below it, the day column holds a horizontal seven-day strip (the chosen day is the graphite choice; days with events carry a few quiet dots; a calendar button returns to today), then **正在推进**: a soft card with warm light for the project's active Goal while it is moving (otherwise the first moving Goal, otherwise the first waiting on a decision), its outcome (a 24px / 600 line, so the card stays about 210px tall), one continue action and its real child progress; the card is absent when no Goal is in play. Then the day's events as a quiet list — time, source glyph tile, title, one line of context — where a row opens in place to show the event text, its facts, the open action, offers and 说一句; nothing opens by itself. A now-line marks the current time on today. An empty day keeps real places to start as one row of small 32px buttons — a glyph and a name each (推进一个目标 · 写一份文档 · 记下一点灵感 · 浏览更多工具), the sentence that used to sit under each now their hover hint — under one line of lead; a day other than today says it has no events and puts 回到今天 first in that row. At the right, a 252px margin holds 回到手边的内容: the plugins kept in the Dock, the person's own shortcuts and 添加快捷方式. There is no scratch note on Home. Below about 1020px of home width the margin moves under the day strip and lays its rows side by side; on a phone everything stacks, the buttons wrap and the strip scrolls sideways. There is no quotation carousel and no Home “打开 Goals” control.

The creation modal is a writing surface, not a form. Two borderless lines carry the whole default state: the Goal's name at 19px and its outcome below it, both label-less with the question in the placeholder and the label kept for assistive technology. A single 11px example sits under the name and fades on the first keystroke, so guidance appears only while it is needed. These lines opt out of the shared field ring through `data-plain-field` and answer focus with a 2px copper underline over a one-step background — a pen line rather than a box. The outcome line grows with what is written, up to 260px. Everything else — supporting notes and acceptance, parent and dependencies, identity and priority — sits behind one quiet disclosure that names all three, never three stacked accordions. Enter in the name creates the Goal, and ⌘/Ctrl+Enter submits from anywhere in the modal.

Home shortcuts remain project-local preferences, listed in the margin under 回到手边的内容. Their modal supports add/edit/remove/cancel, keeps input on failure, restores focus, and opens validated http(s) links through the existing web/native path. They do not create Goal records. 添加快捷方式 is the last row, a quiet outlined slot rather than the loudest thing on the page.

Feed follows the prototype's reading layout: an article column (up to 360px, `--surface-soft`) beside a reading page. The column holds the Feed heading with 立即拉取 (for one source) and 添加来源, one source menu that names what the list shows (全部消息 or a source, with its state and account), the three tabs 消息 · 来源设置 · 捕捉规则 only when one source is chosen, a search field with the full filter-and-sort menu inside it, the 全部 · 未读 · 已保存 switch (已保存 is the saved disposition), then one timeline of cards — source and time, the title with a copper dot while unread, one line of summary, and where the item went when it has left Feed — and a count at the foot. The source menu keeps every source with its count and a state mark that is not colour alone. The reading page starts idle (选一条消息开始读); opening a card marks it read and shows a quiet bar (close, the source) above a 700px page: a kicker (Feed in copper, source, read state, destination), the title at 28px / 600, the byline (author, time, 查看来源, 打开原文), the summary as the lead above a hairline, the body at 15px / 1.9, tags and materials, then the end of the page — where it stands now and the actions (加入 Inbox, 保存为资料, 升格为 Goal, 忽略). Adding a source and a source's settings and rules take the reading side. Below 820px of Feed width one side shows at a time, and the close control becomes a back chevron. Search, filters, sort, keyboard selection, collapse/reopen, read state and detail-error retry remain available; demo actions explicitly change only the current page. Feed task configuration uses the attached editor. Adding a task opens a type list of 32px rows — name plus a short hint — not marketing cards. Capture rules belong to a source task: they are optional when adding a task and managed inside that task's configuration; the Feed directory has no separate capture-rules entry. Task configuration has one Cancel/Save configuration footer; the pull-plan disclosure names its separate save scope and pairs Undo changes with Save pull plan. Saving the plan preserves unsaved task fields; resetting returns to the latest saved plan, including its paused state. Save failures keep input available for retry. Promote/Start retains create-or-reuse Draft behavior and source context boundaries; filling a chosen terminal never automatically sends. Inbox attention and its authoritative processing history remain separate from the Feed stream.

Project settings from the titlebar gear stay in the plugin shell: the directory lists project categories (General, Workspaces, Guidance) with icons and the shared selected row, and the selected page occupies the exclusive main stage as a document (a centred 760px column, grouped cards, inline controls). Workspace tabs stay in state but are covered until another plugin clears exclusive. Direct `/projects/{id}/settings*` URLs still render the independent settings page. The `embed=1` fragment remains for stage loading and project-management callers. Refreshing while settings are open restores the directory and exclusive stage.

General uses a name-edit row, a local-data disclosure and separate rebuild/delete actions. Guidance has six categories, category-specific add actions, one inline editor, version history and inactive entries. Rules use flat rows with right-aligned selects/switches, advanced disclosure, change reason and a clear save footer. Failed saves preserve input. Planning prioritizes the active composition, then search/category filters and content-sized adoption rows: a typical desktop row is about 112px tall, with no 168px minimum. Controls move below the copy on narrow screens. Mobile return/category links, inputs, buttons, planning filters and guidance actions have 44px minimum targets; the switch retains its small visual knob inside a larger clickable setting row.

Global settings presents theme, language, density and terminal appearance as compact setting rows. Execution tools put Runtime status and the relevant preview/connect/repair/remove action first, with local paths collapsed. Diagnostics separates installation, launch entries and Web service status/actions; technical configuration and logs are disclosed on demand. Plugins that register a device-settings page appear as additional categories after these host pages; Shelf’s drop-wheel preference lives there, not on Molis appearance, and Feed Gmail stays in Feed. Planning library browsing, detail and editing use the same independent shell, and that category appears only when the current project has Goals enabled. Global category changes, planning detail/edit and cancel retain the originating project context so Return restores the prior project workspace. Both settings scopes share the Soft Workbench palette and controls. Explicit planning adoption retains confirmation and independent project/personal versions. Project default rule saves reach a Goals-owned command with validation, transaction, audit history and idempotent retry; presentation does not own business state.

### Long detail reading
Inbox uses a 20–22px title in a scrolling context region, with processing actions and failure feedback in a separate footer. Artifact detail keeps its title and local export reachable in both workbench and direct version pages; its raw JSON scrolls within a maximum of 45dvh/400px. Session detail is a continue cockpit flush to the pane: a compact identity bar, one primary continue action, and a relations rail. Search and event filters appear only after execution events are loaded, and those records scroll inside the main column. On a narrow pane the rail becomes an overlay from the identity bar. These rules apply within split panes as well as narrow windows.


### Settings editing
Project rules, project guidance and planning-method editing use the available settings panel: fixed heading and action footer, with fields scrolling independently. Guidance editing replaces the list in that panel until save/cancel; cancel restores focus to its entry point. Save and cancel sit together at the right, with failure feedback immediately above them. Pending saves disable editing and cancellation; a failed connection preserves the draft and offers a readable retry message. Category navigation remains in the independent settings shell. The pattern is verified at 1024×400 and 390×500.


**Model settings.** With no provider configured the page offers the common providers as one `mw-choice` group (the same group stays above a new provider's form): one click fills the name, address, format and any stable model name, says what is still missing, and puts the cursor in the API key. A save that changes how the provider is reached runs one connection check first; a failure shows in the page's status line (red, announced assertively, scrolled into view), keeps every field and saves nothing. The first save that gives a model that can run is announced to the page (`molis-work:model-ready`) and every surface that showed "no model" reads again, without a reload; the onboarding page that opened the settings in a new tab shows the connected model, and the way on, the same way. When the announcement is sent and how it reaches panes and other tabs is written once, in that event's entry in `packages/contracts/src/platform/dom-events.ts`. The provider names on the choices are interface text like the rest, in Chinese or English with the page.

### Goal form panels
Goal record forms use a fixed compact heading, a scrolling field region and a separate action/feedback footer. The outer Goal title remains visible; the duplicate detail toolbar hides during form editing. Fields never scroll under the buttons. The shared structure covers note, progress, concern, decision, closure/resume, agreement, requirements and record-template forms. At 760px and below actions retain 44px targets. Pending writes keep fields inert and disable local form actions without removing inputs from FormData; failures retain drafts, and write-success/read-failure keeps its separate retry-reading action.

### Partial saves and connection recovery
When a multi-step save completes only its first step, name the saved part and the unfinished part in the same feedback area. Retrying must preserve identity and avoid duplicate records. Goal type/requirement saves follow this rule. Planning methods distinguish mandatory steps, coverage questions and dependency rules from optional advanced guidance; validation opens and focuses the missing group. Pending planning saves disable both local return and cancel links. Connector authorization failures point to the current Feed task settings → Manage account connection, while retaining provider diagnostics in history.

Project Workspaces settings replace the standalone Workspace navigator. Show associated paths and one explicit Files/Git browsing selection; Coding keeps its session execution choice. The same settings category works embedded and standalone, with empty, unavailable, saving, and error states. See [settings ownership](docs/platform/PROJECT-SETTINGS.md).

## Do's and Don'ts

### Do

- **Do** build hierarchy from spacing, weight and meaningful boundaries; keep work on the one continuous sheet and let only raised things cast a shadow.
- **Do** use graphite for the one primary action and a selected choice, copper for focus, links and in-progress, and status colours only for status.
- **Do** take every colour, corner, height and duration from the shared tokens; add a missing one to `palette.ts` or the final layer rather than a local value.
- **Do** keep the current tab, loaded body, selected directory item and owned terminal consistent without copying domain state.
- **Do** retain source links, exact Artifact versions and original record IDs; make current facts distinct from historical evidence.
- **Do** preserve visible focus, keyboard paths, error recovery, responsive reading and reduced motion. Keep the shell within the viewport and scroll long content in its owning component.
- **Do** state settings scope, keep global and project preferences independent and provide a direct return to prior work.
- **Do** pair form Cancel and Submit, label independently saved regions, preserve drafts on failure, and carry project context through global settings.
- **Do** put a shared control, state or composition on `/__ui/catalog` when it meets the bar.
- **Do** answer a copy with `window.molisCopy(button, text, labels)` (`packages/design-system/src/browser/copy-feedback.ts`): "copied" only after the clipboard took the text, ~2.5s, same width as the idle label (a button that is only an icon answers with a check or a cross in its own box and reads the words out), a newer press renews it and an older result never covers a newer failure. Open details with `.mw-collapsible` (natural height, 0fr → 1fr, reversible midway), and write a number that changes while it is read as `.mw-num` with the widest value of its range in `data-num-ghost`, so its width never moves the controls beside it in any font.
- **Do** give a growing conversation or log one scroll owner, `window.molisFollow(scroller)` (`packages/design-system/src/browser/scroll-follow.ts`): explicit following/detached on `data-follow`, only the person's wheel, keys, touch, scrollbar drag or selection detaches (the page's own scrolls never do; it says what it means with `toLatest()`, `resume()`, `restore(top)` and `release()`, and `dispose()` on unmount), the same element always gets the same owner (only the first caller's `onChange` is kept), only an upward move leaves (content growing under a downward scroll does not), a pin lands at most once a frame and waits out a gesture (150ms), "back to latest" is the one smooth scroll, and one owner holds the reading place while detached: the browser's anchoring, or, on a surface that compensates by hand (IM, Coding: redraws, earlier pages, a restored place), that compensation with `overflow-anchor: none` on its scroller, never both. The desktop WebView before Safari 27 has no scroll anchoring, so a surface whose content above the reader changes compensates by hand. Do not measure "near the bottom" again elsewhere; ask the follower's `state`.
- **Do** fold a side group to its natural height with its summary still saying what matters (a failure, how many run) and its trigger carrying `aria-expanded` and `aria-controls`; an update never unfolds what the person folded. 工作环境 names the scope, and for Coding the directory, repository and branch (a conflict is its summary); 连接与工具 shows each connection by its own status and what can and cannot be called, with the owner's reason; both are read from the owners when the work changes, never on every redraw. A side group's column is `minmax(0, 1fr)`, so a long line ellipsizes instead of widening the column. In 上下文, what waits to be sent, what the latest round used and what earlier rounds used are three places, never one list. In 产出, a fixed version kept in the 成果库 (固定成果) stands apart from the objects their owners keep changing (工作文件). A long list shows its first five and one "show more" for the rest through `window.molisShowMore(list, { key, label, keep })` (`packages/design-system/src/browser/show-more.ts`): one more than the limit is simply shown, a failure (`keep`) stays in sight, the button stands where the tucked items are and hands focus to the first revealed one, and the person's reveal lasts over redraws under the same key.
- **Do** keep a split divider honest: a press is only a candidate until about 4 px of movement; it follows the pointer frame by frame inside the room both sides need in CSS px (not a fixed percentage), settles on the default with hysteresis (in at 8 px, out at 16 px), and Escape, a cancelled pointer, lost capture or a blurred window put back the ratio of the press with the guard and cursor removed. When the stage cannot hold every pane's minimum, take the narrow layout rather than squeezing. The keyboard (arrows, Shift+arrows, Home, End, Enter) and `aria-valuemin/max/now` speak the same range (`apps/workbench/src/scripts/client/tab-sash.ts`).
- **Do** show code changes with the Diff plugin's rows (`renderDiff`): one grid per row with number columns as wide as the longest number (`--diff-digits`), numbers that stay put and stay out of a copy, and `mode: "split"` for a real two-column view whose halves stay level. A consumer sets `--diff-bg`, never its own column widths. Copy code from its source text, never from the coloured DOM. Copy a change as a patch with the Diff plugin's `unifiedPatch(rows, file)`, written from the rows on show, so the copy is what `git apply` takes.
- **Do** put a control saved on change back to what was saved when the save fails, and say so in its own block (`role="alert"`); never swallow the failure. `tests/save-failure.e2e.test.ts` drops the real request.
- **Do** let a waiting mark wait: a skeleton, a busy button's spinner and `.mw-loading` appear only after 250ms (reduced motion drops the fade, not the wait), and a busy button keeps its label until then. Keep the final busy state as the static value so a container that turns animation off still shows it. `tests/busy-feedback.e2e.test.ts` samples every frame of every plugin's open for a flash.
- **Do** let only the latest request paint: a detail opened while an earlier one is still loading, or closed before it answers, drops the earlier answer (a ticket bumped on every open and close). `tests/stale-detail.e2e.test.ts` holds a real request back and checks the later pick stays.
- **Do** paint first what a surface ends with: names a script can know before data comes (a period, a choice's options) are written at once or by the host, a row that data fills keeps one item's height, and a link into the side panel opens it before the first paint. `tests/load-geometry.e2e.test.ts` holds every plugin's load under a 0.02 layout-shift score at three widths.
- **Don't** anchor a `:has()` on a box that holds long content with something after it (`.stage:has(.x) .y`): once any rule on the page follows a `:has()` with a broad selector (`> :not(.a)`), the browser invalidates such an anchor's whole subtree on every node put in it (1.3 s for one node in a coloured change). Mark the state with an attribute where the owner changes it, or use a sibling selector or a `:has()` on the subject itself (`tests/code-diff-scale.e2e.test.ts`). Nor end the part after a `:has()` in a bare tag (`.row:has(input:checked) strong`): the browser then checks every such tag in the page on every node put anywhere (4.3 ms an insert in a long Assistant reply for one rule). Use a sibling selector, a class, or a custom property set on the classed box (`tests/has-anchors.e2e.test.ts` checks every stylesheet for both shapes).
- **Do** show a large code block as text at once and colour it a slice of lines a frame (Coding's `createCodingCodePaint`: about 8,000 characters a frame, up to 400,000), each slice grown from the last with `growCodeTokens`; a newer text that keeps what is coloured goes on from there, a changed one starts over, a block that leaves the page stops. Where the Host draws the reply (the Assistant), the Host keeps the tokenizer and sends a large block as its text and the map of its pieces (`assistantPaintMap`); the page builds the nodes from that map the same way. Coding keeps newline-aligned layout blocks from the first streamed piece, so later colouring does not lay out the whole accumulated inline tree. The text, token colours, selection and copy remain the same; no Worker or offscreen omission is involved. A physical line longer than a slice stays intact and remains a known layout limit. Code readers take their tab width from `--code-tab`. A page program that watches added nodes looks inside an added element only, never inside a text node's parent (`tests/code-scale.e2e.test.ts`).
- **Do** let a code block that is being streamed grow where it is: pass `grow` to `molisStreamText` and colour it with `growCodeTokens` (the plugin SDK's tokenizer, `@molis-ai/molis-work-plugin-sdk/highlight`), which colours again only from the line where the text changed (its last line while it streams) and gives exactly what colouring it whole gives. The block, its copy button, its leading coloured pieces and a fold the person opened stay; copy reads the code as it now is. A diff is read by its hunks: inside a hunk a line is what its sign says, even one that reads like a header. Don't colour a growing block again from the top on every update (a 1,000-line block cost 19.5 ms a time that way, 3.7 ms grown).
- **Do** zoom a media preview with `window.molisMediaZoom(viewport, image, { onChange })` (`packages/design-system/src/browser/media-zoom.ts`): about the point looked at (a trackpad pinch, two fingers, a double click), held inside its viewport and centred where it is smaller; a plain wheel and a drag pan only once zoomed, `0` goes back to fit, and the page's own zoom is untouched. The control beside it says what it does next and is not offered when it would change nothing. Do not write another pan/zoom for a preview.
- **Do** light a drop zone with `window.molisDropZone(zone, mark, accepts)` (`packages/design-system/src/browser/drop-zone.ts`, loaded right after the request helper on the workbench page, a side view and a Home plugin page): `mark(true)` while a drag it takes (files, unless said) is over the zone, held while the drag crosses its children, and `mark(false)` only when the drag leaves it, leaves the window, is cancelled with Escape, drops, ends, or the window loses focus. It follows the element last entered, not `relatedTarget` (WebKit leaves it empty). A zone the page draws again is given by its selector; zones that share one `mark` are one place. A zone that is only for files passes a fourth argument, its translated `reason` ("不支持拖入这种内容"): while a drag from outside the page that it does not take is over it, it gets `data-drop-refused` (a dashed danger outline) and the page's one badge says why; `accepts(types, items)` may read each item's kind and MIME type (names stay hidden until the drop). Never call `preventDefault` on a drag the zone refuses. The zone still takes the drop itself. **Don't** clear a drop highlight on every `dragleave`: crossing a child sends one.
- **Do** give an added file its own entry from the moment it is added — reading, read, or its name and why it cannot go, with retry when trying again could help — and keep that entry on screen until the person lets it go; a toast is only for what is about the whole batch. When a list's children come and go, change it inside `window.molisReflow(list, change)` (`packages/design-system/src/browser/reflow.ts`): kept children ease from where they were seen, a new one grows in, the rest close up, and a changed entry keeps its element.
- **Do** tell usage apart in the Assistant's 用量: the context window (a share only when both the prompt and the window are known, with the model and when it was read), this round's input, output, cache reads and writes, reasoning and cost, and the account's quota and reset, each from the runtime's own report for the round. A field the runtime did not report reads 暂不可用, never 0; an estimate or a partial count is marked; never stand in characters, material counts or unconfirmed sums for tokens.
- **Do** show what an Assistant round did between two messages as one quiet line that says what was done to what and how many steps it took (读取 Goals、查找能力 · 4 步 · 1 步没有完成), opening to each step; while a step runs the line says that step. A step with something technical behind it (the capability it called, what came back when it did not finish) opens from its own line, by pointer, keyboard or touch, never only from a hover title; a step with nothing behind it is a plain line. The words come from the round's activity alone, never from what the model may have thought. A group is keyed by the message before it and a step by its call, so what the person opened stays open and focused while its state changes and after the round ends, and a group that forms around a step the person opened opens with it (`apps/workbench/src/scripts/client/assistant-process.ts`, `tests/assistant-process-info.e2e.test.ts`).
- **Do** let every region scroll without a visible scrollbar: one design-system rule (`HIDDEN_SCROLLBAR_STYLES`, `packages/design-system/src/styles/scrollbars.ts`) hides them on every page, and nothing else sets `scrollbar-width` or styles `::-webkit-scrollbar` (`tests/scrollbars-hidden.test.ts`). Wheel, touch, keys and focus still scroll; under forced colours the system bars come back. A page written outside the shared stylesheets (the capsule, IM, the continuity page) carries the same rule; exported and printed documents do not.
- **Do** mark a horizontal strip that can hold more than it shows (tabs, chips, views, steps) with `data-overflow-fade`: the design system's one sensor fades only the side that really has more, 28px with eight alpha samples, clears it at the edge, keeps a focused item clear and, under forced colours, drops the fade for the system scrollbar (`packages/design-system/src/styles/overflow-fade.ts`, specimen on the board under 视觉机制). Do not write a local sensor or mask, and keep close buttons and main actions outside the strip.
- **Do** keep a composer's box and its main action where they are while a round starts, runs and ends: the round's settings (way of working, model) sit on the left and give way first, shortened and read whole through the page's tip, and pause, stop and send sit together on the right on the same row. A narrow composer puts its settings on a row of their own whether a round runs or not, so the row count never changes with the round (Coding's `.coding-composer-bar`, `tests/composer-steady.e2e.test.ts`).
- **Do** mark a text field that grows with what is written with `data-fit` (`packages/design-system/src/field-fit.ts`): it starts at two lines and its padding, falls back when lines go, and stops at `--fit-max` (240px unless the field says) or 40% of its frame, whichever is less, then scrolls inside with a caret at the end kept whole in view. Where the engine lacks `field-sizing` the one fallback (`browser/field-fit.ts`) measures without moving the page; after setting a value by code call `window.molisFit(field)`. **Don't** write a field's own `field-sizing` rule or set its height from `scrollHeight` (`tests/soft-workbench-refinement.test.ts`). A field that keeps a resize grip says so with a rule of its own.
- **Do** let headings balance and paragraphs wrap pretty (the shared texture already sets both), and let long paths, URLs and identifiers wrap inside their box rather than spill. A reply written while it streams wraps line by line: `molisStreamText` marks it `data-streamed`, so a line already read never moves as it grows. Check a surface with `tests/fixtures/text-wrap-audit.ts` at a desktop and a phone width.
- **Do** give a group of tabs, radios, toolbar buttons, menu items or focusable options its role (`tablist`, `radiogroup`, `toolbar`, `menu`, `listbox`) and let the shared roving focus (`packages/design-system/src/browser/roving-focus.ts`) run it: one tab stop, arrows along its orientation (reversed right to left), Home/End, disabled items skipped, scrolling only its own strip. Moving focus never chooses; Enter or Space does. **Don't** write a group's own arrow handler unless the keys do more (choose on arrow, Delete, a context menu); it then calls `preventDefault` and the shared one stands aside. Check a surface with `tests/fixtures/keyboard-audit.ts`.
- **Do** let a `<details>` whose content floats (absolute or fixed) close the shared way (`packages/design-system/src/browser/floating-details.ts`): Escape closes the innermost one holding focus and puts focus on its summary, a press outside closes it, and it carries `data-layer-open` while open so a pane that steps out on Escape waits. **Don't** write a menu's own Escape or outside-press closing; a menu that also closes when something in it is chosen adds only that. Check a surface with `tests/fixtures/overlay-audit.ts` at a desktop and a phone width.
- **Do** let a name, path or summary be cut (an ellipsis or a line clamp) only where the shared tooltip (`packages/design-system/src/browser/tip.ts`) can show it whole: inside a control or a row a keyboard reaches, so pointer rest, keyboard focus and a press and hold all show it. **Don't** write a `title` or a tooltip of your own for a cut text, and don't cut an error, a status or an action's label where nothing holds it. Check a surface with `tests/fixtures/truncation-audit.ts`, which lengthens every text that may be cut before it looks.
- **Do** give an action a row shows only on hover the same rule on `:focus-within`, and show it under `@media (hover: none)`; an action that appears once its row is chosen (selected, current, on) is already reached by a tap. A button kept out of the tab order (a tab's close) names its key on the row with `aria-keyshortcuts`. **Don't** hide an action until hover anywhere else. `tests/hover-actions.e2e.test.ts` checks the drawn surfaces and every hover rule in the stylesheets. A drag handle (a column, a table column, an image) has keys that do the same from where the caret is, named on the handle with `aria-keyshortcuts`; Pages uses Mod-Alt-Shift-← and →.

### Don't

- **Don't** add a global left sidebar, a second persistent navigation, or a plugin identity colour; plugins are found in the Dock and the switcher.
- **Don't** fight an earlier rule with `!important`, a per-plugin override or a restated token value; fix the source.
- **Don't** force a font weight globally, synthesise bold, or use weights other than 400 / 500 / 600.
- **Don't** outline a floating layer, draw a card inside the sheet by default, blur the scrim, or paint gradients outside the opening and Welcome's ambient light and the goal card's warm light (the overflow fade is a mask, not a painted band).
- **Don't** fill a button with copper, draw focus in ink or blue, or remove a focus indicator.
- **Don't** celebrate anything but a real completion or a real arrival, and never on first render.
- **Don't** hide a complex feature, disable an entry, swallow an error or show placeholder data to make a page look calmer.
- **Don't** turn a disabled composer, Session demo, reserved module or browser screenshot into a claim of an integrated feature.
- **Don't** infer completion from child counts, activity or missing requirements, or treat UI selection as execution authority.
- **Don't** make status colour the only explanation, allow long paths to widen the viewport, or hide the current tab when resizing.
- **Don't** style from a `:has()` on the page root (other than its own children), the work area, the bar or the switcher, or from a `:has()` placed before a combinator on any large container: Chrome then restyles the whole subtree on every related change. Mark the state on the element with a class or attribute where it changes. Nor put a `:has()` on the subject of a pseudo-element rule (`details:has(.menu)::details-content`): one such rule made every node put anywhere in the page cost 30 ms of style; set a custom property on the element and let the pseudo-element read it. `tests/style-has-scope.test.ts` reads every `:has()` rule in the source (not only the sheets the host serves) for the page-wide places and for both shapes after a `:has()` above.
- **Don't** measure the page (rects, computed style, scroll offsets, `checkVisibility`) inside a mutation callback, a microtask or a loop over every descendant: queue it to the frame, read everything first and write after, and track what scrolled instead of reading every node.
- **Don't** use prototype or review screenshots as product imagery, or claim browser review verifies the native package or every low-frequency form.
