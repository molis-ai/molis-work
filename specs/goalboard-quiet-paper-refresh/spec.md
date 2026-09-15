# Molis Work Visual Redesign

## Completion level

Level 4: internal complete. This is a real visual replacement on the current application, not a static mockup.

## User correction

The previous Quiet Paper direction is rejected. Existing SSOT files remain authoritative for product facts and behavior only; their visual preferences do not constrain this redesign.

Preserve:

- Goal, Project, Decision, Evidence, Risk, Relation, and Runtime behavior.
- The current route structure, labels, forms, keyboard access, theme preference, and Standard/Compact preference.
- Project context as one layer above Goal navigation and system-only settings behind the global settings entry.

Replace:

- The complete visual language, including color, spacing, typography hierarchy, shell composition, control shape, selection treatment, document rhythm, and panel relationships.
- The floating rounded-paper composition and centered utility-bar branding introduced by the rejected direction.

Ignore:

- Quiet Paper as an aesthetic target.
- Existing `DESIGN.md` statements about how Molis Work should look. `DESIGN.md` will be rewritten from the verified build.

## Current evidence

The current browser render has several structural visual problems:

- The centered brand and tiny system controls create an unbalanced empty top bar.
- The rail, document, tabs, search, and actions each use separate rounded containers, so the screen reads as assembled UI chrome.
- The selected Goal is a large outlined card inside another framed canvas instead of the natural main work surface.
- Text scale is compressed everywhere, weakening the difference between project, Goal title, next action, metadata, and controls.
- The left tree is dense but visually mushy: parent depth, selected state, progress, status, and dependencies compete at the same level.
- At 1280px, the main document does not feel calm or editorial despite having large unused space.

### Regression evidence after the first Calm Desktop pass

The first rendered pass was not acceptable despite passing its automated checks:

- Compact Goal rows reduced statuses back to dry unbounded text. Long states such as “Waiting for child Goals” compete with Goal titles instead of scanning as a separate state layer.
- Secondary tree text, dependency summaries, search placeholder text, project metadata, and footer counts fall below the intended readable hierarchy, especially in Light mode and at high-density companion widths.
- Dark-mode status colors still inherit legacy Light-mode hard-coded values; the waiting state measured `rgb(92, 101, 112)` on the dark navigator and is not reliably readable.
- The narrow desktop-shell tree allocates only about 30px to a toolbar whose two rows require about 62px. The overflowing view switch and tools cover the first Goal row.
- “Switch project” and “Project settings” are two low-contrast text links floating under the project name. They do not read as deliberate project-level controls and ignore the existing Lucide icon system.
- Runtime secondary text and disabled controls do not share one explicit terminal contrast scale; some disabled combinations are visibly weaker than their surrounding guidance.

### Regression evidence after the second Calm Desktop pass

- The current project header still spends an entire row on two labeled buttons. At 320px navigator width, the project area is about 92px tall and the actions alone consume 278px, so project content is visibly arranged around controls rather than the controls fitting the context.
- The Goal overview repeats the same status in the title and “下一步”, then stretches four unrelated sections across the full document width. At 1280px, “下一步” is 174px tall, “完成要求” is 151px, and “上下文” is another 152px-wide horizontal table; the result reads like unfinished scaffolding rather than a composed work page.
- Dynamic primary-action copy includes the full child Goal title. The button becomes the widest object in the section and forces the surrounding explanation to concede space to a control.
- Important work content and quiet metadata have equal full-width presence. There is no stable main reading path from title, to next action, to completion requirement, while project facts and Runtime state remain available but secondary.

### Regression evidence after the third Calm Desktop pass

- “下一步”已经有清楚的文字标题，但正文左侧又放了一个独立黑色箭头。它既不表示状态，也不是可操作控件，还把标题、说明和按钮推到不同的对齐线。
- Runtime 把 Goal 所属信息、页签、上层 Goal 引导、子 Goal 选择和操作按钮全部染成终端黑底。应用导航与真正的终端画布没有视觉边界，所以非终端内容既脱离 Molis Work 主题，也降低了浅色界面的可读性。
- 浏览器中的 xterm 使用写死的深色 palette；修改 CSS 只能改变容器背景，不能改变真实终端的前景、光标和选区，因此当前没有可信的终端外观设置。

### Regression evidence after the fourth Calm Desktop pass

