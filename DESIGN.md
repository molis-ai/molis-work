---
name: Molis Work Coss Workbench
description: A neutral, compact personal workbench with continuous work surfaces, edge-attached editors, grouped work tabs, and restrained state feedback.
colors:
  page: "#f6f7f9"
  paper: "#ffffff"
  rail: "#f0f1f4"
  nav-bg: "#f8f8fa"
  ink: "#15161a"
  ink-soft: "#43464f"
  muted: "#5f636d"
  faint: "#6e727c"
  line: "#e6e7ec"
  line-strong: "#d5d7de"
  nav-hover: "ink 5.5%"
  nav-active: "ink 9%"
  nav-press: "ink 13%"
  nav-raised: "#ffffff"
  hairline: "ink 9%"
  accent: "#5a63d6"
  accent-strong: "#474fbd"
  accent-soft: "#eeeffb"
  green: "#2e7d5c"
  amber: "#8a6320"
  red: "#b0424a"
  action: "#1c1d21"
  action-ink: "#ffffff"
  scrim: "rgba(19, 21, 32, .3)"
  dark-page: "#0e0f12"
  dark-paper: "#17181c"
  dark-rail: "#131417"
  dark-nav-bg: "#121316"
  dark-ink: "#f2f3f6"
  dark-ink-soft: "#c4c7d0"
  dark-muted: "#9a9ea9"
  dark-faint: "#82868f"
  dark-line: "#26272d"
  dark-line-strong: "#363840"
  dark-nav-hover: "ink 6%"
  dark-nav-active: "ink 10%"
  dark-nav-press: "ink 14%"
  dark-nav-raised: "#212328"
  dark-hairline: "ink 10%"
  dark-edge-highlight: "rgba(255, 255, 255, .055)"
  dark-accent: "#9aa2fb"
  dark-accent-strong: "#b6bbfd"
  dark-accent-soft: "#24263f"
  dark-green: "#62c08f"
  dark-amber: "#d8a45f"
  dark-red: "#ec8087"
  dark-action: "#edeef1"
  dark-action-ink: "#17181c"
  dark-scrim: "rgba(0, 0, 0, .55)"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  directory-title:
    fontSize: "13px"
    fontWeight: 450
    lineHeight: "20px"
  directory-caption:
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
  tab:
    fontSize: "12px"
    fontWeight: 450
  event-heading:
    fontSize: "16px"
    fontWeight: 550
    lineHeight: 1.5
    letterSpacing: "-.01em"
  settings-heading:
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-.025em"
  home-quote:
    fontFamily: "Songti SC, Noto Serif CJK SC, STSong, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.85
    letterSpacing: "0.015em"
rounded:
  item: "6px"
  control: "8px"
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
    width: "172px"
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

This is the current built world as of 2026-09-16. [Coss workbench redesign](specs/coss-workbench-redesign/spec.md) establishes the shared foundation; [Workbench panes, Feed and global settings redesign](specs/workbench-pane-feed-redesign/spec.md) owns the current tabs, nested panes, Feed and global preferences. The independent project settings world follows [Project settings redesign](specs/project-settings-redesign/spec.md). [PRODUCT.md](PRODUCT.md) remains the authority for product behavior, data relationships, and module ownership; this document records their current visual expression. The latest [whole-product interaction redesign](specs/product-interaction-redesign/spec.md) and its [surface inventory](specs/product-interaction-redesign/inventory.md) own the current form actions, Feed reader, Session entry, settings return context and Artifact empty states. Its v11 correction makes Goal work and records continuous with the pane and attaches temporary editors to the workspace edge. It retains v6 attention continuity and v7–v10 scrolling, reading and editing behavior. The [interaction texture upgrade](specs/interaction-texture-upgrade/spec.md) owns the current colour ramp, elevation, motion, focus and icon calibration; it changes expression only and leaves structure, density and domain behavior to the authorities above. Detailed behavior, source ownership, motion and verification boundaries are in the [workbench surface record](.impeccable/surfaces/immersive-workbench.md).

