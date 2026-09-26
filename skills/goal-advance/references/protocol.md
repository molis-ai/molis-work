# Current Molis Work protocol

Read before the first write. The connected Host supplies project and Runtime identity; ordinary tools require the intended Goal ID, not project paths or self-declared actors. Use the current event workflow for both new and migrated Goals. Historical records remain readable; they are not a second execution protocol.

## Facts, commitments and completion

- event_note preserves ordinary text without a registered type. event_report saves typed facts, optional judgments and optional progress. Neither creates user approval or independent verification.
- goal_state holds the current result agreement, active requirements, gaps, decisions, concerns, work status and cursors. A report receipt contains this moment's compact state; its saved events stay the original batch even on a later retry.
- A requirement with human_decision_required=false can use a supporting Runtime report. With true, completion also needs a still-valid trusted user conclusion. Rejection or later contradicting evidence cannot count as acceptance.
- event_close with kind=complete records an explicit closure assessment. Correct versions but unmet requirements produce recorded=true, completion_applied=false and reasons. Do not call this completed. Cancellation records its reason without requiring a fake delivery.
- event_resume explicitly starts a new round from completed or cancelled; reason is required. A new resume request on an open Goal is rejected. An unrelated ordinary report or note preserves the closed status.

## Versions have separate meanings

| Field | Meaning and use |
| --- | --- |
| config.version | Current local types, their versions, planning adoption and bindings. event_configure.expected_version checks this value. |
| agreement.version | Current result and completion requirements. A change to the commitment advances this independently. |
| expected_config_version and expected_agreement_version | Read both from current state for event_agree and event_close. Neither substitutes for the other. |
| type_version | Published type definition under which a report was written. Old events keep that version; a type edit publishes a new version. |
| goal_event_cursor | Latest event on this Goal. Use it as event_progress.based_on_cursor; later Goal facts can make a standalone summary stale. |

When configuring bindings or adopting selected requirements changes a commitment, supply the current expected_agreement_version as required by that operation. Adding an unrelated type is not an agreement change. On a formal version conflict, read current state and review differences before submitting a revised operation; do not silently replace version numbers and resubmit the old decision. Invalid or stale formal versions are rejected before any write.

Ordinary notes and reports do not need a formal agreement lock. Published historical facts are not rewritten when types, requirements or agreements evolve. Retiring a requirement removes it from current evaluation while preserving its history.

## Specific user decisions

Initial result definition, ordinary notes and adding requirements within existing authority do not mechanically require another approval. Replacing an existing result, revising or retiring requirements, or removing human acceptance must have authority for that exact change. A protected Web/management user action can submit it directly. Runtime uses event_decision_request with a finite proposed_change, reads the actual decision, then cites it in the matching event_agree call.

Runtime cannot call event_decide or goal_tree_decide, or manufacture user approval from a conversation summary, user_confirmed, actor fields or a generic authorize_action. A valid saved approval can be reused within its actual scope; do not ask again merely because a type label changed. If the commitment covered by the approval changed, re-read and resolve that difference.

For human acceptance, use a request with purpose=requirement_acceptance and explicit requirement IDs. A discussion request does not block completion by itself; an unresolved acceptance request for an active requirement does. Action decisions apply only to the named action and scope. A concern likewise needs a specific scope; accepting its risk requires a matching trusted decision.

Tree proposals are reviewable pending changes until the protected user decision applies selected items. Check the proposal before presenting it. A whole-proposal conflict leaves all pending items unchanged; apply a subset only when the user chooses that subset.

## Retry and partial work

- One event_report batch is atomic, including optional progress with summary, next_step and next_actor. Any invalid fact or progress input rejects the entire batch. Earlier successful calls remain saved.
- Partial work can be saved now as a note or valid batch. This does not mean invalid items in one batch are silently skipped.
- Use one idempotency key per logical operation. Retry exactly the same input with that key after a lost response. A changed request needs a new key. Replayed saved events are not another delivery; current fields describe the state now.
- Main Goal facts may save while the secondary Session activity index is unavailable. Report the successful facts and the context issue. After restoring context, the same-key retry can repair the Session entry without duplicating Goal facts.
- Use context_resolve for mcp.context_refresh_required, then retry the unchanged call if bound. Do not bind again or select another project merely to refresh. Follow [project-connection.md](project-connection.md) if resolution no longer returns a bound project.

## Durable project guidance

When `goals.guidance.read` is authorized and available, context_resolve.runtime_prompt_prefix includes confirmed project instructions. A null prefix with project_guidance_error means instructions could not be read; it does not mean the project has no instructions. Persist stable project context, shared constraints, conventions or quality bars through project_guidance_add/update only with authority for the exact category and content. A user's clear instruction to save that precise text already supplies it; do not repeat the same question. Temporary progress belongs on its Goal. Read project_guidance_get to verify the saved canonical entry when reporting the change.

Read structured blocked, conflicts and idempotent “already” states literally. If documented recovery cannot resolve the same failure, report the concrete error and stop that dependent write; continue unrelated authorized work. Do not force another Session's state or turn connection failure into CLI/SQLite writes.
