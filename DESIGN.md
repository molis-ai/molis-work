---
name: GoalBoard Calm Desktop
description: A calm single-directory workbench with a dependency canvas and a fixed expanded Goal workspace combining full-height Runtime, collapsible Goal info, and an inline timeline.
colors:
  accent: "#5068b7"
  accent-strong: "#344b9b"
  accent-soft: "#e9edfb"
  app-canvas: "#f3f3f5"
  goal-canvas: "#ffffff"
  navigator: "#f1f1f3"
  ink: "#19191b"
  ink-soft: "#424247"
  muted: "#62626b"
  faint: "#66666f"
  line: "#e7e7ea"
  line-strong: "#d9d9de"
  action: "#202023"
  action-ink: "#fbfbfc"
  terminal-dark: "#101012"
  terminal-light: "#fbfbfc"
  semantic-green: "#347759"
  semantic-amber: "#936b2d"
  semantic-red: "#a64e51"
typography:
  home-quote:
    fontFamily: "Songti SC, Noto Serif CJK SC, STSong, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.85
    letterSpacing: "0.015em"
  goal-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "clamp(27px, 2.25vw, 34px)"
    fontWeight: 710
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.52
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  home-composer: "23px"
  item: "6px"
  control: "8px"
  transient: "10px"
  surface: "14px"
  canvas-node: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "24px"
  xl: "32px"
  workspace-frame: "18px"
  mobile-workspace-frame: "10px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
    height: "38px"
  button-event-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.item}"
    padding: "6px 10px"
    height: "31px"
  button-event-secondary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-strong}"
    rounded: "{rounded.item}"
    padding: "6px 10px"
    height: "31px"
  search-field:
    backgroundColor: "{colors.goal-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 31px"
    height: "34px"
  goal-row-selected:
    backgroundColor: "{colors.goal-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.item}"
    padding: "5px 8px"
  goal-overview:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0 22px 16px"
  goal-workspace:
    backgroundColor: "{colors.goal-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
  goal-canvas-node:
    backgroundColor: "{colors.goal-canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.canvas-node}"
    padding: "16px"
    width: "258px"
    height: "190px"
  timeline-entry-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.item}"
    padding: "9px 8px"
---

# Design System: GoalBoard Calm Desktop

## Current workbench — 2026-09-13

The immersive project workbench supersedes the older shell and Goal-layout descriptions below. Its implementation authority is `specs/immersive-workbench-implementation/spec.md`; prior descriptions remain references for unchanged Settings, source content and domain-specific components.

- Project home follows `specs/poetic-project-home/spec.md`, with the footer and quotation follow-up in `specs/home-narrow-footer-quotes/spec.md`: local date, weekday and 13 automatically rotating quotations on the left; a small month calendar on the right; user-added web shortcuts immediately above a disabled single-line composer near the bottom. There is no greeting headline, recent activity list, editable draft or quotation control bar. The Agent Harness is not integrated. Goals opens its canvas only after explicit navigation. Direct Goal links open that Goal; reload/back may restore ongoing work. The full home behavior and evidence are recorded in `.impeccable/surfaces/immersive-workbench.md`.
- One fixed directory: 264px, 236px at medium widths. Both titlebars are 32px. Project identity occupies the second left row. Root and plugin directories share the same column; a text-only horizontal plugin strip has a softly raised selected item. Returning to root preserves the work surface.
- Graphite palette comes from `apps/workbench/src/styles/immersive-navigation.ts`: light paper #fff, navigation #f8f9fb, ink #272932; dark paper #191a20, navigation #15161b, ink #e8e9ee. Purple focus #6262d6 / #a7a6f5. Existing Settings tokens remain unchanged.
- Goal directory rows retain compact text status labels. Graph click selects lineage without changing the document or terminal; a corner button, double-click, or Enter opens work. The initial camera centers the next startable leaf at 100%; explicit pan/zoom and collapse/restore persist.
- Goals open in a fixed 24px-inset frame, 10px on phone. Terminal fills the main area. Conversation is disabled until its actual feature exists. The 300px information/timeline rail can close; below an 840px frame width it overlays the work area. Readers/forms use the available frame space. There is no adjustable 70/30 separator and no top Goal-tab row.
- At 600px and below, the directory is a drawer with an inert background and a focus loop. Selecting a Goal or record closes it. Mobile uses the same full-height workspace, with details available on demand.
- Goals, Sessions, Feed and Artifacts are bundled project plugins. Existing projects retain all four on catalog migration; new projects start with Goals. Market activation is project-local and persistent. Feed owns Inbox and Sources. Artifacts uses the owner-rendered exact-version directory/detail within the stage; downloads preserve their exact version.
- Native drag regions remain in the shell. Packaged macOS titlebar/traffic-light alignment has not been reverified; the 32px web implementation is not proof of a rebuilt native window.
- Evidence: `.impeccable/review/production-*.png`, the implementation progress record, production HTTP/SQLite tests and browser paths. Functional level 3; no release or installation claim.

## Overview

**Creative North Star: "Calm Desktop"**