**Key Characteristics:**

- A 48px plugin icon rail, a current-plugin directory, and a 32px work bar with equal-width Chrome-style tabs and stable plugin group colors.
- Neutral Light/Dark tokens shared by the workbench, settings and project index.
- Independent global and project settings with category navigation and one content scroll boundary.
- Compact navigation and continuous reading/work surfaces; temporary editors meet the workspace edge while preserving modal focus.
- Real state and explicit actions; unavailable capabilities remain visibly unavailable.

## Colors

The palette is neutral gray with a restrained violet interaction accent. `packages/design-system/src/styles/coss-controls.ts` owns the shared Coss control layer, and `packages/design-system/src/styles/interaction-texture.ts`, loaded after every page stylesheet, owns the final colour ramp, elevation, motion and icon calibration. The frontmatter lists its actual values; component examples use Light tokens and resolve to their Dark counterparts through runtime CSS variables.

### Primary

Action is near-black in Light and near-white in Dark. It identifies primary actions across chrome and Goal event forms. Violet (`--blue`, `--blue-dark`, `--blue-soft`, `--focus`) identifies links, text selection, field focus and relevant selected content; it is not a second filled-button system.

### Neutral

The neutral ramp carries a faint indigo cast so greys belong to the accent family rather than reading as unrelated system grey. Page/canvas is the outer work field; paper/panel is the reading surface; navigation uses `--nav-bg`. Dark separates those layers as field `#0e0f12` → navigation `#121316` → paper `#17181c` → raised `#212328`. Ink, soft ink, muted and faint establish reading hierarchy and all four stay at or above 4.5:1 on their own surface. Thin lines separate meaningful regions.

`--nav-hover`, `--nav-active` and `--nav-press` are ink at low alpha, so one hover/selected/press recipe composites correctly over any surface in either theme. A selected directory row is that flat fill plus a 2px accent bar at its leading edge and `--ink` title; hover alone never shows the bar. Selected work tabs join the paper surface with a hairline and, in Dark, a top edge highlight. Plugin group labels, work-tab icons, bottom rules and the current plugin rail item use stable, theme-aware colors: blue for Goals, amber for Feed, violet for Sessions, green for Inbox and rose for Artifacts. These identify ownership, not status; labels remain visible.

Green, amber and red retain their existing semantic roles for real state and appear with readable labels or icons. Preserve domain status names; neither a colored dot nor a tint is sufficient on its own. Terminal palettes remain a bounded execution-canvas preference rather than a second application theme.

## Typography

Native system typography with Chinese fallbacks is the default. Weight, spacing and scale establish hierarchy; protocol IDs stay secondary and monospace is reserved for commands, identifiers and measured values. Interface language can change between Chinese and English without rewriting user titles or record bodies.

- **Directory:** 13px / 450 titles, 12px / 500 section captions, 11px secondary facts. Long titles truncate inside a shrinking text column; status and actions retain their own space.
- **Work tabs:** 12px / 450, increasing to 550 when active. Long titles retain a tooltip and accessible name.
- **Goal reading:** compact timeline row titles use 11px / 500; expanded event headings use 16px / 550 / 1.5; event copy uses 12px / 1.8 and wraps completely.
- **Feed:** source/time labels use 11px, closed-row titles 13px / 450 on one line, and expanded body 13px / 1.6, bounded to 76ch. Closed rows hide the summary; an open row reads inline.
- **Temporary editors:** 15px / 550 headings, 13px labels, 14px fields and 12px help; fields use 16px at 760px and below. Session add and relations share this hierarchy.
- **Project settings:** headings 16px / 550 / 1.3, remaining 16px at 760px and below; section headings use 14px / 600. Setting labels use 13px / 550, supporting copy uses 12–13px, and mobile form text uses 16px. Path and storage facts wrap without widening the page.
- **Home:** quotation text alone uses the serif token; date, calendar, navigation and the disabled composer use the system stack.