- Focus 正文仍然贴着白色工作区边缘铺开，标题、页签和内容共享一张连续白纸，右侧缺少能把导航与阅读面分开的外层留白和轻量边界。
- 切换 Goal 主页签只替换内容，不重置正文滚动位置；Hash 和已保存的 `documentTop` 也会恢复旧位置，因此页签切换后标题可能停在可视区域上方，看起来被顶住或裁切。
- “上下文”使用连续文档章节，“进展”使用纵向事实和列表，“关系”再嵌套一组页签，“记录”使用原生折叠面板。四个同级入口有四套完全不同的浏览语法，用户每次切换都要重新理解页面。
- 每个详情页把多个区域纵向堆在一页上；复杂表单、只读记录与摘要同时争夺宽度和注意力，没有“先扫一眼 Section，再展开一个重点”的稳定阅读路径。

### Regression evidence after the fifth Calm Desktop pass

- Hero、详情页签和正文仍然被包在同一张连续白色阅读面里。标题虽然有内边距，但缺少一个独立的开场区块，页面仍然像一张从上铺到底的内容纸，Hero 与工作内容之间没有空间层次。
- 选中 Section 时，当前卡片会横向变宽并挤压其他入口；选择动作改变了导航布局，用户需要重新定位其余卡片。
- 详情正文嵌在被选中的卡片内部，所以大块内容只能占据该卡片的列宽。卡片下方本来有完整可用宽度，却没有成为稳定的共享内容舞台。

### Regression evidence after the stationary-selector pass

- Section 卡片虽然已经固定位置，但说明文字仍被 `45px` 的固定高度和 `overflow: hidden` 裁切。真实中文长文案的 `scrollHeight` 达到 `60px`，用户只能看到不完整句子；同一行卡片也因此出现 107px 与 91px 的不一致高度。
- “Goal 关系”详情仍继承旧关系编辑器的居中网格和全宽小标签样式。关系类型、Goal 标题、Goal ID、路径、原因、状态与解除操作没有稳定列；三行次要信息被渲染成横贯正文的胶囊，既破坏阅读层级，也使多条关系的起点互不对齐。

### Regression evidence after the relationship-row pass

- Compact 只在视口宽于 `760px` 时生效；其旧 `padding: 9px 0` shorthand 会在 761–1080px 的中间桌面宽度清空 Next Step、Completion 和 Context 卡片的左右内边距。882px 实测卡片左边框位于 `x=390.34px`，标题位于 `x=391.34px`，只剩 1px 边框宽度，内容看起来顶在线上。
- 同一页面在 706px 因 Compact 不生效而保留 20px 留白，导致“更窄反而正常”的断点倒挂；这是密度规则与最终概览卡片规则冲突，不是单个标题的 margin 问题。

## Goal

Create a restrained, clear, elegant desktop workbench inspired by the supplied YouMind references without copying its product structure.

Molis Work's unique mechanism must be visible immediately: one selected Goal flows from outline, to readable decision surface, to execution Runtime.

## Direction: Calm Desktop

**Mode:** Operate.

**Design read:** a daily workspace for a founder or product lead, using the visual grammar of a high-quality desktop editor rather than a dashboard.

**Dials:** design variance 6/10, motion 2/10, visual density 7/10.

**Color strategy:** cool monochrome with one restrained cobalt accent for focus, links, and intentional action. Semantic colors remain reserved for real status.

**Composition:**

1. A slim, left-aligned application header with no centered ornament.
2. A continuous cool-gray Project and Goal rail, approximately 300px wide.
3. A full-bleed white Goal surface with no outer card, centered readable content, and stronger editorial type hierarchy.
4. Goal sections organized by alignment and whitespace; no repeated card shells.
5. Runtime uses the same application surface as the rest of Molis Work for navigation and guidance; only the real terminal canvas uses its independent, user-selectable palette.

**Goal overview spatial thesis:** the reading path is Goal title → next action → completion requirements. Project facts and bound Runtime belong together in a compact supporting rail. At document content widths below 720px the rail moves below the work content without changing DOM or focus order.

**Focus detail spatial thesis:** the primary path remains Goal Hero → selected detail tab → stable Section selector row → one shared detail stage. Hero is its own bounded surface, separated from the work surface by visible canvas space. “上下文 / 进展 / 关系 / 记录” all use the same Section deck: summary cards keep equal, stable positions; selection changes emphasis but never changes their width. The selected Section body renders at full available width in one shared stage beneath the row. At narrow widths the selector row wraps to two columns, then one column only when needed, while the detail stage remains below it and DOM/focus order stay logical.

**Focus detail motion:** motion is authored only for section selection. Cards remain stationary while the selection outline, icon, and summary tone settle quickly. The shared detail stage changes height and reveals the selected body through clipping, opacity, and a small vertical translation using exponential ease-out. `prefers-reduced-motion` removes these transitions without hiding information.

