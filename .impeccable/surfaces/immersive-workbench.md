# Immersive workbench — current built world

Updated 2026-09-16. Mode: **Operate**. Latest interaction authority: **v15 Linear default density**, retaining v12 surplus-gap reductions, v11 continuous workspace and attached editors, retaining v10 Goal form panels, v9 settings editing, v8 long-detail reading, v7 low-height adaptation and v6 attention continuity in [Whole-product interaction redesign](../../specs/product-interaction-redesign/spec.md), with its [inventory](../../specs/product-interaction-redesign/inventory.md) and [progress](../../specs/product-interaction-redesign/progress.md). Retained pane and global-settings authority: [Workbench panes redesign](../../specs/workbench-pane-feed-redesign/spec.md). Retained change authorities: [Coss workbench redesign](../../specs/coss-workbench-redesign/spec.md) for the retained workbench and [Project settings redesign](../../specs/project-settings-redesign/spec.md) for the independent preferences world (`project-settings-v2`). [DESIGN.md](../../DESIGN.md) owns the current token vocabulary and visual rules; [PRODUCT.md](../../PRODUCT.md) owns domain behavior and product facts. This record replaces the former sequence of conflicting visual addenda.

## Long-detail reading update

Inbox keeps a modest title/context reader and fixed processing footer. Artifacts separates title, scrolling facts/raw content, and export in both workbench and direct version views. Session is a continue cockpit: compact identity/actions, a relations rail, and a main column that shows a capability state or a scrolling timeline. Search and filters appear only after execution events load. Light/dark, 1024×400, 390×500 and 1280×900 bottom split evidence: `.impeccable/review/long-content-v8/`. Domain contracts, exact versions, source retention, and Runtime authorization are unchanged.

## Goal form panel update

Goal forms have fixed heading and feedback/actions around an internally scrolling body; the duplicate detail toolbar hides while editing. Note/progress/concern, decisions, closure/resume, agreement and template/requirement forms share this structure. Pending writes block duplicate submission and local panel switching, preserve the existing idempotency contract and restore controls after failure. Low-window/narrow evidence: `.impeccable/review/goal-forms-v10/`.

## Continuous surface update v11

Goal work and records share the pane’s paper surface. New Goal, Feed task configuration, Session add/relations and Frame picker are temporary right-edge editors beginning below the 44px tabs: `min(560px, 100vw)` wide, the full remaining viewport height, and full width at ≤760px. They have square edges, no shadow and a 10% theme-ink backdrop without blur. Native dialog semantics still protect focus and preserve Escape/Cancel return; the visually continuous treatment does not remove modality.

Each editor keeps its header/footer outside scrolling fields. The inner Goal creation shell is also square and borderless; its body groups fields at the top with 12px gaps, leaving extra height below the content. Session labels are 13px, fields 14px and help 12px; mobile fields use 16px type and relevant actions retain 44px targets. Feed input/select focus uses the shared 2px outline with 2px offset and no halo. Search and confirmation prompts retain compact 8px surfaces with restrained shadows; real canvas nodes remain spatial cards.

## Information density v12

Reduce surplus layout space before reducing type. Feed keeps 14px titles/12px summaries in 88px minimum rows. Settings widens to 920px with 24px top padding and 14px row padding. Editors group fields with 12px gaps, pair short Session selectors on desktop, and stack them on narrow screens; Goal optional sections use 44px summaries. Reading headings use 18–20px while body copy remains readable. Mobile 16px inputs and 44px actions are preserved. Current screenshots: `.impeccable/review/density-v12/`; current verification is recorded in the task progress.

## Linear default density v15

Desktop default is Linear tool density, not a compact-mode opt-in. Directory chrome is one 36px row; plugin/Goal/Session/Feed rows are 28px; two-line directory objects are 36px; tabs 32/26; shared controls 28px; reading titles 14–16px. Settings documents are exempt: 28px titles, 10px rows, 36px category nav and grouped white cards on a page canvas. Default sidebar is 240px, or 220px at ≤1050px. Narrow/coarse targets stay 44px. Home’s poetic composition, canvas node geometry, terminal type and domain contracts stay as they are. Density layer: `apps/workbench/src/styles/linear-density.ts`, last in the workbench/settings sheets. Contract: [Linear workbench density](../../specs/linear-workbench-density/spec.md). Feed list rows: [Feed stage list row](../../specs/archive/feed-stage-list-row/spec.md). Settings Codex rhythm: [Settings Codex surface](../../specs/settings-codex-surface/spec.md).

## Current composition

The user authorized a full interface redesign, with the latest direction explicitly naming Linear × coss.ui and reducing the overall floating-dialog appearance. The built result uses neutral Light/Dark surfaces, fine boundaries, compact controls, clear reading hierarchy and short feedback. Existing domain functions and relationships remain owned by their original modules. No new UI framework was introduced.