Status copy stays direct and specific. Timeline events use human-readable Chinese labels rather than raw event names; original IDs and sources remain available as secondary facts.

## Layout

Density v15 uses Linear tool spacing as the desktop default: 28px shared controls, 28px Goal/Session rows, 36px two-line directory rows, 40px closed Feed rows and 8px settings row padding. Field groups keep 12px gaps. Desktop Session editors pair Runtime and Goal selectors in DOM order; at 760px and below they stack. Optional Goal sections retain 44px summary targets on touch/narrow screens. Settings content stays a 920px column. Goal form, Frame, Inbox and Artifact titles are 14–16px. Body copy, focus, fixed actions and component scrolling retain their own reading/accessibility rules.

The desktop shell is a full-width titlebar over three columns: a 48px plugin icon rail, a resizable plugin directory, and one flexible work stage. The shell stays within one viewport; tabs and primary toolbars remain in place while lists, readers, board columns and long forms scroll inside their own regions. Long content remains reachable at narrow widths and in split panes without shrinking text or introducing document scrolling. Default directory width is 240px, or 220px at viewport widths up to 1050px. A saved project-local width takes precedence; double-clicking the separator restores the applicable default. The directory has a thin right edge. Project switching, search and project settings sit in the titlebar, occupying the width of the plugin rail and directory; the rail, directory and stage share one top edge below that row. There is no notification placeholder.

The plugin rail lists Home, enabled plugins and the plugin market, with the account avatar at the bottom. The second column shows only the current plugin’s list. Home and the plugin market leave that column closed. Plugin title and actions stay on one row above the list. The directory list is one scroll region without a visible scrollbar. Users may still collapse the directory; the rail remains. Collapse and the current plugin persist per project.

Work tabs occupy a 32px bar. Tabs are a flat strip by default. A single-click in the directory reuses one italic preview tab per pane; a double-click, search, deep link or coarse/narrow tap commits a durable tab. Users may group tabs themselves with a named color chip and a short underline; plugins do not auto-group. Tabs are 172px wide and 26px high, with rounded upper corners; at 760px and below their width is 144px. Each pane owns its strip. A binary layout tree supports nested horizontal and vertical splits, including T-shaped arrangements, with 5px adjustable separators. Tabs, focus and layout persist per project on this device. The same item may appear in multiple panes; this state never becomes Goal truth. At 760px and below only the focused pane is shown, with window selectors to switch focus while preserving the layout. At narrow widths or with a coarse pointer, tabs, group labels, Close and Split use 44px interactive heights inside a 44px bar; desktop fine-pointer tabs retain 26px height.

An opened Goal fills its pane beneath the tabs: zero inset, square edges, no shadow and no canvas backdrop. A compact toolbar with a 32px minimum height keeps Back on the left. Runtime owns the flexible main column; a closable 300px rail holds Goal information and the inline timeline. Below 840px Goal-workspace width, the rail overlays the work area at up to 330px. Goal reading and recording use the continuous paper surface, with fixed heading/actions and internally scrolling content; covered controls and return focus retain their existing behavior. Compact canvas nodes can move; opened workspaces cannot.

At viewport widths of 600px and below, the plugin rail and current directory become one drawer below the titlebar, with a scrim, inert background and focus loop; selection closes it. Titlebar tabs and search remain. Native traffic lights stay in the titlebar and are not covered by the drawer. The opened Goal remains flush and square. Tabs remain available and keep the current item visible when space changes. The work area stays full height with details available on demand. There is no revived 70/30 adjustable Goal split or stacked information → Runtime → timeline layout.

Project settings is a standalone Coss/Codex-style preferences page: a 36px header, 224px category rail and centered content up to 920px. The rail contains return, project identity and four categories: 常规, 项目说明, 工作规则 and 工作规划. It has no workbench directory, plugin bar or workspace tabs. The content region owns the single main scroll boundary; inner documents flow naturally. Desktop content uses 16px top padding and 16–28px horizontal padding. At 760px and below, return and four equal category links sit above the content, project identity leaves the rail, forms and storage facts stack, and content padding becomes 24px 20px 48px. Project planning detail/edit pages retain this shell.

