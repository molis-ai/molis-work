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

Molis Work is a personal workbench for finding current work, reading its facts and taking the next action. Since 2026-09-28 its visual language is the **Soft Workbench**: a pearl-grey desk, one continuous white work surface lying on it, graphite for what you do and copper for where you are. The approved prototype in [`docs/design/soft-workbench/`](docs/design/soft-workbench/README.md) is the reference; this document is the normative production spec, and the rollout record is [specs/soft-workbench-rollout](specs/soft-workbench-rollout/spec.md) with its [inventory](specs/soft-workbench-rollout/inventory.md). [PRODUCT.md](PRODUCT.md) remains the authority for behaviour, data relationships and module ownership; this document records their visual expression.

Shared controls, palette and icons are the `mw-*` HTML Slot primitives in `@molis-ai/molis-work-design-system`. Authors and agents use the component board at `/__ui/catalog` and [`packages/design-system/README.md`](packages/design-system/README.md); shared-control work must match that board. Visible OS chrome — system selects, colour wells, date/time popups, `alert`/`confirm` — is not a product control. Motion, icon colour and arrival are part of a change, not a later pass. The development contract is in [CLI 与开发](docs/cli-and-development.md#前端与控件板) and [ui-craft-floor](specs/ui-craft-floor/spec.md).

**Key characteristics**

- **Desk and surface.** The titlebar and the bottom bar are the desk. All work lies on one white sheet with 14px corners and a shadow you feel more than see. Split panes are separate sheets on the same desk. Plugin directories are columns inside the sheet, never a second chrome.
- **One global navigation.** There is no global left sidebar. The resident bottom bar carries the Dock, the unified conversation (the Assistant with its plugin switcher), the personal residents and the project button.
- **Tone before outline.** Ordinary content separates by spacing, weight and the occasional hairline. Only raised things cast a shadow: the composer, the current Dock item, menus, dialogs, sheets and toasts. A floating layer never also draws a heavy outline.
- **Graphite does, copper points.** The primary action and a selected choice are graphite. Focus, links, work in progress and the small detail of a selection are copper. Colour otherwise says status only; plugins carry no identity colour.
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
| Navigation behaviour: history, covers, the bar's second press, kept page state | `apps/workbench/src/scripts/client/tab-workspace.ts`, `tab-workspace-ops.ts`; the rules in [specs/page-interaction-flow](specs/page-interaction-flow/spec.md) |
| The one list of global settings categories | `apps/workbench/src/settings-sections.ts` |
| Onboarding window | `apps/workbench/src/styles/context-onboarding.ts`, `src/context-onboarding-renderer.ts`, `src/scripts/context-onboarding.ts` |
| Component board | `/__ui/catalog` (sections below) and `/__ui/catalog/bar` (the real bottom bar) |
| Plugin and state glyphs | `packages/design-system/src/icons.ts` (`PLUGIN_ICON`, `STATUS_ICON`) |
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

`--green` done, `--amber` attention, `--red` blocked or destructive, each with a `-soft` wash. `--tone-progress` is copper, `--tone-hold` a quiet cyan, `--tone-quiet` faint. A status is always a label or glyph plus its colour, never colour alone.

### Plugin identity

Plugins carry no identity colour on screen. Every `--plugin-*` resolves to `--ink-soft`, so existing consumers (icons, kind labels, washes, `--plugin-tint`, `--station-tint`) stay valid and calm. A plugin is recognised by its glyph, its name and where it sits. Each plugin has exactly one glyph, listed in `PLUGIN_ICON` (`packages/design-system/src/icons.ts`) and identical in its Manifest, the Dock, the switcher, tabs, the market, its empty state and search; no two plugins share one, and the AI mark (sparkles) is never a plugin identity. A low-saturation tint behind plugin glyphs was evaluated and rejected: with six to twenty glyphs on one screen it spends more colour than the rest of the interface put together. `MW_PLUGINS[].hue` remains data for the catalog, not a rendering rule. The reading-surface family (`--content-*`, Shelf's `--da-*`) aliases these same tokens; only the terminal canvas keeps its own palette. The five `--mark-*` file-kind tones (PDF, text, image, link, folder) remain as small classification chips beside a label.

## Typography

**Face.** The system sans: SF Pro / PingFang SC on macOS, Segoe UI / Microsoft YaHei on Windows. Self-hosted Inter Variable and Noto Sans SC Regular remain offline fallbacks only. `font-synthesis-weight: none`, so a missing weight never renders as faux bold. `--font-mono` (`MONO_FONT_STACK`) is for commands, identifiers, code and measured values.

**Weights.** Three roles, exposed as variables:

- `--weight-title` **600** — page and dialog headings, the onboarding question, section titles, the Home date.
- `--weight-control` **500** — buttons, tabs, segmented choices, selected rows, item titles, `strong`, `th`, `dt`.
- `--weight-body` **400** — reading, captions, field values, placeholders.

`TYPEFACE_STYLES` sets these on `:where()` selectors with no `!important`; a component that needs a role uses the variable. There is no global weight override.

**Scale.** Eight fixed steps and no fluid sizes: **11 / 12 / 13 / 15 / 17 / 20 / 24 / 30px**, and a page uses at most four of them. Body 13px / 1.5 at `-.011em`. Captions, counts and meta 12px; 11px only for the smallest group labels. Directory titles 13px. Section and dialog titles 15px / 600. Page headings 24px / 600 at `-.02em` (20px on phones); display (Home heading, a Goal document title, onboarding question, settings heading) 30px / 600 at `-.03em`. Reading bodies use 13–15px with 1.6–1.8 line height, bounded to 76ch. Fields use 16px at 760px and below so iOS does not zoom. Only content itself goes above 30px (a Pages document title, the onboarding greeting word). `tests/soft-workbench-refinement.test.ts` enforces the steps.

Status copy stays direct and specific. Timeline events use human-readable labels rather than raw event names; original IDs and sources remain available as secondary facts. Interface language changes between Chinese and English without rewriting user titles or record bodies.

## Layout

**Desk and sheet.** On desktop the window is the titlebar (`--desktop-titlebar-height`), the work area and the bottom bar (`--dock-h` 76px). `.tab-workspace` leaves `--sheet-inset` (14px) of desk on the right; each pane and the exclusive cover (market, settings) is a sheet with 14px corners on `--paper` with `--sheet-shadow`. Split panes are separate sheets with a desk gap between them; the focused pane's sheet reads a step deeper. Pages inside the sheet do not draw a second card. Embedded panes and widths ≤ 600px keep no inset.

**Plugin stage.** A plugin's own page reads as one centred column up to 960px wide (at least 32px from the sheet's edges), 32px from the top: the page heading (the surface's own name, 24px / 600) with one sentence under it on the left and the page's actions on the right, then the list. The first create action is the page's one graphite button; an empty state repeating it uses the secondary style. Opening an item turns the list into a `--surface-soft` side column beside the item. Directories (Goals tree, Feed sources, Sessions) are `--surface-soft` columns inside the sheet, 240px by default (220px at ≤ 1050px), resizable, with a saved project-local width; double-click restores the default. The directory scrolls on its own without a visible scrollbar.

**Scroll ownership.** The shell stays within one viewport. Tabs and primary toolbars stay in place while lists, readers, board columns and long forms scroll inside their own regions. Long content remains reachable at narrow widths and in split panes without shrinking text or introducing document scrolling.

**Breakpoints.**

- **≥ 1020px of home width:** Home shows its margin (note, things at hand) beside the day column; the board shows six columns when the pane is ≥ 840px.
- **≤ 1050px:** directory default 220px.
- **≤ 900px:** the composer hides its shortcut hint.
- **≤ 760px:** form and reader actions use 44px targets; settings stack; only the focused pane is shown.
- **≤ 600px (phone):** no sheet inset; the directory becomes a drawer with scrim, inert background and focus loop; the bottom bar becomes two rows (`--dock-h` 116px) — the composer on the first row (search stays in it as an icon), the Dock menu, Home, the +N fold, the residents and the project button on the second — and popovers open full-width above it.
- **≤ 560px tall:** writing gets the height: the bar tightens to 52px (a 40px composer, 34px Dock buttons), steps aside entirely while a Goal record form is open (on phones too), and the record menu opens as a sheet above the bar. At ≤ 640px tall the Goal terminal view's rail scrolls as one column and keeps at least 240px for the timeline.

**Density.** Standard is the default: 32px controls, 32px directory rows, 40px two-line rows. Compact (`html[data-density="compact"]`) uses 28 / 28 / 36. Phones and coarse pointers use 44px controls in either density. Density changes row height and padding only; type, colour and corners stay the same.

**Tabs and panes.** Each pane owns a tab strip in the titlebar row. A plugin's own page is the pane's place, named by the location chip; a record opened on that page (a note, a document, a Goal from the Goals list, a Feed message) opens in place, and the page keeps it — with its scroll — when the pane goes elsewhere and comes back; after a reload the page reopens the record it had open. A tab is a work object kept at hand: a Session, an Inbox item, or anything opened from another place (Home, search, the Assistant, a link). Opening one inserts a new durable tab; existing tabs keep their identity. Closing the tab being looked at returns to where the pane was before it. Each pane keeps a history of its places — plugin pages and the records opened on them, tabs, and the covers opened over it down to the settings category — for this browser session, so it survives a reload; the titlebar arrows, ⌘[ / ⌘] (Alt+← / Alt+→ elsewhere) and the mouse side buttons walk it. Unpinned tabs hug their title up to 172px and share the remaining width equally when they overflow, down to 72px on desktop and 96px on narrow or touch. Users may group tabs with a named chip; plugins do not auto-group. A binary layout tree supports nested horizontal and vertical splits; split panes are separate sheets with a desk gap, a grip appears on hover, focus or drag, and the focused pane carries a faint copper edge. Tabs, focus and layout persist per project on this device and never become Goal truth. At 760px and below only the focused pane is shown, with window selectors to switch focus. At narrow widths or with a coarse pointer, tabs, group labels, Close and Split use 44px targets.

**Goal workspace.** An opened Goal fills its pane's sheet beneath the tabs: no further inset and no extra shadow. A compact toolbar keeps Back on the left. Runtime owns the flexible main column; a closable 300px rail holds Goal information and the inline timeline, and below an 840px Goal-workspace width that rail overlays the work at up to 330px. Reading and recording keep fixed headings and actions with internally scrolling content.

**Settings.** Global and project settings open in the workbench as covers over the panes. Global settings are one grouped list shared by the cover and the independent page (本机 · AI · 工具与接入 · 系统 · 插件): a plugin's settings page is placed by the order its Manifest gives the view and joins the group of the host page it follows. Every `/settings/*` link inside the workbench opens in the cover; 能力 opens its own cover from the same list. 角色 (Characters) is a settings page: its roles open their prompts in the same cover, and Back returns to 角色. Direct `/settings*` and `/projects/{id}/settings*` URLs render the same content as an independent page with a category column and a centred 760px document of grouped cards on `--surface-soft`. At 760px and below categories become return-plus-links above the content, forms stack and content padding becomes 24px 20px 48px. The project index is a full-page arrival surface with its own brand, search and device-settings entry.

Native window drag regions and fullscreen-aware safe insets remain platform-owned. Tabs, buttons and resizers stay outside native system controls and are never drag regions. Overlay traffic lights sit in the titlebar (`trafficLightPosition.y = 10`); the titlebar's box starts after that inset.

## The bottom bar

There is no global sidebar; the work spans the window and one resident bar at its foot carries every global entry. The `navigator` slot id is unchanged: a plugin that contributes `navigator` appears in the plugin switcher and can be kept in the Dock.

- **Trays.** On desktop widths the left group and the person's own group each sit in a tray as tall as the composer: a recessed tone (ink 4% with a 6% inner edge, `--r-composer` corners, 6px padding), never raised, so the composer stays the one raised thing and the current entry still reads as a paper tile lifted out of its tray. Phones keep the two groups on their own row without trays.
- **Left — Dock menu and Dock.** The Dock menu (a tune glyph) holds 插件市场 (a dot on the trigger when updates wait), 插件创作工作台 and 常驻在 Dock, the list of every plugin with a trailing tick on the kept ones; ticking keeps the menu open. The Dock follows: 项目首页 first, then the chosen plugins as 38px glyph buttons. The current item is a paper tile with `--lift-1` and a 3px copper dot beneath; others are transparent until hover. What does not fit folds into a trailing +N button whose list rises above it.
- **Centre — the unified conversation.** One 50px white composer pill (`--r-composer` 15px, `--lift-2`) with the **plugin switcher** in front of it. The switcher names what the work area shows: one plugin, or one chip per pane when split, the focused pane's chip raised. Its list holds the project's whole navigation (项目首页 and the backbone, then 插件 — 灵光, work plugins, 创作, 更多), with the current entry in `--nav-active`. ⌘K search opens from the same place; a search with no hit is asked of the Assistant, whose answer rises above the composer headed by the question.
- **Right — residents and project.** Shelf, 灵光 and the discussion button (group and direct chat in a split beside the work) share one tray; then the project button — the project monogram (a 40px target) on a solid hue chosen from the project id, also used on project-index cards and in the project menu. Its menu holds the projects, 管理项目, 项目设置, then who you are, 能力 and 设置. Every row in that menu is 32px with a 20px leading slot.

Every Dock glyph, resident button and switcher entry opens its plugin through the same entry, so navigation has one path. The bar is a set of switches: pressed again while its plugin is showing, a Dock glyph or resident puts back the place the pane had before it (the latest earlier place in the pane's history that belongs to something else; the project's home when there is none). 项目首页 is where panes start and is not a switch. A menu entry that opened a cover (设置, 项目设置, 能力, 插件市场) is marked current while its cover is up and closes it when chosen again. Menus from the bar rise from it, anchored at the edge nearest their control. Tooltips are graphite, sit above the bar, appear only where a name is hidden, and name the shortcut: ⌥1…⌥9 for the first nine Dock glyphs, ignored while typing, in a terminal, or with a dialog or popover open.

**Where am I.** When a pane shows a plugin's own page, its tab strip starts with a location chip (that plugin's glyph and name) marked current; opening an item makes the chip a quiet "back to the plugin page" control. When market, capabilities or settings covers the panes, a cover chip (插件市场 / 能力 / 设置 / 项目设置) leads the strip with its own close button; Esc (outside a field, menu or dialog), the titlebar Back and the entry that opened it close it too, and the panes show exactly what they showed. While a cover is up the switcher and the window title name the cover, and no Dock entry claims to be current beneath it. Chips are not tabs: they never group or share width. The location chip can be dragged like a tab.

## Elevation & depth

| Step | Token | Used by |
| --- | --- | --- |
| Surface | `--sheet-shadow` (`--surface-shadow`) | The work sheet on the desk |
| Lift 1 | `--lift-1` (`--shadow-soft`) | Current tab, segmented thumb, current Dock item, primary button, raised canvas tools |
| Lift 2 | `--lift-2` (`--shadow-raised`) | The composer, inner sheets, hovered cards |
| Lift 3 | `--lift-3` (`--shadow`) | Menus, popovers, dialogs, edge sheets, toasts, a dragged node or tab |

Light shadows are diffuse and low-contrast (≤ 20% at the far layer); Dark shadows are deeper with a 1px 5–6% white ring standing in for the edge. Every modal and attached editor dims with one `--scrim` (Light `rgba(21,23,29,.16)`, Dark `rgba(0,0,0,.5)`) and no blur. Dialogs, menus, popovers, edge sheets and every filter panel are borderless in both themes — the lift is the boundary (Dark's `--shadow` carries the light ring). Never nest a card inside a card; the sheet is already the surface. Directory rows are flat; a selected row takes the `--nav-active` fill without a leading bar. Goal work and records stay flat and continuous with their pane.

## Shapes

`--r-tag` 6px (status tags, file-kind chips) · `--r-control` 8px (buttons, fields, choices, segmented tracks) · `--r-row` 10px (directory and stage rows, menu items) · `--r-card` 12px (cards, canvas nodes, board cards, grouped settings) · `--r-sheet` 14px (work sheets, inner sheets, the onboarding window uses its own 18px) · `--r-composer` 15px · `--r-dialog` 16px (dialogs, edge sheets on their open side). Dock buttons are 11px tiles; avatars and the project monogram are circles.

Status presentation follows context and the shared `mw-status` mark: directory and stage-list status is a compact Lucide glyph plus text in the family colour, with no enclosing border; canvas and board status use small dots with text. Elsewhere a status tag is a borderless soft wash at 6px corners, never an outlined or stadium pill. Preserve domain status names.

## Iconography

One curated Lucide library on a 24 grid, line only, grouped as 栏 / 动作 / 对象 / 状态 on the board. Four sizes: **12** (beside captions and counts), **14** (inline, menus, small buttons), **16** (buttons, row leads, tabs) and **20** (Dock, residents, the empty-state mark), as `--icon-xs` … `--icon-lg`. Stroke is 2 at 16px and below and 1.6 at 20px. A glyph and its label share a centre line with 6–8px between them. Chrome glyphs are `--ink-soft`, current glyphs `--ink`. Do not introduce a second icon family, filled glyphs or emoji.

- **Plugins:** one glyph each, from `PLUGIN_ICON` (see Plugin identity).
- **States:** `STATUS_ICON` fixes one glyph per state everywhere — 待办 Circle, 进行中 CirclePlay, 等待 CircleEllipsis, 需要你 CircleUserRound, 受阻 Ban, 完成 CheckCircle2, 取消 CircleX. The colour comes only from the state's tone.
- **Empty states:** one picture — two sheets of abstract paper lying across each other with the plugin's 20px glyph on the front sheet (`mw-empty__mark`). No plugin draws its own illustration.

The component board's 图标清单 shows all of these.

## Motion

| Token | Value | For |
| --- | --- | --- |
| `--dur-press` | 130ms | Press give on buttons, choices, Dock items (scale .97 → spring back) |
| `--dur-hover` | 130ms | Tone steps on rows and buttons |
| `--dur-move` | 250ms | State changes: segmented thumb travel, switch knob, disclosure, selection |
| `--dur-arrive` | 420ms | Arrivals: stage content rises 7px from 40% opacity; dialogs rise from .975 |
| `--dur-moment` | 640ms | The two moments below |

These four durations and two curves are the only ones in the product; older curve names (`--ease-swift`, `--ease-out`, `--ease-standard`, `--ease-settle`) alias them. Motion animates `transform` and `opacity` only, so nothing reflows while it plays, and it never blocks input (exits use `transition-behavior: allow-discrete`). It answers a real state change only: a list cascades (at most 12 rows) the first time it appears, never on a refresh, a re-render or switching back; a disclosure rises only when the person just opened it. Nothing loops except a loading indicator. The component board's 动效标本 has a clickable specimen of each of the twelve moments: press, hover, menu, dialog in and out, edge sheet, tab switch, segmented thumb, first list arrival, row expand, page or plugin switch, toast and completion.

Curves: `--ease-quint` `cubic-bezier(.22,1,.36,1)` for arrivals and moves; `--ease-spring` `cubic-bezier(.2,1.35,.4,1)` for a press's return, a check landing and the segmented thumb settling. Menus grow from their trigger (bar menus rise from the bar), edge sheets slide from their edge, dialogs rise and scale in, the scrim only fades. A control that opens a popover never scales, so its menu cannot shift. Nothing rises, tilts or spins on hover. Home's event rows cascade only on first arrival or a day change, never on a background refresh. Toasts are a graphite capsule with a success or failure mark above the bar; failure nudges once. Checks draw themselves; a pressed switch knob stretches before it lands.

**Moments.** Only two things get one. When the open Goal turns 已完成, its mark pops and a ring with a few sparks leaves it (opening an already-completed Goal never does). When a new Goal, a newly pulled message or a new Inbox entry first appears, its row carries one `--accent-soft` wash that fades (at most three per update). Opening a project settles the bar and the sheet in once per page. Plugins may call `molisCraft.celebrate(element)` and `molisCraft.land(element)`; both are presentation only.

Under `prefers-reduced-motion`, and under automation (`navigator.webdriver`), nothing in the final layer or onboarding moves: transitions take 0s, so a new size or position is there the moment the state changes, and focus still moves.

## Focus and accessibility

Keyboard focus is `--focus-stroke`: a 2px copper outline at a 1px offset (`--focus-stroke-inset`), on every button, tab, row, summary and link. Fields — `mw-input`, `mw-textarea` and the `mw-select` trigger — answer focus with a full copper border (3:1 or better on its surface) and a 3px copper halo at 16% (`FIELD_FOCUS`) instead of the stroke, and an input group turns from wash to white. A control never shows both. Writing surfaces marked `data-plain-field` answer with a copper underline instead of a box. Focus never relies on colour change alone and is never removed.

Every interactive target is at least 32px on desktop (28px compact) and 44px on phones and coarse pointers. Text on paper meets 4.5:1 down to `--faint`. The directory, tab strip and plugin switcher have full keyboard paths (Arrow, Home, End); dialogs trap focus, close on Escape and return focus to their opener. Status uses text or a glyph besides colour.

Do not ship operating-system chrome as the product UI. A closed select may look like `mw-select`; opening it reveals `mw-menu`. Colour, date and time picking, range and destructive confirmations use `mw-*` (calendar, slider, alert dialog). A native `<dialog>` may keep Escape and focus trapping; its skin is still `mw-*`. File picking may keep a hidden `input[type=file]` behind `mw-btn`. Known leftovers are listed in [ui-craft-floor](specs/ui-craft-floor/spec.md) and must not be copied.

## Components

### Buttons

- **Primary** (`mw-btn--primary`): graphite fill, `--action-ink`, 500 weight, 8px corners, 32px, `--lift-1`; hover `--action-hover`. One per decision.
- **Secondary** (`mw-btn--secondary`): borderless `--control-fill` wash, ink text; hover one step deeper.
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

One segmented control serves view switches, settings choices and the locale switch: a borderless `--control-fill` track, 8px corners, 3px padding, and a paper thumb with `--lift-1` on the current choice at 500 weight. The thumb travels between slots over 250ms on the spring curve, taking each slot's width; without script it simply appears on the current slot.

### Directory rows

`mw-dir-row` owns row chrome: 32px single-line (40px two-line), 10px corners, 8px inline padding, `--nav-hover` on hover, `--nav-active` with an `--ink` title when selected, no leading bar. Titles are 13px / 500 (the item-title role) in `--ink-soft`; captions and counts 12px / 400 `--faint`. Group headings are 11px / 500 `--faint`, with more space above than below. Collection folds share one grammar: caret, mark, title, count. Status marks are 12px Lucide plus the domain label in the family colour and must not outrank the title.

### Menus, popovers and tooltips

`mw-menu` and popovers are paper (`--popover` in Dark) with `--lift-3`, no border, 12px corners, 8px padding and 34px items (8px corners, 16px `--ink-soft` glyphs, `--nav-hover` hover and keyboard focus, `--nav-active` current). They grow from their trigger over 250ms. Floating menus keep their CSS size cap and only shrink to fit. Tooltips are graphite with `--action-ink` text and 6px corners.

### Dialogs and sheets

Creating or picking an item opens a centred modal — New Goal, Feed task configuration, Session add, the Frame picker — at `min(560px, 100vw - 48px)` wide, as tall as its content up to `min(100dvh - 96px, 720px)`, with a fixed header and action footer and one scrolling body between them. Dialogs are paper, borderless, 16px corners, `--lift-3`, over the shared scrim; at 760px and below they inset 12px. ⌘/Ctrl+Enter submits the open modal. Editing an existing Session's relations and the Handoff editor stay attached to the right edge as sheets (16px corners on the open side). Native focus trapping, Escape, cancellation and focus return remain. A dialog taller than the viewport keeps its footer sticky. A menu opened inside a dialog may overflow the dialog rather than be clipped.

### Toasts, alerts and empty states

Toasts are a graphite capsule above the bottom bar with a success or failure glyph. `mw-alert` is a soft status wash with a glyph, a title and a retry or next action. `mw-empty` is a centred block — the paper mark, a 15px / 600 title, 13px body up to 34em — offering only a real available action. Directory empty states are the same block left-aligned inside the column.

**Loading.** One rule: content whose shape is known (a list, cards) shows a static `mw-skeleton` placeholder; anything else shows `.mw-loading`, a quiet line with a small spinner that appears only once the wait passes 250ms, so a fast load never flashes. Skeletons never shimmer; under reduced motion the spinner is still.

**Failure.** A list or section that cannot be read says so where the content would be — `mw-empty mw-empty--error`: the paper mark with a red glyph, what failed, the reason, and **重试**. A failure is never only a line in a panel the person cannot see, and never an empty list that looks like "nothing yet".

### Tables and cards

`mw-card` is paper with a `--line` hairline and 12px corners where a card is needed at all; `mw-table` uses hairline rows and 500-weight headers. Settings documents group rows into cards on the sheet; plugins do not wrap sections in cards by default.

## Onboarding

First use is one horizontal window on a softly lit desk (warm light top-left, cool light bottom-right; gradients live only here). The window is white, 18px corners, as tall as `clamp(560px, 100dvh - 150px, 760px)`, with a small window bar. Inside, the question and its options sit on the left, a **live mini preview** of what those choices make sits on the right, and the footer carries short-line progress (24px bars: done in copper-tint, current in copper) and the next step.

- **Steps.** First run: 语言 → 外观 → 来源 → 确认 → 整理 → 开始. A new project: 来源 → 确认 → 整理 → 开始. 语言 and 外观 are real preferences: language goes through `/locale`, theme and density through the shared preference handlers, and the mini workbench previews them live.
- **Choices** are `mw-choice`: graphite with a check when selected. Source rows are custom checkboxes with a graphite ring; the preview stacks the chosen sources as documents that slide in and out as you tick them.
- **Transitions** are directional: forward slides content in from the right with a short blur, back from the left, 420ms on `--ease-quint`. Title focus moves with each step. Enter continues when focus is not in a field.
- **The real flow is unchanged.** Back, skip (稍后再说), retry, resume after reload, source reselection, reading without a model, the review with editable name and summary, and saving the project all use the existing journey API and ids. Preferences are saved as they are chosen.
- **Returning users** are not sent through it again: the first-run intro runs only while the local intro flag is unset, a new project skips 语言 and 外观, and an app update uses the same window with a mini preview and one dismiss.
- **Narrow screens.** At ≤ 860px the window becomes one column with the preview first and a sticky footer; at ≤ 600px it fills the screen. Reduced motion removes the slides, blur and document motion.

## Component board

`/__ui/catalog` is built from the production renderers and styles. Sections: 色板 (desk, surface, soft, wash, line; graphite, copper, status), 字体 (role specimens at 600/500/400), 空间 · 层次 · 动效 (lifts, corners, motion table, the desk–sheet–bar diagram), buttons, choice, fields, segmented, checks and switches, menus and popovers, dialogs and sheets, directory rows, status, toasts and alerts, empty states, icons, **图标清单** (every plugin's glyph, the state glyphs, sizes and strokes, and the empty / loading / failed trio), **动效标本** (one clickable specimen per motion moment), and **compositions**: list + detail split, toolbar + filter menu, form with errors, a menu inside a dialog, long content with nested scroll, and narrow width with density. `/__ui/catalog/bar` renders the real bottom bar (Dock, switcher, composer, residents, project menu) with the workbench stylesheet. A shared control, state or motion that meets the bar belongs on the board.

## Components in the workbench

### Directory and project search

Destinations are plugin section headers: icon and label, with a disclosure control when the plugin has a list. Flat tone and stronger text mark the current plugin. Lists nest under their plugin and may stay expanded together. Plugin lists that occupy the second column share the `mw-dir` panel and `mw-dir-row` grammar: Session rows are single-line (32px, 28px compact), with a title and compact status mark, nested under runtime collection folds that use the same caret, mark, title and count as Goals’ 当前; Inbox and Artifact lists use 40px two-line rows (36px compact) with a title, one secondary fact and a trailing status mark; Feed’s 全部 is the same collection fold as Goals’ 当前 — caret, mark, title and count — with source tasks nested inside as single-line rows that keep a trailing health mark; last-fetch lives in task configuration; Feed and Session add sit above those folds. Settings categories use the same single-line row with a neutral icon. Row type, chrome and selection follow **Directory rows** above; row chrome lives only on `mw-dir-row` and spans any trailing action. Selected captions use `--muted`. The tools row is the plugin name plus icon actions. Leftover plugin row classes must not carry a second height, selection tint or padding. Create actions sit as a full-width add control at row height; Feed and Sessions place it above the collection folds. Empty states describe the missing content and offer only a real available action. The Goals tree keeps its own hierarchy widget and does not use this row. The Goals directory keeps a full-width New Goal control with the status filter on its right; the live tree, archive and trash live as collection folds in the Goals stage list, with target / archive / trash marks.

Search (⌘K, from the composer or the directory) opens a palette above the bottom bar grouped by plugin and navigates to the selected object. It remains available with the directory collapsed or on a phone. The project button's menu keeps project switching, 管理项目 and 项目设置 distinct; 设置 there opens global device settings. Plugin market remains project-local activation, with search, installed icons, text filters and catalog rows; enabling Feed also enables Inbox.

### Plugin stage lists

When a plugin fills the stage (no item open), its list reads like the prototype's pages: one centred column up to 960px, the page heading drawn from the surface's own label (a CSS variable set once on the shell, so a plugin that re-renders its list keeps it; it is drawn text only, because the tab and the surface label already name the page), and the page's actions at the right of the heading. The first create action is the page's one graphite button; secondary actions are ghost buttons with a leading Lucide mark. Rows are at least 44px with a hover wash and 8px corners; folds read as quiet section labels 18px apart. Sessions share the frame with their own fixed header. When an item is open, the list becomes the `--surface-soft` side column and its create action returns to the soft wash. Editors that are a single form sit in a centred column inside a full-width scroller (Forms 52rem, Dataset 72rem); a note (灵光) is a writing page — a 24px document title and body text at 15px / 1.85 in a 46rem column, fields that show a wash on hover and the shared focus ring. Search sits inside its field (leading mark, ≤420px) and filters follow on the same row as `mw-select` at their natural width. Stage empty states use `mw-empty` (see above) at up to 30em so Chinese copy does not break mid-phrase. The selected row, including a Goal row, is the neutral `--nav-active` fill; plugins add no identity tint. Every detail view returns with the same rotated chevron in `plugin-stage-back`; a kicker that shares the back button's row starts after it, like a breadcrumb. Stage and dialog checkboxes are `mw-check`, date fields open the calendar from a calendar mark, and a dialog taller than the viewport keeps its footer (the submit action) sticky at the bottom. List dates follow the interface language (9月23日 / Sep 23). Every disclosure (`details`) uses one grammar: the OS triangle is hidden and a 12px chevron rotates from right to down (`mw-disclosure`, or the owner's own caret); remove, move-up and move-down controls are icon-only ghost buttons with `x` / `chevron-up` / `chevron-down` marks and an accessible name, never typed glyphs (×, ↑, ↓). Floating menus keep their CSS size cap (the Pages slash menu is a 380px scroller placed below the caret) and only shrink further to fit the stage. The Dock and the plugin switcher list are each one Tab stop: the current entry is tabbable, and Arrow/Home/End move between entries.

### Workflow chains

A workflow is edited as the chain itself: plugins are stations (hairline cards marked by the plugin's glyph; `--station-tint` now resolves to neutral ink), and each gap holds a handoff pill — Function, AI or 手动 — plus a small `+`. Every edit (drop a plugin into a gap, pick one from the gap's popover, change a handoff, move or remove a station) saves at once; there is no separate save step. A handoff that cannot run yet (a Function with no rule, an AI with no instruction or no text model) is drawn dashed in amber with an alert mark, and a line under the chain names each one. It never looks connected. Plugins that cannot join yet are counted, never shown as disabled chips. An open run keeps the vertical chain in a 232px column on the left, with check / dot / ring marks for done / current / not reached. The main area embeds the station's own plugin view with this run's item, under one bar that says what the next handoff will do. On a phone the vertical chain becomes a horizontal strip above the plugin. Both views are patched in place rather than redrawn. Continuing, opening the manual form or saving never reloads the embedded plugin or drops scroll and focus. Motion only says what changed. A station arrives with a settle, slides to its new place, or leaves quickly; the gap a drag would land in makes room with a copper insertion mark. A handoff in progress runs down its line; once handed over, the check lands, the line fills and the next plugin fades in over the last one. Removing a station, or a move that resets configured handoffs, offers 撤销 in the notice; ⌘Z does the same in the editor.

### Grouped work tabs

Tabs use independent rounded surfaces and neutral plugin Lucide icons; the current tab is paper with `--lift-1`. Ordinary tabs hug their title up to 172px and share remaining strip width equally when they overflow; selection changes tone, not geometry. Preview tabs keep the same width with italic titles. User groups use a color chip and optional name; collapsing hides every tab in that group, including the current one. Pinned tabs stay at the left of their pane, show only an icon (36px desktop, 44px touch) and cannot join a group. Right-click or Shift+F10 exposes pin/unpin, close and group actions. The plus menu opens enabled plugin pages as committed tabs and offers the same current-tab actions for touch. Pin state survives reload, moving and split copies; an existing destination tab keeps its own preference when merging duplicates. Ordinary tabs reserve close-button space; inactive fine-pointer closes reveal on hover or focus, while touch closes remain visible. Menus use the shared 130ms entrance, disabled with reduced motion.

Native tab triggers support Arrow keys, Home and End to move and select; Delete closes a closable tab. Rerendering restores trigger focus. Collapsing a group hides its tabs until the chip is opened again. The focused pane synchronizes the active Goal title and directory selection without rebinding terminals. Opening or restoring a Goal tab loads that Goal's actual body, not only its title. Current tabs scroll into view after selection and viewport changes. Dragging reorders or moves tabs across panes and into or out of groups; Alt/Option copies. While the pointer is on the strip, other tabs slide to the order `moveTab` will commit and a same-width slot marks the landing place; dropping at a pane edge still splits with the dragged tab. The split control opens a layout menu with left, right, above and below options. Separators support pointer/keyboard resizing and double-click equalization. Closing a pane closes its tabs and expands the remaining layout; closing the final workspace tab restores home.

Same-plugin panes contain independently usable content. Loaded content windows stay mounted when tabs move or panes merge, preserving their unsubmitted input. Navigation inside an embedded content window delegates new tab selection to its parent, allowing A → B → A to return to the original content. Same-pane focus changes do not move or reload the work surface. Splitting preserves the current Frame/work view; an explicit “打开 Frame” action selects Frame even when that Goal’s existing tab last showed work. This live-document continuity is separate from persisted layout restoration; it does not promise that unsubmitted forms survive a page refresh.

### Goal canvas, board and work area

The dependency canvas uses real Goal/active relation data. Arrows run from provider to consumer; parent membership is separate. Completed nodes remain visible but quieter. Clicking a canvas node, a kanban card, or a stage-list row opens that Goal's Frame and selects it; the node's open control still expands the existing work surface. Panning, zooming, node positions and collapse/restore remain local view state.

A Goal opens as a document first (概览): a centred 880px column with the Goal's mark, its title at 28px / 600, the outcome, the current status callout, requirements and the timeline, whose events expand in place. 终端 is one switch away in the Goal header (a two-segment toggle, icon-only on phones). A Goal with a live terminal session opens in 终端; otherwise it opens in 概览, and when a terminal session appears for a Goal whose view was never chosen, the view follows it once. 打开工作区 on a Goal's frame is an explicit request for the work area and opens 终端. The choice is remembered per Goal. Forms and readers (a concern, a requirement, an old event) take the whole document area while open, with their footer in reach even in a 400px-tall window. In the narrow Goal list beside an open Goal, entries are two lines (title, then state) at 52px.

The Goals mother page switches between list, canvas and board. An empty canvas keeps New Goal in the stage chrome and centers a two-line status on the dotted field: there are no Goals yet, and Goals and dependencies will appear here as nodes. It does not repeat the create control. The list is the same Goal tree as the former directory, stretched across the stage so Goal IDs, status, child progress and prerequisites stay visible. Board columns show counts derived from their actual items and a visible empty-column message. On a desktop pane 840px or wider the six columns share the available width so the board itself does not scroll horizontally. When the Goal board pane is narrower than 840px, the same six groups stack as a collapsible list on the pane’s paper surface: 32px rows, a real chevron, status discs shared by group and row, one-line titles, and a single vertical scroll. Collapsed group headers hug their content. Empty groups remain as headers, start collapsed, and hide the empty-column sentence. Opening a card uses the same Goal content. Vertical wheel input over an overflowing card column scrolls that column, including at its ends; horizontal gestures and Shift-wheel move the board horizontally only while six columns are showing and the board actually overflows. In the stacked list, vertical wheel reads the list. Vertical wheel over headers, gaps or non-overflowing columns can move the board horizontally when columns are showing. Zoom gestures and the open Goal work area retain their own behavior. The expanded workspace keeps full-height Runtime and optional information/timeline. When terminal is the only available work mode, the duplicate Conversation/Terminal mode bar is omitted.

Goal information reads live `readState` and prioritizes actual unmet requirements, pending decisions and blockers with their relevant entry points. An existing dependency alone is not presented as a completion blocker. Historical bodies start collapsed on ordinary entry; explicit selection, deep links and restored reading can expand the original event inline without replacing current facts. Relation body headings remain secondary to the main document heading. Requirements, pending decisions, concerns and older history retain their real data and retry behavior. 目标与要求 includes purpose, scope, decisions, material references and the relation/risk/impact/rules deck. 完成要求 shows current requirements, read-only historical criteria and exact Artifact versions. These views never calculate completion themselves.

### Frame content picker

Empty and populated Frames offer “添加已有内容”. Its viewport-contained dialog searches and filters the current project’s loaded Feed, Inbox, Session and Artifact references by source. Existing owner loaders read the selected content. Already-added items are disabled and labeled; empty projects and unmatched searches have distinct explanations. Adding stores only project/Goal-local canvas references and positions, retained after reload; it does not create a domain object. Search receives focus, Cancel returns to the opener, and adding focuses the new block. Cross-pane dragging remains available.

### Runtime and domain ownership

Work owns Session/PTY identity and terminals. Opening, selecting or closing a Goal never starts, sends to, destroys or rebinds execution. The empty terminal surface offers a local Add terminal action that opens the existing chooser, focuses its first available choice and returns focus on Cancel. Users explicitly add/start a terminal. Event-owned parent Goals can record integration in their own Runtime; the existing untransferred compound-parent guard remains. Only the terminal canvas uses its independent Follow interface/Light/Dark palette.

Session creation and association share a readable dialog heading, with the mode switch separate from Close; on mobile, the mode switch sits below the title. The first-use creation action uses the shared primary style and an aligned plus icon. Artifact reading distinguishes no project results, available results with no selected version, and an unavailable exact version; each state describes the actual next step.

Goals retains event writing and domain decisions; Work/Sessions retains execution identity, histories and working-directory relationships; Artifacts retains owner-rendered exact versions and downloads. Inbox owns attention with an entry reason, related object and next action. Feed owns source-message facts and source tasks. Shelf is a personal DropAgent-shaped ingest surface: its directory, preview, command bar, confirm strip and drop veil keep DropAgent's structure but use the shared Soft Workbench tokens through `--da-*` — a `--surface-soft` directory, graphite primary, copper focus, links and on-states. File-kind labels sit beside the name as small filled chips in the five `--mark-*` tones (PDF clay, Markdown/text slate, image plum, link/site blue, folder ochre). Returning from a plugin detail uses the same top-left chevron inset as the Goal work toolbar; the detail itself is not a centred card. The bar, titlebar and other plugins are the same Soft Workbench. Source migration, credential handling and promotion semantics remain in their existing owners; shared chrome does not change these contracts.

### Home, Feed and settings

Home follows the prototype's composition inside one centred column (up to 1280px). The heading is 今天的工作 (or the chosen date) at 30px / 600 with one quiet line under it — the greeting by the local clock (早上好 · 中午好 · 下午好 · 晚上好 · 夜深了), the date, the day's count and whether something needs you — and the month at the right. Below it, the day column holds a horizontal seven-day strip (the chosen day is the graphite choice; days with events carry a few quiet dots; a calendar button returns to today), then **正在推进**: a soft card with warm light for the project's active Goal while it is moving (otherwise the first moving Goal, otherwise the first waiting on a decision), its outcome, one continue action and its real child progress; the card is absent when no Goal is in play. Then the day's events as a quiet list — time, source glyph tile, title, one line of context — where a row opens in place to show the event text, its facts, the open action, offers and 说一句; nothing opens by itself. A now-line marks the current time on today. An empty day keeps real places to start (推进一个目标, 写一份文档, 记下一点灵感, 浏览更多工具); a day other than today says it has no events and also offers 回到今天. At the right, a 252px margin holds 随手记 — a scratch note for this project kept only in this browser, and labelled so — then 回到手边的内容: the plugins kept in the Dock, the person's own shortcuts and 添加快捷方式. Below about 1020px of home width the margin moves under the day column; on a phone everything stacks and the strip scrolls sideways. There is no quotation carousel and no Home “打开 Goals” control.

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

### Don't

- **Don't** add a global left sidebar, a second persistent navigation, or a plugin identity colour; plugins are found in the Dock and the switcher.
- **Don't** fight an earlier rule with `!important`, a per-plugin override or a restated token value; fix the source.
- **Don't** force a font weight globally, synthesise bold, or use weights other than 400 / 500 / 600.
- **Don't** outline a floating layer, draw a card inside the sheet by default, blur the scrim, or use gradients outside onboarding's ambient light.
- **Don't** fill a button with copper, draw focus in ink or blue, or remove a focus indicator.
- **Don't** celebrate anything but a real completion or a real arrival, and never on first render.
- **Don't** hide a complex feature, disable an entry, swallow an error or show placeholder data to make a page look calmer.
- **Don't** turn a disabled composer, Session demo, reserved module or browser screenshot into a claim of an integrated feature.
- **Don't** infer completion from child counts, activity or missing requirements, or treat UI selection as execution authority.
- **Don't** make status colour the only explanation, allow long paths to widen the viewport, or hide the current tab when resizing.
- **Don't** use prototype or review screenshots as product imagery, or claim browser review verifies the native package or every low-frequency form.