- Shared foundation: 8px control corners, square continuous work/editor surfaces, 12px canvas nodes, 28px shared controls; near-black primary in Light and near-white in Dark. Active directory rows stay flat; active work tabs join paper without shadow.
- Shell: a full-width 32px titlebar over a 48px plugin icon rail, a current-plugin directory (240px, or 220px at up to 1050px), and a flexible stage. Existing saved directory widths remain valid. Pointer/keyboard resize and double-click reset remain available. Home and the plugin market leave the second column closed.
- Top chrome: 32px work bar with 26px Chrome-style tabs. Project switching, search and project settings sit in that same row, spanning the plugin rail and directory; the rail, directory and stage share one top edge below it. Notification placeholders and the top-right theme shortcut are absent; appearance settings retains theme control.
- Low-height adaptation: Session dialog headers and footers stay visible while fields scroll; mobile form height follows the dialog content box. The directory middle (plugin sections) is the single list scrollport, without a visible scrollbar, while project and account chrome stay outside. Verified at 1024×400 and 390×500 in `low-viewport-v7` evidence.
- Directory: the second column shows only the current plugin’s list, or global settings when the rail gear is active. Plugin title and actions stay stacked. The list is the single scrollport, without a visible scrollbar. The plugin rail holds Home, enabled plugins, market, then a settings gear above the account avatar. Goal and Session rows are 28px and use compact text status without nested tag borders. Goals directory actions are New Goal with the status filter on its right; the live tree, archive and trash are collection folds on the Goals stage list, with the live tree open by default. Sessions directory actions are New Session above runtime collection folds; nested session rows stay 28px. Other object lists use title plus one secondary fact at 36px.
- Canvas/board: three parallel stage views — list, canvas, kanban. List rows are the Goal tree stretched across the stage. Canvas or kanban click opens that Goal's Frame; the node's open control still enters work. Board counts derive from actual column items, with an explicit empty-column state. History remains inline, with a 16px expanded-event heading.
- Tabs: independent rounded surfaces, plugin-colored icons and compact disclosure; ordinary tabs hug their title up to 172px and share the strip when they overflow; icon-only pinned tabs at the left. Current tabs use raised neutral tone; separate title trigger and stable close slot. Right-click/Shift+F10 and the plus menu provide pin/unpin and close. The plus menu opens enabled plugin pages; a separate action area stays available alongside the scrolling tabs. Groups, tabs, focus and nested pane layout persist per project. Arrow/Home/End select; Delete closes; trigger focus survives redraw. Goal tab selection/restoration loads the corresponding body. Current tabs remain visible when viewport width changes.
- Goal: flush to the full pane under the tabs, with zero inset/radius/shadow/backdrop and a left Back action in a 32px desktop toolbar (44px on narrow/touch). Flexible full-height Runtime sits beside a closable 300px information/timeline rail. Below 840px Goal-workspace width the rail overlays at up to 330px; mobile Goal work remains flush and square. There is no adjustable 70/30 Goal split. Terminal-only availability omits the duplicate mode bar.
- Settings: global appearance, runtimes, diagnostics, and registered plugin device-settings pages (Shelf, Functions, and Goals planning methods when that project has Goals enabled) open from the plugin-rail gear as an exclusive stage document. Category names sit in the directory with icons and a 36px rounded current row; the selected page uses a 28px title, grouped cards and left-copy/right-control rows. Plugin content configuration such as Feed Gmail stays in the plugin workbench. Project settings from the titlebar gear uses the same shell. Direct `/projects/{id}/settings*` URLs still render the independent Coss/Codex-style page. Independent `/settings/*` routes remain for the project index and direct links.
- Feed: each source is a left-directory task with name, state and count. Selection synchronizes the source, stage title and filtered message list. Closed rows show provider/source/time and a 13px title; the summary is hidden until the row opens. Expansion reads inline at 13px/1.6 within 76ch; source links remain available. Optional materials follow the body, and destination/actions share a divided footer. The selected-source stage heading has no Feed eyebrow. At 760px and below, reader actions use two equal columns with 44px minimum heights. Search, filters and source management remain reachable. Inbox remains a separate attention surface.
- Phone: at up to 600px the plugin rail and current directory become a drawer below the titlebar, with inert background and scrim. Selecting an object closes it. Work tabs remain present; Goal details are available on demand. At narrow widths or with coarse pointer, tabs, group labels, Close/Split and the new Home/Frame-picker controls use 44px interactive targets. Fine-pointer desktop controls retain their compact scale.

## Nested work panes

The layout is a binary tree of horizontal and vertical splits, including T-shaped arrangements. Every pane has independently usable content, including two panes of the same plugin. Dragging reorders or moves tabs across panes; Alt/Option copies. While over the strip, remaining tabs slide around a same-width slot at the post-`moveTab` index; dropping on one of four pane edges splits with the actual dragged tab. The split control copies to the right, or below with Shift. A 5px separator supports pointer and keyboard resizing, with double-click to equalize. Closing a pane closes its tabs and expands the remaining layout. To retain a tab, move it to another pane before closing the source pane.

At 760px and below only the focused pane is visible; window selectors change focus without discarding the desktop arrangement. The 600px directory drawer threshold is independent. Saved tabs, layout and ratios restore after refresh.