Feed sources live in the left directory, one task per source. The stage shows the selected source's message list and reading detail. Closed Feed rows are source plus title; the summary appears only after expansion. Project home remains a centered date/quotation/calendar composition with circular shortcuts above its disabled composer. Global preferences uses the independent settings shell for appearance, execution tools, diagnostics and planning library, including library detail/edit pages; the work bar has no theme shortcut.

Native window drag regions and actual fullscreen-aware safe insets remain platform-owned. Tabs, buttons and resizers must remain outside native system controls and must not become drag regions. Overlay traffic lights sit in the 32px titlebar (`trafficLightPosition.y = 10`). Project switching, search and project settings share that titlebar row, filling the plugin-rail-plus-directory width after the traffic-light inset. The plugin rail, directory and stage start together on the next row. Project index remains a full-page arrival surface with its own brand, search and device-settings entry.

## Elevation & Depth

Thin boundaries and tonal differences carry most structure. Directory rows are flat. Active work tabs use a paper surface, rounded upper corners and no shadow. Goal work and records remain flat and continuous with their pane. Temporary editors use a workspace edge and fine separator instead of a floating frame. Compact search and confirmation surfaces retain restrained depth.

- Shared surface shadow, Light: `0 1px 2px rgba(19, 21, 32, .05), 0 2px 5px rgba(19, 21, 32, .04)`.
- Shared surface shadow, Dark: `0 1px 2px rgba(0, 0, 0, .45), 0 2px 6px rgba(0, 0, 0, .3)`.
- Raised transient surfaces — project menu, directory filters, search, shortcuts, Runtime plan, trash, operation confirmation, migration and Feed import — use a `--hairline` boundary plus `--control-shadow`, and in Dark an `inset 0 1px 0` edge highlight so they read as glass rather than as a lighter rectangle.
- Every modal and attached editor dims with one `--scrim`: `rgba(19, 21, 32, .3)` in Light and `rgba(0, 0, 0, .55)` in Dark, with no blur. Dark no longer washes the app with a light ink veil.
- Goal workspace and attached editor panels themselves: `box-shadow: none`. The home composer has no shadow.

Motion expresses a state transition. Rest → hover → press is a tone step, never a lift: `--motion-instant` 90ms for hover and press, `--motion-fast` 130ms for boundary and elevation, `--motion-normal` 190ms for surface arrival, all on `--ease-standard` `cubic-bezier(.32, .72, 0, 1)` except arrival, which keeps `--ease-out` `cubic-bezier(.16, 1, .3, 1)`. Buttons answer a press with tone, and ghost controls with `--nav-press`; a control that opens a popover is excluded so its menu never shifts. Attached editors keep their 140ms opacity transition without translation or scale. Modals arrive with opacity and a 6px rise. Feed readers reveal over 160ms ease-out with a 3px upward starting offset; disclosure chevrons use 160ms ease. Project settings disclosures and switch knobs use 160ms ease. Reduced-motion preference suppresses animation, press feedback and smooth scrolling.

Fields answer focus with their own accent ring — a 1px `--focus` line plus a 3.5px halo — instead of a detached browser outline. Scroll regions that already show a scrollbar keep a transparent track and a thumb that appears on hover; regions declared scrollbar-free stay scrollbar-free.

## Shapes

Shared controls use 8px corners. Goal workspaces and attached editors, including the inner Goal creation shell, use square edges. Compact search/confirmation dialogs use 8px corners; other retained shared surfaces may use 12px. Directory rows use 6px. Compact canvas nodes use 12px; wide-board cards use 8px; the stacked Goal list (pane under 840px) uses full-width 6px group bars and 16px status marks, matching Linear issue groups rather than hugging chips or nested cards. The home composer retains its established 23px corner as a surface-specific shape. These are current component values, not a requirement to wrap every content section.