GoalBoard is a high-frequency personal workbench with a quiet project arrival surface and a dedicated Goal workspace. Its desktop workspace has two stable regions: one graphite directory that owns project and work navigation, and one flexible work surface. Project home can use generous whitespace; opening a Goal brings its current facts and real Runtime into view without duplicating domain state.

The Goal surface uses a neutral dotted dependency canvas. Clicking a compact Goal opens one fixed workspace within the main region: full-height Runtime on the left, collapsible Goal info above the chronological timeline on the right. Event bodies open inside that timeline; configuration and forms temporarily cover the left work area. The existing cool palette, system typography, and restrained spacing remain. The directory changes in place when the user enters Goals or the Feed Workbench. Inbox and Feed remain two presets of the same Item workspace, each with a visible path back.

**Key Characteristics:**

- One desktop directory instead of parallel navigation columns.
- Project-scoped, persistent Goal tabs above the main work surface.
- Goal canvas composition: one fixed expanded workspace, with full-height Runtime beside Goal info and an inline timeline.
- Soft tonal surfaces and calibrated shadows instead of pervasive structure lines.
- Cool monochrome surfaces with a restrained cobalt focus color.
- Compact information density in navigation, with calm reading density in the selected Goal.
- Runtime application chrome follows GoalBoard; only the terminal canvas becomes a distinct execution environment.

## Colors

Project home inherits the immersive workbench's live neutral Light/Dark variables and violet interaction accent from `apps/workbench/src/styles/immersive-navigation.ts`. It adds no separate palette. The cobalt foundation below remains applicable to unchanged Settings and domain-specific components; it does not override the immersive surface's theme.

The palette uses cool neutrals for structure and one low-saturation cobalt for focus, links, progress, and Goal event-document operate cues. Green, amber, and red are reserved for true semantic state. Production tokens live in the visual foundation (`--page`, `--paper`, `--rail`, `--ink`, `--blue`, `--green`, `--amber`, `--red`, `--action`) and resolve in Light and Dark; the Goal event document consumes those variables and does not introduce a second palette.

### Primary

- **Cobalt Focus**: keyboard focus, progress, links, selected timeline rows, owner chips, and Goal event-document primary saves.
- **Deep Cobalt**: accent text that must remain legible on pale surfaces, including secondary event buttons and 完成要求.

### Neutral

- **App Canvas**: the outer desktop and landing-page field.
- **Goal Canvas**: the primary reading, decision, settings, and event-reader surface.
- **Navigator Gray**: the Project and Goal directory surface, and the dotted dependency-canvas field.
- **Desktop Ink**: primary titles, current-summary column copy, and actions.
- **Soft Ink**: explanations and secondary facts.
- **Faint Ink**: the light-theme floor for quiet secondary facts; `#66666f` remains 5.04:1 against the `#f1f1f3` directory rail.
- **Quiet Line**: persistent structural separators, including the workspace toolbar, Terminal boundary, and timeline divider.
- **Terminal Dark / Terminal Light**: curated execution-canvas palettes, independent from the surrounding Runtime application chrome.

**The One Accent Rule.** Cobalt appears for focus, links, progress, selected intent, and Goal event-document save and owner cues. It never becomes a decorative field or a general-purpose card tint. Near-black Action remains the workbench primary for Session, draft save, and other chrome.

**The Semantic Color Rule.** Green, amber, and red always describe real application state and appear with text, never as decoration. Timeline dots use green for result, cobalt for decision, and amber for problem, always with a Chinese type label beside them.

## Typography

**Display Font:** native system UI stack with Chinese-first fallbacks.

**Body Font:** the same native system stack.

**Character:** direct, compact, and platform-native. Hierarchy comes from weight and scale rather than mixing type families or adding tracked micro-labels.

### Hierarchy

- **Display** (710, 27-34px, 1.2): retained large chrome titles. The expanded Goal uses the compact goal-title token; canvas nodes use 16px / 630.
- **Headline** (700, 17px, 1.35): important section statements. Inline timeline event titles use 15px / 1.5; configuration reader headings use 18px.
- **Title** (700, 13-14px): Project names, section labels, and settings headings. Current-summary lead is 13px / 550. Event-form labels are 12px / 550.
- **Body** (400, 13px, 1.52): explanations and document content. Expanded Goal outcome copy uses 13px / 1.7; inline event paragraphs use 12px / 1.75 and wrap within the timeline.
- **Label** (650, 10-12px): tabs, metadata, compact controls, and status text. Timeline titles are 11px / 550 clamped to two lines; time, type, and author are 10px, with tabular time numerals.

**The Native Clarity Rule.** Controls and Goal work use native system typography. Project home alone uses the home-quote serif token for quotations; its date, weekday, calendar, shortcuts and composer remain in the system stack. Monospace remains limited to commands, identifiers, and measured values.

**The Secondary-Fact Floor.** Source, time, filter labels, and other critical secondary facts use Faint Ink or stronger and never render below 9px.

**The Chinese Reading Voice Rule.** Timeline entries and event meta use Chinese type names (当前进展, 进展记录, 配置, 建立目标, 增加关系, 工作记录, 补充说明). Judgments read 报告支持, 尚未达到, or 仍无法判断. Protocol IDs, original record IDs, and criterion IDs stay secondary.

## Layout

