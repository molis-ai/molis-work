# Narrow Goal navigation — implementation handoff

Writer: Grok 4.6 / xhigh. Preview server was not stopped or restarted. Spec was not modified. No commit, push, install, or user-data access. Codex still owns final live-browser confirmation on the already-running preview (this writer rebuilt packages and ran isolated e2e only; Codex owns the preview restart that picks up the second batch).

**Supervisor completion:** Codex subsequently restarted only the isolated preview, loaded the final build, and completed the final 390/721/1440px confirmation. All eight contract scenarios and evidence are recorded in `spec.md` under 最终验收. The preview is left at the Goal list with normal viewport sizing and cleared temporary search. No source/test edits were made by Codex; no commit/push/install was performed. The writer-only live-QA status below is retained as its execution record, not an outstanding task.

## Cause

1. `plugins/native/goals/src/event-document-styles.ts` set `.document-pane:has(...) { display: flex }`. `:has()` carried the argument’s specificity, so that rule beat Workbench’s `.workspace[data-mobile-view="tree"] .document-pane { display: none }`. At 721×936 the target tab and `data-mobile-view="tree"` were already correct, but the document pane stayed `display:flex` (height 844) and the tree pane collapsed to height 0 in the same cell.
2. Clicking 目标 (`data-mobile-target="tree"`) only flipped `mobileView`. From directory root that left `desktopDirectory="root"`, so the Goal list never opened.
3. `applyUiState` forced `mobileView="document"` whenever `desktopCompanionActive && selected`, then called `setWorkspaceMode("focus")`. Reload therefore discarded a stored list or Runtime view.
4. `setDesktopDirectory` and `setMobileView` each mutated tab `is-active` / `aria-selected` with different predicates, so more than one tab could look selected. Hidden panes were not `inert`.
5. 1440px graph → 390px set `mobileView="tree"` while `workspaceMode`/`navigatorView` stayed `graph`. The tree pane could have height, but `.goal-list-view` stayed `display:none` (empty view). Graph is the current surface on that narrowing; 目标 then returns to the real list.
6. 390→721px `applyMobilePanePresence` moved focus from the project-menu summary onto 目标 even when that focus did not belong to a now-hidden pane.

## What changed

Event document styles keep their flex layout, but the `:has()` condition is wrapped in `:where()` so Workbench owns pane visibility. Narrow CSS also hides the graph sibling when the tree pane is selected, stacks the single-column panes in one cell, and raises primary mobile-switch hit targets to 44px with visible `:focus-visible`. Tree click opens the current module directory (Goals / Feed / Sources / Sessions), exits graph when needed, and one shared `syncMobileNavigationChrome` owns the single selected tab. Graph + `mobileView="document"` maps to 目标 selected with `aria-controls="goal-momentum-pane"`; no new top tab. Stored `mobileView` is restored as-is; a direct Goal URL still opens focus. Hidden panes get `inert`; arrow/Home/End on the existing switch activate the next tab.

`applyMobilePanePresence` only relocates focus when the previous active element belonged to a pane that is now hidden. Project-menu, modal, and topbar focus stay.

Resize into the desktop companion: `workspaceMode === "graph"` now calls `setMobileView("document")`, so the graph remains the visible surface. Clicking 目标 then shows a real nonzero Goal list and hides graph.

Mobile selected underline `::after` bottom is `0` to match the 44px no-padding controls.

## Files

- `plugins/native/goals/src/event-document-styles.ts`
- `plugins/native/goals/src/navigation-client.ts`
- `apps/workbench/src/styles/responsive.ts`
- `apps/workbench/src/scripts/client/{documents-state,editing-graph,events-secondary,initialization,navigation-feed}.ts`
- `packages/design-system/src/styles/{momentum,personal-workbench-v3}.ts`
- `tests/goals-narrow-navigation.e2e.test.ts` (new)
- preexisting unrelated `desktop/20260902-022934.jpg` deletion left in place

## Commands

First batch (already verified earlier; plugin code unchanged since then):

```
pnpm --filter @molis-ai/molis-work-plugin-goals build
pnpm --filter @molis-ai/molis-work-design-system build
pnpm --filter @molis-ai/molis-work-app-workbench build
```

Final batch (this writer):

```
pnpm --filter @molis-ai/molis-work-design-system build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-narrow-navigation.e2e.test.ts tests/goals-navigation.e2e.test.ts tests/goals-momentum.e2e.test.ts
```

Results (logs in `/private/tmp/molis-work-narrow-nav/`):

- first batch: goals / design-system / workbench `tsc` exit 0; focused tests 10 pass, 0 fail, 0 skipped (~25s) in `focused-tests.log`
- final design-system `tsc` exit 0 (`final-design-system-build.log`)
- final workbench `tsc` exit 0 (`final-workbench-build.log`)
- final focused tests: 6 pass, 0 fail, 0 skipped, ~20.4s (`final-tests.log`)
  - narrow Goal switch shows the list, restores the stored view, and keeps one tab (includes real `recordNote` refresh while still in list)
  - narrow list, graph return, keyboard switch, desktop side-by-side, and 1440 graph → 390 keep usable geometry
  - existing Goal navigation and momentum tests

Host serves `/assets/molis-work-workbench.css` and `.js` from `renderMolisWorkWorkbenchStylesheet` / `renderMolisWorkWorkbenchClientScript` on the rebuilt workbench package. Isolated e2e hits that renderer through the existing temp-database Chrome fixture.

## Spec acceptance (this writer)

| Contract | Result | Evidence |
| --- | --- | --- |
| 721px 目标 shows usable Goal list; detail does not cover it | pass | e2e computed `display`, height, `elementFromPoint` |
| Direct Goal URL opens focus; same Goal from list returns focus | pass | first test |
| Root 目录 then 目标 opens current module list (Goals / Feed labels) | pass | first test |
| Reload keeps list; Runtime reload stays runtime | pass | first test |
| Failed Goal load stays on list and retries | pass | first test |
| Real refresh via `GoalProjectApplication.goalEvents.recordNote` stays on list and shows the new note | pass | first test wait on greater `goalEventCursor` + visible note |
| One selected tab; 44px; keyboard on existing switch | pass | both tests |
| 390px no horizontal escape; 1440px side-by-side | pass | second test |
| Graph sibling hidden when tree is selected; return to list | pass | second test |
| Graph + document maps to 目标 / `aria-controls=goal-momentum-pane` | pass | second test |
| 390→721 does not steal project-menu focus | pass | second test |
| 1440 graph → 390 keeps graph geometry and 目标/graph chrome; 目标 then shows nonzero list and hides graph | pass | second test |
| Live visual 390/721/1440 in the open preview | not run | Codex owns preview restart and live-browser QA |

## Limits (not over-engineered)

- Graph is not a fourth mobile tab. Entering graph maps to `mobileView="document"`; selecting 目标 exits graph and CSS hides `.goal-momentum`. A full graph-as-exclusive-mobile-view would be a larger navigation change than this repair.
- Sessions uses the same `currentModuleDirectory()` helper; the e2e clicked Goals and Inbox/Feed, not Sources/Sessions.
- Default desktop layout, event reader, business data, and the running preview process were left alone.
- `tests/workbench-ui-platform.test.ts` was in the first-batch command set and is not part of this final focused run.