Status presentation follows context: directory Goal status is compact icon/text without a second surrounding border; canvas and board status use small dots with text and no container behind them. Elsewhere a status tag is a borderless 11% tone wash at 5px corners, never an outlined pill. Other domain tags may retain their bounded tag treatment. Do not apply a universal pill style or outline the wrapper around an existing status tag.

Icons are Lucide drawn on a 24 grid. Application surfaces render them at `stroke-width: 2`, which keeps a 16px glyph at a 1.33px stroke; large empty-state marks drop to 1.6 so they do not read as heavy. Chrome icon boxes are 16px. An icon rests one step quieter than its label — `--faint` in the plugin rail — and resolves to `--ink-soft` or its plugin colour on hover and when current.

## Components

### Buttons, fields and overlays

Primary controls use Action/Action Ink, 32px minimum height, 8px corners and a stable short label. Secondary controls use ink-tinted fill and a translucent boundary; ghost controls are transparent until interaction. Hover changes tone without lifting. Disabled actions stay visibly unavailable. Shared mobile action selectors use 44px minimum height. At widths up to 760px or with a coarse pointer, the new Home Goals/quotation actions, Frame add actions and picker search/source/Cancel controls use a scoped 44px control height from the final shared sheet; desktop controls retain their compact scale.

Goal event forms, rule editors and planning save footers pair Cancel on the left with the specific Submit action on the right, in one adjacent action group. Supporting explanations sit outside that group. These form actions and Feed reader actions use 36px desktop minimum controls and 44px mobile controls; compact navigation retains its separate scale. Cancel follows the form’s existing non-submit return or reset behavior.

Inputs use paper, an ink-derived 10% input boundary, 8px corners and 32px height. Textareas grow independently. Buttons, links and summaries keep the shared 2px keyboard ring at a 2px offset, and tabs draw it inside their container. Fields answer focus with their own accent ring instead — a 1px `--focus` line plus a 3.5px halo — so a focused field reads as active rather than merely outlined; Feed dialog fields keep their outline-only ring.

One segmented control serves the board switch, settings choices and the locale switch: a recessed `--control-fill` track with a `--hairline` boundary, 9px corners and 3px padding, and a raised `--nav-raised` chip on the current choice carrying the hairline, the shared surface shadow and, in Dark, the top edge highlight. The directory keeps its own compact metrics and shares only those tones. Directory empty states share one calm left-aligned block — 18px/10px padding, `--muted` copy, an `--ink-soft` lead line and a 16px `--faint` mark — instead of a different padding and alignment per plugin. New Goal, Feed task configuration, Session add/relations and Frame picker dialogs attach to the right edge at 44px below the viewport top. They fill the remaining height, use `min(560px, 100vw)` width, and become full width at 760px and below. Square, shadowless shells and the 10% ink backdrop reduce floating-window appearance; native dialog focus trapping, Escape, cancellation and focus return remain. Headers and action footers stay outside scrolling fields; the Goal creation body aligns fields to the start with 12px gaps. Feed fields explicitly retain the shared 2px theme focus outline without a halo. Mobile fields use 16px type and relevant actions retain 44px targets. The directory middle (plugin sections) can scroll when height is scarce, without a visible scrollbar, while project and account chrome remain outside. Errors keep entered data available and provide an explicit correction or retry path.

### Directory and project search

Destinations are plugin section headers: icon and label, with a disclosure control when the plugin has a list. Flat tone and stronger text mark the current plugin. Lists nest under their plugin and may stay expanded together. Goal and Session rows are 28px and single-line, with a title and compact status; Inbox and Artifact lists use compact two-line rows where applicable, with a title and one secondary fact. Feed source tasks show name, state and count in this directory. Empty states describe the missing content and offer only a real available action. The Goals directory keeps a full-width New Goal control with the status filter on its right; the live tree, archive and trash live as collection folds in the Goals stage list, not in the directory.

