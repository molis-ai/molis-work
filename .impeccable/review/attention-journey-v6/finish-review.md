# v6 finish review

disposition: fix

## persistence

The v6 spec provides a clear scoped contract and correctly retains completion level 3. The implementation and supplied regression evidence support local reference persistence, current Goal identity, explicit Frame/work transitions, and preservation of source-owned data. This review did not execute a browser or tests.

Update `.impeccable/surfaces/immersive-workbench.md:74`: it still describes five-second automatic quotation rotation and half-second fades. The current v6 contract and `scripts/client/project-home.ts` instead implement manual change with a 160ms transition. Preserve the existing quotations and their sources in that documentation correction.

## fidelity

The retained neutral Coss language holds across Feed, Frame picker, Goal, note form and settings. Feed now has a full-width toolbar boundary in desktop, mobile and the 1312×936 split capture. Reading and action content continues into internal scroll areas; the viewport-edge clipping in the split capture is consistent with the supplied scroll evidence, rather than grounds to shorten the content. The Goal title agrees across directory, tab and work header; current unmet requirements are visible above initially collapsed historical bodies. Both Goal themes show the local empty-terminal action.

Opened all 13 required screenshot files with `view_image`. Reopened the Light Goal capture at original detail and confirmed the empty-state copy and button are present. No invalid evidence remains. No approved comp applies to this code-led correction.

## ceiling

This needs a bounded control correction, not a new visual direction or rebuild. The attention hierarchy and main journey are materially improved and satisfy the retained direction. The remaining visible failures concern newly added controls and a shared-style cascade that defeats the stated mobile target size. Repair the two items below together; verify their dimensions and keyboard behavior, then return only affected Home/picker captures. Do not reopen the earlier whole-product redesign or run another detector.

## material_fixes

### V6-F1 — Give the manual quotation control its intended shared appearance

`fixed-home-desktop-dark.png` and `fixed-home-mobile-light.png` show “换一句” as a native square browser button, with an unspaced icon and, in Dark, a light grey fill that reads like a disabled control. It is an enabled action introduced by this pass.

Root: `apps/workbench/src/project-home.ts` gives it `text-button home-quote-next`, but `apps/workbench/src/styles/project-home.ts:61` only supplies margin, minimum height, gap, font size and color. It never establishes flex layout, appearance, padding, border, radius, background or cursor; it is also absent from the shared control selectors.

Use the existing quiet Coss control treatment, align icon and text, and retain visible hover/focus states in both themes. Keep the manual behavior and existing page composition.

### V6-F2 — Make the new mobile controls actually reach 44px

The two 390px Frame picker captures visibly render search, source selection and Cancel at about 32px high. `styles/goal-canvas.ts:282` attempts to set them to 44px, but the shared Coss sheet loads last: `packages/design-system/src/styles/coss-controls.ts:196` and `:216` reset input/select minimum and actual height to `--control-h` (32px), and the more specific footer selector at `:137`/`:160` resets Cancel's minimum height. This is a real cascade failure, not a missing media-query intention.

The new Home “打开 Goals” and “换一句” controls are also 32px high in `fixed-home-mobile-light.png`; neither receives a narrow-screen/coarse-pointer 44px rule. Scope the shared size token or final overrides to these new controls, including the Frame add actions that currently retain a 34px minimum. Avoid enlarging unrelated compact desktop navigation.

Acceptance: at 390px and with coarse pointer, actual interactive bounds for these actions, search and source selection are at least 44px; the picker still fits the viewport and its result list scrolls internally. Search focus, Cancel return focus, manual quote change and Goals navigation remain functional. Existing picker close and row targets do not need an unrelated redesign.

## keep

- Full-width stable Feed toolbar, constrained reader width, internal scrolling and paired mobile action layout.
- Explicit Frame/work distinction, reference picker, source ownership and local reference persistence.
- Current Goal facts before historical bodies, consistent Goal identity, local empty-terminal action and focus-return behavior.
- Same-row note actions, focused first input, neutral themes and reduced-motion support.
- Home date, calendar, original quotations, manual-only change and truthful unavailable Agent composer.

This verdict covers v6 only. External fetching, real Runtime launch, native packaging and release readiness remain outside the supplied evidence.
