Current workbench direction (2026-09-12): see `.impeccable/surfaces/immersive-workbench.md` and `specs/immersive-workbench-implementation/spec.md`. The older shell/Goal layout below is historical; retained feature ownership remains applicable.

Scope and mode: Molis Work V1 local Web application, Operate mode. Goal canvas workspace, updated 2026-09-12.

Audience and job: users need to see what each Goal produces, which Goal consumes it, and work on one Goal while keeping its current facts, terminal, and history together.

Direction: retain Calm Desktop and the single project/list directory. The accepted Goal surface is the user-pinned code-led evolution `seed=user-goal-canvas-workspace-2026-09-12`: neutral dotted canvas, existing system fonts and Lucide icons, semantic state colors with text. Earlier Goal railway/status-rail comps are superseded; no new comp round or demo edit is needed.

First viewport: the left project and Goal list remains. The main region shows the dependency canvas. Clicking a Goal node itself expands one fixed workspace with an 18px breathing frame and an upper-right 收起 action. Left default 70% is full-height Runtime; right 30% has collapsible Goal info above the latest-first timeline. The 6px separator supports pointer/keyboard adjustment and persists locally by project and Goal. At intermediate desktop widths Terminal remains in the grid.

The signature: compact nodes can move; the expanded workspace cannot. 收起 returns to the previous camera, zoom, and compact-node positions. Provider → consumer arrows represent dependencies; 属于 labels express parent membership. Completed nodes remain. Pan, zoom, fit, and local node placement never change business relations or dispatch work.

The collapsible Goal info popover shows the outcome, live progress, requirement support, and pending decisions. Record templates move into the more menu. The timeline exposes one Add entry disclosure, explaining note, progress update, and issue choices before opening existing forms. Set as current Goal is removed. Events retain inline bodies and real pagination/retry paths.

Readers and forms temporarily cover the left Runtime area with 返回工作区. Covered controls are inert and focus enters the active content; the visible desktop timeline remains interactive. At ≤760px, the frame is 10px and foldable Goal info → Runtime → timeline stack with scrollable regions. The reader covers the whole work area and also makes Goal info and the timeline inert. Returning restores visible-trigger focus.

Work retains separate Goal terminals. Opening, switching, expanding, or collapsing a Goal never starts a Runtime, sends input, destroys its process, or rebinds another Goal's terminal. Only explicit user actions open/start a terminal. An unopened Terminal shows its honest empty state.

Proof/content: real Goal state and existing APIs; no second completion calculation or domain state. The current canvas delivery is Level 3, functional locally. Independent visual review disposition: ship after the intermediate-width Terminal and covered-panel focus fixes. Installation, packaging, and release were not validated. Acceptance and test evidence remain in `specs/goal-canvas-workspace/spec.md`.

Visual evidence: `.impeccable/review/desktop.png`, `desktop-dark.png`, `mobile.png`, `canvas-overview.png`, `user-1024.png`, `user-1024-reader.png`, and `mobile-reader.png`. These are review screenshots, not shipped raster assets. Source authority is `apps/workbench/src/goals-page-renderer.ts`, `apps/workbench/src/styles/goal-canvas.ts`, and the Goals event-document / momentum UI and clients. Existing Feed, Settings, Sessions, and native-chrome directions remain unchanged.

## Information Stream Workbench direction — approved 2026-08-30

Approved structural comp: `.impeccable/mocks/decision/feed-dispatch-ledger.png`.

The selected direction is the Dispatch Ledger because its light stone directory,
compact repeated rows, continuous work surface, horizontal item actions, and
structured source/context rail fit Molis Work Calm Desktop more closely than a
full-height dark console. Goals, Inbox, Feed, and Sources share one directory
shell: the same heading, search and on-demand tools, row rhythm, selected state,
keyboard movement, and detail linkage. Their row slots remain semantic: Goal
shows status/progress, Inbox sender/subject/reply pressure, Feed source/summary,
and Source connector/sync health.

The comp is structural rather than literal. Reduce its persistent grid lines and
large outlined containers in favor of tonal separation, paper-toned selection,
and low local shadows. Keep selected Item titles within the established desktop
21–28px range. The primary action uses the existing near-black fill; cobalt stays
reserved for focus, links, progress, and selected intent. The directory and work
surface separate by quiet tone and the resize affordance, never a standing heavy
border. Generated content, counts, dates, and provider state are not product facts.

Information ownership remains: Connector is the provider capability, Source is
the concrete configured origin, and `inbox_message` / `feed` are the two Item
responsibility modes. The user-facing management surface is named “来源与连接”.
Relay is migration-only and never a runtime dependency.
