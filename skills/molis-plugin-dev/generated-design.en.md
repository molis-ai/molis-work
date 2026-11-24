# Generated plugins: the lead designer's standard

In detail and revision answers, choose `design.icon` from the task’s `iconNames` for the purpose of the plugin (for example, `book` for a reading journal).

Studio generates sandbox backend code, with one operation per task, and a platform-rendered UI from the catalog. Define the operations, one example per operation, page parts and acceptance. Once frozen, the UI and code Agents work concurrently from that specification; contradictions surface at acceptance, so keep it internally consistent. Follow the current stage's output format; this chapter explains the judgment behind it.

## Requirements and proposals

Deliver the smallest complete scope: all requests and no unasked editing, categories, tags, search, grouping or export. Mention future options in the summary. Ask at most 1–3 questions in one round if distinct readings would change the feature; do not ask about style, colors or sample content. Offer 2–3 genuinely different structures or behaviors (one-page capture/list versus pages by status), with audience and tradeoff. Use only supplied capabilities. An inactive plugin may be proposed; the person approves activation before build, or you revise without it.

## Operations

- One operation per job; a read-only query cannot write storage. Use your own prefix such as `reports.list`; a platform capability is listed in the calling operation's effects and does not get a second definition. Generate string record IDs in the plugin.
- Use the same enum values across operations. Display labels are a projection; examples and logic use the actual values. Put `?` on optional inputs. A next-state or delete command can take just the ID and compute from current state. Do not use a fake “next” value. Aggregation queries return numeric fields plus a list of categories, not category names as object keys.
- States: an enum field a record moves through from one value to another (`unread|reading|finished`, `todo|doing|done`) is a state. Declare it in `states`: its field, each value's state family, a new record's value and the values a record never leaves; the platform registers the plugin's states from it. An enum that only sorts records (category, priority, tag) is not a state. Write an empty list when the records have none; the entry is never left out.
- Declare only effects actually used. Write documents with `pages.create`/`pages.update`, keep one as an artifact with `pages.promote`, read it via `artifacts.read`, send to Feed with `feed.content.receive`. Do not declare events or artifacts as effects.
- For an external public API use the exact HTTPS domains in that operation's `networkDomains` (e.g. `api.open-meteo.com`); consent is per domain. Before install only approved GETs are real; writes are stand-ins. Assert structures for changing data and invariant saved or visible words for acceptance.
- Quota or paid work belongs in an explicit user-triggered command; save its result and read it with a query. A scheduled command does the work, returns `text` and stores the result; a separate command calls `schedules.add` to set its time (`inbox: true` to receive results). Use `reminders.add` for reminders that do not run plugin code.

## Examples (at least one per operation)

Examples execute in sequence on that operation's fresh storage. Queries return empty on an empty store; use acceptance for existing records and successful updates/deletes. Examples for missing records use a declared error. Assert a subset for random IDs, only declared fields, and dates supplied by inputs. Foreign stand-ins prove schema or own storage; a missing foreign record error requires its read capability.

## Interface

For a command requiring an account, choose the service from the task’s `connectionServices` and declare `connections.slots` (e.g. `[{"slot_id":"source","service_id":"github","reason":"Read the chosen repository"}]`), list that slot in the command’s `effects.connections`, and bind an action or input part with `connectionNeed: {"slot_id":"source"}`. Per-record slots use `binding:"per_record"` and the part names the submitted record ID field in `recordField`. The shell handles sign-in and resumes the submission. Drafts have no bound account. Test the unbound case in preview and the connection after installation. Use `sdk.connections.describe/request` on the backend.

For a Home image plugin, use `connectionNeed: {"kind":"image","slot_id":"drawing","base_url":"https://images.example/v1"}`. The command declares bind and its actual image operations in `effects.imageGeneration`, and the service domain in `networkDomains`.

Give every part an intent; the platform chooses a legal component from `/__ui/catalog`.

| Intent | Purpose | Catalog candidates |
|---|---|---|
| heading | Plugin name and one description at the top | Frame |
| description | A result or metric group | Card, Alert, Badge |
| input | Capture or edit | Inline Form, side Sheet, Dialog |
| action | Act on a record | Button; confirm deletion with Alert Dialog |
| collection | A set of records | Directory, Card, Table, Accordion; Calendar for dated rows |
| reading | Original body with sections | Accordion, Card |
| schedule | Items by date | Calendar, Table, Directory |
| conversation, evidence, feedback | Conversation, evidence table, state notice | Directory/Card, Table/Accordion, Alert |