Project home's content is centered within an 800px maximum width. The upper date/quotation and calendar region is at most 670px wide; the lower launch region is at most 740px wide and settles near the bottom with flexible space between them. Shortcuts wrap directly above the composer. At a stage width of 640px the layout tightens; at 450px it stacks date/quotation, centered calendar, shortcuts and composer. These are container-width decisions, so resizing the directory produces the same responsive behavior as a narrow window.

On Desktop at 761px and above, the workspace has two regions: a single resizable directory approximately 286-334px wide, and the remaining width as the main workbench. The directory is the only persistent navigation column. A narrow resize affordance sits between the regions without becoming another visual pane.

In macOS Overlay mode, `--desktop-titlebar-height` reserves a 48px native-chrome band. The first row contains the directory toggle and right-side work tabs; the project selector and project-settings control retain their second row. Tauri keeps the native `trafficLightPosition.y = 24px` inset; the packaged window's visible traffic-light center is approximately 22 CSS px. Both sides of the first row use that same visible center, including when the directory is collapsed. Native detection runs before stylesheets load; full-page Desktop navigation and service recovery retain the desktop query. The public Desktop bootstrap reads the real Tauri fullscreen state on page load and resize: the shared leading inset is 88px in a window and 2px in fullscreen, without changing vertical alignment. A maximized window is not fullscreen. The remaining left-side titlebar space and an elastic right workbench track with a 72px minimum may drag the window; interactive controls explicitly remain no-drag.

Project and Global Settings use the same titlebar rhythm: a 48px native band aligned with the right-side title, the existing project-controls row, then one 50px scope heading in the directory. Settings and project-index topbars do not make their outer containers draggable; only plain-text context or otherwise empty spacer regions may drag the window. The directory resizer starts at grid row 2, below the titlebar band, and utility tabs stay on one line. These Overlay rules do not change ordinary Web or the Companion at 760px and below.

The titlebar contains the current project selector, its real project dropdown, and a separate project-settings control. The directory root begins immediately below it with Inbox, Goals, Sessions, Feed, 来源, Promotion, and Visual Workspace, without permanent group headings or a resident search field. Goals and Sessions stay adjacent because they are sibling project work types; 来源 and Sessions are directly enterable directory—detail workbenches. Sessions owns Runtime execution identity, readable execution history, Goal history, and the working-directory choice used to create, link, or hand off work. Connector remains the available capability behind a Source instance. Feed is the complete source-message fact stream, while Inbox only keeps references and internal matters that need intervention, with a visible reason and next step. Promotion and Visual Workspace remain reserved work surfaces and never fabricate items, counts, or working flows. Switching back to Goals restores its selected Goal, reading state, open Goal tabs, and canvas view; Terminal ownership remains with Work.

A Session detail reuses the compact metadata → title → actions → main work surface order. Runtime, Session ID, state, the two primary actions, and the visible Level 2 demo boundary stay above the work surface without becoming a separate marketing Hero. Project, current Goal, workspace, Goal history, archive, and compatibility facts live in the contextual rail. Execution content owns the flexible majority of the desktop stage while Goal history remains visible beside it; at 760px and below, the detail stacks execution before Goal context and identity. Handoff requires a current Goal and always creates a new destination Session. Narrow-screen actions provide at least 44px touch targets.

Project is the global scope selector, not one side of a Project / Sessions switch. Inside a selected project, Goals and Sessions are sibling entries in the same root directory. 工作目录 is a Session launch and relationship attribute, not a standalone workbench module: users choose it while creating, linking, handing off, or editing a Session. Entering Sessions keeps the project selector and project workbench chrome, replaces the left root with a returnable Session directory, and opens the selected work record on the right. The Session detail uses a chronological execution timeline for dialogue, tools, status, artifacts, and terminal evidence, while keeping current relations and Goal history visible. Global compatibility `/sessions` and `/workspaces` routes return to the project index; both project-prefixed compatibility routes open the Sessions directory.

Sessions inherits the existing Goal list / Goal Detail layout contract instead of defining a parallel management system. Its subdirectory uses the same compact heading, tool rhythm, row hierarchy, flat selected location, and focus behavior as the Goal Tree; its detail uses the same page background, title scale, metadata/action hierarchy, related-paper work surface, and contextual rail. Working-directory selection appears only inside Session creation, linking, handoff, and relationship controls. Root entries never expose browser link underlines, and every return affordance uses a left arrow because it moves back to the project root.

Entering Goals replaces the root directory in the same column with the original Goal Tree. Parent-child expansion, status filtering, creation, list/canvas navigation, archive, and trash remain available through a compact heading and on-demand tools. Entering Inbox or Feed replaces it with the same Item directory: Inbox preselects `Inbox Message`, Feed preselects `Feed`, and either view may change source, disposition, search, or sort. Search and one filter trigger share a single compact row; source, status, and sorting progressively disclose in a Goal Tree-style anchored panel instead of standing native selects. Every subdirectory has a visible back action that returns to the root.

The project Goal canvas shows the real dependency graph. Arrows run from provider to consumer; parent membership is a separate 属于 label. Completed nodes remain visible with a quieter fill. Users pan empty space, drag compact nodes, zoom, or fit the whole graph; these are local view changes. Clicking a node or list entry opens the same Goal. The canvas does not edit dependencies or dispatch work.