Search in the directory top row opens a centered palette grouped by plugin and navigates to the selected object. It remains available with the directory collapsed or on a phone. The project selector and project settings keep distinct roles. The account footer opens global device settings. Plugin market remains project-local activation, with search, installed icons, text filters and catalog rows; enabling Feed also enables Inbox.

### Grouped work tabs

Tabs use independent 9px rounded surfaces and stable plugin-colored Lucide icons. Ordinary tabs remain equal-width (172px desktop, 144px narrow); selection changes tone, not geometry. Preview tabs keep the same width with italic titles. User groups use a color chip and optional name; collapsing hides every tab in that group, including the current one. Pinned tabs stay at the left of their pane, show only an icon (36px desktop, 44px touch) and cannot join a group. Right-click or Shift+F10 exposes pin/unpin, close and group actions. The plus menu opens enabled plugin pages as committed tabs and offers the same current-tab actions for touch. Pin state survives reload, moving and split copies; an existing destination tab keeps its own preference when merging duplicates. Ordinary tabs reserve close-button space; inactive fine-pointer closes reveal on hover or focus, while touch closes remain visible. Menus use a short 120ms entrance, disabled with reduced motion.

Native tab triggers support Arrow keys, Home and End to move and select; Delete closes a closable tab. Rerendering restores trigger focus. Collapsing a group hides its tabs until the chip is opened again. The focused pane synchronizes the active Goal title and directory selection without rebinding terminals. Opening or restoring a Goal tab loads that Goal's actual body, not only its title. Current tabs scroll into view after selection and viewport changes. Dragging reorders or moves tabs across panes and into or out of groups; Alt/Option copies. Dropping at any pane edge splits with the dragged tab. The split control opens a layout menu with left, right, above and below options. Separators support pointer/keyboard resizing and double-click equalization. Closing a pane closes its tabs and expands the remaining layout; closing the final workspace tab restores home.

Same-plugin panes contain independently usable content. Loaded content windows stay mounted when tabs move or panes merge, preserving their unsubmitted input. Navigation inside an embedded content window delegates new tab selection to its parent, allowing A → B → A to return to the original content. Same-pane focus changes do not move or reload the work surface. Splitting preserves the current Frame/work view; an explicit “打开 Frame” action selects Frame even when that Goal’s existing tab last showed work. This live-document continuity is separate from persisted layout restoration; it does not promise that unsubmitted forms survive a page refresh.

### Goal canvas, board and work area

The dependency canvas uses real Goal/active relation data. Arrows run from provider to consumer; parent membership is separate. Completed nodes remain visible but quieter. Clicking a canvas node, a kanban card, or a stage-list row opens that Goal's Frame and selects it; the node's open control still expands the existing work surface. Panning, zooming, node positions and collapse/restore remain local view state.

The Goals mother page switches between list, canvas and board. The list is the same Goal tree as the former directory, stretched across the stage so Goal IDs, status, child progress and prerequisites stay visible. Board columns show counts derived from their actual items and a visible empty-column message. On a desktop pane 840px or wider the six columns share the available width so the board itself does not scroll horizontally. When the Goal board pane is narrower than 840px, the same six groups stack as a collapsible list on the pane’s paper surface: 32px rows, a real chevron, status discs shared by group and row, one-line titles, and a single vertical scroll. Collapsed group headers hug their content. Empty groups remain as headers, start collapsed, and hide the empty-column sentence. Opening a card uses the same Goal content. Vertical wheel input over an overflowing card column scrolls that column, including at its ends; horizontal gestures and Shift-wheel move the board horizontally only while six columns are showing and the board actually overflows. In the stacked list, vertical wheel reads the list. Vertical wheel over headers, gaps or non-overflowing columns can move the board horizontally when columns are showing. Zoom gestures and the open Goal work area retain their own behavior. The expanded workspace keeps full-height Runtime and optional information/timeline. When terminal is the only available work mode, the duplicate Conversation/Terminal mode bar is omitted.

