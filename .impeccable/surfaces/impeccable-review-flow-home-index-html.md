---
version: 4
slug: "impeccable-review-flow-home-index-html"
primary_target: ".impeccable/review/flow-home/index.html"
related_targets: []
---

Mode: Operate. Slice only; do not change production `renderProjectHome`.

Audience: sitting down, seeing what already arrived today, and what can still be added.

Direction: the scheme in `specs/home-flow-stream/spec.md` v5. Two columns: today's stream, and one solid task panel. Talk is not a left column. It is a small 说一句 button on each event and each task — an action on that item. Click opens a lightweight popover next to the button, already scoped to that row. ⌘K opens it for the current event.

Today's events live in a single recessed track — `--control-fill` with a `--hairline` boundary — and the current event is a raised `--nav-raised` chip carrying `--surface-shadow` plus the dark-mode top highlight. This is the existing segmented-control language, not a new pattern. Everything else in the column is plain paper cards: greeting, connect-calendar, source status, what's doable now. Paper cards take the hairline and no shadow; the raised event takes the shadow and no border. Nested content inside a card is fills and rows, never a second card.

Ticks are one per event, all the same 12×2 length, sitting on the left edge of that event's row so they travel with the card. Rows stay compact, like the original shutter teeth, not a sparse left rail. Hover a tick to show that event's card; drag or wheel the track and the ticks roll with the cards. The current event sits in the middle as the raised chip. Not a day-mapped shutter, not a soundwave, not an hour table.

The task panel is a full-height paper: heading plus 创建任务, a 任务 / 定时任务 segment, then real-density rows (plugin-tinted icon, title, one line of hint, a persistent plus). No hover-only affordances, no category capsule wall, no large empty area.

Colour appears only in small marks: plugin tints on event and task icons, status dots on the source list. No washes, no bars, no filled charts.

Chrome stays: 32px titlebar, 48px three-card rail, Action fill primary. No 2px plugin stripe. No kicker above headings.

Not a dashboard, not an hour table, not a soundwave, not explode-the-day, not the pastel 刀盾 skin.
