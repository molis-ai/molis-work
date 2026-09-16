# v11 continuous workspace — independent finish review

## 1. Disposition

**fix**. The continuous Goal workspace and edge-attached editor direction are established. Two material gaps remain in the supplied render: Goal creation retains a second framed container with stretched field spacing; Feed configuration loses the shared visible keyboard focus ring. These are bounded CSS corrections, not a direction rebuild.

All 11 required captures were opened at legible viewport size and are valid: `goal-note-1440.png`, `goal-note-dark-390.png`, `goal-create-1440.png`, `goal-create-390.png`, `feed-editor-1440.png`, `feed-editor-390.png`, `session-editor-1440.png`, `session-editor-390.png`, `frame-picker-1440.png`, `frame-picker-390.png`, `settings-1440.png`. They show settled content without blank or malformed regions.

## 2. Brief / contract alignment

The user's pinned Linear × coss direction and spec v11 take precedence over the older rounded Goal guidance. No approved comp or generated artwork was supplied or required for this code-led workspace.

Goal note editing now occupies the pane beneath the persistent tabs, with a left back action and a fixed action footer. Its mobile dark rendering preserves that composition. Feed, Session and Frame editors attach to the right edge at the tab baseline; settings uses the same quiet neutral surfaces, fine separators and restrained action hierarchy. Canvas dots remain tied to a real spatial canvas, so they are justified. Keeping native modal semantics for temporary editing is explicitly inside v11 scope.

The visible Goal creation shell is the remaining exception to the promised single surface language. Its stretched rows also undermine the density and content grouping established by the other editors.

## 3. Visual / accessibility findings

### V11-F01 — P1 / material: Goal creation still reads as a framed dialog within the edge panel

**Evidence:** Both `goal-create-1440.png` and `goal-create-390.png` show an inner rounded outline at the panel's top corners and perimeter. At 1440, the name field ends around y=207, the outcome label starts around y=283, and the three collapsed sections spread down to y=748 with large height-driven gaps. Feed and Session group fields toward the top instead.

**Cause supported by source:** `surface-language.ts` removes radius/shadow from the outer `dialog`, but only gives its immediate form height constraints. The inner `.dialog-shell` still inherits border, radius and shadow from shared `calm-desktop.ts` / `quiet-paper.ts`. The Goal body is `<div class="dialog-body">` (`plugins/native/goals/src/dialogs-ui.ts`), whereas the new `align-content: start` and spacing rule targets `> form > section`. `.dialog-body` remains a grid whose default content alignment stretches available rows. The current outer-dialog geometry assertion cannot detect either inner-shell defect.

**Required correction:** Within the existing edge-editor scope, make the actual inner shell borderless, square and unelevated; align the actual Goal body grid to the start, using the same intentional field spacing as the other editors. Keep the body internally scrollable and the footer fixed. Preserve field labels and disclosure behavior. Do not remove borders from real form controls or canvas objects.

**Acceptance:** At 1440×900 and 390×640, creation has one flush panel surface, with no inner window outline or corner cutouts. Collapsed sections follow the fields with deliberate spacing; additional viewport height becomes whitespace below content rather than larger gaps between each field. Expanded content can still scroll without pushing the footer offscreen.

### V11-F02 — P1 / material accessibility: Feed editor keyboard focus is nearly invisible

**Evidence:** The subscription input is focused in both `feed-editor-1440.png` and `feed-editor-390.png` (visible caret), but its only ring is very pale lavender. Goal and Frame inputs have a clearly visible graphite focus outline, so the same operation also changes visual language across editors.

**Cause supported by source:** `personal-workbench-v3.ts` sets `outline: 0` on `body[data-desktop-shell="true"] .feed-source-dialog input/select`, with higher specificity than the generic shared `:focus-visible` rule. Its old focus shadow is only 10% blue. The newer, more specific `.feed-task-dialog :is(...)` control rule also restores the pale normal border. The result shown in the captures does not retain the shared focus ring. A 10% blend of the light-theme blue over white is approximately #efeffa, about 1.14:1 against white, well below a 3:1 visible state indicator.

**Required correction:** Restore the shared theme-aware `:focus-visible` outline for Feed inputs and selects at sufficient specificity within the scoped editor. Remove the competing faint focus halo there so the editor uses the same single focus convention as Goal/Frame. Preserve normal control boundaries and input sizing.

**Acceptance:** Keyboard-focused Feed input and select have a clearly visible, at least 3:1 indicator against their adjacent surface in light and dark themes, with no clipping at mobile width. The existing subscription input focus screenshot should show the corrected state.

## 4. Behavior / evidence limits

Read the supplied test source and log summaries; no browser, detector, full tests, Runtime or native app was launched by this reviewer. `molis-v11-final-build.log` records a successful build. `molis-v11-final-ui.log` records 4 passing tests covering continuous workspace geometry at 1440×900 / 390×640 and low-height directory/Session action reachability at 1024×400 / 390×500. The continuous-surface test also observes note focus, cancellation without a cursor change, return to the Frame, and panel opening/closing. The parent reports 15 additional passing regressions; their scope is not upgraded into new claims here.

The screenshots prove representative composition and visible states. They do not prove every plugin page, every dialog state, screen-reader behavior, a native desktop launch, external Runtime execution, or production persistence. Session relations are covered by the shared selector but do not have a distinct supplied capture. Reduced-motion screenshots cannot verify the regular entry transition. Neither limitation is evidence of a new defect, and this review requests no broader redesign.

## 5. Scoped verdict and verdict-pass evidence

**fix**, limited to V11-F01 and V11-F02. All other supplied representative surfaces support the chosen v11 direction; this is not a whole-product accessibility certification or release verdict.

Apply both corrections in one batch. Rebuild once and rerun the affected viewport checks. Replace the same required screenshot files for the final evidence round, retaining the exact viewports and settled capture conditions above. For the verdict pass, explicitly include corrected Goal creation and Feed editor at 1440×900 and 390×640; keep the other seven representative states in the packet to detect shared-style collateral changes. Supply computed focus outline/color evidence for focused Feed input and select in both themes, and an expanded Goal creation / low-height scrolling check. No new detector run is requested.

The next review scores these two findings resolved / partial / unresolved; it must not be reported as a new whole-product audit. Update DESIGN.md and the surface brief only after the final correction, so the documented world matches the build.