**Runtime spatial thesis:** Goal ownership, tabs, guidance, child choices, and actions are application UI and follow the current Molis Work theme. The terminal canvas is a distinct execution region. Its palette is a local preference—Follow interface, Light, or Dark—and updates both the CSS surface and live xterm instances.

**Shape rule:** 6px rows, 8px controls, 10px transient surfaces. Persistent panes are square and structural, not floating cards.

## Scope

- Replace shared light and dark semantic tokens.
- Recompose the desktop header and three-pane workspace.
- Restyle Project layer, Goal search, view switch, tree rows, progress, statuses, and footer.
- Render every Goal status as a compact, bordered semantic tag with an icon and text; color remains supplementary rather than the only state signal.
- Place project switch and project settings as compact Lucide icon controls in the project-title row; their accessible names remain explicit while visible labels do not consume a separate row.
- Restyle Goal header, workspace switch, detail tabs, next action, completion criteria, context, and document sections.
- Recompose the Goal overview into a main work column and a supporting context rail at spacious widths, with a single-column fallback driven by the document container.
- Give the Focus pane an outer canvas inset and a faint bounded reading surface so the Goal content has visible breathing room on all four sides.
- Split the Goal Hero and detail navigation into their own bounded surface above a separate work-content surface, with visible canvas space between them.
- Reset the Focus document to its readable top inset when the user changes a main Goal detail tab; direct links to a deeper section may still reveal and scroll to that section.
- Replace the four different detail-page browsing patterns with one reusable two-layer section deck across Context, Progress, Relationships, and Record: a stable equal-width selector row above one full-width detail stage.
- Keep one section card selected at a time without resizing or moving sibling cards. Context exposes Goal explanation and completion requirements; Progress exposes state, blockers, risks, and checks; Relationships exposes relations, risks, impact, and work rules; Record exposes basic facts, execution/checks, history, and relation/rule history in the shared stage.
- Let the tallest selector summary determine the whole row height. Titles and descriptions must remain fully visible in Chinese and English; icon, count, and caret align to the first content line instead of vertically centering against wrapped copy.
- Recompose Goal relations as grouped information rows with stable columns: a bounded relation type, a leading Goal title with quiet ID/path/reason text, a compact lifecycle state, and an aligned secondary action. Long metadata remains plain text rather than full-width pills, and the row collapses without horizontal overflow at narrow widths.
- Preserve the existing content, forms, deep-link targets, lazy-loaded records, and relationship write receipts inside the new card bodies.
- Add restrained active-card expansion and body reveal motion, with an equivalent no-motion state for reduced-motion users.
- Shorten visible primary-action labels so controls fit the content; preserve the complete action meaning in accessible labels and surrounding explanatory copy.
- Remove the decorative arrow from “下一步” and align the heading, explanation, guidance, and content-width action to one reading edge.
- Restyle Runtime, dialogs, menus, settings, and project index using the same visual grammar.
- Keep Runtime ownership, tabs, parent guidance, child choices, and controls on normal application surfaces; apply terminal colors only to the actual terminal canvas.
- Add a current-device terminal appearance preference with Follow interface, Light, and Dark choices. Apply it before first paint and propagate changes to existing xterm sessions without reloading.
- Preserve Compact as a meaningful density change above 760px.
- Compact may reduce vertical rhythm, type scale, and row height, but overview cards retain a deliberate horizontal safe inset; Next Step, Completion, and Context content must never sit against their border at intermediate desktop widths.
- Preserve narrow layouts without horizontal overflow or clipped controls.
- Update the emitted direction contract, visual regression assertions, `DESIGN.md`, and its sidecar after browser verification.

## Non-goals

- No data-model, route, action, navigation-label, or form-order changes. Primary-action microcopy may be shortened when its complete meaning remains in the section and accessible name.
- No new UI framework or dependency.
- No YouMind branding, content model, imagery, or IA.
- No decorative illustration, gradient, glass, grain, or attention-seeking animation.
- No carousel, masonry feed, or dashboard metric tiles. The horizontal deck is a section selector and disclosure surface, not a content recommendation feed.
- No data mutation, form reordering, or loss of detail content while unifying the four detail structures.
- No arbitrary terminal color editor or custom ANSI palette in this pass; the three curated modes cover the requested light/dark adjustment without creating an additional theming system.
- No attempt to retain the rejected visual direction for compatibility.

## Acceptance criteria