**The Account Footer Rule.** The directory footer stays pinned to the bottom and shows the local identity and local-space state. In the immersive workbench, its own styles apply at every width, including the mobile drawer: name and space stay on separate lines, the link uses the current theme's ink without an underline, and the centered avatar and Settings icon keep their dimensions while long text shrinks and truncates within its own column. Its Settings control always enters global settings. Project settings remain beside the project selector at the top, so project scope and device scope cannot be mistaken for one another.

The right workbench begins with project-scoped work tabs. Opening a Goal creates or reuses its tab; the current project may retain at most eight Goal tabs in local device storage. Closing an inactive tab only removes it, while closing the active tab selects an adjacent Goal and preserves at least one displayable Goal. Switching projects restores that project's own tab set. Goal selection continues to use the existing asynchronous document loading, history, write actions, and Goal-bound Runtime.

An expanded Goal is fixed inside the main canvas region with an 18px frame and an upper-right 收起 action. It cannot be dragged. Only one Goal is expanded at a time; closing restores the camera and compact-node positions. The left side defaults to 70% and contains full-height Runtime; the right 30% contains collapsible Goal info above the timeline. The 6px separator supports pointer dragging, Left/Right keyboard adjustment, and Home to restore 70%. The share is stored locally by project and Goal and clamped to available width. Goal info, Runtime, and timeline keep separate scrolling boundaries. Runtime stays in the full-height left grid cell at intermediate desktop widths, including 761–1180px.

At 760px and below, the frame is 10px and the work area stacks foldable Goal info → Runtime → timeline. Goal info starts folded with the Goal title visible; its expanded body is bounded to 240px; the regions remain scrollable and the work area scrolls to reach them. The desktop divider is hidden. A reader or form covers the full work area on mobile.

记录模板, 目标与要求, 完成要求, and event forms share one temporary reader over the left Runtime area. 返回工作区 closes it. The desktop timeline stays visible and interactive; covered Runtime controls are inert; visible Goal info remains operable. At 760px and below the overlay also covers Goal info and the timeline, both inert until return. Focus enters the active reader/form and returns to a visible trigger. Reader/form states remain exclusive, including the untransferred 使用事件记录继续 form; long content scrolls within the reader.

目标与要求 opens a temporary reader with six peer tabs: 基础信息, 历史覆盖, Goal 关系, 风险, 影响范围, and 工作规则. 基础信息 reads as a lead outcome, supporting explanation, then compact scope facts. Section titles use the existing Lucide icon well and a short tag, not a stack of plain labels. 历史覆盖 holds retained parent/child Contract coverage. Coverage cards use theme tokens instead of a light paper inset. The other four tabs reuse the existing factor workbenches. Untransferred drafts retain their editor; event-owned Goals change agreement through 记录模板 → 修改当前约定. 完成要求 shows current event requirements as the live authority, then read-only 原 Goal 标准 and exact Artifact versions. Original criteria never become another completion algorithm.

Project Settings and Global Settings reuse the same single-directory / work-surface language. Project Settings contains the current project's Work Rules and Work Planning; Global Settings contains device-level Appearance & Language, AI & Execution Tools, and Diagnostics. Headers, directory labels, close/return behavior, and explanatory copy state the active scope.

At 760px and below, the shell still moves between the root, current list, and its work surface. Goals preserves a path back to its list; the expanded work area contains foldable Goal info, Runtime, and timeline together. Feed keeps its Item / Detail navigation. Browser Web and Desktop share the adaptive DOM; native traffic-light spacing, drag regions, and Tauri abilities remain platform-specific.

**The One Directory Rule.** The root modules, Goal Tree, Feed Item list, Sessions, and settings navigation all use one left directory; project context belongs to the titlebar. Goals, the Feed Workbench, and Sessions replace the root only while active, and their back action restores it. Working-directory choice stays inside Session actions rather than becoming another root module. Never add a second persistent navigation column.

**The Project Tabs Rule.** Work tabs belong to one project, reuse existing Goals, persist locally, and never become a second source of Goal truth.

**The Native Chrome Safe-Zone Rule.** In macOS Overlay mode, reserve the 48px titlebar band and calibrate native traffic-light inset against the visible center of the left project controls in a real packaged window. Collapsing the directory preserves that same inset before the reveal control and expands the collapsed rail just enough to contain it; work tabs begin after the rail. Only empty or plain-text titlebar regions may drag; tabs, buttons, interactive containers, and the resizer never overlap the traffic lights or inherit drag behavior. The directory and work surface separate through a quiet tonal shift, never a full-height border or standing shadow; the resize gutter only appears on interaction.

**The Compact State Tag Rule.** A Goal state is one visual tag. Directory layout wrappers may place the tag but never draw a second border or background around it, including under compact-density overrides.

**The First-Viewport Rule.** Project home is the daily arrival surface. Entering Goals shows the dependency canvas; opening a Goal keeps current facts, the explicit Terminal entry and timeline together according to the current workbench frame. The disabled home composer never replaces the Goal's working Runtime.

