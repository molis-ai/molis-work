# v11 fix verdict — V11-F01 / V11-F02 only

## Disposition

**ship** — both listed findings are **resolved**. This is a verdict pass on the two requested corrections, not a new whole-product review.

## Finding scores

| Finding | Score | Evidence and judgment |
| --- | --- | --- |
| V11-F01 — Goal creation inner window and stretched rows | **resolved** | Updated creation captures at 1440×900 and 390×640 show a square, borderless inner surface meeting the workspace edge. Fields stay grouped toward the top; extra desktop height now becomes whitespace below content. Scoped CSS resets the actual `.dialog-shell` border/radius/shadow and applies `align-content: start` to the real `.dialog-body`. The regression checks that inner form directly. Expanded captures at 1440×400 and 390×500 show content scrolling behind stable header/footer regions; the supplied passing test dispatches a real wheel event, verifies changed body scroll position, and verifies unchanged header/footer coordinates. |
| V11-F02 — Feed keyboard focus visibility | **resolved** | Updated light and dark Feed captures at 1440×900 and 390×640 show an unclipped, distinct focus outline using the shared theme treatment. Scoped CSS restores the 2px `--control-ring` outline and removes the old halo. Both supplied focus JSON records cover input and select in both themes: 3.686:1 light and 6.826:1 dark against the adjacent paper surface, 2px outline, no shadow, `:focus-visible` true. The test uses a real Tab key event to move from input into select. |

## Evidence reviewed

Opened all 11 overwritten original required screenshots plus `feed-editor-dark-1440.png`, `feed-editor-dark-390.png`, `goal-create-expanded-low-1440.png` and `goal-create-expanded-low-390.png`. All are valid, settled captures of their named states. The additional low-height files are 1440×400 and 390×500 respectively. The seven representative states outside Goal creation / Feed were inspected only for collateral changes from this fix batch; they preserve their previous composition.

Read `surface-language.ts`, the affected test assertions, both `feed-focus-*.json` records, and `/private/tmp/molis-v11-fix-tests.log`: **6/6 pass**. `/private/tmp/molis-v11-fix-build.log` contains the workbench TypeScript build invocation without errors; successful completion is reported by the parent. No new browser session, detector, tests, external Runtime or native launch was run by this reviewer.

## Scope and close

No partial or unresolved items remain in **this two-finding list**. The correct delivery claim is: “The reviewer scored both v11 fixes resolved.” The result does not certify every product surface, all accessibility requirements, native launch or production readiness. Proceed to the scoped design-document update; no further fix batch is owed by this verdict.