The initial single pane uses the native content surface. Split mode loads same-origin content windows and isolates their layout persistence from the parent. Loaded windows remain in a stable workspace pool: resizing, moving a tab or merging panes changes geometry and ownership rather than rebuilding the document. Unsubmitted forms in those windows survive these operations. New-item navigation inside a child delegates to the parent once, so A → B → A returns to the original document. Frame URLs start at the project root to avoid a previous Goal deep link overriding the requested item. Unsubmitted form recovery across a full page refresh is not established by this behavior.

## Attention and viewport continuity v6

The outer shell fits one viewport. Work tabs and primary toolbars stay in place; lists, readers, board columns and long forms own scrolling. Expanded project rules and narrow/split Feed readers retain access to all content and actions. Feed’s full-width toolbar has a persistent boundary independent of its constrained reading width, and stays outside the list/reader scrolling region.

The focused pane synchronizes the current Goal title and directory selection without touching terminal bindings. A collapsed user tab group hides all of its tabs, including the current one, until the chip is opened again. Same-pane focus does not move or reload the work document. Splits preserve the current Frame/work view; an explicit “打开 Frame” selects Frame in the existing Goal tab even if that tab previously showed work. Loaded documents and unfinished forms retain their existing live continuity; full-refresh recovery of unsubmitted forms is not claimed.

Current Goal facts lead: actual unmet requirements, pending decisions and blockers link to the relevant existing actions. Dependencies alone do not become a completion blocker. Ordinary initial entry leaves history bodies collapsed; explicit history selection, deep links and return restoration can expand the original body. Relation body headings remain secondary. Opening a note focuses the first usable input; adjacent Cancel/Submit actions retain the existing write behavior and Cancel returns to its entry. The empty terminal’s local Add action opens the existing chooser, focuses an available option and returns focus on Cancel; merely opening the Goal never starts execution. Feed expansion, collapse and retry preserve item focus and the correct component scroll position.

Empty and populated Frames both offer “添加已有内容”. The attached picker searches titles/captions and filters by source across the current project’s already-loaded Feed, Inbox, Session and Artifact references. Existing loaders read their owner’s content. Already-added items are disabled and labeled; no content and no matches have separate explanations. Adding stores local Frame references and positions, surviving reload without creating a domain object. Search receives focus, Cancel returns to its opener, and successful addition focuses the new block. Cross-pane dragging remains supported.

Kanban routes wheel input by pointer location and axis. Vertical input over an overflowing card column stays vertical, including at its ends; horizontal gestures or Shift-wheel move the board sideways. Vertical input over headers, gaps or non-overflowing card areas can scroll the board horizontally. Ctrl/Meta zoom gestures and an inert board behind the open Goal are left to their own handlers.

At widths up to 760px or with coarse pointer, tabs/group labels and Close/Split use 44px targets within the existing 44px bar. The final shared sheet scopes `--control-h: 44px` to Frame picker/add actions and the two new Home actions, so input/select/Cancel dimensions survive the shared-control cascade. Desktop fine-pointer controls keep their compact scale. Reduced motion remains supported.

## Independent global settings

Appearance, execution tools, diagnostics and planning library use the independent preferences shell and shared Coss tokens. Planning browse/detail/edit use that shell as well. Category navigation, planning subpages and cancel carry the originating project context; Return restores that project’s prior workbench. Project settings retains its four separate categories below.

- **Appearance:** compact rows for theme, language, density and terminal appearance; related choices form one segmented control. Device preferences apply immediately. There is no large preview card or workbench theme shortcut.
- **Execution tools:** each Runtime row leads with name, explanation, current state and the relevant preview/connect/repair/remove action. Local executable, configuration and Skill paths start collapsed. Existing preview and explicit apply semantics remain.
- **Diagnostics:** installation/version/project count, launch entries and Web service status/actions are separate reading groups. Local paths and service configuration/logs are disclosures.
- **Planning library:** content and actions fit the independent shell across browse/detail/edit. Existing adoption, version and save semantics remain owned by planning.

## Independent project settings

The titlebar gear opens project settings in the plugin shell: categories in the directory, the document in the exclusive main stage as a Codex-style preferences page. Direct `/projects/{id}/settings*` URLs, refresh and browser history still use the independent page. Leaving settings via Goals or another plugin restores saved project tabs and splits. Refreshing while settings are open restores the exclusive stage. Existing `embed=1` requests return a fragment for the stage and project management. Project planning detail/edit paths share the preferences shell.

- **General:** a name-edit row, expandable read-only project ID/database facts, and distinct rebuild/delete actions with the existing confirmation. Paths remain secondary and wrap.
- **Guidance:** six categories (background, requirements, constraints, collaboration, workflow and quality), each with an add action; a shared inline editor, reasons, full version detail and inactive-entry restoration.
- **Rules:** common selects and switches in flat rows, advanced fields disclosed on demand, explicit change reason and save feedback. The switch is visually 34×20px inside a clickable setting row.
- **Planning:** current composition first, then searchable/filterable method adoption rows, library and new-method entry. Desktop adoption rows are content-sized (`min-height: 0`), about 112px with reviewed content; they do not retain the old 168px card minimum. Mobile row actions sit below the copy. Explicit adoption still creates independent project versions through the guarded API.