**The Current-Summary Rule.** Goal info reads live `readState`, including requirement support, concerns, and pending decisions; it does not recompute completion. Selecting history only changes its inline event body. Neither absent activity nor missing requirements proves work has started.

**The Fixed Workspace Rule.** Compact nodes are draggable; the expanded workspace is fixed. The Runtime and Goal-info/timeline split remains through 761px and stacks at 760px. Collapsing restores the prior camera and node layout.

**The Reader Presence Rule.** Readers and forms occupy the left work area one at a time. Covered controls are inert. The visible desktop timeline stays operable; the mobile timeline is inert under the full-area overlay. Returning restores the workspace and focus.

## Elevation & Depth

Project home stays open and flat around the date and calendar. Its disabled composer uses one faint structural shadow (`0 4px 16px color-mix(in srgb, var(--ink) 5%, transparent)`), while the shortcut editor is a modal above the work surface. Shortcuts use quiet circular icon grounds, without card containers or raster imagery.

The system uses shallow, persistent layering. The directory and workbench separate through quiet tone; compact location states stay flat. The expanded Goal has a low structural shadow over the dotted canvas. Its Goal info popover has a 12px corner and shallow shadow, the timeline uses a light rail/paper mix, and the selected event row uses cobalt-soft. Hairlines mark the toolbar, Terminal boundary, inline event rail, and adjustable divider. Dark uses the same semantic variables and geometry. Menus, dialogs, and unrelated contract panels retain their existing low shadows.

**The Soft Layer Rule.** Use a low shadow to separate one meaningful navigation or content level, not to make every row float.

**The Flat Location Rule.** In Light, a control that only answers “where am I?” never uses a paper fill plus exterior shadow. Use stronger text with either one quiet tonal fill or a two-pixel bottom marker; reserve elevation for content and overlays.

**The Line Rationing Rule.** A border must explain state, grouping, or interaction. Do not outline every item or split the entire workspace into a management-grid skeleton.

## Shapes

The home composer uses the softly rounded home-composer token and a single-line input within a 76px-high surface, reduced to 70px on narrow stages. Shortcut icons sit in 43px circles; the editor uses a 15px corner and stays inside the viewport. These home shapes do not change Goal state tags or ordinary form controls.

Compact controls use 6–8px corners. Existing project selection and settings retain their rounded controls. Compact canvas nodes use 12px corners; the expanded Goal uses 14px on desktop and 10px on mobile. Goal info is a compact 12px rounded popover inspired by the approved Codex environment-info reference. Timeline rows and event buttons use 6px corners, event-form fields 5px, and timeline markers remain small circles on a thin rail.

Goal state is always a compact bounded tag: 5–6px corners, a one-pixel semantic border, a quiet semantic tint, a Lucide icon, and readable text. Tags are labels rather than pills; they never use a full-radius capsule and never rely on color alone.

Relationship records use one stable reading grid: bounded relation type, leading Goal title with quiet ID/path/reason text, compact lifecycle state, then the secondary action. The metadata remains ordinary text—not a stack of full-width chips—and every repeated row shares the same title, state, and action columns. At the narrowest content width the action moves below without changing semantic order.

## Components

### Project Home

The date, quotation and month calendar provide quiet local context. The calendar starts on Monday, offers previous/next month controls and marks today; it contains no schedules or task counts. The quotation collection retains the three original sourced passages and appends all ten Adeptify English originals with their original attributions, for 13 total. The migrated text remains English in the Chinese interface. All attributions use quiet 11px text; the original three source links remain, while migrated attributions are plain text without added citations or a claim of independent verification.

Quotations rotate every five seconds with a half-second fade in each direction. All pages share one grid cell, reserving the natural height of the longest content at the current width with a 112px minimum, so complete wrapping does not move the date, calendar or launch area during rotation. Inactive pages stay in layout with hidden visibility, `aria-hidden` and `inert`; they never use `hidden` or `display: none`. Only the outer quotation group fades. Descendants have no transitions, preventing inherited reduced-motion rules from animating visibility. There are no quote buttons. Hover or focus pauses rotation; hidden pages and inactive home surfaces do not advance it; reduced motion changes the text directly.

Shortcuts begin empty with an Add shortcut action. Each user-created link has a plain-text name, a shared Lucide link icon and a separate edit action. The modal supports add, edit, remove and cancel; validation and storage failures keep the entered form visible. These are project-local device preferences, restored from localStorage, never Goal records or synced project content. Web opens validated http(s) links in a new page; macOS uses the system browser through the native external-link channel.

**The Home Agent Availability Rule.** Both the home input and send button are natively disabled and accompanied by “Agent 尚未开放”. They do not capture drafts, accept input, send messages or imply a working Agent Harness. Goal work keeps its existing explicit terminal entry and ownership rules; Conversation stays disabled until that feature is implemented.

### Buttons

