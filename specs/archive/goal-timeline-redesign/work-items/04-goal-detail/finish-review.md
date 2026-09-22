# 04 独立生产界面 finish review

2026-09-09。全新直接 Grok CLI，grok-4.6 / xhigh；只读，原 Impeccable 评审规则经格式封装适配。会话 f52b9a7e-136e-48d7-9c41-7ebc6a80ac76。以下是最终完整五段结论，范围限所列视觉与 UX 证据，不代表功能验收。主 Session 将 P1 与 review-2 合并修正，P2 不另开视觉优化任务。

disposition: fix

## persistence
pass. Root `PRODUCT.md` exists (old five-tab copy; packet forbids using it as visual authority). Not a generated-comp build: no `hero-repro.png` owed. Direction is `specs/archive/goal-timeline-redesign/DESIGN.md` (approved v3 Operate/Read); 04 spec overrides prototype simulation. No comp-round mocks requiring an approval record. Detector `04-design-detector.json` is `[]` (static only).

## fidelity
Code-led production of the approved v3 prototype (critique-reference, not a generated raster spec). Inventory from revision-3 screenshots, then production captures:

| element | class |
|---|---|
| TYPE | match — system Chinese stack, 21px goal title / 22px event / 11px index, as DESIGN.md |
| MATERIAL | match — paper, 1px lines, blue-soft selection, no fake physicality; no raster assets owed |
| GROUND | match — cool gray canvas + white paper on light; dark paper `#1b1b1e` / body `rgb(18,18,20)` uses existing theme tokens (04 override; prototype was light-only) |
| Goal tree + 聚焦/Runtime chrome | adaptation — user: preserve tree and Host Runtime; prototype chrome is demo-only |
| Current-result band above index/reader | match on ≥680px container |
| Three facts: 已经做成 / 接下来做什么+owner / 风险与待决定 | contradicted on ≤680px container: `overview-grid` is `display:none`; `overview-mobile-next` is next-step only, no 责任人 (`event-document-styles.ts` `@container 680px`, `event-document-ui.ts`) |
| Bold current-judgment lead | contradicted — desktop.png lead repeats the outcome subtitle; columns are 11px `--ink-soft`/`--muted`, not the memory hook |
| 待接续 / owner chip in next column | missing unless `progress_summary.next_actor` is set; no collapsed-narrow equivalent |
| Dual-pane 302px index + independent reader | match on desktop; 522px container → timeline→reader + 返回时间线 (04 container-width override) |
| Index: time, short title, type·author, 全部/成果/决定, 最新在前 | match topology; type/author/date copy contradicted (below) |
| Reader: planning, types, reports, intervention forms in the same pane, no modal | match; extra action chips are 04 production entries, not unapproved chrome |
| Single 返回所选事件 under reader chrome | contradicted — desktop-planning.png shows two stacked identical controls (`reader-header` + planning panel) |
| Type form: 字段名 / 内容形式 / 必填 / 移除; mobile submit full width | contradicted — 类型 ID required; no field row on first paint; `composer-bottom` keeps submit beside wrapped helper |
| History body as useful Chinese explanation | contradicted — index `goal.created` / `relation.added`; reader `report · web-user`; journal key dumps; `long: unknown` |
| Human date group `今天 · 9 月 9 日` | adaptation — ISO `2026-09-09` (weaker Chinese; fold into protocol copy fix) |
| Prototype demo banner / 查看场景 | omitted — correct; production shell replaces it |

## ceiling
unused vs Operate/Read bar: judgment-weight lead (prototype’s “当前要求已有更新…”); filled selected timeline dot; 待接续 owner chip; default visible field editor; reader chrome that names the event (`刚刚 16:02 · 工作规划调整`) instead of generic「事件内容」. Restrained color and dense index are reached. Raw protocol in the reader is below the bar, not unused decoration.

## material_fixes
1. **P1 fidelity/quality-bar (Chinese copy, not protocol):** In `event-history-map.ts` (`mapJournalHistoryItems` `type_label: event.type`) and `event-history-body.ts` (`renderWorkEventBody` meta uses `event.kind`; `renderJournal` dumps payload keys; judgments print `requirement_id` + English `verdict`), stop using protocol as the reading voice. Index/meta must use the same Chinese type name as the row (进展记录, not `report`/`goal.created`); journal/relation bodies in a sentence (谁与谁、什么关系), IDs only as secondary; judgments as 要求陈述 + 仍无法判断/支持/尚未达到. Accept: recapture desktop.png, desktop-legacy-v1.png, desktop-real-dark.png with no dotted identifiers as the primary explanation.
2. **P1 user-facing (duplicate return):** `event-document-ui.ts` `.reader-header` and `event-document-forms.ts` planning panel both emit「返回所选事件」. Keep one back control; put「工作规划」in the header title or drop the panel’s duplicate. Accept: desktop-planning.png shows a single return path.
3. **P1 contract (narrow current truth):** `@container goal-event-read (max-width: 680px)` hides `.overview-grid` and `overview-mobile-next` omits owner. DESIGN: keep 整体判断、下一步和责任人; user: done / next+owner / risk. Collapsed 522px and 390 views must show next **and** owner (or 待接续) without expand; blocking risk may stay one line. Accept: desktop-squeezed-reading.png and mobile-390-timeline.png.
4. **P1 fidelity (type/requirement forms):** `event-document-forms.ts` requires 类型 ID / 要求 ID / 字段 ID; create-type paints zero `.type-field-row` while copy says「至少保留一个字段」; client `typeFields()` silently invents `{field_id:"body", name:"内容"}`. Generate IDs; show one prototype field row (名称, 内容形式, 必填, 移除) on open. Accept: desktop-type.png and mobile-390-form-top.png match that editor, no ID fields.
5. **P1 contract (mobile submit):** `.composer-bottom` is a side-by-side flex, so `@container 680px .event-form .button.primary { width:100% }` cannot fill. Stack helper above a full-width primary in that container. Accept: mobile-390-form-top.png, button edge-to-edge, helper not wrapping beside it.
6. **P2 ceiling (clear current truth):** `currentJudgment` lead falls back to `agreement.outcome` (desktop.png duplicates the subtitle); `.overview-grid p` is 11px muted; next and risk can be the same gap string (desktop-real-dark.png). Lead = judgment sentence; columns in ink; next ≠ risk. Accept: desktop first viewport, three distinct facts, lead not a second outcome.

## keep
Keep the production shell (Goal tree, 聚焦/Runtime), container-query timeline→reader with reachable「返回时间线」, current facts that do not follow the selected history row, and the white/gray restrained-blue operate/read split.