- [x] The top bar reads as a functional desktop frame with Molis Work aligned to the rail, not floating in the center.
- [x] Persistent panes are full-bleed structural regions without large rounded outer cards.
- [x] Project and Goal navigation form one continuous hierarchy; the selected Goal is immediately identifiable.
- [x] Goal titles, progress, dependency facts, and status tags form four distinct and readable information levels in both Standard and Compact.
- [x] Every Goal status is a bounded icon-and-text tag with readable Light/Dark contrast, including waiting, ready, completed, clarification, and blocked states.
- [x] Project switch and project settings use consistent icon-only Lucide controls inside the title row, with accessible names, tooltips, and coherent hover/focus states.
- [x] The Goal title and next action dominate the central surface while metadata remains available but quiet.
- [x] The Goal overview has one clear main reading path and one visibly subordinate context rail at spacious widths; it becomes one column without overflow when the document is narrow.
- [x] The Focus canvas contains two visibly separate bounded surfaces: an independent Hero/navigation block above a work-content block, with at least 12px of canvas space between them.
- [x] The Focus document is inset from the workbench edge; its title and first content never appear clipped against the top edge after switching tabs.
- [x] Context, Progress, Relationships, and Record all use the same two-layer section-card grammar: a stable equal-width selector row and one full-width detail stage.
- [x] Context exposes two cards, Progress four, Relationships four, and Record four; each preserves the content and actions previously available in that tab.
- [x] Selecting a Section never changes any selector card's width or position; only the shared detail stage changes content.
- [x] Every selector card shows its full title and description in Chinese and English; cards in the same row share the tallest content-driven height and no summary uses clipping to fake alignment.
- [x] Goal relation groups, rows, states, and actions share stable alignment at wide and narrow content widths; long IDs, paths, and reasons remain readable plain text instead of stacked full-width pills.
- [x] The shared detail stage reveals content with restrained height/clip/text motion; reduced-motion keeps the same information and interaction without transitions.
- [x] At narrow document widths the selector row wraps predictably while the detail stage remains below it, with no horizontal viewport escape and no changed focus order.
- [x] Existing Goal/section hashes, record lazy loading, relationship forms, and write receipts still reveal the correct card before focusing or scrolling to their target.
- [x] The selected Goal status appears once in the overview header and is not repeated beside “下一步”.
- [x] Primary actions use short, stable labels, remain content-width, and never reduce the explanatory copy to make room for a long dynamic title.
- [x] “下一步” contains no decorative arrow; its content and primary action share one left alignment below the section heading.
- [x] Completion requirements read as a compact working checklist; context facts do not become a full-width table.
- [x] Detail tabs use a clear editorial/navigation treatment instead of a floating segmented pill.
- [x] The central document has a readable measure and purposeful whitespace at 1280px and wider.
- [x] Runtime application chrome follows the current Molis Work theme, while only the terminal canvas uses terminal-specific colors.
- [x] Settings exposes Follow interface, Light, and Dark terminal appearance choices that persist on the current device and update live xterm instances.
- [x] Runtime primary, secondary, semantic, disabled, and terminal text remain readable in app Light/Dark combined with terminal Light/Dark.
- [x] Settings and project pages belong to the same product without copying the workbench layout blindly.
- [x] Standard and Compact are visibly different; Compact does not alter Runtime density.
- [x] At 761–1080px in Compact, Next Step, Completion, and Context retain at least 16px horizontal padding; their text does not touch or overlap the card border.
- [x] Light, dark, desktop, Runtime-open, settings, and 660–760px narrow Goal-list states are inspected in a real browser.
- [x] The narrow Goal toolbar owns its full intrinsic height and never overlaps the first Goal row.
- [x] No horizontal viewport escapes, browser warnings, browser errors, or component overlaps remain.
- [x] Targeted Web tests, typecheck, build, and `git diff --check` pass.

## Verification

```sh
node --import tsx --test tests/visual-foundation.test.ts tests/i18n.test.ts tests/web.test.ts
pnpm typecheck
pnpm build
git diff --check
```

Re-verified on 2026-08-28 after correction: 52/52 targeted tests passed, typecheck and production build passed, the design sidecar parsed, and `git diff --check` passed. Real-browser inspection covered Light/Dark, Standard/Compact, Runtime-open, 660px, 726px, and 1280px states. At 660px and 726px, the Goal toolbar bottom equals the tree scroll top, the first Goal begins below it, horizontal overflow is zero, and the browser console has no warnings or errors.