Goal information reads live `readState` and prioritizes actual unmet requirements, pending decisions and blockers with their relevant entry points. An existing dependency alone is not presented as a completion blocker. Historical bodies start collapsed on ordinary entry; explicit selection, deep links and restored reading can expand the original event inline without replacing current facts. Relation body headings remain secondary to the main document heading. Requirements, pending decisions, concerns and older history retain their real data and retry behavior. 目标与要求 includes purpose, scope, decisions, material references and the relation/risk/impact/rules deck. 完成要求 shows current requirements, read-only historical criteria and exact Artifact versions. These views never calculate completion themselves.

### Frame content picker

Empty and populated Frames offer “添加已有内容”. Its viewport-contained dialog searches and filters the current project’s loaded Feed, Inbox, Session and Artifact references by source. Existing owner loaders read the selected content. Already-added items are disabled and labeled; empty projects and unmatched searches have distinct explanations. Adding stores only project/Goal-local canvas references and positions, retained after reload; it does not create a domain object. Search receives focus, Cancel returns to the opener, and adding focuses the new block. Cross-pane dragging remains available.

### Runtime and domain ownership

Work owns Session/PTY identity and terminals. Opening, selecting or closing a Goal never starts, sends to, destroys or rebinds execution. The empty terminal surface offers a local Add terminal action that opens the existing chooser, focuses its first available choice and returns focus on Cancel. Users explicitly add/start a terminal. Event-owned parent Goals can record integration in their own Runtime; the existing untransferred compound-parent guard remains. Only the terminal canvas uses its independent Follow interface/Light/Dark palette.

Session creation and association share a readable dialog heading, with the mode switch separate from Close; on mobile, the mode switch sits below the title. The first-use creation action uses the shared primary style and an aligned plus icon. Artifact reading distinguishes no project results, available results with no selected version, and an unavailable exact version; each state describes the actual next step.

Goals retains event writing and domain decisions; Work/Sessions retains execution identity, histories and working-directory relationships; Artifacts retains owner-rendered exact versions and downloads. Inbox owns attention with an entry reason, related object and next action. Feed owns source-message facts and source tasks. Source migration, credential handling and promotion semantics remain in their existing owners; shared chrome does not change these contracts.

### Home, Feed and settings

Home retains local date/weekday, a navigable month calendar and the existing 13 quotations. There is no Home “打开 Goals” control; Goals is opened from the directory or plugin strip. Date, calendar, quotations, shortcuts and the disabled composer stack from the top as one column; leftover paper stays below, not as a gap between the date and the input. Quotations autoplay about every 8 seconds while Home is visible; hovering or focusing the quotation pauses the cycle so source links stay clickable. There is no “换一句” control. Rotation uses a 160ms opacity transition; reduced motion switches directly. Quote layout reserves the longest text's space. Original text and attributions are unchanged. The home input and send control remain natively disabled with “Agent 尚未开放”. No Agent Harness is implied.

Home shortcuts remain project-local preferences on the project home page, above the disabled composer. Their modal supports add/edit/remove/cancel, keeps input on failure, restores focus, and opens validated http(s) links through the existing web/native path. They do not create Goal records. The add-shortcut circle is an empty slot — a `--line-strong` hairline ring with a `--muted` mark that fills on hover — rather than the most saturated element on a quiet page.

Feed keeps a full-width fixed toolbar boundary above its internally scrolling list and reader, including in narrow and split panes. Opening, collapsing and retrying an item retain its focus and appropriate scroll position. Feed selection synchronizes the source task, selected-source heading and filtered list; the stage has no redundant Feed eyebrow. Rows show a provider glyph, source/time/read state, title, quieter summary and disclosure chevron. Opening a row keeps that single title and brings the original source link and body into continuous inline reading. Tags and optional material disclosures follow the body; destination state and grouped actions sit in a divided footer. Read state and destination state are distinct. At 760px and below, the reader actions form two equal columns with 44px targets; long titles and body wrap. Search, filters, keyboard selection, collapse/reopen and detail-error retry remain available. Demo actions explicitly change only the current page. Feed task configuration uses the attached editor. Task configuration has one Cancel/Save configuration footer; the pull-plan disclosure names its separate save scope and pairs Undo changes with Save pull plan. Saving the plan preserves unsaved task fields; resetting returns to the latest saved plan, including its paused state. Save failures keep input available for retry. Promote/Start retains create-or-reuse Draft behavior and source context boundaries; filling a chosen terminal never automatically sends. Inbox attention and its authoritative processing history remain separate from the Feed stream.