Disclosure arrows and switch knobs use 160ms ease. Reduced motion removes those transitions. Mobile return/category links, form controls, buttons, planning filters and guidance actions have 44px minimum targets; text fields use 16px type. The shared Coss palette and visible keyboard focus remain in both themes. No raster assets ship with this settings world.

The real rules-save regression exposed an existing POST `/api/policy-bindings` 404. The repaired `project_default` path is owned by Goals: strict validation, transactional replacement, audit history and idempotent retry. Invalid input does not write, a lost-response retry does not duplicate history, and save failures retain form input. Other APIs, business data and planning semantics remain with their existing owners.

## Form actions, Feed configuration and truthful empty states

Goal event forms, rule editors and planning save footers place Cancel left and the specific Submit right in one adjacent group. Help text stays outside it. Cancel remains a non-submit return or reset, and failed writes preserve input. The shared action scope uses 36px desktop and 44px mobile minimum controls without increasing compact navigation globally.

Feed task configuration has one bottom Cancel/Save configuration group. Its pull-plan disclosure explicitly saves only the plan and offers Undo changes beside Save pull plan. A successful plan save retains unsaved task details; reset uses the latest saved schedule, including a paused interval plan. Configuration and plan failures preserve input for retry. Reader loading/error/retry, persisted read state, collapse/reopen and filtering retain their production behavior. Demo readers state that actions only change the current page; they do not connect accounts, write the database or start background work.

Session create/associate modes sit separately from the Close control; on mobile the switch moves below the title. The empty Sessions surface uses the shared primary creation action with a horizontally aligned plus icon. Artifact readers distinguish “还没有项目成果”, “选择一个结果版本” and “找不到这个 Artifact 版本”; exact missing references never become a successful selection.

## State, ownership and recovery

The following workbench capabilities are retained; the project-default rules write repair is described above:

- Goal, dependency, event, acceptance and completion state remain domain-owned. The workbench reads live `readState`; choosing a historical event changes only its inline body. Original Run/Evidence/Review/Decision identities stay traceable. Goal requirements never become a UI completion algorithm.
- Work owns terminals and Session/PTY identity. Opening, selecting or closing a Goal never launches, sends to, destroys or rebinds a terminal. Event-owned parents may record integration; existing untransferred compound-parent execution guards remain.
- Readers and forms use the existing exclusive overlay behavior, remove covered controls from keyboard operation and return focus. History loading, write failures, conflict handling and retry stay on their existing paths.
- Feed owns full source-message facts and source tasks; Inbox owns attention references with entry reason, related object and next step. Feed task configuration uses the attached editor. External source content stays untrusted. Promote/Start creates or reuses a Draft and binds input; choosing a terminal can fill context but never auto-send.
- Artifacts retains owner-rendered exact-version details and downloads. Sessions retains execution histories and working-directory relationships; a UI redesign is not evidence that demo execution or an unavailable Harness is integrated.
- Plugin activation remains project-local and persistent. Feed activation enables Inbox. Project and personal planning versions remain independent, and explicit adoption continues through the existing guarded API.
- Native drag regions and fullscreen-aware insets remain platform-owned. Interactive controls are no-drag. This browser pass does not recalibrate or certify macOS traffic lights.

## Retained project home and shortcuts

Home keeps local date/weekday and a small month calendar. It uses the shared neutral theme. Date, calendar, shortcuts and the disabled composer share one 670px column, left-aligned in the pane and stacked from the top; leftover paper stays below. Container widths of 640px and 450px tighten and stack the composition. The composer remains disabled with “Agent 尚未开放”; no draft capture, message submission or simulated Agent response is introduced.

Home has no quotation carousel and no “打开 Goals” control. Goals is opened from the directory or plugin strip.

Shortcuts live on the project home canvas above the disabled composer, not in the directory. Add/edit/remove/cancel remains a project-local device preference. Validation and save/open failures preserve an honest correction or retry path, closing restores focus, and http(s) destinations use the existing web/native external-open channel. Names render as text and icons are local Lucide symbols. These preferences do not write Goal truth or synchronize across devices.

## Motion, focus and depth extensions

Shared CSS tokens are `--motion-fast: 120ms`, `--motion-normal: 180ms`, and `--ease-out: cubic-bezier(.16, 1, .3, 1)`. Attached editors use 140ms opacity feedback with no translation or scale; other retained shared dialogs use the existing small 6px translation and .985 scale. Feed reader arrival is 160ms ease-out from opacity 0 and translateY(-3px); its disclosure chevron rotates over 160ms ease. Reduced motion removes both. The existing directory-list arrival is 220ms, directory title 180ms and Goal opening 200ms. These surface-specific timings do not imply animation on every content update. Reduced-motion rules suppress transitions/animations and smooth scrolling.

