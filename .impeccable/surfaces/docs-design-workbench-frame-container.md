---
version: 1
slug: "docs-design-workbench-frame-container"
primary_target: "docs/design/workbench-frame-container"
related_targets: ["docs/design/workbench-frame-container/index.html","docs/design/workbench-frame-container/styles.css"]
---

Scope: workbench Frame container slice. Operate mode. Updated 2026-09-14 after correction.

Authority: `specs/workbench-frame-container/spec.md`. Visual world is incumbent Calm Desktop / immersive graphite: 264px directory, 32px titlebars, paper `#fff`, nav `#f8f9fb`, ink `#272932`, violet focus `#6262d6`. Do not introduce a second palette, display face, or dashboard-card grammar.

Thesis: the Goal canvas Tab is today’s dotted relation map (258×190 paper nodes, arrows, 「目标关系」). Original `.goal-canvas-open` still opens the Goal workspace. One extra 28px button to its left opens that Goal’s Frame Tab. Tabs mark location with type weight and a 2px bottom marker.

First viewport: left directory, pinned Goal-canvas tab, three compact Goal nodes with dependency arrows, 写周报 selected with a cobalt/violet border. Two top-right icon buttons: Frame, then maximize. No in-card chat.

Signature: one shadow family for menus and the existing workspace overlay only. Resting Goal nodes and Frame blocks have a hairline, no exterior drop shadow.

Finish: browser-checked Light/Dark at desktop and 390px, plus original workspace and Frame. Detector scan on the slice CSS. Not a production visual rewrite of `apps/workbench`.
