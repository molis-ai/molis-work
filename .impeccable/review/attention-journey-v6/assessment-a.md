# Assessment A — independent design review

Method: isolated Assessment A, no prior review conclusions or detector output consumed. Date: 2026-09-16. Target: current workbench source and isolated preview `http://127.0.0.1:4186/projects/project-cc9b4ba9-4a91-4c88-92a1-e92d3609cbff/`.

## Judgment

The product has a recognizable working environment: dependency canvas, Goal-bound workspace, outer tabs, personal reference Frame, and a separate settings world. This is more specific than a generic dashboard. The neutral palette and restrained surfaces are coherent. **Attention protection is incomplete, however: the app provides a quiet background but does not consistently put the most useful fact at the user's point of attention.** At the most important moment—opening a Goal—the largest area is an empty terminal, the most emphatic content is automatically expanded history, and the present-tense explanation only says “有事项挡住完成”.

The major opportunity is a stable, readable current-Goal anchor and an actionable explanation of current state. Preserve outer tabs and free panes; do not remove or auto-collapse user-arranged context to obtain superficial cleanliness.

## Exact behavioral boundary and evidence

Fresh independent Chrome tab 161736504. Existing dark theme and persisted tab state were left intact. Desktop viewport screenshots were 1535 × 1083. Visited project home → Goals board (restored state) → canvas → `把 Molis Work 作为不切窗口的主工作站` Frame → work area → 记一笔 → 随手备注 → cancel → project settings → return → Inbox. No form was submitted; no domain data, theme, account settings or terminal state was changed; no Runtime was launched. Opening/selection necessarily changes local navigation/view state. Parent-owned preview remains running. Original tabs preserved.

Saved and visually inspected eight screenshots in this directory: assessment-a-home.png, assessment-a-canvas.png, assessment-a-frame.png, assessment-a-workspace.png, assessment-a-note-chooser.png, assessment-a-note-form.png, assessment-a-settings.png, assessment-a-inbox.png.

Read product/design/surface context, then current navigation, Frame, event-document and motion source. This is representative desktop critique, not full functional, keyboard, mobile, native-package or failure-path certification.

## Nielsen scores

Scores are design quality 0–4, not defect severity. Limited to observed surfaces and directly inspected source.

| Heuristic | Score | Evidence / qualification |
|---|---:|---|
| Visibility of system status | 2 | Goal status and requirement count exist, but current blocker is generic; Frame and tree identity diverge. |
| Match with real world | 3 | Outcome-based Goal names and plain record choices are useful; Frame / Goal / 工作区 distinction still needs learning. |
| User control and freedom | 3 | Blank note cancel returns and focuses 记一笔; independent settings returns to same Goal/tab. Undo of domain writes untested. |
| Consistency and standards | 2 | Settings/form controls consistent, but selecting Frame does not update selected tree row; browser title also stays at previous Goal until work view. |
| Error prevention | 3 | No automatic terminal launch; note clearly describes its non-execution effect; disabled execution controls are genuine. Destructive operations untested. |
| Recognition rather than recall | 2 | Labels help, but many Goal titles truncate and empty Frame requires recalling another plugin's draggable material. |
| Flexibility and efficiency | 3 | Outer grouped tabs and retained workspaces offer useful control; sources include keyboard tab handling and independent pane content. This run did not certify every gesture. |
| Aesthetic and minimalist design | 2 | Calm palette; present work facts lose prominence to history and empty execution area. |
| Error recognition and recovery | 2 | Source preserves original ID/source when event body unavailable (`event-history-body.ts:29`), but this run did not exercise live retry/error states; provisional evidence-limited score. |
| Help and documentation | 2 | Contextual note and terminal guidance works; Frame uses a short drag instruction with no immediately visible material picker. |
| Total | 24/40 | Acceptable; significant improvements needed in attention/orientation. |

## Strengths

1. Settings is a genuinely separate, predictable place. `assessment-a-settings.png` has four categories, one content column, clear scope and visible return. Return restored the same selected Goal and workspace. This protects the workbench from configuration clutter.
2. The note journey has a manageable three-way choice with plain consequences, a single edit area, adjacent cancel/save, and verified cancellation/focus restoration. `assessment-a-note-chooser.png` and `assessment-a-note-form.png` demonstrate purposeful disclosure rather than a wall of commands.
3. The visual language is restrained and the product avoids fake activity: no terminal starts on opening; Inbox can end with “现在没有需要你介入的事项” rather than fabricated urgency. Full outcome names in Frame provide a solid readable anchor when opened.