`--surface-shadow` is the shared shallow surface depth; current work tabs explicitly have no shadow. `--control-shadow` retains menu/other-dialog depth. Goal work and attached editors have no shadow; compact search/confirmation surfaces use `0 8px 28px #00000018` with a `#00000026` backdrop and no blur. Shared control boundaries use `color-mix` with theme ink (8% secondary boundary, 10% input boundary in Light); Dark has corresponding white-derived values. Shared focus is a 2px ring with 2px offset; tabs put the ring inside the visible tab container. Preserve the source tokens rather than creating another palette here.

## Implementation ownership

| Owner | Files / role |
| --- | --- |
| Shared design foundation | `packages/design-system/src/styles/coss-controls.ts`: theme, shared controls, focus, motion and modal depth |
| Shell and navigation | `apps/workbench/src/immersive-shell.ts`; styles `immersive-navigation.ts`, `immersive-directory.ts`; client `immersive-navigation.ts`: project chrome, directory and search placement |
| Work tabs | `apps/workbench/src/styles/tab-workspace.ts`, `tab-workspace-ops.ts`; client `tab-workspace.ts`: colored tabs, nested layout, drag/copy, keyboard/resize, stable content pool, parent navigation and restoration |
| Continuous surface language v11 | `apps/workbench/src/styles/surface-language.ts`, loaded by `renderer.ts` after the retained shared Coss controls; `goal-canvas.ts`, `immersive-shell.ts` and `goals-page-renderer.ts`: flush work, attached editor geometry, Back entry and emitted contract |
| Goal work surface | `apps/workbench/src/styles/goal-canvas.ts`; client `editing-graph.ts`; `plugins/native/goals/src/kanban-ui.ts`: frame, reading hierarchy and board counts/empty states; Goals/Work retain content and execution ownership |
| Independent project settings | `apps/workbench/src/project-settings-pages.ts`, `settings-navigation.ts`, `styles/project-settings-page.ts`; `apps/local-host/src/web-goals-read.ts` and `web-request.ts`: direct category HTML, independent shell and routes |
| Settings domain forms | `plugins/native/goals/src/policy-ui.ts`, `project-policy-client.ts`, `planning-project-ui.ts` and planning renderers; `modules/goals/src/policy-commands.ts`, Native Goals `http/policy-guidance.ts`: rules save, history, retry and planning ownership |
| Global settings and arrival | `apps/workbench/src/settings-renderer.ts`, `settings-directory.ts`, `plugin-settings-catalog.ts`, `styles/project-settings-page.ts`, `styles/settings.ts`: host categories plus registered plugin device-settings pages; `plugins/native/shelf/src/settings-ui.ts` owns Shelf’s page; `project-index.ts` retains arrival scope |
| Feed | `plugins/native/feed/src/ui.ts`, `apps/workbench/src/scripts/client/navigation-feed.ts` and workbench immersive directory styles: source task directory, message list and reader; source/message behavior remains plugin-owned |
| Current forms / Session / Artifact states | `plugins/native/goals/src/event-document-forms.ts` and styles, `policy-ui.ts`; `plugins/native/work/src/ui/styles.ts` and `render.ts`; `plugins/native/artifacts/src/browser-ui.ts`: paired form actions, readable Session entry and accurate Artifact states |
| v6 attention and continuity | `apps/workbench/src/goals-page-renderer.ts`, client `frame-container.ts`, `tab-workspace.ts`, `editing-graph.ts`; `plugins/native/goals/src/event-document-{ui,client,styles}.ts`, `momentum-client.ts`; `plugins/native/work/src/ui/terminal.ts`, `terminal/client.ts`: Frame references, view/identity/focus, current facts, pointer-aware board and local terminal entry |
| Home and shortcuts | `apps/workbench/src/project-home.ts`, `styles/project-home.ts`, client `project-home.ts` and `project-home-shortcuts.ts`; native external opening remains in Desktop adapters |

Paths abbreviated as `styles/` or `client/` above are under `apps/workbench/src/styles/` and `apps/workbench/src/scripts/client/` respectively.

## Current verification and limits

### Continuous workspace v11 — latest

Completion level: **3 — local functionality available**. The [finish review](../review/continuous-v11/finish-review.md) requested two corrections; the [fix verdict](../review/continuous-v11/fix-verdict.md) scored **V11-F01 and V11-F02 resolved**, with disposition **ship** for that two-finding list. This is not a new whole-product audit.

The supplied final full build passed (`/private/tmp/molis-v11-final-build.log`), followed by a passing workbench build after the fixes (`/private/tmp/molis-v11-fix-build.log`). Final affected checks passed **6/6** (`/private/tmp/molis-v11-fix-tests.log`): continuous workspace, low viewport and attention cases. The earlier supplied runs establish **17 unique UI cases** across `/private/tmp/molis-v11-tests.log` and `/private/tmp/molis-v11-final-ui.log`; two obsolete cursor expectations were superseded by passing continuity checks, and overlapping low-viewport cases are not counted again. The documenter did not rerun tests, browser captures or the detector.

