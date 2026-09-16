# v6 fix verdict

disposition: ship

Scope: V6-F1 and V6-F2 only. No new defect hunt, browser session or detector was run.

## V6-F1 — resolved

The manual “换一句” action now uses the shared quiet Coss button treatment with aligned 14px icon, text spacing, pointer cursor and shared hover/focus behavior. The updated desktop Dark and mobile Light Home screenshots show the intended neutral surface and no native square-button chrome. Manual quotation behavior is retained.

## V6-F2 — resolved

The final shared stylesheet sets `--control-h: 44px` on the Frame picker, Frame add-action scopes and both new Home actions for narrow viewports or coarse pointer. Its final overrides address the original cascade failure without enlarging desktop controls. The five replacement screenshots show readable controls, preserved desktop sizing and a mobile picker contained within the viewport.

The supplied successful touch-confirm run records 2/2 passing tests; the handoff reports actual 44px bounds after entrance motion settles, narrow/coarse coverage, picker persistence and focus return. The Home run reports three passing Home cases including mobile measurements. The production build log completes successfully. I inspected the final CSS and these logs; I did not independently execute the browser tests.

## Evidence inspected

All five exact replacement files were opened using `view_image` at original detail:

- `fixed-home-desktop-dark.png`
- `fixed-home-mobile-light.png`
- `fixed-frame-picker-desktop-light.png`
- `fixed-frame-picker-mobile-light.png`
- `fixed-frame-picker-mobile-dark.png`

This resolves both material findings from `finish-review.md`. The already-assigned documentation correction for manual quotation behavior remains with the documenter; this verdict does not claim that documentation work has occurred.