- **Workbench primary:** near-black fill in Light, near-white fill in Dark, 8px corners, 34-38px height, short stable one-line label. Session “加载原 Session” and untransferred 保存草稿修改 keep this Action fill.
- **Goal event primary:** cobalt fill, white label, 6px corners, 31px height. Used for 登记到当前 Goal, 记录到进展, 保存约定, 提交收尾, and other event-document saves.
- **Goal event secondary:** cobalt-soft fill and deep-cobalt text for secondary form actions. Goal info uses quiet text links; the timeline has one Add entry disclosure with explanatory choices.
- **Ghost / text:** transparent at rest; event text buttons (完成要求 and 返回工作区) use deep cobalt without a chrome fill.
- **Hover:** a small opacity change and one-pixel upward translation on Action primaries; event buttons keep the same compact geometry.
- **Focus:** a two-pixel cobalt outline with a two-pixel offset.
- Dynamic Goal titles belong in surrounding copy, `title`, and accessible names, never in the visible button.

### Inputs / Fields

- **Style:** white or dark-canvas fill, one-pixel structural border, 5-8px corners, no inset shadow. Event-form fields use 5px corners and 8px 9px padding.
- **Focus:** cobalt outline independent of the border so keyboard focus remains obvious.
- **Placeholder:** visibly secondary but still readable.
- **Mobile event forms:** 16px input text; helper copy stacks above a full-width primary. Type editors show 字段名, then 内容形式 / 必填 / 移除; IDs are hidden tokens. Empty-field submit is blocked in the client.
- **Error / conflict:** field errors sit on the control; version conflict uses a quiet red-soft panel and keeps the user’s input for an explicit retry against the current versions.

### Navigation

- The Desktop titlebar begins with project selection and project settings; the directory below changes in place between root, Goals, and the Feed Item list, and ends with the pinned local identity / global-settings entry.
- The root order is Inbox, Goals, Sessions, Feed, 来源, Promotion, and Visual Workspace. It has no permanent group labels or search bar; Goals and Sessions stay adjacent as sibling project work types, while 来源 and Sessions are direct directory—detail workbenches. Working-directory choice lives inside Session actions.
- Inbox and Feed open the same Feed Workbench. Inbox presets `Inbox Message`; Feed presets `Feed`. Entering either replaces the root directory with the Item list, and Back restores the root.
- Goal decisions and recent decision results appear as labeled `Inbox Message` rows. A pending decision opens the existing real form in the detail surface; a result opens its authoritative event record and Goal links.
- Promotion and Visual Workspace remain reserved locations. Their empty states explain that entities and workflows must be defined before real content appears.
- Goals opens the existing Goal Tree in the same directory. Its heading owns the back action and compact tools; the tree retains its real hierarchy and state.
- In Light, selected directory items use a quiet flat tone and stronger text; hover uses a lighter transient tone. Neither state lifts above the directory. Dark may use its theme-appropriate paper tone without changing dimensions.
- In ordinary Web, the same compact project selector, single directory, project tabs, and work surfaces remain in place; responsive CSS folds Goals into Companion navigation and Feed into Item / Detail switching below 760px.
- Goal titles, child progress, dependency health, and status tags form four distinct reading levels; no metadata uses an inaccessible faint tone.
- Compact parent progress uses a short accessible line instead of another text badge.

**The Directory Ledger Rule.** Goals, Inbox, Feed, and 来源 share one row grammar: one leading hierarchy/type position, one flexible content column, and one stable trailing state column. The title owns the first line; identifiers, progress, source, time, and dependency health share a compact secondary line. Resting rows keep stable heights and column lines; selected, hovered, and focused rows keep identical dimensions. In Light, the selected row is a flat cobalt-neutral tint without exterior shadow. Goal rows use a 40px resting rhythm, and dependency detail adds height only after explicit expansion.

**The Source-in-Context Rule.** Inbox and Feed rows always retain a visible source fact, even when the Item comes from GoalBoard itself. The 来源 workbench uses the same title, secondary-fact, and trailing-state hierarchy; its detail owns overview, configuration, pull schedule, source messages, and run state. Adding a source, binding an account, or migrating Relay may use a focused dialog, but browsing and managing an existing Source never depends on that dialog. Connector remains the capability and Source remains the configured instance.

**The Attention Boundary Rule.** Feed is complete and append-oriented; Inbox is selective and action-oriented. An Inbox row must say why it needs intervention, which Feed Item, Source, or Goal it references, and what the next real step is. Completing it removes it from the default Inbox without deleting or copying the referenced object.

### Feed Workbench

The Feed Item directory keeps its tools above the list: one search field, then type, source, disposition, and sort controls. Inbox and Feed change the initial type and handling language, not the underlying workspace: Inbox offers Archive / Restore to Inbox, while Feed offers Ignore / Restore to Feed. Filters and status labels always follow the active type. Each row keeps type, source, title, summary, time, and readable state compact enough to scan; an empty result offers a direct reset.

The right surface is dedicated to the selected Item. It shows type and disposition labels, source and author, timestamp, summary or body, tags, original link, and attached materials. Actions remain beside the Item: save as material, promote to Goal, start processing, ignore, restore, or open the already linked Goal. Missing body, link, or materials use honest empty states.

来源、Feed 与 Inbox 的详情共享 Goal Detail 的工作面层级，但不共享同一内容顺序：来源使用身份页头 → 紧凑分段导航 → 单一配置工作面；Feed 使用单一 paper 阅读面并让标题、摘要和正文优先；Inbox 在同一工作面中把现有操作和“下一步”置于进入原因、关联对象与原消息正文之前。详情容器使用相关 paper 色、14px 圆角和低阴影，内部以分隔行组织，不为去向、事实或资料再套卡片。目录选择仍遵守 Flat Location Rule，只用平面色调，不使用外部阴影。

