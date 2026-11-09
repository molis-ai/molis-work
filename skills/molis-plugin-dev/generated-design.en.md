# Generated plugins: the lead designer's standard

Design one sandbox operation per task and a page from the UI catalog. Examples, parts and acceptance agree with the frozen contract. Follow the task's output format.

## Requirements and proposals

Deliver the smallest complete scope: all requests and no unasked editing, categories, tags, search, grouping or export. Mention future options in the summary. Ask at most 1–3 questions in one round if distinct readings would change the feature; do not ask about style, colors or sample content. Offer 2–3 genuinely different structures or behaviors (one-page capture/list versus pages by status), with audience and tradeoff. Use only supplied capabilities. An inactive plugin may be proposed; the person approves activation before build, or you revise without it.

## Operations

- One operation per job; a read-only query cannot write storage. Use your own prefix such as `reports.list`; a platform capability is listed in the calling operation's effects and does not get a second definition. Generate string record IDs in the plugin.
- Use the same enum values across operations. Display labels are a projection; examples and logic use the actual values. Put `?` on optional inputs. A next-state or delete command can take just the ID and compute from current state. Do not use a fake “next” value. Aggregation queries return numeric fields plus a list of categories, not category names as object keys.
- Declare only effects actually used. Write documents with `pages.create`/`pages.update`, keep one as an artifact with `pages.promote`, read it via `artifacts.read`, send to Feed with `feed.content.receive`. Do not declare events or artifacts as effects.
- For an external public API use the exact HTTPS domains in that operation's `networkDomains` (e.g. `api.open-meteo.com`); consent is per domain. Before install only approved GETs are real; writes are stand-ins. Assert structures for changing data and invariant saved or visible words for acceptance.
- Quota or paid work belongs in an explicit user-triggered command; save its result and read it with a query. A scheduled command does the work, returns `text` and stores the result; a separate command calls `schedules.add` to set its time (`inbox: true` to receive results). Use `reminders.add` for reminders that do not run plugin code.

## Examples (at least one per operation)

Examples execute in sequence on that operation's fresh storage. Queries return empty on an empty store; use acceptance for existing records and successful updates/deletes. Examples for missing records use a declared error. Assert a subset for random IDs, only declared fields, and dates supplied by inputs. Foreign stand-ins prove schema or own storage; a missing foreign record error requires its read capability.

## Interface

Give every part an intent; the platform chooses a legal catalog component. Headings use Frame; inputs use Form/Sheet/Dialog; actions use Button; collections use Directory/Card/Table/Accordion, or Calendar for dated rows. For reading, evidence and feedback use an appropriate catalog reader, table or alert.

- Each input/action binds one query or command, and every operation is used. An action whose inputs all come from one selected row appears on that row; say “Delete” or “Mark as read,” not “Delete selected.” Filter/search is the list's query inputs, not an extra form or action.
- To run a query from person-entered values, give the input part its own form and submit that query. Content fields support multiple lines; an empty string is legal if the contract allows it. Required means the key exists. A query replaces its own result and keeps draft values; show the complete result by default, or use `show` to select one value. Do not read another form's draft or expose raw JSON as an acceptance result.
- For a visible command result use `"submit":{"op":"summary.run","show":"text"}`. Prefill from an earlier result or a row while leaving the field editable. Code generates request or idempotency IDs.
- A collection names its ID, title, text fields and empty copy, and maps booleans/enums to display labels. A text template such as `You drank {{count}} cups today` requires a read query with that object field; a list result cannot fill a template. Show the new row via the command's own result. Without a template, object totals display as labeled metric cards. Calendar groups by date and labels Today/Yesterday/Tomorrow; acceptance can locate a real day and its record.
- Use only catalog interactions, no custom script, style or gestures. Keep component IDs unique across pages, and refer to the actual ID in `selection:component.field`. Form values use `form`. Row buttons are siblings in parts, with `selection:list.id`; do not add a separate actions array. Return display names as well as machine IDs where a person must read the data.

## Acceptance

Each independent case starts empty. Interact like a person: fill, submit, select a visible row, see text appear or disappear, check order, paginate or reload. Use realistic material: assert the last paragraph of a full body, varied title/summary lengths and meaningfully different values. Respect validation. Fixed stand-ins do not prove presentation.

Cover add-then-see; cover update, delete and filters when present. The acceptance protocol selects a record by visible text before submitting, while the real row button selects its own row. Put inaccessible errors like “record not found” in operation examples. Assert actual record values, not column labels, IDs not shown, unrelated date text or inferred copy. Foreign writes do not change the fixed stand-in `示例` row; verify visible feedback or local storage. After refresh assert a read view, not transient command feedback.

Use explicit negative steps, never infer a failure from names or expectation wording:

- `{"action":"submitBlocked","componentId":"editor","field":"text","reason":"valueMissing"}` clicks the form, verifies native required validation and that submit was never called. Use `props.requiredText` for visible feedback; ordinary submit still expects success.
- `{"action":"faultRead","componentId":"notes"}` only affects the next real bound query in this isolated acceptance. Open the component with conditions met so it consumes the fault. No command, trial, script, URL, custom error copy or data.
- `{"action":"retry","componentId":"notes"}` clicks real retry; error replaces the old empty state and input survives recovery.
- `{"action":"expectValue","componentId":"editor","field":"text","value":"original"}` checks a text or boolean value; the existing `expect editor.text = original` is also valid.

Reset each case; collect failures and run remaining independent cases. Stop and report cases not run if environment or reset fails. Reload proves reload only; restart and upgrade need lifecycle tests.

## Revision and UI handoff

Keep unchanged operations and parts exactly, with stable IDs, to reuse accepted code. If only implementation changes, name affected operations and behavior. Before freeze the UI agent can reorder draft parts and provide concrete experience scenarios. Bind stable IDs, data and operations; a journey gives entry, action, observable result and continuation, and a purpose describes the job served. A collection that already returns the body should give title/text/id fields and share the row with detail, without an extra selection-dependent query. The whole-page stage uses the experience chapter, UI chapter and quality bar; it does not receive these output rules. Detail turns concrete scenarios into real acceptance checks (final paragraph, meaningful differences). Scenario data is not seeded in the real store. Post-freeze visual revisions do not change the contract, acceptance or backend.
