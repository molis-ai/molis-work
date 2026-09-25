---
name: Molis Work Coss Workbench
description: A neutral, compact personal workbench with continuous work surfaces, edge-attached editors, grouped work tabs, and restrained state feedback.
colors:
  page: "#f3f4f5"
  paper: "#ffffff"
  rail: "#eceef0"
  nav-bg: "#f3f4f5"
  ink: "#222326"
  ink-soft: "#3c3f44"
  muted: "#6b6f76"
  faint: "#737882"
  line: "#e2e4e7"
  line-strong: "#d0d6e0"
  nav-hover: "ink 6%"
  nav-active: "ink 10%"
  nav-press: "ink 14%"
  nav-raised: "#ffffff"
  hairline: "ink 12%"
  accent: "#5e6ad2"
  accent-strong: "#4c56c4"
  accent-soft: "#eef0fb"
  green: "#2d7a5a"
  amber: "#8a5c18"
  red: "#b03d45"
  action: "#222326"
  action-ink: "#ffffff"
  scrim: "rgba(18, 18, 24, .32)"
  dark-page: "#0f1011"
  dark-paper: "#161718"
  dark-rail: "#0f1011"
  dark-nav-bg: "#0f1011"
  dark-ink: "#f7f8f8"
  dark-ink-soft: "#d0d1d3"
  dark-muted: "#8a8f98"
  dark-faint: "#737880"
  dark-line: "#23252a"
  dark-line-strong: "#2e3036"
  dark-nav-hover: "ink 8%"
  dark-nav-active: "ink 12%"
  dark-nav-press: "ink 16%"
  dark-nav-raised: "#1c1c1f"
  dark-hairline: "ink 14%"
  dark-edge-highlight: "rgba(255, 255, 255, .07)"
  dark-accent: "#8b93f1"
  dark-accent-strong: "#a8aef5"
  dark-accent-soft: "#262848"
  dark-green: "#6bc49a"
  dark-amber: "#d4a15c"
  dark-red: "#ee858c"
  dark-action: "#f7f8f8"
  dark-action-ink: "#0f1011"
  dark-scrim: "rgba(0, 0, 0, .58)"
  tone-idle: "#5c6570"
  tone-progress: "#5e6ad2"
  tone-attention: "#8a5c18"
  tone-hold: "#3d6f78"
  tone-blocked: "#b03d45"
  tone-done: "#2d7a5a"
  tone-quiet: "#6d6d76"
  dark-tone-idle: "#b3b8c2"
  dark-tone-progress: "#8b93f1"
  dark-tone-attention: "#d4a15c"
  dark-tone-hold: "#86c0c7"
  dark-tone-blocked: "#ee858c"
  dark-tone-done: "#6bc49a"
  dark-tone-quiet: "#94949c"
typography:
  body:
    fontFamily: "Inter Variable, Inter, Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontFeatureSettings: "cv01, ss03, calt"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-.011em"
  directory-title:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  directory-caption:
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "14px"
  tab:
    fontSize: "12px"
    fontWeight: 400
  event-heading:
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-.01em"
  settings-heading:
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-.03em"
rounded:
  item: "8px"
  control: "10px"
  surface: "12px"
  home-composer: "23px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  content: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "32px"
  tab-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "10px 10px 0 0"
    height: "36px"
    maxWidth: "172px"
  directory-selected:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.ink}"
    rounded: "{rounded.item}"
    leadingAccentBar: "2px {colors.accent}"
  segmented-control:
    trackBackgroundColor: "control-fill (ink 4.5%)"
    trackBorder: "1px {colors.hairline}"
    rounded: "9px"
    padding: "3px"
    currentBackgroundColor: "{colors.nav-raised}"
    currentTextColor: "{colors.ink}"
  goal-workspace:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "0"
  goal-canvas-node:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "18px 16px 14px"
    width: "258px"
    height: "190px"
---

# Design System: Molis Work Coss Workbench

## Overview

**Creative North Star: "Operate"**

Molis Work is a personal workbench for finding current work, reading its facts, and taking the next action. Its current visual language follows the user's Linear × coss.ui direction: continuous paper surfaces, thin boundaries, compact controls, distinct navigation levels, and short feedback. The quiet project home and denser Goal workspace belong to the same system.