Final representative captures are in [continuous-v11](../review/continuous-v11/): Goal note (1440 Light and 390 Dark), Goal creation, Feed configuration, Session add and Frame picker (1440/390), plus 1440 settings. Supplemental captures show Feed focus in Dark and expanded Goal creation at [1440×400](../review/continuous-v11/goal-create-expanded-low-1440.png) / [390×500](../review/continuous-v11/goal-create-expanded-low-390.png). Focus records measure 3.686:1 in Light and 6.826:1 in Dark for the shared Feed input/select outline. Real wheel input confirms the expanded creation body scrolls while header/footer coordinates stay fixed.

These are isolated fixture captures, not the user’s live tab or shipping raster assets. Session relations shares the editor selector but has no distinct capture. No external fetching, actual Runtime launch, native haptics, desktop packaging, installation or release verification is established. Prior evidence below remains historical where v11 supersedes its surface geometry.

### Attention and viewport continuity v6 — historical

Completion level: **3 — local functionality available**. The [review packet](../review/attention-journey-v6/review-packet.md) records scope, current capture provenance and regression evidence. The [initial finish review](../review/attention-journey-v6/finish-review.md) requested two bounded fixes: shared styling for “换一句” and actual 44px narrow/coarse controls. Both are resolved in the [final fix verdict](../review/attention-journey-v6/fix-verdict.md), **ship** for this scope. This document refresh records those changes; it did not rerun the browser or detector.

The final production build passed (`/private/tmp/molis-v6-review-fix-build.log`). Home’s three cases passed (`/private/tmp/molis-v6-review-fix-tests.log`); the picker’s animation-sensitive measurement in that run was superseded by the passing **2/2** narrow/coarse confirmation (`/private/tmp/molis-v6-touch-confirm.log`), which waits for entrance motion before measuring bounds. The earlier 26-case confirmation passed 25 with one collapsed-group test setup error; opening the group before selecting its mother tab yielded **2/2** in `/private/tmp/molis-v6-attention-confirm.log`. These overlapping runs are not summed. Supplied regressions cover actual wheel input and internal scroll boundaries, Frame persistence/search/duplicates, current identity, view/focus continuity, initially collapsed history, terminal chooser/Cancel, unchanged domain Goals/runs, and Feed/settings behavior; earlier failed expectations and their replacements are detailed in the packet.

Current evidence includes [Feed desktop Dark](../review/attention-journey-v6/fixed-feed-desktop-dark.png), [390px Light](../review/attention-journey-v6/fixed-feed-mobile-light.png) / [Dark](../review/attention-journey-v6/fixed-feed-mobile-dark.png), and [two Feed panes at 1312×936](../review/attention-journey-v6/fixed-feed-split-1312.png). The split capture emulates the measured user viewport, not a new capture of the user’s tab. Final [Frame picker desktop](../review/attention-journey-v6/fixed-frame-picker-desktop-light.png), [mobile Light](../review/attention-journey-v6/fixed-frame-picker-mobile-light.png) / [Dark](../review/attention-journey-v6/fixed-frame-picker-mobile-dark.png), [Home desktop Dark](../review/attention-journey-v6/fixed-home-desktop-dark.png) and [mobile Light](../review/attention-journey-v6/fixed-home-mobile-light.png) replace the pre-fix captures. Goal [Dark](../review/attention-journey-v6/fixed-goal-desktop-dark.png) / [Light](../review/attention-journey-v6/fixed-goal-desktop-light.png), [focused note form](../review/attention-journey-v6/fixed-note-mobile-light.png) and [expanded mobile settings](../review/attention-journey-v6/fixed-settings-mobile-dark.png) complete the supplied 13-capture review.

No real external fetching/OAuth, actual Runtime launch, native haptic hardware, desktop packaging, installation or release verification is established. The full repository suite was not run. Older evidence below remains historical where v6 supersedes it; these screenshots are review evidence, not shipped imagery.

### Whole-product interaction v4 and Feed reader v5

Completion level: **3 — functionality available**. The [inventory](../../specs/product-interaction-redesign/inventory.md) records the reviewed surfaces; this documentation refresh does not promote them to release readiness. The final build passed (`/private/tmp/molis-feed-v5-finish-build.log`). Final targeted tests passed **13/13** (`/private/tmp/molis-review-fixes-final-tests.log`), Feed configuration/reader tests **5/5** (`/private/tmp/molis-feed-final.log`), and supplemental domain/browser regressions **28/28** (`/private/tmp/molis-redesign-final-contracts.log`). These runs overlap and are not summed into a unique test count. The earlier 31/33 run was not fully green; its two navigation failures were fixed and covered by the final 13/13 run.

The same-reviewer [F1–F6 verdict](../review/product-interaction-v4/fix-verdict.md) is **ship** for paired Goal/rule actions, scoped Feed saves, Session heading/first-use actions, settings context and Artifact states. The fresh [Feed v5 full review](../review/product-interaction-v4/feed-v5-finish-review.md) identified V5-1, the redundant Feed eyebrow; its [fix verdict](../review/product-interaction-v4/feed-v5-fix-verdict.md) is **ship / resolved** after all eight captures were refreshed. These scoped verdicts do not claim every product surface is free of issues.

