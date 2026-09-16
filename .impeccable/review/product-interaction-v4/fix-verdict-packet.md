# F1–F6 verdict pass
Use existing finish-review.md and original review-packet.md. F1–F6 corrections landed; latest Feed reader added by user is under a separate fresh full review. Score only the named six findings, no expansion.

- F1: 12 Goal form generators now footer Cancel left + specific Submit right. Explanations outside. Existing data-event-back exits without domain writes. Rule forms use reset/Cancel, clear errors/reason and native saved defaults; instant appearance remains instant.
- F2: source name/address/description/scope Save in dialog footer next to Cancel, button scopes to visible source panel. Close/Escape/reset discards unsaved config. Schedule has separate explicit save scope and reset; saving a schedule retains upper task draft, updates saved defaults without reloading. Reset preserves paused as well as enabled defaults. Test injects configuration failure and retries, verifies DB save scopes and cancellation.
- F3: only close icon gets square width; text mode switch natural width and mobile under heading. Footer uses 44px touch sizing on narrow.
- F4: empty Session button system primary, icon inline, existing creation handler.
- F5: settingsContextHref retains project + desktop. Fixed additional root cause: global planning contextProject had selected project settings nav; now personal/global library uses global nav with project return context, project-scoped editor still project nav. Full real browser chain appearance → runtimes → planning → new/cancel → diagnostics → return passes for web/desktop, restores CORE Frame. No-project settings close returns directory.
- F6: zero versions has meaningful results introduction, existing/unselected asks to choose, exact missing preserves accurate missing and no-latest substitution. HTTP tests all three.

Required current screenshots in this directory, parent opened each:
F1 final-goal-concern-1440-dark.png, final-goal-concern-390-dark.png, final-rules-bottom-1440-light.png, final-rules-bottom-390-light.png, final-rules-bottom-390-dark.png.
F2 final-feed-config-1440-dark.png, final-feed-config-390-dark.png.
F3 final-session-create-1440-light.png, final-session-create-390-light.png, final-session-attach-390-light.png.
F4 final-sessions-1440-light.png, final-sessions-390-light.png.
F6 final-artifacts-1440-light.png, final-artifacts-1440-dark.png.
Long planning footer supplementary final-planning-bottom-1440-dark.png, final-planning-bottom-390-dark.png.

Build /private/tmp/molis-review-fixes-build.log completed. /private/tmp/molis-review-fixes-tests.log 31/33; two failures onboarding outdated migration destination expectation and global planning wrong nav are fixed. /private/tmp/molis-review-fixes-final-tests.log 13/13 includes both corrected plus Feed, Frame and Coss. Goal lifecycle/document/retry/trash, Artifacts, project rule cancel/failure/save, and pane preservation passed in the first 31/33 log; not all-green label for that older file. /private/tmp/molis-feed-final.log reruns five Feed/Frame cases after paused-plan reset correction.
No second detector; /private/tmp/molis-product-detector.json remains single run []. No shipped raster additions. External OAuth/native haptic/native Runtime launch remain unverified.
Write fix-verdict.md with disposition and F1–F6 resolved/partial/unresolved. Do not edit product or broaden findings.
