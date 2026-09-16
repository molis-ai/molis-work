# Attention and viewport continuity v6 — finish review

Project: /Users/yijunwang/code/goalboard. Read-only review of current implementation and supplied captures; no browser, mutations, detector, or unrelated repository audit. Working tree contains the entire earlier redesign; scope this review to the v6 contract.

## User request and authority
The user requested a systematic whole-product UI/interaction redesign, retaining Coss's neutral control language, Chrome grouped tabs and VS Code pane behavior. The earlier 26-surface redesign is recorded in specs/product-interaction-redesign/inventory.md and progress.md. Following that, the user rejected remaining attention/journey problems and authorized continued repair. Latest additions: pointer-aware Kanban scrolling; stable Feed toolbar boundary; content should fit a viewport when possible and otherwise scroll within lists/readers/forms, never the whole page. No need for new design-direction approval.

Unique contract: specs/product-interaction-redesign/spec.md, section “注意力与连续动线修正（v6）”. Product truth: PRODUCT.md. Direction: DESIGN.md and .impeccable/surfaces/immersive-workbench.md. Prior problem evidence: assessment-a.md and assessment-b.md in this directory. Do not use assessment screenshots as current-build evidence; assessment-b-feed-narrow.png is invalid.

## Direction / QUALITY BAR
Operate mode, incumbent Coss world; code-led correction, no approved comp or invented seed contract. Neutral monochrome surfaces, fine persistent borders, restrained semantic status/group colors, compact Chinese text with readable line height. Primary work is identifiable and reachable without hunting; current Goal identity agrees across directory/tab/header. One viewport shell with independently scrolling content, ordinary wheel expectations, keyboard focus retained. Touch controls 44px, short purposeful transitions and reduced-motion respected. Preserve domain data, explicit execution and existing content. No ornament required to disguise weak interaction.

Craft floor: /Users/yijunwang/.agents/skills/impeccable/reference/craft-floor.md. Finish workflow: /Users/yijunwang/.agents/skills/impeccable/reference/new-work.md. Detector already ran for this pass: assessment-b-detector.json = []; do not run again.

## Required current screenshots
All files here were opened by the builder and show their named state. Review each with view_image. Viewport screenshots intentionally end at scroll-container edges, not full documents.
- fixed-feed-desktop-dark.png — 1440×900, expanded Feed.
- fixed-feed-mobile-dark.png and fixed-feed-mobile-light.png — 390×844, expanded Feed.
- fixed-feed-split-1312.png — 1312×936, two horizontal Feed panes, restored actual stored dark theme. This emulates the previously measured user viewport; it is not a new screenshot of the user's tab.
- fixed-frame-picker-desktop-light.png — 1440×900; fixed-frame-picker-mobile-light.png and fixed-frame-picker-mobile-dark.png — 390×844.
- fixed-goal-desktop-dark.png and fixed-goal-desktop-light.png — 1440×900; current requirements, empty terminal, collapsed history. Light capture replaced after transitions settled.
- fixed-note-mobile-light.png — 390×844, note form with focus and same-row cancel/save.
- fixed-home-desktop-dark.png — 1440×900; fixed-home-mobile-light.png — 390×844. Builder observed native-looking “换一句” control; include in independent judgment.
- fixed-settings-mobile-dark.png — 390×844, expanded advanced project rules. DOM measured document 844px, settings-content 689px viewport / 1473px content; all scrolling internal.

## Changed boundaries
- apps/workbench/src/scripts/client/tab-workspace.ts, editing-graph.ts and styles/tab-workspace.ts: identity synchronization, active tab retention, no same-pane DOM reparent, explicit Frame vs work view and iframe-state notifications.
- plugins/native/goals/src/event-document-{ui,client,styles}.ts and apps/workbench/src/styles/goal-canvas.ts: current facts, initially collapsed history, form focus/actions, smaller relation heading.
- plugins/native/goals/src/momentum-client.ts: pointer/axis-aware wheel routing.
- apps/workbench/src/goals-page-renderer.ts, scripts/client/frame-container.ts: existing-content picker and local reference persistence.
- plugins/native/work/src/ui/terminal.ts and terminal/client.ts; apps/workbench/src/styles/base.ts: local empty-terminal action, chooser focus/return; removed visibility transition that prevented focus.
- apps/workbench/src/project-home.ts, scripts/client/project-home.ts, styles/project-home.ts: actual Goals action and manual quote change.
- apps/workbench/src/styles/immersive-directory.ts and scripts/client/navigation-feed.ts: full-width fixed toolbar, list/reader internal scroll, retry focus and correct scroll restoration.
- packages/design-system/src/styles/coss-controls.ts, i18n/en.ts: shared new controls and copy.

## Verification
Latest production build passed: /private/tmp/molis-v6-build.log.
26-test confirmation /private/tmp/molis-v6-confirm-tests.log has 25 passes and one test setup error: trying to click a mother tab after deliberately collapsing its group. Test now opens the group before clicking; rerun /private/tmp/molis-v6-attention-confirm.log is 2/2 passing. Covers actual wheel input across overflowing column/horizontal/Shift/header/edge, document no-scroll; Frame local reference persistence/reload/search/duplicate; focus, current title/directory, no history auto-open, terminal chooser/cancel, explicit Frame entry overriding saved work view, unchanged domain Goals/runs.
Other passing cases in 26-test run: Goal lifecycle/history, pane source navigation/nested resize/restore, unfinished form retention, related Goal isolation, shared control and tab operations.
/private/tmp/molis-v6-final-tests.log: Feed five cases (including long reader wheel and retry/collapse focus), two standalone settings cases and Goal review passed. Its two failures are superseded by latest tests (terminal focus fixed, old split reset-to-Frame expectation corrected to preserve current work view).
/private/tmp/molis-v6-new-tests.log: Home three cases and existing Frame container passed. No runtime execution/OAuth/native package/haptic hardware claims.

## Requested output
Return disposition exactly ship / fix / rebuild / recapture. Five sections: persistence, fidelity, ceiling, material_fixes, keep (recapture only needs invalid evidence list). Give specific actionable material defects with evidence/code locations; do not reopen unrelated old scope or require an unrequested visual world. Persist review as finish-review.md in this directory; write no other files. Verdict applies to this v6 scope, not a claim the entire product is perfect.

## Final correction evidence
V6-F1 and V6-F2 corrected in one production batch; no second detector. The five affected Home and Frame-picker screenshots above were replaced with final Chrome captures at the same named dimensions and opened for validation. Temporary failed IAB captures are not evidence and were overwritten before the verdict handoff. Existing remaining eight screenshots are unchanged.

Build passed: /private/tmp/molis-v6-review-fix-build.log. Home three regression cases passed in /private/tmp/molis-v6-review-fix-tests.log, including actual mobile 44px bounds. The picker case in that run measured during its .985 entrance scale; it now waits for real animations to finish rather than relaxing the target. /private/tmp/molis-v6-touch-confirm.log passes 2/2, measuring search/select/Cancel/Frame-add bounds in both 390px and actual coarse-pointer emulation and exercising persistence/focus/Frame navigation. Live CUA measures Home actions 44px, picker inputs/Cancel 44px, Frame add actions 44px; cancel focus is 添加已有内容. Test viewport and temporary theme overrides restored; temporary IAB QA tab closed.
