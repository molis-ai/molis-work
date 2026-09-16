# Feed content redesign: independent full review
User rejected the prior Feed body: “现在这个 feed 里的内容区的列表和展开，以及展开里的信息质感也很差，很违和，重新做一下”. This extends the active whole-product request, whose requirements remain specs/product-interaction-redesign/spec.md and inventory.md. Use this latest request over the old review's retained Feed conclusion.

Read PRODUCT.md, DESIGN.md, .impeccable/surfaces/immersive-workbench.md for Operate direction. No new approved comp; Coss neutral dense workbench direction is retained. Quality bar: readable scan hierarchy and coherent inline reading, body is primary, avoid duplicating title/summary/source panels, explicit readable read/destination states, clear purposeful actions, natural expand/collapse, desktop and 390 work, no pretend persistence for demo. Preserve actual source filtering, keyboard navigation, read marking, failures/retry and Feed domain boundaries.

Artifact: plugins/native/feed/src/ui.ts (stage list, prototype detail, persisted detail); apps/workbench/src/styles/immersive-directory.ts; apps/workbench/src/scripts/client/navigation-feed.ts; packages/design-system/src/styles/coss-controls.ts. New rows carry source/time/read, title, summary, provider glyph and chevron. Expand retains one visible title, body and source links, tags and collapsible attachments, destination/actions footer. Mobile actions two columns. Current disposition enums and safe material references retained. Scope only this Feed list/reader, not other forms or unrelated layout.

Required screenshots (all relative to this packet, opened by parent):
- feed-list-v5-1440-light.png
- feed-reader-v5-1440-light.png
- feed-reader-v5-390-light.png
- feed-list-v5-1440-dark.png
- feed-reader-v5-1440-dark.png
- feed-reader-v5-390-dark.png
- feed-list-v5-user-1312-dark.png
- feed-reader-v5-user-1312-dark.png
The last two are user's real IAB viewport, no emulation. Demo is explicit. Earlier feed-reader-1440-dark.png/final-user-feed.png are superseded and should not be scored as current.

Evidence: /private/tmp/molis-review-fixes-final-tests.log 13/13 includes actual DB read state, failed detail→retry, one visible title, collapse/reopen/filter, source create and failed plan retry. Prior /private/tmp/molis-review-fixes-tests.log 31/33; its two navigation failures are fixed and pass in final log. No generated raster asset. Detector ran once for whole product /private/tmp/molis-product-detector.json = []; do not rerun. No external OAuth or native haptic/Runtime launch claim.

Use Impeccable full finish review (five contract sections), craft-floor /Users/yijunwang/.agents/skills/impeccable/reference/craft-floor.md. No browser. Read source and all named screenshots; no product edits. Report disposition ship/fix/rebuild/recapture and only material findings. Write feed-v5-finish-review.md beside this packet. Parent is independently completing previous F1–F6 review fixes; avoid shared-file edits or expanding into them.