Relay ownership migration is a user-confirmed local operation. Its dialog previews Source, Item, and Material counts, keeps Relay read-only, and explains that GoalBoard takes over every usable Feed asset: source definitions, Items, Materials, cursors, run history, decryptable GitHub/Gmail credentials, and retained encrypted bodies. Secrets and bodies are re-sealed into GoalBoard-owned stores; the interface must never expose token values or imply that ongoing synchronization still depends on Relay. Source and Relay dialogs belong to the workspace overlay layer, so the active work surface or narrow Item-list mode cannot hide them; below 760px they remain contained inside the viewport. The source manager is the durable control surface for adding public feeds, connecting GitHub/Gmail accounts, reading status and failures, and manually synchronizing, pausing, or resuming each source.

Promote and Start create or reuse one Draft Goal and bind the Item as its input. Start moves into that Goal's Runtime. If no TUI is open, the Runtime picker stays visible; after the user chooses one, source, body, and material context is filled into the terminal without being sent. All source-derived content stays inside a visible untrusted-data boundary and terminal control characters cannot become input actions. This preserves Goal ownership and gives the user a final review point.

### Project Goal Tabs

- Tabs are isolated by project, restored from local device storage, and capped at eight.
- Opening the same Goal focuses its existing tab. Opening a ninth Goal retires an older inactive tab rather than overflowing indefinitely.
- In Light, work tabs stay flat inside the workbench bar: the selected tab uses stronger text and a two-pixel bottom marker rather than a white fill or exterior shadow, while inactive hover uses only a faint transient tone. Dark keeps its theme-appropriate paper surface; status remains readable through its dot and the Goal content itself.
- The close action is separate from the tab button. Closing the active tab selects a neighbor and never removes the last displayable Goal.
- The tab strip uses complete tab semantics and disappears in the narrow Companion.

### Native Window Chrome

- First-run and update Onboarding use a compact 44px native-only topbar with an 88px leading safe area and a 1px optical lift. In the packaged macOS App, the brand and right-side actions align with the visible traffic-light center. Both pages reuse the Desktop bootstrap before styles load; ordinary browser/mobile topbars keep their existing dimensions. Do not move the system buttons to compensate for page layout.
- macOS Overlay uses a fixed 48px titlebar band, with the directory toggle and right-side tabs/titles centered at approximately `y=22px`. Project controls retain their existing second row. The shared native inset follows actual fullscreen state (88px window / 2px fullscreen), including full-page navigation; never infer it from viewport width.
- The workbench bar contains tabs, one dedicated empty 48px drag slot, and actions. Utility tabs stay on one line.
- Whole workbench, project-index, and Settings topbars are never drag regions. Only empty spacers or plain-text context may carry window drag behavior.
- The directory resizer begins below the native titlebar at grid row 2 so resizing and macOS traffic-light interaction never compete.
- Ordinary Web and the Companion at 760px and below retain their existing chrome and structure.

### Goal Canvas and Expanded Workspace

Compact nodes show a readable title, outcome, status, and parent membership when present. The node itself opens the Goal and supports keyboard activation; dragging changes only local layout. Dependencies are provider → consumer paths and completed nodes remain visible. The canvas becomes inert while a Goal is expanded; 收起 restores the view and focuses its compact node.

Goal info shows the outcome, live progress, requirement support, and pending decisions. Its footer offers Goal and requirements plus a more menu for record templates and lifecycle actions. The timeline exposes one Add entry disclosure with explained choices for a note, progress update, or issue. Set as current Goal is removed. Folded info retains the Goal title and status.

The timeline is latest-first and grouped by day. Entries show time, title, Chinese type, author, and relevant state. Results, concerns/blockers, pending decisions, decision outcomes, and ordinary records stay in one chronology. Selecting an entry expands its original body immediately below it; selecting it again can collapse the body. Arrow keys move between entries. 查看更早记录 loads earlier history with failure/retry feedback. There are no result/decision filters or separate event-body column. Historical Run / Evidence / Review / Decision keep original IDs and sources.

目标与要求 uses six compact peer tabs inside the reader: 基础信息 / 历史覆盖 / Goal 关系 / 风险 / 影响范围 / 工作规则. This is not primary workspace navigation. The default tab is 基础信息, with a lead / explanation / facts reading order. Historical Contract coverage has its own tab. 工作规则 uses grouped settings rows like Cursor / Codex preference pages: current effective values, then Goal extras with a dropdown, switches, and compact numbers on the right. Risk/relation deep links reveal the corresponding tab.

### Runtime

The Goal Runtime occupies the full-height left column. Its duplicate owner header is hidden; tabs, parent guidance, child choices, and controls use GoalBoard application colors and system typography. Work owns separate Goal terminals; selecting, expanding, or collapsing a Goal does not launch a Runtime, send input, destroy a process, or rebind an existing terminal. Users explicitly add or start a terminal. The unopened state says 还没有终端. Parent guidance and child choices remain flat rows separated by lines.