Latest Feed evidence: [desktop Light list](../review/product-interaction-v4/feed-list-v5-1440-light.png), [reader](../review/product-interaction-v4/feed-reader-v5-1440-light.png), [390px Light reader](../review/product-interaction-v4/feed-reader-v5-390-light.png), [desktop Dark list](../review/product-interaction-v4/feed-list-v5-1440-dark.png), [reader](../review/product-interaction-v4/feed-reader-v5-1440-dark.png), [390px Dark reader](../review/product-interaction-v4/feed-reader-v5-390-dark.png), and actual 1312×936 user viewport [list](../review/product-interaction-v4/feed-list-v5-user-1312-dark.png) / [reader](../review/product-interaction-v4/feed-reader-v5-user-1312-dark.png). The final desktop Light reader capture is 1440×960px. These replace earlier Feed list/reader captures; no generated raster asset ships.

Not verified: real external fetching or OAuth, actual Runtime launch, native haptics, native desktop packaging/installation/release, or the full repository suite. Demo screenshots do not establish those outcomes. Earlier pane/settings evidence below remains relevant where not superseded by this pass.

### Workbench panes / Feed / global settings v3

Completion level: **3 — functionality available**, verified with an isolated demo project in the browser. The spec records **62 targeted checks passed** and a successful build. Latest lifecycle evidence: `/private/tmp/molis-panes-lifecycle-build.log` and `/private/tmp/molis-panes-lifecycle-tests2.log`. The finish review concluded **ship** after both P1 findings were resolved: child navigation returning to the original Goal, and source-form drafts surviving tab movement/pane merge.

| Acceptance | Result and evidence |
| --- | --- |
| Tabs and panes | Passed: equal widths, independent same-plugin searches, nested splits, actual dragged item, resize, refresh layout restoration and 390px focus switching. The mouse path created a fourth pane containing the dragged Goal while retaining three Feed windows. |
| Content continuity | Passed: actual content documents were not rebuilt; source name/URL input survived moving and merging; CORE → INTERFACES → CORE returned to the original detail. |
| Feed | Passed: left source tasks, matching list/title, list and reader states, source form reachability. |
| Settings | Passed: appearance, Runtime, diagnostics and planning browse/detail/edit use the independent shell; four project categories retain their existing regression coverage. |
| Visual and keyboard behavior | Passed within the reviewed desktop/390px Light/Dark surfaces; focus, tab selection and reduced-motion behavior retain targeted coverage. |

The [v3 review directory](../review/workbench-panes-v3) contains current screenshots, including post-fix captures. Representative evidence: [nested panes Dark](../review/workbench-panes-v3/split-nested-1440-dark.png), [fourth-pane drag Dark](../review/workbench-panes-v3/split-drag-goal-1440-dark.png), [moved draft](../review/workbench-panes-v3/feed-draft-moved-1440-dark.png), [merged draft at 390px](../review/workbench-panes-v3/feed-draft-merged-390-dark.png), [Goal return](../review/workbench-panes-v3/goal-return-1440-dark.png), [Feed directory at 390px](../review/workbench-panes-v3/feed-directory-390-dark.png), [Feed reader](../review/workbench-panes-v3/feed-reader-1440-light.png), [appearance](../review/workbench-panes-v3/appearance-1440-light.png), [Runtime at 390px](../review/workbench-panes-v3/runtimes-390-dark.png), [diagnostics](../review/workbench-panes-v3/diagnostics-1440-dark.png), [planning detail](../review/workbench-panes-v3/planning-detail-1440-dark.png), [planning edit at 390px](../review/workbench-panes-v3/planning-edit-390-dark.png).

Not run in this pass: real external source fetching, real Runtime connection/terminal startup, native desktop packaging and the full repository suite. Browser evidence does not establish those outcomes. At this historical v3 checkpoint the tab-close hit area was 22px; v6 supersedes that mobile limitation with narrow/coarse 44px targets.

### Project settings v2

Completion level: **3 — browser functionality available**. Full build passed (`/private/tmp/molis-settings-v2-build.log`). The final 37 targeted tests passed across the consolidated run and targeted rerun: the initial run passed 36, its single stale storage-class assertion was corrected, and the deletion file rerun passed 3/3. The full `web.test.ts` file passed in that verification. The fresh independent finish reviewer returned **ship** after mobile 44px targets (M1), content-sized planning rows (M2) and the real rules-save path (F1) were resolved.

Four categories were reviewed at 1440px Light, 1024px Dark and 390px Light, with guidance-editor and advanced-rules states:

