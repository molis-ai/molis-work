# Runtime Protocol: Agreements, Facts, and Closure

Molis Work keeps goals, actual work, and current outcomes together. A Runtime works within its existing authority; the user can see what happened, what remains, and which changes need a decision. Ordinary work requires no Claim, Run, complete plan, or default template.

## The current work model

| Record | Purpose |
| --- | --- |
| Goal | Save a recognizable intent, then clarify its outcome and requirements |
| Current agreement | The outcome and requirements that apply to this round of work |
| Note | Save observations, discussion, or partial work without defining a type first |
| Local type and report | A type describes the content to record; a report saves actual results and may support or contradict specific requirements |
| Concern | Track an issue; concerns explicitly marked as blocking closure participate in completion checks |
| User decision | A trusted choice about a concrete change or acceptance; suggestions do not automatically block completion |
| Closure and resume | Complete or cancel explicitly; give a reason to begin another round |
| Goal tree and dependencies | Express parent outcomes and real prerequisites when needed |

`goal_state` provides the current agreement, requirements, work status, and gaps. Work is `open`, `completed`, or `cancelled`. A parent can record its own integration results; child count does not prove completion. An unfinished dependency affects formal completion, while notes and partial work can still be recorded.

## Connect a project and select a Goal

The Runtime uses Molis Work through MCP. `apps/mcp` owns tool names, inputs, and presentation; Local Host injects the bound project and actor; Goals Module owns current event facts, and the Goals Plugin composes use cases. The Skill does not inspect internal databases or reimplement completion checks.

Start with `context_resolve`. An existing Session binding or one verified workspace association can recover the project. Suggestions, directory names, and model guesses do not authorize binding. Reuse the user's explicit choice when it identifies one project; ask only when the choice is ambiguous. Binding, switching, creating, unlinking, and deleting retain their respective authorization. An ordinary binding does not set a directory default. See [MCP integration](mcp.en.md).

Use `goal_list` to find work or `goal_intent_create` to save a new intent. Creation requires a title and may include an outcome. Ordinary calls omit project and actor fields such as `board_id` and `actor_id`; Host supplies them. Calls that read or record a particular Goal still provide `goal_id` explicitly rather than guessing from the current focus.

## Record everyday work

The following names omit the `molis_work_v1_` prefix:

```text
context_resolve → goal_list / goal_intent_create → goal_state
  → without a type: event_note
  → structured facts: optional event_configure → event_report
  → progress alone: event_progress
  → issues and decisions: event_concern / event_decision_request / event_cite_decision
  → original records: event_list / event_read
```

`event_configure` can register local types or adopt a suitable plan. Published type versions cannot be rewritten. A new version may change names, fields, and constraints; older reports retain the meaning of their saved type version. Read professional methods through `planning_methods` when useful. Planning is not a prerequisite for recording work.

One `event_report` can save multiple facts and optional progress. The entire batch must be valid: an invalid item rolls back that batch, while earlier successful calls remain. Its receipt includes saved facts, current work status, gaps, and cursors, so a full history read is usually unnecessary. With no new facts, use `event_progress` and follow its `based_on_cursor` contract.

Retrying the same input with the same idempotency key does not duplicate writes. Reusing a key with different input is rejected. A replay returns the original saved facts together with the state and gaps read now; an old receipt is not proof of current completion.

## Agreements and human acceptance

`event_agree` maintains the current outcome and requirements. Requirements can be added, revised, or retired; retirement removes them from current evaluation without deleting historical requirements or reports. A current requirement can bind to a local type. When `human_decision_required=false`, Runtime reports can contribute support. When it is `true`, acceptance still needs a trusted user conclusion valid for the current requirement; a Runtime support report cannot replace it.

Adding an initial outcome, taking notes, and working within existing authority do not create an extra approval step. Replacing a committed outcome, retiring or weakening requirements, or removing human acceptance requires a valid decision about that concrete change. An unrelated approval, a generic `authorize_action`, or a caller-supplied `user_confirmed` cannot approve a different change. An existing decision can be reused while its exact scope remains valid.

The Runtime can request, read, and cite decisions. Protected Web or management entries record the user's actual choice; the Runtime has no `event_decide` or `goal_tree_decide` authority. When a choice is needed, present the concrete change and returned Goal page to the user. Other authorized work can continue.

The two versions serve different purposes: the configuration version identifies the current type configuration; the agreement version identifies the current outcome and commitments. Formal agreement changes and closure require the versions specified by the tool. Missing or stale versions are rejected before formal effects. Read `goal_state`, review the changes, then submit again. Ordinary reports use their actual type version without taking on the formal closure lock.

## Close and resume

```text
goal_state → review current agreement, requirements, dependencies, and decisions
  → event_close(kind=complete or cancel)
  → to continue completed or cancelled work: event_resume(reason=a concrete reason)
```

Saving a record does not establish completion. Only `completion_applied=true` on a completion receipt means formal completion took effect. With current versions but unresolved acceptance gaps, a closure report may be saved without completing the Goal. Address the specific returned gaps. Invalid inputs such as missing or stale versions are rejected without saving that closure.

A substantive outcome change or valid counterevidence may remove the effect of an earlier completion while preserving its history and basis. An unrelated note or report does not automatically reopen a Goal. Both `completed` and `cancelled` use the same `event_resume` entry with a required reason. A new resume request on open work is rejected, and retries do not create extra rounds.

## Change structure when needed

Use `goal_tree_propose` to save explicit Goal and relation changes, and `goal_tree_read` / `goal_tree_check` to restore and inspect them across Sessions. Source references point to real saved records. The user decides the whole proposal or selected items through a protected entry; the Runtime cannot approve structure through a confirmation field.

Only selected valid items are materialized. Cycles, references to another project, stale relation baselines, and concurrent changes are rejected or returned as concrete conflicts. Approving a relation cannot silently create an unselected Goal. Follow the returned impact and conflicts without adding fixed breakdown thresholds, leaf categories, or mandatory nonempty planning arrays.

## Recovery and history

For `mcp.context_refresh_required`, resolve context read-only, then retry the unchanged request with its original key after bound. If the primary facts were saved but Session activity could not be recorded, keep the successful facts; a retry after recovery can fill in the activity without duplicating the work.

Changing Goals never automatically rebinds a terminal or sends it a message. Host Sessions, terminal processes, and panels retain their separate duties.

Database upgrades and V3 import connect current work to event state while preserving original sources, relations, and real history. Historical Claim, Run, Evidence, and Review records remain readable by their original identity. Existing approvals are preserved rather than fabricated. History does not provide a second executable workflow: old Claim, Run, and Contract/Candidate/Rewire write tools are retired.

For executable examples and recovery details, see the [Runtime Skill](../skills/goal-advance/SKILL.md).
