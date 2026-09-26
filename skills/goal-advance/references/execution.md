# Recording and completing work

Use this reference for ordinary work on a connected Goal. Examples use `call(name, args)` to mean invoking that exact host-provided MCP tool and reading its result. Keep the returned IDs and versions; replace the example content and operation keys for your task.

Before these examples, the current client needs project grants for goals.list, goals.create and goals.note, plus goals.state.read, goals.events.list and goals.events.read for state and history queries. Missing or revoked access is resolved in **Capabilities → External access**, not by enabling a legacy name alone. The same Home's system service must be running. Preserve the original tool name and Session context on retries: legacy write names keep their historical Session author, while public action tools use their client author.

Work operation grants are separate from read/create/note grants:

| Legacy name suffix | Required action |
| --- | --- |
| event_configure | goals.events.configure |
| event_report | goals.events.report |
| event_progress | goals.progress.record |
| event_concern | goals.concerns.apply |
| event_decision_request | goals.decisions.request |
| event_cite_decision | goals.decisions.cite |
| event_agree | goals.agreement.set |
| event_close | goals.closure.submit |
| event_resume | goals.work.resume |

These grant ordinary work operations only. Requesting or citing a decision does not authorize a Runtime to create user approval. Missing tools require user authorization through External access; do not grant yourself access.

## A useful Goal without a template

```javascript
const created = await call("molis_work_v1_goal_intent_create", {
  title: "Help a buyer find and verify their receipt",
  idempotency_key: "receipt-intent-1"
});
const g = created.goal.goal_id;
await call("molis_work_v1_event_note", {
  goal_id: g,
  body: "The buyer looked for a receipt immediately after payment.",
  idempotency_key: "receipt-note-1"
});
let state = await call("molis_work_v1_goal_state", {goal_id: g});
```

For an existing Goal, start with `molis_work_v1_goal_list({limit:20})`, identify the intended Goal, and read its state. Follow the returned next cursor when needed; do not create a duplicate because the first page omitted it. A note needs no type registration, requirement, planning adoption or role.

## Add structure when it improves the result

This example registers one local type and defines the first result agreement. The type alone does not enable a completion requirement.

```javascript
await call("molis_work_v1_event_configure", {
  goal_id: g,
  expected_version: state.config.version,
  types: [{
    type_id: "receipt-check",
    version: 1,
    name: "Receipt check",
    purpose: "Record what was opened and the amount shown",
    fields: [{
      field_id: "finding",
      name: "Finding",
      purpose: "Receipt location and observed payment amount",
      format: "text",
      required: true
    }]
  }],
  idempotency_key: "receipt-type-1"
});
state = await call("molis_work_v1_goal_state", {goal_id: g});
await call("molis_work_v1_event_agree", {
  goal_id: g,
  expected_config_version: state.config.version,
  expected_agreement_version: state.agreement.version,
  outcome: "A buyer can open their order receipt and verify the payment amount",
  new_requirements: [{
    requirement_id: "readable-receipt",
    statement: "The receipt opens and displays the actual payment amount",
    bound_type_id: "receipt-check",
    human_decision_required: false
  }],
  idempotency_key: "receipt-agreement-1"
});
```

This is a first agreement. Replacing an existing commitment follows [protocol.md](protocol.md): request a concrete change when trusted authority is needed, then cite the actual saved decision. Do not apply this example over an existing Goal indiscriminately.

## Report a batch and use its current receipt

```javascript
const receipt = await call("molis_work_v1_event_report", {
  goal_id: g,
  events: [{
    type_id: "receipt-check",
    type_version: 1,
    title: "Order receipt opens with the correct amount",
    fields: {finding: "Opened order 2026-09; the receipt shows the paid amount of 99."},
    judgments: [{requirement_id: "readable-receipt", verdict: "supports"}]
  }, {
    type_id: "receipt-check",
    type_version: 1,
    title: "Receipt location recorded for the next visit",
    fields: {finding: "The receipt remains available in the order details."}
  }],
  progress: {
    summary: "The receipt is readable and its location has been recorded.",
    next_step: "Review the current requirements and close this round."
  },
  idempotency_key: "receipt-report-1"
});
```

The receipt returns `events`, `work_status`, `gaps`, `progress_summary`, cursors, `completion_effect` and `can_record`. Explain what actually saved and what remains. A saved supporting judgment is not a human acceptance. Reuse the identical call and key after a lost response; do not resubmit it as another batch.

To update progress without a new fact, call `event_progress` with `summary`, optional `next_step/next_actor`, the current `goal_event_cursor` as `based_on_cursor`, and a new key. Do not invent an empty report merely to save text.

## Human acceptance only when the requirement calls for it

When a current requirement has `human_decision_required=true`, a supporting Runtime report still leaves a human acceptance gap. Request that specific decision; replace the requirement ID with the actual active one.

```javascript
await call("molis_work_v1_event_decision_request", {
  goal_id: g,
  purpose: "requirement_acceptance",
  question: "Have you personally opened the receipt and verified the payment amount?",
  options: [
    {option_id: "verified", label: "Verified", impact: "Accept this receipt requirement"},
    {option_id: "not-yet", label: "Not verified", impact: "Keep this requirement unmet"}
  ],
  scope: {requirement_ids: ["readable-receipt"]},
  idempotency_key: "receipt-acceptance-request-1"
});
```

This optional branch is for a requirement already configured for human acceptance; it does not change the earlier example's default. Show the Goal URL returned by Molis Work and the concrete decision awaiting the user. The user records acceptance or rejection in the protected interface. If that page needs starting, follow [service-start.md](service-start.md); continue unrelated work meanwhile.

Then read `goal_state` and use its actual requirement conclusions and pending decisions. Runtime cannot invoke `event_decide`, copy the user's wording into a fake identity, or treat “request saved” as “accepted.” A rejected decision leaves the requirement unmet.

## Close and explicitly continue

```javascript
state = await call("molis_work_v1_goal_state", {goal_id: g});
const closure = await call("molis_work_v1_event_close", {
  goal_id: g,
  kind: "complete",
  result: "The order receipt is accessible and its payment amount has been verified.",
  reason: "The current result and completion requirements are supported.",
  expected_config_version: state.config.version,
  expected_agreement_version: state.agreement.version,
  idempotency_key: "receipt-close-1"
});
```

Only `closure.completion_applied=true` establishes completion. If false, report `unmet_reasons` and address the gap. A parent needs its own supported result; completed children alone do not prove it.

For explicit cancellation, use the same current versions with `kind:"cancel"` and the actual reason; no invented delivery is needed. When the user wants another round after either completed or cancelled:

```javascript
await call("molis_work_v1_event_resume", {
  goal_id: g,
  reason: "Start another round to verify the refund receipt.",
  idempotency_key: "receipt-resume-1"
});
```

A new resume call on open work is rejected. Retry an already successful resume with its original key if needed; do not manufacture a second round. Ordinary unrelated notes on closed work remain historical additions.

## Read the right amount and recover

Use `event_list` with `goal_id`, `limit` and the returned cursor to browse earlier events, then `event_read` for a specific `event_id`. Old events retain their saved type versions. Report receipts usually avoid an immediate full history read; read current state when the next formal operation needs versions or a decision changed.

Invalid report input rejects the entire batch. Correct it, use a new key for changed input, and retain earlier successful work. Formal version conflicts require reviewing current state, not blindly retrying. Connection refresh uses `context_resolve` and an unchanged same-key retry as described in [project-connection.md](project-connection.md).