The terminal-palette correction was verified on 2026-08-28. 54/54 targeted tests passed, including the bootstrap preference, shell/canvas boundary, and live xterm palette-update wiring. Typecheck, production build, sidecar parsing, and `git diff --check` passed. Browser inspection covered Light application + Light/Dark terminal, Dark application + Light terminal, Follow interface across both application themes, the settings page, Runtime-open at 1280px, and Focus at 726px. The Light Runtime shell measured `rgb(255, 255, 255)` around a Dark terminal canvas at `rgb(16, 16, 18)`; the reverse combination measured Dark application chrome around `rgb(251, 251, 252)`. At 726px the Next Step heading, content, and action all start at x=43px, the decorative-arrow count is zero, and horizontal overflow is zero.

The temporary browser fixture intentionally has no linked workspace, so it cannot launch a real PTY session. Live xterm instances are covered by the client contract test (`theme: terminalPalette()`, the terminal-theme change event, and `term.options.theme = palette`) plus TypeScript and bundle compilation; a manually spawned PTY was not part of this browser pass.

The final Goal-overview correction was verified at 726px and 1280px in Light and Dark. At 1280px, Standard renders a 458px work column plus a 250px context rail, while Compact renders a 625px work column plus the same 250px rail. At 726px the DOM reflows to one column with zero viewport overflow. The visible child-Goal action is 111–117px wide instead of inheriting the child title, the Next Step section contains no duplicate status, project context is 70px in Standard and 62px in Compact, and browser logs remain empty.

The Impeccable detector was run once over the changed UI files. Its findings were advisory design-token drift in the legacy `render.ts` CSS layer that the final `VISUAL_FOUNDATION_STYLES` replacement overrides; it reported no blocking runtime or accessibility defect in the corrected path. Removing that legacy layer is a separate cleanup rather than part of this visual correction.

The Focus section-deck correction was verified on 2026-08-28. At 1280×900 the reading surface keeps 17.9px of canvas space on both sides; Context renders 2 cards at 715px/156px, while Progress, Relationships, and Record each render 4 cards with exactly one expanded body. Switching a main tab resets `documentTop` to 0. The `#acceptance-V1` deep link activates the Completion card before scrolling, and the Record fragment lazy-loads before its History card expands. Active-card motion measures 480ms; the reduced-motion stylesheet removes all card, summary, reveal, and padding transitions. At 700×900 the same cards stack to 646px full-width rows, outer inset is 8px, and horizontal overflow is zero. Light and Dark were both inspected; Dark risk, impact, record, document, and section surfaces resolve to theme tokens without legacy white islands. The interface preference was restored to Light after verification.

Final validation: 55/55 targeted tests passed, including new Focus canvas, responsive deck, reduced-motion, deep-link, and card-count assertions. Typecheck, production build, design-sidecar JSON parsing, and `git diff --check` passed.

The stationary-selector correction was verified on 2026-08-28. Hero and work content are now sibling bounded surfaces with 14px of canvas space at 1280×900 and 12px at the native 726px companion viewport. At 1280px, all four Progress selectors measured exactly 196×86px; selecting Open Risks left every selector's x/y/width/height unchanged while the full-width stage switched from State to Risks. At 726px, the two Context selectors measured 331px each and the four Progress selectors remained one stable horizontal row without viewport overflow. Relationship deep links activate the matching stage before scroll, Record still lazy-loads four 196px selectors, and its stage begins 12px below the row. Light and Dark were inspected; the Dark scope disclosure now resolves to `rgb(23, 23, 25)` instead of the legacy light surface. The browser was restored to Light and left on Progress for review.

The selector-content and relationship-row correction was verified on 2026-08-28 at the native 726×1169 companion viewport and 1280×900. In Chinese, the two longest selector summaries render at `60px` with `clientHeight === scrollHeight`; in English, the longest renders at `75px` with the same equality. Every card in each row shares the tallest content-driven height. All three relationship records share the same title (`copyX`), lifecycle-state (`stateX`), and remove-action columns, long metadata has transparent backgrounds and no pill radius, and both widths have zero horizontal viewport overflow. Light and Dark were inspected, then the browser was restored to Chinese Light and left open on Goal Relationships. Final validation remained 55/55 targeted tests, with typecheck, production build, design-sidecar parsing, and `git diff --check` passing.

The Compact inset correction was verified on 2026-08-28 at 706px, 882px, and 1280px. At 882px the Next Step, Completion, and Context title inset changed from the broken 1px edge to 19px (`18px` content padding plus the 1px border); all three share the same start. The 706px narrow composition retains a 21px inset, the 1280px Compact composition retains 19px, and every width has zero horizontal viewport overflow. Final targeted tests remained 55/55; typecheck and production build passed.

## Assumptions

- The supplied YouMind screenshots are the confirmed craft-level reference.
- Native system typography is retained for Chinese rendering quality and zero-loading latency.
- Existing icons and the Molis Work wordmark remain product assets, but their placement and emphasis may change.