## Priority findings

### A1 · P1 · The current-state anchor tells me there is a problem without telling me what to do

- **Reproduce:** Goals canvas → Frame `把 Molis Work 作为不切窗口的主工作站` → 打开工作区.
- **Observed:** right rail reads “有事项挡住完成” and “完成要求 0/1 已满足”. No concrete next action or named blocker is visible. Meanwhile the largest main region is a black empty terminal, with disabled advancement controls above it; the only start action is small, distant “添加终端”.
- **Why:** The product promises a quick answer to current goal, next step and why completion is blocked. The person must open requirements and reconstruct the situation before deciding whether to start work. This is an information-selection problem, not simply a color problem.
- **Evidence:** assessment-a-workspace.png. `plugins/native/goals/src/event-document-ui.ts:49–51` renders outcome, lead and only an explicitly stored progress next_step; `:142–173` computes richer next/risk information but renders a generic blocked lead. Its `deps.length` also contributes to generic blockage even though the sampled dependency is shown completed in the tree; do not diagnose the actual cause from the generic sentence.
- **Fix:** In the same optional rail, show one truthful present-tense statement naming the unmet requirement/decision/blocker and a directly corresponding action; when no supplied next step exists, state that rather than inventing work. When terminal empty, make the existing Add terminal entry a clear local action inside that empty state. Keep opening distinct from launching and sending.
- **Suggested command:** impeccable clarify / layout.

### A2 · P1 · Frame selection leaves a contradictory selected Goal in the directory

- **Reproduce:** with root Goal previously selected, choose another Goal's `打开 Frame` action on canvas.
- **Observed:** Frame headline and outer active tab say `把 Molis Work 作为不切窗口的主工作站`, but directory still highlights `让第一次使用的人顺利完成一轮目标协作`. AX reports root selected true and current Frame Goal false. Opening 工作区 then correctly moves selection to current Goal. Browser title similarly retained previous Goal before work view.
- **Why:** In a multi-Goal tool, current identity is a safety and attention anchor. The user should not need to interpret which of two highlighted identities controls the next action.
- **Evidence:** assessment-a-frame.png compared with assessment-a-workspace.png. `apps/workbench/src/scripts/client/tab-workspace.ts:62–67` returns from the Frame branch before applySelection; `frame-container.ts:333–342` sets activeTab/work surface/mode without applying selected tree identity.
- **Fix:** Derive directory active-object presentation and window title from the focused outer tab for Frame as well as work view. Preserve separate canvas lineage selection if useful, but label/style it as graph selection rather than current object. Do not rebind execution or open another pane.
- **Suggested command:** impeccable harden.

### A3 · P2 · Auto-expanded historical detail outranks current facts

- **Reproduce:** same Goal work area, immediately after opening, without selecting an event.
- **Observed:** first relation event is expanded automatically. Its large “Goal 关系变更” heading, highlighted event card, relation boxes and explanation occupy nearly all visible timeline height; later history goes below the fold. Current state uses tiny text above. This historic relationship is visually more authoritative than current progress.
- **Evidence:** assessment-a-workspace.png. `event-document-ui.ts:42` chooses the first timeline item by default. `event-history-body.ts:187` puts relation h2 inside header, while `styles/goal-canvas.ts:154` limits the smaller history heading rule to `.event > h2`, so this nested heading escapes it. Rail fixed at 300px in `goal-canvas.ts:88`.
- **Fix:** Give relation event headings the same secondary scale as other inline event content. Start with compact recent rows unless a user-selected event is being restored, and preserve the user's explicit expanded event on return. Keep history inline and the rail closable; do not replace outer tabs or create another persistent inner tab system.
- **Suggested command:** impeccable typeset / distill.

### A4 · P2 · The empty Frame teaches a gesture but does not expose the objects needed for it

