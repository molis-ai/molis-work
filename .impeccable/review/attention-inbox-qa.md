# Attention Inbox QA

Date: 2026-08-30

Goal: `goal-infoflow-attention-inbox`

## Runtime surface

- Project: `Molis Work 信息流工作台重设计`
- URL: `http://127.0.0.1:4182/projects/project-aeb51deb-e335-403b-80cc-387e20e0e000/`
- Real project data: 195 canonical Feed Items; 43 active Inbox references in the default Inbox view.
- Default Inbox check: every visible row had status `inbox` or `processing`; the footer and sidebar both reported 43.
- History check: switching to all statuses exposed 61 Inbox rows with active, completed, and ignored states while the default view remained focused on 43 active references.

## Wide-screen path

- Opened Inbox from the project directory, selected a persisted `source_rule` reference, and loaded its real linked Feed Item.
- Detail exposed: reason, linked object, current status, next action, original-message navigation, Goal promotion, complete, and ignore.
- Detail explicitly states that Inbox stores only the reference and reason while the displayed body belongs to the original Feed Item.
- Evidence image: `attention-inbox-wide.png`.

## Narrow-screen path

- Requested viewport: 390×844; effective content viewport inside the app panel: 312 px.
- `documentElement.scrollWidth === documentElement.clientWidth === 312`; no horizontal overflow.
- After selecting an entry, mobile navigation selected `详情`, hid the list, and showed the detail.
- Selecting `Inbox` returned to the list, hid the detail, and preserved the selected row.
- Evidence images: `attention-inbox-narrow-list.png`, `attention-inbox-narrow-detail.png`.

## States and recovery

- Search with a guaranteed missing value produced 0 rows and the accurate empty result: “没有符合当前条件的 Item”; clearing the query restored the list.
- Evidence image: `attention-inbox-empty.png`.
- With the local server stopped, selecting an unloaded Inbox reference produced `Failed to fetch`, retained the Item, and offered `重试`.
- After the server restarted, the same reference detail recovered with the original title and complete action available.
- No production Inbox state was changed during browser QA; write paths are covered by isolated Web and store tests.

## Contract coverage

- `manual`, `source_rule`, `goal_decision`, and `source_fault` fixtures are rendered and asserted in `tests/web.test.ts`.
- Completion, repeated completion idempotency, reopening, restart survival, and Feed revision independence are asserted in `tests/desktop-tui.test.ts` and `tests/feed.test.ts`.
- Source disconnect, retained history, deleted history, source fault creation, and no-body Inbox storage are asserted in `tests/feed-sources.test.ts` and `tests/feed-contract.test.ts`.

## Verification results

- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- Affected suite (`feed`, `feed-contract`, `feed-sources`, `web`, `desktop-tui`): 99/99 passed.
- Full suite: 335/336 passed. The only failure is the pre-existing broad static-English-translation backlog in `tests/i18n.test.ts`; Inbox behavior and all affected Web tests passed.

## Follow-up risk

Legacy Inbox migration conservatively preserves old Inbox rows as `source_rule` references. The real project therefore still contains low-value historical Gmail entries. Provider-specific Goals must narrow Gmail/GitHub/RSS attention rules before final internal-usability acceptance; this Inbox work keeps the reference model and processing semantics correct without guessing away historical user data.