This is the current built world as of 2026-09-16. Shared controls, palette and icons are the `mw-*` HTML Slot primitives: authors and agents use `/__ui/catalog` and [`packages/design-system/README.md`](packages/design-system/README.md). Shared-control work must match that board. Visible OS chrome — system selects, color wells, date/time popups, `alert`/`confirm` — is not a product control. Motion, icon colour and arrival are part of the slice, not a later pass. Shared controls, states or motion that meet the visual bar belong on Catalog. This document records visual intent, not helper APIs. The development contract is in [CLI 与开发](docs/cli-and-development.md#前端与控件板) and [ui-craft-floor](specs/ui-craft-floor/spec.md). [Coss workbench redesign](specs/coss-workbench-redesign/spec.md) establishes the shared foundation; [Workbench panes, Feed and global settings redesign](specs/workbench-pane-feed-redesign/spec.md) owns the current tabs, nested panes, Feed and global preferences. The independent project settings world follows [Project settings redesign](specs/project-settings-redesign/spec.md). [PRODUCT.md](PRODUCT.md) remains the authority for product behavior, data relationships, and module ownership; this document records their current visual expression. The latest [whole-product interaction redesign](specs/product-interaction-redesign/spec.md) and its [surface inventory](specs/product-interaction-redesign/inventory.md) own the current form actions, Feed reader, Session entry, settings return context and Artifact empty states. Its v11 correction makes Goal work and records continuous with the pane and attaches temporary editors to the workspace edge. It retains v6 attention continuity and v7–v10 scrolling, reading and editing behavior. The [interaction texture upgrade](specs/interaction-texture-upgrade/spec.md) owns the current colour ramp, elevation, motion and icon calibration; the [focus ring redesign](specs/archive/focus-ring-redesign/spec.md) owns keyboard and field focus. Both change expression only and leave structure, density and domain behavior to the authorities above. Detailed behavior, source ownership, motion and verification boundaries are in the [workbench surface record](.impeccable/surfaces/immersive-workbench.md).

**Key Characteristics:**

- A 48px plugin icon rail, a current-plugin directory, and a 32px work bar with equal-width Chrome-style tabs and stable plugin group colors.
- Neutral Light/Dark tokens shared by the workbench, settings and project index.
- Independent global and project settings with category navigation and one content scroll boundary.
- Compact navigation and continuous reading/work surfaces; creating or picking an item opens a centred modal sized to its content, while editing an existing Session's relations keeps the workspace-edge sheet.
- Real state and explicit actions; unavailable capabilities remain visibly unavailable.

## Colors

The palette is cool zinc with a Linear indigo accent. `packages/design-system/src/palette.ts` owns the hue, plugin, status and content tables; `packages/design-system/src/styles/interaction-texture.ts` writes the final CSS variables. Neutrals stay distinct by layer instead of a muddy indigo-grey wash. Chromatic color is a 14-hue set (gray, brown, orange, yellow, green, mint, cyan, blue, indigo, purple, pink, red, steel, slate). Each hue has text (13px on paper ≥4.5:1), fill (6–8px marks, Linear-bright) and soft (≈11% wash). `--blue` / `--focus` alias indigo `#5e6ad2` for links, selection and in-progress; keyboard rings use `--ink` via `--focus-stroke`. `--green` / `--amber` / `--red` alias green / orange / red. Plugin tokens (`--plugin-goals` …) alias the ownership hues. The reading surface is a second family, not a second skin: `--content-*` is DropAgent warm paper (side `#f5f5f4`, paper `#fcfcfb`, ink `#292a2e`); `--content-accent` aliases `--hue-slate` (`#66709e`). Five `--mark-*` type colors (steel-blue, mist-cyan, ochre, plum, clay; ink + chip fill, no green) mark files and actions on that surface. Shelf `--da-*` aliases the content family so chrome stays Linear zinc. The Catalog 色板 specimen is the readable table; the frontmatter lists Light surface and type values.

### Primary

Action is near-black in Light and near-white in Dark. It identifies primary actions across chrome and Goal event forms. Violet (`--blue`, `--blue-dark`, `--blue-soft`, `--focus`) identifies links, text selection and work-in-progress — not keyboard rings, not field borders. It is not a second filled-button system.

### Neutral

The neutral ramp is Linear product zinc so field, rail and paper stay distinct; indigo is reserved for links, selection wash and in-progress, never for a focus box. Page/canvas is the outer work field; paper/panel is the reading surface; navigation uses `--nav-bg`. Dark matches Linear’s panel: field and navigation `#0f1011`, paper `#161718`, raised `#1c1c1f`. Ink `#f7f8f8`, muted `#8a8f98`, and faint (WCAG floor on paper) establish reading hierarchy. Body copy uses ink or soft ink, not muted. Do not stack extra opacity on faint or muted type. Thin lines separate meaningful regions.

`--nav-hover`, `--nav-active` and `--nav-press` are ink at low alpha, so one hover/selected/press recipe composites correctly over any surface in either theme. A selected directory row is a quiet ownership wash (plugin tint ≈10%) and `--ink` title, matching Goal; it does not add a second leading bar. Selected work tabs join the paper surface with a hairline and, in Dark, a top edge highlight. Plugin group labels, work-tab icons, bottom rules, plugin rail icons (idle and current) and that plugin’s directory glyphs use stable, theme-aware colors: blue for Goals, brown for Feed, violet for Sessions, mint for Inbox, yellow for Schedule, rose for Artifacts, slate for Shelf, steel for settings. These identify ownership, not status; labels remain visible. The current rail item adds a tinted wash so selection stays a chip, not the only place color appears. That wash travels between plugin icons on the same curve as the segmented control. `--plugin-tint` also binds to the current `[data-work-surface]` and `.tab-item`, so empty-state marks, directory and stage selected rows (≈10% wash, including `feed-stage-entry`) and the stage create glyph share ownership without painting the paper.

Green, amber and red remain the done / attention / blocked hues. Status families add quiet companions so pending states are not all indigo: idle slate for “can start”, progress indigo for work in motion, attention clay for “your turn”, hold fog-teal for waiting on others or children, and quiet muted for archive/trash.

## Typography

Latin UI uses self-hosted Inter Variable with Linear’s `cv01` and `ss03` features. Chinese uses self-hosted Noto Sans SC Regular, a geometric sans close to Inter; PingFang SC / Microsoft YaHei remain fallbacks. Default weight is 400 everywhere: hierarchy is size and `--ink` / `--ink-soft` / `--muted` / `--faint`, not bold. Selected directory rows and tabs change fill and color, not weight. Protocol IDs stay secondary and monospace is reserved for commands, identifiers and measured values. Interface language can change between Chinese and English without rewriting user titles or record bodies.

- **Directory:** 13px / 400 titles, 12px / 400 captions. Long titles truncate inside a shrinking text column; status and actions retain their own space. Stage lists that carry a type chip keep five aligned columns across rows (title, type, fact, caption, status); type/fact/status tracks are fixed rem so Choice and 草稿 do not drift with title length.
- **Work tabs:** 12px / 400. Long titles retain a tooltip and accessible name.
- **Goal reading:** compact timeline row titles use 11px / 400; expanded event headings use 16px / 400 / 1.5; event copy uses 12px / 1.8 and wraps completely.
- **Feed:** source/time labels use 11px, closed-row titles 13px / 400 on one line with the Goal list grammar, and expanded body 13px / 1.6, bounded to 76ch. An open row keeps that single title and reads inline below.
- **Temporary editors:** 15px / 400 headings, 13px labels, 14px fields and 12px help; fields use 16px at 760px and below. Session add and relations share this hierarchy.
- **Project settings:** headings 28px / 400 / 1.2, remaining 20px at 760px and below; section headings use 13px / 400. Setting labels use 14px / 400, supporting copy uses 13px, and mobile form text uses 16px. Path and storage facts wrap without widening the page.
- **Home:** date, calendar numbers, navigation and the disabled composer use Inter. The date stream and event rows read at 40rem; source chips follow the title. Calendar “today” uses Action fill at a 5px status-tag corner, not a stadium pill.

Status copy stays direct and specific. Timeline events use human-readable Chinese labels rather than raw event names; original IDs and sources remain available as secondary facts.

## Layout

Density v15 uses Linear tool spacing as the desktop default: 28px shared controls, 28px Goal/Session/Feed rows, 36px two-line directory rows. Settings documents leave that compression: 28px titles, 10px row padding and grouped white 12px cards on a `--page` canvas. Field groups keep 12px gaps. Desktop Session editors pair Runtime and Goal selectors in DOM order; at 760px and below they stack. Optional Goal sections retain 44px summary targets on touch/narrow screens. Settings content stays a centered 760px column in the remaining pane. Goal form, Frame, Inbox and Artifact titles are 14–16px. Body copy, focus, fixed actions and component scrolling retain their own reading/accessibility rules.

The desktop shell is a full-width titlebar over three columns: a 48px plugin icon rail, a resizable plugin directory, and one flexible work stage. The shell stays within one viewport; tabs and primary toolbars remain in place while lists, readers, board columns and long forms scroll inside their own regions. Long content remains reachable at narrow widths and in split panes without shrinking text or introducing document scrolling. Default directory width is 240px, or 220px at viewport widths up to 1050px. A saved project-local width takes precedence; double-clicking the separator restores the applicable default. The directory has a thin right edge. Project switching, search and project settings sit in the titlebar, occupying the width of the plugin rail and directory; the rail, directory and stage share one top edge below that row. There is no notification placeholder.

The plugin rail lists Home, enabled plugins and the plugin market, with the account avatar at the bottom. The second column shows only the current plugin’s list. Home and the plugin market leave that column closed. Plugin title and actions stay on one row above the list. The directory list is one scroll region without a visible scrollbar. Users may still collapse the directory; the rail remains. Collapse and the current plugin persist per project.

Work tabs occupy a 32px bar. Tabs are a flat strip by default. Opening a plugin or item always inserts a new durable tab; existing tabs keep their identity and are not replaced. Users may group tabs themselves with a named color chip and a short underline; plugins do not auto-group. Unpinned tabs hug their title up to 172px and 26px high; when they no longer fit the titlebar they share the remaining width equally, down to 72px on desktop and 96px on narrow or touch. Each pane owns its strip. A binary layout tree supports nested horizontal and vertical splits, including T-shaped arrangements. Split panes leave an 8px canvas gap with a 1px divider; a centered grip handle appears on hover, focus or drag instead of highlighting the whole seam. Tabs, focus and layout persist per project on this device. The same item may appear more than once in a pane and in multiple panes; this state never becomes Goal truth. At 760px and below only the focused pane is shown, with window selectors to switch focus while preserving the layout. At narrow widths or with a coarse pointer, tabs, group labels, Close and Split use 44px interactive heights inside a 44px bar; desktop fine-pointer tabs retain 26px height.

An opened Goal fills its pane beneath the tabs: zero inset, square edges, no shadow and no canvas backdrop. A compact toolbar with a 32px minimum height keeps Back on the left. Runtime owns the flexible main column; a closable 300px rail holds Goal information and the inline timeline. Below 840px Goal-workspace width, the rail overlays the work area at up to 330px. Goal reading and recording use the continuous paper surface, with fixed heading/actions and internally scrolling content; covered controls and return focus retain their existing behavior. Compact canvas nodes can move; opened workspaces cannot.

At viewport widths of 600px and below, the plugin rail and current directory become one drawer below the titlebar, with a scrim, inert background and focus loop; selection closes it. Titlebar tabs and search remain. Native traffic lights stay in the titlebar and are not covered by the drawer. The opened Goal remains flush and square. Tabs remain available and keep the current item visible when space changes. The work area stays full height with details available on demand. There is no revived 70/30 adjustable Goal split or stacked information → Runtime → timeline layout.

Project settings is a standalone Coss/Codex-style preferences page: a 36px header, 224px category rail with icons and centered content up to 760px. The rail contains return, project identity and two categories: 常规 and 项目说明. Work planning and work rules live in the Goals toolbar. It has no workbench directory, plugin bar or workspace tabs. The content region owns the single main scroll boundary; inner documents flow as grouped cards with left copy and right controls. Desktop content uses 40px top padding and 28–56px horizontal padding. At 760px and below, return and four equal category links sit above the content, project identity leaves the rail, forms and storage facts stack, and content padding becomes 24px 20px 48px. Project planning detail/edit pages retain this shell.

Feed sources live in the left directory, one task per source. The stage shows the selected source's message list and reading detail. Closed Feed rows are source plus title; the summary appears only after expansion. Project home remains a centered date/calendar composition with circular shortcuts above its disabled composer. Global preferences uses the independent settings shell for appearance, execution tools and diagnostics. The planning library, including its detail and edit pages, is the Goals plugin settings page: it uses that same shell and appears only when the current project has Goals enabled. The remaining pane keeps the same centered 760px document as project settings. The work bar has no theme shortcut.

Native window drag regions and actual fullscreen-aware safe insets remain platform-owned. Tabs, buttons and resizers must remain outside native system controls and must not become drag regions. Overlay traffic lights sit in the 32px titlebar (`trafficLightPosition.y = 10`); the titlebar element's box starts after that inset so close, minimize and zoom are not covered by the bar's stacking context or drag region. Project switching, search and project settings share that titlebar row, filling the plugin-rail-plus-directory width after the traffic-light inset. The plugin rail, directory and stage start together on the next row. Project index remains a full-page arrival surface with its own brand, search and device-settings entry.

## Elevation & Depth

Thin boundaries and tonal differences carry most structure. Directory rows are flat. Active work tabs use a paper surface, rounded upper corners and no shadow. Goal work and records remain flat and continuous with their pane. Temporary editors use a workspace edge and fine separator instead of a floating frame. Compact search and confirmation surfaces retain restrained depth.

- Shared surface shadow, Light: `0 1px 2px rgba(19, 21, 32, .05), 0 2px 5px rgba(19, 21, 32, .04)`.
- Shared surface shadow, Dark: `0 1px 2px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .3)`.
- Raised transient surfaces — project menu, directory filters, search, shortcuts, Runtime plan, trash, operation confirmation, migration and Feed import — use a `--hairline` boundary plus `--control-shadow`, and in Dark an `inset 0 1px 0` edge highlight so they read as glass rather than as a lighter rectangle.
- Every modal and attached editor dims with one `--scrim`: `rgba(19, 21, 32, .3)` in Light and `rgba(0, 0, 0, .55)` in Dark, with no blur. Dark no longer washes the app with a light ink veil.
- Goal workspace and attached editor panels themselves: `box-shadow: none`. The home composer has no shadow.

Three micro-interactions move because the movement carries information, and each is scoped to where exactly one thing is moving. The segmented chip travels between slots, and the plugin rail reuses that chip so switching plugins is a displacement, not a blink. The assistant island uses the same thumb when 灵光 is current or the composer is open (`aria-expanded`). Compact search keeps its keyboard selection on a travelling `--nav-active` pill that matches the selected row; the row itself stays unfilled so hover can stay a lighter tint on other hits and stop impersonating selection. A focal Goal in a running state — clarifying, executing, reviewing, revalidating or in progress, and only in the Goal toolbar, Frame heading, Runtime owner actions, reader header or Goal information popover — replaces its still glyph with an indeterminate arc; directories, canvas nodes and board cards keep the static mark rather than filling a list with spinners. All three fall back to today's static presentation without the client script, and reduced motion removes the travel and restores the still glyph. Plugin list rows add a fourth, quieter motion: hover fill takes 180ms on `--ease-out`, and a squeezed title ellipsizes in its title slot so trailing status stays fully visible. Shelf file rows also yield width to hover actions the way DropAgent does — the name is as wide as it can be at rest, then compresses when copy/hide/delete appear. The same yield is a Directory primitive (`yield` + optional `fileName`) and a `/__ui/catalog` specimen; Feed-style trailing actions stay reserved unless a row opts in. Plugin stages, `mw-menu` and the assistant sheet share one 6px rise (`creative-arrive`): 190ms on stages, 130ms on menus.

Motion expresses a state transition. Rest → hover → press is a tone step, never a lift: `--motion-instant` 90ms for hover and press, `--motion-fast` 130ms for boundary and elevation, `--motion-normal` 190ms for surface arrival, all on `--ease-standard` `cubic-bezier(.32, .72, 0, 1)` except arrival, which keeps `--ease-out` `cubic-bezier(.16, 1, .3, 1)`. Directory and plugin list rows use the 180ms arrival curve for hover fill so a long title can compress instead of flashing. Buttons answer a press with tone, and ghost controls with `--nav-press`; a control that opens a popover is excluded so its menu never shifts. Attached editors keep their 140ms opacity transition without translation or scale. Modals arrive with opacity and a 6px rise. Feed readers reveal over 160ms ease-out with a 3px upward starting offset; disclosure chevrons use 160ms ease. Project settings disclosures and switch knobs use 160ms ease. Reduced-motion preference suppresses animation, press feedback and smooth scrolling.

Keyboard focus is a 1px `--ink` stroke drawn *inside* the control (`--focus-stroke`, `outline-offset: -1px`), not a detached browser rectangle, not a washed outer halo, and never a 2px indigo/blue box. Outer rings clip under the workbench's `overflow: hidden` surfaces and read as a default focus box. `--focus` / `--blue` stay chromatic accents for links and selection; they are banned as outlines. Writing surfaces marked `data-plain-field` answer with a 1px ink underline instead of a box. Scroll regions that already show a scrollbar keep a transparent track and a thumb that appears on hover; regions declared scrollbar-free stay scrollbar-free.

Do not ship operating-system chrome as the product UI. A closed select may look like `mw-select`; opening it must reveal `mw-menu`, never the macOS or Windows list. Hide a native `<select>` only as the form value. Colour, date and time picking, range, and destructive confirmations use `mw-*` (calendar, slider, alert dialog). A native `<dialog>` may keep Escape and focus trapping; its skin is still `mw-*`. File picking may keep a hidden `input[type=file]` behind `mw-btn`. Icons take colour from the surface they sit on: `--plugin-tint` for plugin identity, status families for state, ink/muted for chrome. Pair motion with those same tokens — travel or arrive, do not snap — and treat that polish as part of the change. Known leftovers (PPT `type=color`, Schedule `type=time`, a few `window.confirm` calls) are listed in [ui-craft-floor](specs/ui-craft-floor/spec.md) and must not be copied.

## Shapes

Shared controls use 10px corners. Goal workspaces and edge sheets, including their inner shells, use square edges; a creation modal uses the 12px surface corner and keeps its own form shell square inside it. Compact search/confirmation dialogs and menus use 12px corners; grouped paper (Card, Catalog shell, tables) uses `--radius-surface` 12px. Directory rows use 8px. Compact canvas nodes use 12px; wide-board cards use 8px; the stacked Goal list (pane under 840px) uses full-width 8px group bars and 16px status marks. The home composer retains its established 23px corner as a surface-specific shape. These are current component values, not a requirement to wrap every content section.

Status presentation follows context and a shared `mw-status` mark: directory and stage-list status is compact Lucide icon plus text in the family colour, without a second surrounding border; canvas and board status use small dots with text and no container behind them. Elsewhere a status tag is a borderless 11% tone wash at 5px corners, never an outlined or stadium pill. Feed/Inbox kickers use that same tag. Preserve domain status names; neither a colored dot nor a tint is sufficient on its own. Terminal palettes remain a bounded execution-canvas preference rather than a second application theme.

Icons are a curated Lucide library on a 24 grid, grouped as 栏 / 动作 / 对象 / 状态 in Catalog. Application surfaces render them at `stroke-width: 2`, which keeps a 16px glyph at a Linear-weight 1.33px stroke; large empty-state marks drop to 1.6 so they do not read as heavy. Chrome icon boxes are 16px. Plugin rail icons use that plugin’s `--plugin-tint` at rest, on hover and when current; the current item adds the travelling wash. Directory glyphs and empty-state marks inherit the same token when the surface has a plugin identity. Do not introduce a second icon family or emoji.

## Components

### Buttons, fields and overlays

Primary controls use Action/Action Ink, 32px minimum height, 10px corners and a stable short label. Secondary controls use ink-tinted fill and a translucent boundary; ghost controls are transparent until interaction. Hover changes tone without lifting. Disabled actions stay visibly unavailable. Shared mobile action selectors use 44px minimum height. At widths up to 760px or with a coarse pointer, Frame add actions and picker search/source/Cancel controls use a scoped 44px control height from the final shared sheet; desktop controls retain their compact scale.

Goal event forms, rule editors and planning save footers pair Cancel on the left with the specific Submit action on the right, in one adjacent action group. Supporting explanations sit outside that group. These form actions and Feed reader actions use 36px desktop minimum controls and 44px mobile controls; compact navigation retains its separate scale. Cancel follows the form’s existing non-submit return or reset behavior.

Select is a field. The closed face is `mw-select`; the open list is `mw-menu` on the popover layer, not the operating-system menu. See [mw-select-custom-menu](specs/archive/mw-select-custom-menu/spec.md).

Inputs use paper, an ink-derived 10% input boundary, 10px corners and 32px height. An Input Group or Number Field keeps that boundary on the shell only; the inner control is chromeless. A slider is a 28px hit target, not a text field: 4px `--control-fill` track, `--action` fill to the thumb (same grammar as Progress), and a 16px `--paper` disc with a hairline and the Switch raised shadow. Focus is a 1px `--ink` ring on the thumb. Legacy page-wide `input` cosmetics do not restyle `mw-*` fields or `type=range`. Textareas grow independently. Buttons, fields, summaries and tabs share one contained keyboard ring: 1px `--ink` drawn inside the control so it cannot clip. Text links and `.mw-btn--link` keep a 1px offset so the stroke does not cover glyphs. Fields also turn their hairline `--ink` so a focused field reads as active rather than merely outlined. Feed dialog fields use that same contained ring. The [neutral focus stroke](specs/archive/neutral-focus-stroke/spec.md) replaces the earlier 2px indigo inner ring; [focus-ring-redesign](specs/archive/focus-ring-redesign/spec.md) still owns “inside, not outside”.

One segmented control serves the board switch, settings choices and the locale switch: a recessed `--control-fill` track with a `--hairline` boundary, 10px corners and 3px padding, and a raised `--nav-raised` chip on the current choice carrying the hairline, the shared surface shadow and, in Dark, the top edge highlight. That chip travels between slots over 240ms on `cubic-bezier(.32, 1.22, .52, 1)`, settling with a slight overshoot and taking each slot's own width; without the client script it simply appears on the current slot as before. The directory keeps its own compact metrics and shares only those tones. Directory empty states share one calm left-aligned block — 18px/10px padding, `--muted` copy, an `--ink-soft` lead line and a 16px Lucide mark in `--plugin-tint` — instead of a different padding and alignment per plugin. Creating an item is a centred modal: New Goal, Feed task configuration, Session add and the Frame picker sit in the middle of the viewport at `min(560px, 100vw - 48px)` wide, take their content's height up to `min(100dvh - 96px, 720px)`, and keep a fixed header and action footer with one scrolling body between them. They carry the surface corner, the hairline, the shared control shadow and the shared `--scrim`; at 760px and below they inset 12px from each edge. ⌘/Ctrl+Enter submits the open modal. Editing an existing Session's relations and the Handoff editor stay attached to the right edge at 44px below the viewport top, filling the remaining height. Square, shadowless shells and the 10% ink backdrop reduce floating-window appearance; native dialog focus trapping, Escape, cancellation and focus return remain. Headers and action footers stay outside scrolling fields; the Goal creation body aligns fields to the start with 12px gaps. Feed fields use the same contained 1px `--ink` ring. Mobile fields use 16px type and relevant actions retain 44px targets. The directory middle (plugin sections) can scroll when height is scarce, without a visible scrollbar, while project and account chrome remain outside. Errors keep entered data available and provide an explicit correction or retry path.

### Directory and project search

Destinations are plugin section headers: icon and label, with a disclosure control when the plugin has a list. Flat tone and stronger text mark the current plugin. Lists nest under their plugin and may stay expanded together. Plugin lists that occupy the second column share the `mw-dir` panel and `mw-dir-row` grammar: Session rows are 28px and single-line, with a title and compact status mark, nested under runtime collection folds that use the same caret, mark, title and count as Goals’ 当前; Inbox and Artifact lists use 36px two-line rows with a title, one secondary fact and a trailing status mark; Feed’s 全部 is the same collection fold as Goals’ 当前 — caret, mark, title and count — with source tasks nested inside as compact 28px rows that keep a trailing health mark; last-fetch lives in task configuration; Feed and Session add sit above those folds. Settings categories use the same compact 28px row with a quiet section-coloured icon. Titles are 13px/450 (`--ink-soft`), 550 and `--ink` when selected. Captions and counts are 12px `--faint`; selected captions use `--muted`. Status marks are 12px/400 Lucide plus the domain label in the family colour, with no second enclosing box; they must not outrank the title. The tools row is the plugin name plus icon actions. Group headings are 11px/550 `--faint`, with more space above than below. Row chrome — height, padding, 8px corners, hover fill, selected ownership wash — lives only on `mw-dir-row`, and spans any trailing action. The directory does not add a second 2px leading mark; that selected grammar matches Goal. Leftover plugin row classes must not carry a second height, selection tint or padding. Create actions sit as a full-width 28px add control; Feed and Sessions place it above the collection folds. Empty states describe the missing content and offer only a real available action. The Goals tree keeps its own hierarchy widget and does not use this row. The Goals directory keeps a full-width New Goal control with the status filter on its right; the live tree, archive and trash live as collection folds in the Goals stage list, with target / archive / trash marks.

Search in the directory top row opens a centered palette grouped by plugin and navigates to the selected object. It remains available with the directory collapsed or on a phone. The project selector and project settings keep distinct roles. The account footer opens global device settings. Plugin market remains project-local activation, with search, installed icons, text filters and catalog rows; enabling Feed also enables Inbox.

### Plugin stage lists

When a plugin fills the stage (no item open), its list shares one frame with Goals and Sessions: the toolbar sits at the stage's top-left (16px/20px), and rows, folds and empty states run the full stage width from the same 20px edge — no plugin re-centres its list in a narrower column. The toolbar's first control is the create action as an outlined `tree-create` with a leading plus (or the plugin's import mark when importing is the first step); secondary actions are ghost buttons with a leading Lucide mark. Toolbars never use a filled Action button; a stage empty state may offer one filled first action, and several alternative starts sit in an `mw-empty__actions` row of ghost buttons. Search sits inside its field (leading mark, ≤420px) and filters follow on the same row as `mw-select` at their natural width. Stage empty states use `mw-empty` — mark in `--plugin-tint`, 14px title, 13px body — at up to 30em so Chinese copy does not break mid-phrase. The selected row, including a Goal row, is the ~10% `--plugin-tint` wash, never a neutral ink fill. Every detail view returns with the same rotated chevron in `plugin-stage-back`; a kicker that shares the back button's row starts after it, like a breadcrumb. Stage and dialog checkboxes are `mw-check`, date fields open the calendar from a calendar mark, and a dialog taller than the viewport keeps its footer (the submit action) sticky at the bottom. List dates follow the interface language (9月23日 / Sep 23). Every disclosure (`details`) uses one grammar: the OS triangle is hidden and a 12px chevron rotates from right to down (`mw-disclosure`, or the owner's own caret); remove, move-up and move-down controls are icon-only ghost buttons with `x` / `chevron-up` / `chevron-down` marks and an accessible name, never typed glyphs (×, ↑, ↓). Floating menus keep their CSS size cap (the Pages slash menu is a 380px scroller placed below the caret) and only shrink further to fit the stage. The plugin rail is one Tab stop: the current plugin is tabbable, and Up/Down/Home/End move between plugins.

### Workflow chains

A workflow is edited as the chain itself: plugins are stations (outlined cards tinted by `--station-tint`), and each gap holds a handoff pill — Function, AI or 手动 — plus a small `+`. Every edit (drop a plugin into a gap, pick one from the gap's popover, change a handoff, move or remove a station) saves at once; there is no separate save step. A handoff that cannot run yet (a Function with no rule, an AI with no instruction or no text model) is drawn dashed in amber with an alert mark, and a line under the chain names each one. It never looks connected. Plugins that cannot join yet are counted, never shown as disabled chips. An open run keeps the vertical chain in a 232px column on the left, with check / dot / ring marks for done / current / not reached. The main area embeds the station's own plugin view with this run's item, under one bar that says what the next handoff will do. On a phone the vertical chain becomes a horizontal strip above the plugin. Both views are patched in place rather than redrawn. Continuing, opening the manual form or saving never reloads the embedded plugin or drops scroll and focus. Motion only says what changed. A station arrives with a settle, slides to its new place, or leaves quickly; the gap a drag would land in makes room in the workflow tint. A handoff in progress runs down its line; once handed over, the check lands, the line fills and the next plugin fades in over the last one. Removing a station, or a move that resets configured handoffs, offers 撤销 in the notice; ⌘Z does the same in the editor.

### Grouped work tabs

Tabs use independent 6px rounded surfaces and stable plugin-colored Lucide icons. Ordinary tabs hug their title up to 172px and share remaining strip width equally when they overflow; selection changes tone, not geometry. Preview tabs keep the same width with italic titles. User groups use a color chip and optional name; collapsing hides every tab in that group, including the current one. Pinned tabs stay at the left of their pane, show only an icon (36px desktop, 44px touch) and cannot join a group. Right-click or Shift+F10 exposes pin/unpin, close and group actions. The plus menu opens enabled plugin pages as committed tabs and offers the same current-tab actions for touch. Pin state survives reload, moving and split copies; an existing destination tab keeps its own preference when merging duplicates. Ordinary tabs reserve close-button space; inactive fine-pointer closes reveal on hover or focus, while touch closes remain visible. Menus use a short 120ms entrance, disabled with reduced motion.

Native tab triggers support Arrow keys, Home and End to move and select; Delete closes a closable tab. Rerendering restores trigger focus. Collapsing a group hides its tabs until the chip is opened again. The focused pane synchronizes the active Goal title and directory selection without rebinding terminals. Opening or restoring a Goal tab loads that Goal's actual body, not only its title. Current tabs scroll into view after selection and viewport changes. Dragging reorders or moves tabs across panes and into or out of groups; Alt/Option copies. While the pointer is on the strip, other tabs slide to the order `moveTab` will commit and a same-width slot marks the landing place; dropping at a pane edge still splits with the dragged tab. The split control opens a layout menu with left, right, above and below options. Separators support pointer/keyboard resizing and double-click equalization. Closing a pane closes its tabs and expands the remaining layout; closing the final workspace tab restores home.

Same-plugin panes contain independently usable content. Loaded content windows stay mounted when tabs move or panes merge, preserving their unsubmitted input. Navigation inside an embedded content window delegates new tab selection to its parent, allowing A → B → A to return to the original content. Same-pane focus changes do not move or reload the work surface. Splitting preserves the current Frame/work view; an explicit “打开 Frame” action selects Frame even when that Goal’s existing tab last showed work. This live-document continuity is separate from persisted layout restoration; it does not promise that unsubmitted forms survive a page refresh.

### Goal canvas, board and work area

The dependency canvas uses real Goal/active relation data. Arrows run from provider to consumer; parent membership is separate. Completed nodes remain visible but quieter. Clicking a canvas node, a kanban card, or a stage-list row opens that Goal's Frame and selects it; the node's open control still expands the existing work surface. Panning, zooming, node positions and collapse/restore remain local view state.

The Goals mother page switches between list, canvas and board. An empty canvas keeps New Goal in the stage chrome and centers a two-line status on the dotted field: there are no Goals yet, and Goals and dependencies will appear here as nodes. It does not repeat the create control. The list is the same Goal tree as the former directory, stretched across the stage so Goal IDs, status, child progress and prerequisites stay visible. Board columns show counts derived from their actual items and a visible empty-column message. On a desktop pane 840px or wider the six columns share the available width so the board itself does not scroll horizontally. When the Goal board pane is narrower than 840px, the same six groups stack as a collapsible list on the pane’s paper surface: 32px rows, a real chevron, status discs shared by group and row, one-line titles, and a single vertical scroll. Collapsed group headers hug their content. Empty groups remain as headers, start collapsed, and hide the empty-column sentence. Opening a card uses the same Goal content. Vertical wheel input over an overflowing card column scrolls that column, including at its ends; horizontal gestures and Shift-wheel move the board horizontally only while six columns are showing and the board actually overflows. In the stacked list, vertical wheel reads the list. Vertical wheel over headers, gaps or non-overflowing columns can move the board horizontally when columns are showing. Zoom gestures and the open Goal work area retain their own behavior. The expanded workspace keeps full-height Runtime and optional information/timeline. When terminal is the only available work mode, the duplicate Conversation/Terminal mode bar is omitted.

Goal information reads live `readState` and prioritizes actual unmet requirements, pending decisions and blockers with their relevant entry points. An existing dependency alone is not presented as a completion blocker. Historical bodies start collapsed on ordinary entry; explicit selection, deep links and restored reading can expand the original event inline without replacing current facts. Relation body headings remain secondary to the main document heading. Requirements, pending decisions, concerns and older history retain their real data and retry behavior. 目标与要求 includes purpose, scope, decisions, material references and the relation/risk/impact/rules deck. 完成要求 shows current requirements, read-only historical criteria and exact Artifact versions. These views never calculate completion themselves.

### Frame content picker

Empty and populated Frames offer “添加已有内容”. Its viewport-contained dialog searches and filters the current project’s loaded Feed, Inbox, Session and Artifact references by source. Existing owner loaders read the selected content. Already-added items are disabled and labeled; empty projects and unmatched searches have distinct explanations. Adding stores only project/Goal-local canvas references and positions, retained after reload; it does not create a domain object. Search receives focus, Cancel returns to the opener, and adding focuses the new block. Cross-pane dragging remains available.

### Runtime and domain ownership

Work owns Session/PTY identity and terminals. Opening, selecting or closing a Goal never starts, sends to, destroys or rebinds execution. The empty terminal surface offers a local Add terminal action that opens the existing chooser, focuses its first available choice and returns focus on Cancel. Users explicitly add/start a terminal. Event-owned parent Goals can record integration in their own Runtime; the existing untransferred compound-parent guard remains. Only the terminal canvas uses its independent Follow interface/Light/Dark palette.

Session creation and association share a readable dialog heading, with the mode switch separate from Close; on mobile, the mode switch sits below the title. The first-use creation action uses the shared primary style and an aligned plus icon. Artifact reading distinguishes no project results, available results with no selected version, and an unavailable exact version; each state describes the actual next step.

Goals retains event writing and domain decisions; Work/Sessions retains execution identity, histories and working-directory relationships; Artifacts retains owner-rendered exact versions and downloads. Inbox owns attention with an entry reason, related object and next action. Feed owns source-message facts and source tasks. Shelf is a personal DropAgent-shaped ingest surface: its directory, preview, command bar, confirm strip and drop veil use DropAgent tokens (`#F5F5F4` / `#19191B`, fog-blue `#66709E` / `#A6AFD5`, five icon tones, paper press that darkens). File-kind labels sit beside the name as small filled chips in those five marks (PDF clay, Markdown/text slate, image plum, link/site blue, folder ochre). Returning from a plugin detail uses the same top-left chevron inset as the Goal work toolbar; the detail itself is not a centred card. Molis chrome (plugin rail, titlebar, other plugins) stays Coss. Source migration, credential handling and promotion semantics remain in their existing owners; shared chrome does not change these contracts.

### Home, Feed and settings

Home retains local date/weekday and a navigable month calendar. There is no quotation carousel, no Home “打开 Goals” control, and Goals is opened from the directory or plugin strip. Date, calendar, shortcuts and the disabled composer stack from the top as one column; leftover paper stays below, not as a gap between the date and the input. The home input and send control remain natively disabled with “Agent 尚未开放”. No Agent Harness is implied.

The creation modal is a writing surface, not a form. Two borderless lines carry the whole default state: the Goal's name at 19px and its outcome below it, both label-less with the question in the placeholder and the label kept for assistive technology. A single 11px example sits under the name and fades on the first keystroke, so guidance appears only while it is needed. These lines opt out of the shared field ring through `data-plain-field` and answer focus with a 2px accent underline over a one-step background — a pen line rather than a box. The outcome line grows with what is written, up to 260px. Everything else — supporting notes and acceptance, parent and dependencies, identity and priority — sits behind one quiet disclosure that names all three, never three stacked accordions. Enter in the name creates the Goal, and ⌘/Ctrl+Enter submits from anywhere in the modal.

Home shortcuts remain project-local preferences on the project home page, above the disabled composer. Their modal supports add/edit/remove/cancel, keeps input on failure, restores focus, and opens validated http(s) links through the existing web/native path. They do not create Goal records. The add-shortcut circle is an empty slot — a `--line-strong` hairline ring with a `--muted` mark that fills on hover — rather than the most saturated element on a quiet page.

Feed keeps a full-width fixed toolbar boundary above its internally scrolling list and reader, including in narrow and split panes. Opening, collapsing and retrying an item retain its focus and appropriate scroll position. Feed selection synchronizes the source task, selected-source heading and filtered list; the stage has no redundant Feed eyebrow. Closed rows share the Goal list grammar: a 16px provider glyph and title, then source, time and a plain status mark. Opening a row keeps that single title and brings the original source link and body into continuous inline reading. Tags and optional material disclosures follow the body; destination state and grouped actions sit in a divided footer. Read state and destination state are distinct; destination replaces the read mark when the item is no longer only in Feed. At 760px and below, the reader actions form two equal columns with 44px targets; long titles and body wrap. Search, filters, keyboard selection, collapse/reopen and detail-error retry remain available. Demo actions explicitly change only the current page. Feed task configuration uses the attached editor. Adding a task opens a type list of 32px rows — name plus a short hint — not marketing cards. Capture rules belong to a source task: they are optional when adding a task and managed inside that task's configuration; the Feed directory has no separate capture-rules entry. Task configuration has one Cancel/Save configuration footer; the pull-plan disclosure names its separate save scope and pairs Undo changes with Save pull plan. Saving the plan preserves unsaved task fields; resetting returns to the latest saved plan, including its paused state. Save failures keep input available for retry. Promote/Start retains create-or-reuse Draft behavior and source context boundaries; filling a chosen terminal never automatically sends. Inbox attention and its authoritative processing history remain separate from the Feed stream.

Project settings from the titlebar gear stay in the plugin shell: the directory lists project categories (General, Workspaces, Guidance) with icons and a 36px rounded current row, and the selected page occupies the exclusive main stage as a Codex-style document (a centered 760px column, grouped cards, inline controls). Workspace tabs stay in state but are covered until another plugin clears exclusive. Direct `/projects/{id}/settings*` URLs still render the independent settings page. The `embed=1` fragment remains for stage loading and project-management callers. Refreshing while settings are open restores the directory and exclusive stage.

General uses a name-edit row, a local-data disclosure and separate rebuild/delete actions. Guidance has six categories, category-specific add actions, one inline editor, version history and inactive entries. Rules use flat rows with right-aligned selects/switches, advanced disclosure, change reason and a clear save footer. Failed saves preserve input. Planning prioritizes the active composition, then search/category filters and content-sized adoption rows: a typical desktop row is about 112px tall, with no 168px minimum. Controls move below the copy on narrow screens. Mobile return/category links, inputs, buttons, planning filters and guidance actions have 44px minimum targets; the switch retains its small visual knob inside a larger clickable setting row.

Global settings presents theme, language, density and terminal appearance as compact setting rows. Execution tools put Runtime status and the relevant preview/connect/repair/remove action first, with local paths collapsed. Diagnostics separates installation, launch entries and Web service status/actions; technical configuration and logs are disclosed on demand. Plugins that register a device-settings page appear as additional categories after these host pages; Shelf’s drop-wheel preference lives there, not on Molis appearance, and Feed Gmail stays in Feed. Planning library browsing, detail and editing use the same independent shell, and that category appears only when the current project has Goals enabled. Global category changes, planning detail/edit and cancel retain the originating project context so Return restores the prior project workspace. Both settings scopes share the neutral palette and controls. Explicit planning adoption retains confirmation and independent project/personal versions. Project default rule saves reach a Goals-owned command with validation, transaction, audit history and idempotent retry; presentation does not own business state.

## Do's and Don'ts

### Do

- **Do** build hierarchy from spacing, text and meaningful boundaries; use paper continuity for work and selected tabs, attached edges for temporary editors and restrained depth for compact prompts.
- **Do** keep the current tab, loaded body, selected directory item and owned terminal consistent without copying domain state.
- **Do** retain source links, exact Artifact versions and original record IDs; make current facts distinct from historical evidence.
- **Do** preserve visible focus, keyboard paths, error recovery, responsive reading and reduced motion. Keep the shell within the viewport and scroll long content in its owning component.
- **Do** state settings scope, keep global and project preferences independent and provide a direct return to prior work.
- **Do** use the existing owner renderer and shared token source when adding screens.
- **Do** keep Feed read state separate from destination state, read the body before processing, and disclose optional materials only when present.
- **Do** pair form Cancel and Submit, label independently saved regions, preserve drafts on failure, and carry project context through global settings.

### Don't

- **Don't** restore the old 32px work bar, underlined active work tab, 10px shared controls, or separate Settings palette.
- **Don't** add a second persistent directory inside the workbench, decorative dashboard cards, duplicate mode bars or inactive placeholder tools.
- **Don't** embed project preferences in workspace/plugin tabs or revive the asynchronous exclusive settings stage.
- **Don't** turn a disabled composer, Session demo, reserved module or browser screenshot into a claim of an integrated feature.
- **Don't** infer completion from child counts, activity or missing requirements, or treat UI selection as execution authority.
- **Don't** make status color the only explanation, allow long paths to widen the viewport, or hide the current tab when resizing.
- **Don't** use review screenshots as product imagery or claim browser review verifies the native package or every low-frequency form.
- **Don't** repeat the Feed stage eyebrow, expanded title or summary, or ask users to select an Artifact when the project has no results.


### Long detail reading
Inbox uses a 20–22px title in a scrolling context region, with processing actions and failure feedback in a separate footer. Artifact detail keeps its title and local export reachable in both workbench and direct version pages; its raw JSON scrolls within a maximum of 45dvh/400px. Session detail is a continue cockpit flush to the pane: a compact identity bar, one primary continue action, and a relations rail. Search and event filters appear only after execution events are loaded, and those records scroll inside the main column. On a narrow pane the rail becomes an overlay from the identity bar. These rules apply within split panes as well as narrow windows.


### Settings editing
Project rules, project guidance and planning-method editing use the available settings panel: fixed heading and action footer, with fields scrolling independently. Guidance editing replaces the list in that panel until save/cancel; cancel restores focus to its entry point. Save and cancel sit together at the right, with failure feedback immediately above them. Pending saves disable editing and cancellation; a failed connection preserves the draft and offers a readable retry message. Category navigation remains in the independent settings shell. The pattern is verified at 1024×400 and 390×500.


### Goal form panels
Goal record forms use a fixed compact heading, a scrolling field region and a separate action/feedback footer. The outer Goal title remains visible; the duplicate detail toolbar hides during form editing. Fields never scroll under the buttons. The shared structure covers note, progress, concern, decision, closure/resume, agreement, requirements and record-template forms. At 760px and below actions retain 44px targets. Pending writes keep fields inert and disable local form actions without removing inputs from FormData; failures retain drafts, and write-success/read-failure keeps its separate retry-reading action.

### Partial saves and connection recovery
When a multi-step save completes only its first step, name the saved part and the unfinished part in the same feedback area. Retrying must preserve identity and avoid duplicate records. Goal type/requirement saves follow this rule. Planning methods distinguish mandatory steps, coverage questions and dependency rules from optional advanced guidance; validation opens and focuses the missing group. Pending planning saves disable both local return and cancel links. Connector authorization failures point to the current Feed task settings → Manage account connection, while retaining provider diagnostics in history.

Project Workspaces settings replace the standalone Workspace navigator. Show associated paths and one explicit Files/Git browsing selection; Coding keeps its session execution choice. The same settings category works embedded and standalone, with empty, unavailable, saving, and error states. See [settings ownership](docs/platform/PROJECT-SETTINGS.md).
