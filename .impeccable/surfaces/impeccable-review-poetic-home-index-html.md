---
version: 1
slug: "impeccable-review-poetic-home-index-html"
primary_target: ".impeccable/review/poetic-home/index.html"
related_targets: []
---

Mode: Operate. Slice only; do not change production `renderProjectHome`.

Audience: sitting down to open one page of work, not to scan a dashboard.

Direction: keep the designed open-page scheme in `specs/home-open-page/spec.md` — one paper card on the field, bookmark, unfold/fold, edge drawers. Rebuild the chrome with the current workbench grammar: 32px titlebar, 48px three-card raised rail, Inter 13px/400, Action fill primary, 12px paper card with `--control-shadow`.

First viewport: folded `mw-card` in the middle. Title, last bookmark line, Action fill primary “打开草稿，接着想”. Ghost “换一件事” / “先放下一些想法”. “今天先到这里” as ghost at the bottom. Drawers are `dialog.mw-drawer`. Inputs are `mw-input` / `mw-textarea`.

Keep the open-page composition. Do not keep the old underline CTA, sweep highlight, custom `.open` / `.solid` / `.ghost`, or borderless fields.

Not the date/calendar/quotes empty page. That was the wrong poetic-project-home production layout.