- Each input/action binds one query or command, and every operation is used. An action whose inputs all come from one selected row appears on that row; say “Delete” or “Mark as read,” not “Delete selected.” Filter/search is the list's query inputs, not an extra form or action.
- To run a query from person-entered values, give the input part its own form and submit that query. Content fields support multiple lines; an empty string is legal if the contract allows it. Required means the key exists. A query replaces its own result and keeps draft values; show the complete result by default, or use `show` to select one value. Do not read another form's draft or expose raw JSON as an acceptance result.
- For a visible command result use `"submit":{"op":"summary.run","show":"text"}`. Prefill from an earlier result or a row while leaving the field editable: a sentence the last operation polished can prefill the next Record form. Code generates request or idempotency IDs.
- A collection names its ID, title, text fields and empty copy, and maps booleans/enums to display labels such as Checked in / Not checked in. A text template such as `You drank {{count}} cups today` requires a read query with that object field; a list result cannot fill a template. Show the new row via the command's own result. Without a template, object totals display as labeled metric cards. Calendar groups by record date and labels Today/Yesterday/Tomorrow. Acceptance may say `expect calendar Today 1` to check the value on today’s row.
- Use only catalog interactions, no custom script, style or gestures; the host provides paper controls, date pickers, busy/Toast feedback and pane-level responsive layouts (`skills/molis-design-ui/SKILL.md`). Keep component IDs unique across pages, and refer to the actual ID in `selection:component.field`. Form values use `form`. Row buttons are siblings in parts, with `selection:list.id`; do not add a separate actions array. Return display names as well as machine IDs where a person must read the data.
- Optionally declare `design.help` (`{"default_topic":"page","topics":[{"id":"page","title":"…","sections":[{"id":"what","heading":"What this is","body":"…"}]}]}`) for Scheme A on-demand help; when omitted, the host generates truthful help and pre-action facts (`.mw-facts`) directly from declared pages and `effects`. Never claim capabilities absent from the contract.

## Acceptance

Each independent case starts empty. Interact like a person: fill, submit, select a visible row, see text appear or disappear, check order, paginate or reload. Use realistic material: assert the last paragraph of a full body, varied title/summary lengths and meaningfully different values. Respect validation. Fixed stand-ins do not prove presentation.

Cover add-then-see; cover update, delete and filters when present. The acceptance protocol selects a record by visible text before submitting, while the real row button selects its own row. Put inaccessible errors like “record not found” in operation examples. For records, assert their actual words, such as “Reading,” without adding the column label. Use the designer prompt's explicit `expectWord` object step for fixed UI copy. For `model.generate`, examples assert structure or stored data via `includes`, while UI acceptance checks the runtime stand-in prefix (the literal token `［模型替身］` followed by the first 40 characters of input). A foreign read stand-in returns one fixed row whose string fields contain the literal stand-in token `示例`, minimum numbers and first enum values: select that row first before filling and submitting. A foreign write cannot change that fixed row or empty its list, so assert command feedback or local storage instead. After reload assert a read view, not transient command feedback.

Negative checks (`submitBlocked`, isolated query `faultRead`, `retry`, and `expectValue`) must use the explicit JSON object steps specified in the lead designer prompt—never infer faults from case names or prose. Ordinary `submit` still expects success; `faultRead` applies only to bound queries and must be consumed, replacing any old empty state with the shared error while preserving drafts across `retry`. Reset each case independently, collect failures across remaining independent cases, and stop if reset fails. Reload proves reload only; restart and upgrade need lifecycle tests.

## Common mistakes

| Mistake | Correction |
|---|---|
| Use an enum such as `string(Design\|Reading\|Product)` in one operation and free text in another | Use the same values everywhere. |
| Use a display label such as “Want to read” where the input enum is “Unread” | Examples use actual values; column labels map the display. |
| Return rows in a query example | Example storage is empty; verify records in acceptance. |
| Expect a specific current month for a monthly total | Supply the date in input, or avoid an expectation tied to today. |
| Expect fields absent from output | Use only declared output fields. |
| Put `"next:books.status"` in a binding | The operation takes the ID and computes from the stored state. |
| Add a separate filter form | Expose the read query's inputs on the list. |
| Click a record action to check “record not found” | Select a real record first; the error belongs in an example. |
| Put acceptance inside the page | Keep acceptance beside the interface specification. |
| Define a new `goals.list` operation to read Goals | Use a plugin operation such as `reports.goals`, with capability `goals.list` in its effects. |
| Write `{{count}}` without a read | Bind a read whose output has `count`. |
| Bind `"note": "editor.note"` for a draft field | Use `form` for user input or `selection:list.field` for a selected record. |
| Reuse `title` and `goals` on a second page | Use unique IDs across the plugin, such as `write-title` and `write-goals`. Host normalizes proposal drafts, not final designs. |
| Put Delete or Check in a list's `actions` | Put the button next to the list in parts and bind `selection:list.id`. Host draws it on the row. |
| Only return `habitIds` in calendar/list rows | Return the person's `habitNames` too; IDs are for selection. |
| Bind a button to an undefined `notes.remove`, or declare an unused operation | Every binding has a declared operation, and each operation is used by at least one part. |
| Try to note an Inbox record without selecting it | `select list 示例` first, then fill and submit. |
| Expect a done item to vanish from the Inbox stand-in | The foreign list is fixed; assert feedback from the command. |
| Expect one acceptance case to continue the last case's data | Each starts empty. Three clicks mean three, not four after another case clicked once. |
| Expect “Set…” under the command button after refresh | Command results are transient. Add a read query and assert its component if the state must survive reload. |

## Revision and UI handoff

Keep unchanged operations and parts identical with stable IDs so accepted code is reused; list code-only behavior changes in `rework`. See the mounted experience and UI chapters for journey, layout and review rules: when a collection already returns full body text, set `idField`/`titleField`/`textField` to share the row with detail instead of adding a selection-only detail query. Keep `selection:part.field` bound to a real part ID, never seed scenario inputs into production storage, and never let post-freeze visual revisions alter contract, acceptance or backend.