| Category | 1440 Light | 1024 Dark | 390 Light |
| --- | --- | --- | --- |
| General | [Screenshot](../review/project-settings-v2/general-1440-light.png) | [Screenshot](../review/project-settings-v2/general-1024-dark.png) | [Screenshot](../review/project-settings-v2/general-390-light.png) |
| Guidance | [Screenshot](../review/project-settings-v2/guidance-1440-light.png) | [Screenshot](../review/project-settings-v2/guidance-1024-dark.png) | [Screenshot](../review/project-settings-v2/guidance-390-light.png) |
| Rules | [Screenshot](../review/project-settings-v2/rules-1440-light.png) | [Screenshot](../review/project-settings-v2/rules-1024-dark.png) | [Screenshot](../review/project-settings-v2/rules-390-light.png) |
| Planning | [Screenshot](../review/project-settings-v2/planning-1440-light.png) | [Screenshot](../review/project-settings-v2/planning-1024-dark.png) | [Screenshot](../review/project-settings-v2/planning-390-light.png) |

Additional states: [Guidance editor](../review/project-settings-v2/guidance-editor-1024-dark.png), [Advanced rules](../review/project-settings-v2/rules-advanced-1024-dark.png). These screenshots are QA evidence, not shipped imagery. This pass does not verify a native package, installation/release or the whole product.

### Retained Coss workbench evidence

The following is earlier workbench verification; its tabs, Feed and global-settings screenshots are superseded by v3, and project settings by v2 above. Completion level: **3 — browser functionality available**. `pnpm build` passed. The final targeted regression run passed **42/42, zero skipped** (`/private/tmp/molis-coss-regression.log`); the targeted tab browser regression also passed **1/1**. The isolated preview used `/private/tmp/molis-coss-review`. Restored Goal tabs were checked against the actual loaded body, including INTERFACES, not only their visible title.

The independent finish reviewer returned **ship**, with no material findings. Ten historical screenshots cover 1440px, 1024px and 390px, Light/Dark, workspace, directory, board, Feed and settings:

- [Workspace Light](../review/coss-workspace-1440-light.png), [Workspace Dark](../review/coss-workspace-1440-dark.png), [Workspace 390px](../review/coss-workspace-390-light.png), [Directory 390px](../review/coss-directory-390-light.png).
- [Board Dark](../review/coss-kanban-1440-dark.png), [Feed Dark](../review/coss-feed-1440-dark.png).
- [Global settings Dark](../review/coss-settings-1440-dark.png), [Global settings 390px](../review/coss-settings-390-light.png), [Project settings 1024px Dark](../review/coss-project-settings-1024-dark.png), [Project settings 390px](../review/coss-project-settings-390-light.png).

These are UI review evidence, not product content assets. This pass did not verify a rebuilt native package, installation/release, external AI execution, or every low-frequency domain form. The then-recorded 22px tab-close limitation at 390px was superseded by v6’s narrow/coarse 44px targets.

## Prior evidence references

Older records explain retained behavior and prior verification; they do not override the current visual rules:

- [Initial immersive implementation](../../specs/archive/immersive-workbench-implementation/spec.md) and [progress](../../specs/archive/immersive-workbench-implementation/progress.md): original browser/data/PTY/plugin integration evidence.
- [Project home](../../specs/archive/poetic-project-home/spec.md), [quotation/footer follow-up](../../specs/archive/home-narrow-footer-quotes/spec.md), [home shortcuts](../../specs/archive/home-shortcuts-return/spec.md): retained calendar and shortcut behavior. Quotations were later removed by [home-remove-quotes](../../specs/archive/home-remove-quotes/spec.md).
- [Tab workspace](../../specs/workbench-tab-workspace/spec.md), [global search](../../specs/archive/global-plugin-search/spec.md), [Feed stage directory](../../specs/archive/feed-stage-directory/spec.md), [plugin catalog](../../specs/archive/plugin-market-catalog/spec.md): existing navigation capabilities.

Historical 32px titlebars, underlined active tabs, separate Settings palette, 10px shared controls, inset/rounded/elevated expanded Goal frames and adjustable 70/30 Goal splits are superseded by this record's current implementation values.

## v14 closing acceptance
Planning editors in global/project settings now share fixed actions and independently scrolling fields; mandatory planning groups are named and validation locates them. Goal relation actions reach the existing domain commands with scoped, idempotent writes. Type/requirement partial saves explicitly distinguish the saved type from the unfinished requirement. Dense-tab/nested-pane fixtures and 39 final targeted checks passed. Live RSS, Codex execution/read/link, and GitHub read-only sync succeeded. Gmail requires user reauthorization; do not describe that live path as accepted. See specs/product-interaction-redesign/progress.md for evidence and completion boundary.

## Compact icon tabs — 2026-09-16

User reference: rounded icon tabs with pinned shortcuts. Desktop and mobile light/dark checked in `.impeccable/review/icon-tabs/`. Workbench build and 20 targeted tests passed, including pin persistence and ordering, actual right-click/Escape, keyboard menu navigation, touch actions, reduced motion, existing tab keyboard behavior, Feed split/move continuity and dense nested panes. A manual native popover avoids macOS right-button release dismissing the menu; outside pointer/focus and Escape close it. No automatic hover resizing or external writes.