Project settings opens directly as complete server-rendered HTML. Returning restores the project’s persisted workspace tabs and splits; category navigation, refresh and browser history do not depend on an asynchronous workbench settings stage. Obsolete persisted `project-settings` exclusive state is cleared on workspace restoration. The `embed=1` fragment remains for existing project-management callers.

General uses a name-edit row, a local-data disclosure and separate rebuild/delete actions. Guidance has six categories, category-specific add actions, one inline editor, version history and inactive entries. Rules use flat rows with right-aligned selects/switches, advanced disclosure, change reason and a clear save footer. Failed saves preserve input. Planning prioritizes the active composition, then search/category filters and content-sized adoption rows: a typical desktop row is about 112px tall, with no 168px minimum. Controls move below the copy on narrow screens. Mobile return/category links, inputs, buttons, planning filters and guidance actions have 44px minimum targets; the switch retains its small visual knob inside a larger clickable setting row.

Global settings presents theme, language, density and terminal appearance as compact setting rows. Execution tools put Runtime status and the relevant preview/connect/repair/remove action first, with local paths collapsed. Diagnostics separates installation, launch entries and Web service status/actions; technical configuration and logs are disclosed on demand. Planning library browsing, detail and editing use the same independent shell. Global category changes, planning detail/edit and cancel retain the originating project context so Return restores the prior project workspace. Both settings scopes share the neutral palette and controls. Explicit planning adoption retains confirmation and independent project/personal versions. Project default rule saves reach a Goals-owned command with validation, transaction, audit history and idempotent retry; presentation does not own business state.

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
Inbox uses a 20–22px title in a scrolling context region, with processing actions and failure feedback in a separate footer. Artifact detail keeps its title and local export reachable in both workbench and direct version pages; its raw JSON scrolls within a maximum of 45dvh/400px. Session detail keeps a compact title/action area and full-width search toolbar above the scrolling execution record. Relations and history are available in a collapsed context disclosure below it; opening the disclosure does not leave the reading surface. These rules apply within split panes as well as narrow windows.


### Settings editing
Project rules, project guidance and planning-method editing use the available settings panel: fixed heading and action footer, with fields scrolling independently. Guidance editing replaces the list in that panel until save/cancel; cancel restores focus to its entry point. Save and cancel sit together at the right, with failure feedback immediately above them. Pending saves disable editing and cancellation; a failed connection preserves the draft and offers a readable retry message. Category navigation remains in the independent settings shell. The pattern is verified at 1024×400 and 390×500.


### Goal form panels
Goal record forms use a fixed compact heading, a scrolling field region and a separate action/feedback footer. The outer Goal title remains visible; the duplicate detail toolbar hides during form editing. Fields never scroll under the buttons. The shared structure covers note, progress, concern, decision, closure/resume, agreement, requirements and record-template forms. At 760px and below actions retain 44px targets. Pending writes keep fields inert and disable local form actions without removing inputs from FormData; failures retain drafts, and write-success/read-failure keeps its separate retry-reading action.

### Partial saves and connection recovery
When a multi-step save completes only its first step, name the saved part and the unfinished part in the same feedback area. Retrying must preserve identity and avoid duplicate records. Goal type/requirement saves follow this rule. Planning methods distinguish mandatory steps, coverage questions and dependency rules from optional advanced guidance; validation opens and focuses the missing group. Pending planning saves disable both local return and cancel links. Connector authorization failures point to the current Feed task settings → Manage account connection, while retaining provider diagnostics in history.