Event-owned Goals, including parent Goals that record their own integration, keep the executable Runtime surface. Switching Goal does not rebind an already open terminal and never auto-sends. Untransferred `closed_compound` Goals without event ownership still use the parent-read-only terminal guard: add/open controls stay disabled on that Goal, and the user enters a child Goal to execute. Child-count is not a completion algorithm, and the event document does not hide Runtime because a parent is compound.

Only the bounded terminal canvas uses terminal tokens. The local terminal appearance preference offers Follow interface, Light, and Dark. It is applied before first paint and updates live xterm background, foreground, cursor, selection, and ANSI colors without reloading. Terminal Dark uses `#101012`, `#f0f0f2`, `#b5b5bd`, and `#92929b`; Terminal Light uses `#fbfbfc`, `#202023`, `#65656e`, and `#7b7b84`.

### Settings

Desktop settings reuse the same single directory, local-identity footer, flat Light current-location treatment, and soft content section panels as the Goal workspace. Project Settings is reached beside the project selector and only contains Work Rules and Work Planning for that project. Global Settings is reached from the pinned footer and only contains Appearance & Language, AI & Execution Tools, and Diagnostics for the current device. Ordinary Web settings retain their existing shell.

## Do's and Don'ts

### Do:

- **Do** establish hierarchy with proportion, alignment, and whitespace before adding a container.
- **Do** keep project, module, Goal Tree, and settings navigation in one replaceable directory.
- **Do** preserve project-local Goal tabs as UI state, never canonical Goal state.
- **Do** reserve the 48px macOS Overlay safe zone and limit window dragging to empty or plain-text titlebar regions.
- **Do** distinguish project settings from global device settings at their entry, directory, header, and content.
- **Do** use tonal surfaces and low shadows to reduce the need for structure lines.
- **Do** keep full-height Runtime visible beside Goal info and the timeline.
- **Do** keep the selected Goal continuous across its list entry, canvas node, workspace, and owned Terminal.
- **Do** keep Goal info on live `readState` while history selection changes only its inline body.
- **Do** keep the 70/30 desktop split adjustable and locally persistent, including intermediate widths.
- **Do** open 记录模板 / 目标与要求 / 完成要求 over the left work area with 返回工作区, and remove covered controls from keyboard focus.
- **Do** preserve the cool-neutral palette and reserve cobalt for interaction, focus, and event-document operate cues.
- **Do** keep Promotion and Visual Workspace visibly labeled “规划中” and limited to honest reserved views until their real entities and flows exist.
- **Do** test Light, Dark, Standard, Compact, Runtime-open, narrow states, and both terminal palettes together.
- **Do** keep every mobile workspace surface full width and free of horizontal viewport escapes.
- **Do** let users switch 目标与要求 tabs without scrolling past unrelated content, and reveal the correct tab before honoring a deep link.

### Don't:

- **Don't** add a second persistent navigation column or repeat project context across the shell.
- **Don't** restore permanent search, group headings, and tool blocks at the root directory.
- **Do** keep the existing Goal search usable inside the Goals drill-down. GW5 restored the search field above its compact toolbar after real browser tests found it hidden by desktop CSS; this does not add search to the root directory or change the visual direction. Desktop and 390px captures were inspected; details and evidence are in `specs/goalboard-architecture-reorganization/gw5-progress.md`.
- **Don't** let open Goal tabs grow without limit or leak across projects.
- **Don't** place tabs, buttons, or the directory resizer in the traffic-light safe zone, or mark an interactive topbar container as draggable.
- **Don't** replace an opened Goal's current facts, timeline or real Runtime with project-home whitespace or its disabled composer.
- **Don't** present reserved placeholder views as working modules or fill them with fake content, counts, or activity.
- **Don't** treat the Goal Tree or an AI chat homepage as the entire application.
- **Don't** restore five Goal tabs (概览 / 完成要求 / 进展与阻塞 / 关联与约束 / 完整记录) as the selected Goal’s primary navigation.
- **Don't** let 目标与要求 or 完成要求 share the reader with 使用事件记录继续.
- **Don't** restore result/decision filters, a separate event-body column, or exclusive Goal Focus/Runtime panes.
- **Don't** drag an expanded Goal or represent parent membership as dependency arrows.
- **Don't** treat 原 Goal 标准 as the live completion authority; current requirements and `readState` own that reading.
- **Don't** use protocol identifiers (`report`, `goal.created`, English verdicts) as the primary timeline or event explanation.
- **Don't** blur project-setting and global-setting scope.
- **Do** treat an explicit “加入组合” click as the project-adoption confirmation and send it to the existing guarded API. GW5 repaired the missing client field; it did not weaken the server check or auto-adopt methods. Real failed/retried saves, independent personal/project versions and desktop/390px captures were verified; no visual redesign was made (impeccable harden).
- **Don't** force the Desktop two-pane arrangement into the narrow Companion; Feed must switch between Item and Detail.
- **Don't** turn unrelated filters and navigation into segmented pills; keep grouped controls limited to choices that belong together.
- **Don't** stack unrelated detail sections into one unbroken page or give every nested content block another decorative border.
- **Don't** make status colors decorative or rely on color without text.
- **Don't** copy YouMind's product IA, content cards, branding, or imagery.