- **Reproduce:** open an unused Goal Frame from Goals.
- **Observed:** center says “从目录拖入消息、会话或资料” while the visible directory contains only Goals. Getting a message/session/artifact requires switching destination, which changes the central stage too; the user must discover returning to this Frame or arranging panes before they can carry out the first instruction.
- **Why:** The free canvas has an attractive spatial promise but creates an immediate memory bridge in first use. It risks feeling like an empty extra stop on the way to the real Goal work area.
- **Evidence:** assessment-a-frame.png. `styles/goal-canvas.ts:251` sets frame-empty pointer-events:none; no inline material action visible in the inspected Frame AX tree. `frame-container.ts:313–314` exposes only work/locate actions in the summary.
- **Fix:** Add a contextual “添加已有内容” entry in the empty Frame that lists existing message/session/artifact references without leaving it, while retaining drag from other panes for experts. Use the existing owner/read semantics and do not silently create or associate domain records. This is a proposal for discoverability, not a claim that dragging is functionally broken.
- **Suggested command:** impeccable onboard.

### A5 · P2 · Home's strongest action-shaped anchor is unavailable, while its only movement is incidental

- **Observed:** spacious date/calendar and quote composition is pleasant; bottom composer occupies the strongest action position but is disabled (“Agent 尚未开放”). The quote changed between observations. No inline working route accompanies the unavailable composer.
- **Evidence:** assessment-a-home.png. `scripts/client/project-home.ts:68–84` auto-rotates every five seconds, pausing hover/focus; reduced motion removes fade but still changes text. Goal opening itself uses 200ms/5px restrained entry motion (`styles/goal-canvas.ts:230–231`).
- **Fix:** Retain the personal home/date/calendar and the user-requested layout. Until composer is live, include one quiet truthful route adjacent to it (e.g. existing Goals or last opened Goal) so this focal point leads somewhere. Consider user-controlled quotation change or a slower cadence: the homepage need not attract repeated attention with unrelated text while waiting. Do not fabricate AI functionality or current activity.
- **Suggested command:** impeccable clarify / quieter.

## Cognitive load

Checklist results for Goal entry: grouping passes; general visual restraint passes; progressive disclosure passes for forms. **Fails visual hierarchy, one thing at a time, minimal concurrent navigation choices, and working-memory continuity** → high load at the orientation/entry decision, despite low visual ornament.

Counts are not a blanket demand to hide navigation: seven permanent destinations, several open outer tabs/groups, twelve tree rows, two per-node open meanings and a board/canvas switch are available simultaneously. Their stable availability is valuable for an operating tool. The failure is insufficient emphasis on current object/current action among them. The note chooser has three distinct options and low load; settings has four categories and low load; empty Inbox also has low load.

## Emotional journey and personas

- **Arrival:** calm and personal, then small disappointment when the central composer cannot act.
- **Goals canvas:** sense of real project structure; equal large outcome nodes plus truncated directory labels demand scanning. Initial view was persisted at 100% with nodes outside the viewport; treated as saved state, not claimed layout failure.
- **Frame:** full title restores confidence, empty material canvas creates uncertainty about what belongs here and how to add it.
- **Work area:** biggest valley. User sees an empty execution area, generic blockage, and verbose historical detail instead of a confident next step.
- **Note/cancel:** task becomes focused and predictable; cancel lands correctly on 记一笔.
- **Settings/return:** reassuring continuity; no lost current Goal in the verified path.
- **Inbox end:** legitimate quiet and closure; sampled queue was empty, so pending-item decision journey remains unassessed.

Alex (power user): preserve outer tabs/free splits; stale Frame directory highlight and long truncated titles impede fast switching. Jordan (first-time user): empty Frame instruction needs materials not visible in current directory; disabled home composer and distant terminal start action create hesitation. Goal-owning multi-Runtime developer: present requirement/blocker must outrank historical plumbing; otherwise they still have to reconstruct truth before resuming work.

## Minor observations / limits

Top group color lines extend across large inactive areas and many titles truncate; worth tuning selected-tab salience without collapsing groups or removing free panes. Canvas mother tab stayed titled 画布 while showing restored 看板 state; minor terminology mismatch. Note menu buttons were temporarily blank in AX even while screenshot showed text; not enough here to diagnose accessibility failure, and source contains labels. No fabricated animation-performance or contrast claims: this run observed transitions and read timings, not frame-rate or numerical contrast measurement.

## Questions for parent synthesis

1. On opening a Goal, what single sentence should make the person confident enough to act before reading history?
2. Can adding the first reference to a Frame happen while the Frame stays visible, with no need to learn pane choreography first?
3. Should current-object identity follow the focused outer tab everywhere, while graph lineage selection remains an explicitly separate cue?
