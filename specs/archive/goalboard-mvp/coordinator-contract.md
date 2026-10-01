# Molis Work Deterministic Coordinator Contract

Status: Draft deliverable of `GB-002-02`. The executable Work Order remains
`specs/molis-work-mvp/molis-work.md`. This document defines application decisions;
it does not define storage tables, SQL, CLI syntax, MCP payloads, or Runtime
process behavior.

## 1. Outcome and business meaning

The Coordinator is the deterministic authority that answers whether a requested
Molis Work action is currently allowed, explains every blocking reason, and
records allowed transitions exactly once.

In plain language:

> A Runtime asks what work is available, chooses a Goal, and asks to claim it.
> The Coordinator checks the accepted Goal, dependencies, risks, affected areas,
> policies, existing Claims, and actor capabilities at the same authoritative
> moment. It either creates the Claim or returns concrete reasons. It never
> launches a Runtime, chooses work on the Runtime's behalf, or turns an
> explanation into an assignment.

The same canonical Board facts and actor request must produce the same semantic
decision. Wall-clock expiry and newly appended events are explicit input facts,
not hidden nondeterminism.

## 2. Responsibilities and non-goals

The Coordinator owns:

- role-specific readiness and explanation;
- policy resolution;
- Impact Surface conflict evaluation;
- Risk gates;
- atomic Claim/Lease eligibility;
- Run, Evidence, and Review transition validation;
- Candidate Goal and confirmed Rewire transitions;
- invalidation and revalidation propagation;
- leaf and parent completion evaluation;
- structured decision reasons and authoritative events.

The Coordinator does not own:

- Runtime discovery, startup, shutdown, scheduling, or health;
- model, session, worktree, container, or tool selection;
- business acceptance decisions reserved for the user;
- hidden priority-based assignment;
- storage layout or transport representation.

## 3. Decision envelope

Every application operation is evaluated against an authority snapshot.

```yaml
request:
  request_id: caller correlation identity
  operation: requested use case
  actor:
    actor_id: authenticated or declared principal
    kind: user | runtime | reviewer | board_system
    capabilities: capabilities visible to this decision
  board_id: authority boundary
  parameters: operation-specific facts
  idempotency_key: required for writes

decision:
  allowed: true | false
  observed_event_cursor: last authority event included in the decision
  reasons: structured allow, warning, or block reasons
  result: operation-specific read model or created identity
  effects: domain events and projection invalidations when allowed
```

`observed_event_cursor` identifies the facts used by the decision. It is not a
Goal Contract version. A later cursor can contain new coordination or Runtime
facts while the accepted Goal semantics remain unchanged.

### Idempotency rule

- Read decisions are pure and append no events.
- Every write requires an `idempotency_key` scoped to Board, actor, and operation.
- Repeating the same key with the same canonical payload returns the original
  decision and identities without appending another event.
- Repeating the same key with a different payload is rejected with
  `request.idempotency_key_reused`.
- Idempotency cannot bypass a permission or eligibility check from the original
  request; it only replays that request's authoritative outcome.

## 4. Structured reasons

A reason is data, not only human prose.

```yaml
code: stable machine-readable code
severity: info | warning | blocker
subject_type: goal | dependency | input | risk | surface | policy | claim | run | criterion | review | candidate | coverage
subject_id: canonical identity
message: concise human explanation
facts: structured supporting values
remediation: optional safe next action
```

Baseline reason families:

| Family | Example codes |
| --- | --- |
| Goal definition | `goal.not_accepted`, `goal.not_closed_leaf`, `goal.already_satisfied` |
| Goal validity | `goal.needs_revalidation`, `goal.invalidated` |
| Decomposition | `decomposition.not_triggered`, `decomposition.pending_decision` |
| Dependency/input | `dependency.unsatisfied`, `dependency.not_valid`, `input.unbound`, `input.snapshot_changed` |
| Risk | `risk.blocks_claim`, `risk.blocks_completion`, `risk.triggered_invalidation` |
| Impact | `impact.write_write_conflict`, `impact.read_write_unpinned`, `impact.decision_conflict`, `impact.exclusive_conflict` |
| Policy | `policy.goal_mode_required`, `policy.capability_missing`, `policy.review_pending`, `policy.weakening_forbidden` |
| Claim/Lease | `claim.already_active`, `claim.conflicting_active`, `claim.not_owner`, `lease.expired`, `lease.renewal_denied` |
| Run | `run.claim_inactive`, `run.transition_invalid`, `run.blocked_pending_decision` |
| Evidence/Review | `evidence.criterion_uncovered`, `evidence.invalid`, `review.independence_failed`, `review.verdict_failed` |
| Candidate/Rewire | `candidate.user_decision_required`, `rewire.confirmation_required`, `rewire.active_run_protected` |
| Coverage/parent | `coverage.unresolved_blocking`, `parent.end_to_end_acceptance_missing`, `parent.child_not_valid` |
| Request | `request.idempotency_key_reused`, `request.actor_unauthorized`, `request.operation_invalid` |

Queries return all currently known blockers in deterministic order by reason
family, subject identity, and code. A failed write returns the blockers required
to explain rejection; it must not expose a partly applied effect.

## 5. Policy resolution

The Coordinator resolves policy before readiness, Claim, Review, or completion.

```text
project defaults
  -> ancestor minimum bindings from Root to parent
  -> leaf bindings
  -> request-time strengthening
```

Policy dimensions use explicit merge rules rather than generic object overwrite:

| Dimension | Strengthening rule |
| --- | --- |
| Goal Mode | `disabled < preferred < required`; choose the maximum |
| Required capabilities | set union |
| Self verification | boolean OR |
| Cross reviewer count | numeric maximum |
| Adversarial reviewer count | numeric maximum |
| Human approval | boolean OR |
| Required Evidence kinds | set union per Acceptance Criterion |
| Maximum Lease duration | choose the shortest applicable maximum |

A leaf or Claim may strengthen policy. It cannot weaken an ancestor minimum.
Authorized user policy changes are audited coordination events.

The resolved policy is attached to the Claim decision. If policy is strengthened
after Claim creation:

- new Evidence or Review obligations may block completion;
- the active Run is not falsely recorded as having used a Goal Mode it did not;
- a newly required execution mode or capability can mark the Goal
  `needs_revalidation` or block safe continuation;
- the Coordinator returns an explicit impact report.

If policy is weakened after Claim creation, the Claim keeps its stronger resolved
policy unless the authorized transition explicitly releases and replaces it.

## 6. Readiness and explanation

### Query Ready Set

Input facts:

```yaml
scope: Board, Root Goal, parent Goal, or explicit Goal set
actor_id: requesting Runtime or reviewer
role: executor | cross_reviewer | adversarial_reviewer | revalidator
capabilities: current declared or verified capabilities
```

For each relevant Goal, the Coordinator resolves policy and evaluates the
role-specific predicate against the same authority snapshot.

Executor readiness:

```text
ready_for_execution(goal, actor) =
accepted
AND closed_leaf
AND valid
AND not already satisfied
AND dependencies satisfied and valid
AND required inputs acceptably bound
AND no Risk blocks claim
AND no confirmed Impact conflict with active Claims
AND actor satisfies capability and Goal Mode policy
AND no conflicting Claim exists
```

Reviewer readiness:

```text
pending obligation for requested role
AND executor Evidence required for review exists
AND actor satisfies independence and capability policy
AND no conflicting reviewer Claim exists
```

Revalidator readiness:

```text
Goal is satisfied or has Evidence
AND validity == needs_revalidation
AND revalidation scope is explicit
AND actor and conflict gates pass
```

Success result:

```yaml
ready:
  - goal_id
    role
    why_now
    priority_hint
    dependency_summary
    risk_summary
    resolved_policy_summary
    relevant_surface_summary
observed_event_cursor: authority cursor
```

`priority_hint` is explanatory metadata. It does not select or dispatch a Goal.
The Runtime chooses among the returned items.

### Explain Goal

`explain_goal` runs the same predicates for one Goal and returns both passing
conditions and every blocker. It never mutates state. A Runtime can therefore
distinguish “not important,” “not ready,” “conflicting,” and “not permitted.”

## 7. Impact conflict decision

Conflict evaluation uses only confirmed active Impact Bindings and active Claims.

Decision inputs:

- requested Goal, role, and declared Impact Bindings;
- every active Claim whose Goal has a potentially overlapping surface;
- access modes and any immutable read snapshot digest;
- policy-defined conflict exceptions, if explicitly confirmed.

Baseline matrix:

| Existing / requested | read | write | decide | exclusive |
| --- | --- | --- | --- | --- |
| read | allow | allow only when the read is pinned to an immutable pre-write snapshot | block | block |
| write | allow only when the requested read is pinned to an immutable pre-write snapshot | block | block | block |
| decide | block | block | block | block |
| exclusive | block | block | block | block |

Conflict evaluation is symmetric for overlapping logical surfaces even when
their textual Goal order differs. Every block names the active Claim, surface,
both access modes, and missing safe condition.

Proposed or unconfirmed Impact Bindings appear as warnings or policy-defined
blocks but cannot be silently treated as confirmed facts. Discovery of an omitted
surface can block the Run and initiate an audited coordination update.

## 8. Risk gate decision

The Coordinator evaluates open or triggered Goal-linked Risks at operation gates.

| Blocking mode | Claim | Run | Completion | Trigger effect |
| --- | --- | --- | --- | --- |
| `none` | allow with explanation | allow | allow if policy permits | record only |
| `claim` | block new Claim | existing Run follows impact decision | may allow | no automatic invalidation |
| `completion` | allow Claim | allow | block satisfaction | no automatic invalidation |
| `invalidate_on_trigger` | follow current Risk state | block or continue by impact decision | block while invalid | mark affected Goals/dependents for invalidation or revalidation |

An accepted Risk treatment must name authority, reason, and revisit condition.
Mitigation work is represented by a separate Goal related with `mitigates`.

## 9. Claim and Lease operations

### Claim Goal

Inputs:

- `goal_id`, actor, requested role, capabilities, Goal Mode attestation;
- optional request-time policy strengthening;
- idempotency key.

Atomic semantic boundary:

```text
begin authority operation
  capture authority time as an explicit decision fact
  treat Leases past their authority deadline as inactive
  resolve current policy
  re-evaluate role readiness against current facts
  if blocked: create nothing and return reasons
  otherwise: create exactly one Claim and Lease, append event, return Claim
end authority operation
```

Storage must eventually implement this as one transaction, but this contract does
not select a database mechanism.

Success event: `claim.created`.

Common blockers: Goal state, dependency/input, Risk, Impact conflict, policy,
actor identity, existing Claim, or reused idempotency key.

### Renew Lease

Only the Claim actor may renew an active Lease. Renewal rechecks:

- Claim and Lease are active and unexpired;
- actor still satisfies identity/capability rules;
- Goal is not invalidated;
- no policy or confirmed discovery requires revocation or release;
- requested expiry respects the resolved maximum.

Success event: `lease.renewed`. Repeating the request is idempotent.

An expired Lease cannot be revived. The Runtime must request a new Claim so all
current eligibility gates are re-evaluated.

### Release Claim

The Claim actor or authorized Board actor can release an active Claim with a
structured reason. Release does not delete its Runs or Evidence.

Success event: `claim.released`. Releasing an already released Claim with the
same idempotency key returns the original outcome.

### Revoke Claim

Revocation is an explicit Coordinator transition caused by invalidation, actor
authority loss, policy, or confirmed conflict. It appends `claim.revoked`, blocks
new Run writes except terminal reporting, and never retargets the Runtime.

## 10. Run operations

### Start Run

Preconditions:

- active Claim owned by actor;
- role permits a Run;
- no existing nonterminal Run for that Claim;
- Goal has not become invalidated since Claim.

Success: create one Run and append `run.started`.

### Report Run

Allowed transitions:

```text
started -> blocked | completed | failed | abandoned
blocked -> started | completed | failed | abandoned
```

Every transition includes output references, discoveries, and a structured reason
when not completed. Invalid transitions are rejected without partial changes.

A discovery outside the accepted Goal creates or references a Candidate Goal,
Risk, or coordination-fact proposal. If it changes execution safety, the Run may
enter `blocked_pending_decision`; the active Goal is not enlarged.

Terminal Run state does not itself satisfy the Goal.

## 11. Evidence and Review operations

### Submit Evidence

Preconditions:

- actor is authorized by the Run, Review, or human policy path;
- every referenced Goal and Acceptance Criterion exists;
- locator and digest requirements for the Evidence kind are met;
- Evidence result and provenance are explicit.

Success: append immutable Evidence and `evidence.submitted`.

The Coordinator then recalculates criterion coverage and Review readiness. It
does not automatically pass an uncovered criterion because a Run completed.

### Claim Review

This uses the same atomic recheck-and-create Claim semantics for a pending Review
Obligation. The actor must satisfy role capability and independence rules.

An executor cannot claim cross or adversarial Review for its own Goal. Multiple
reviewers are allowed only up to unresolved policy requirements.

### Submit Review

Preconditions:

- active Review Claim when policy requires one;
- actor satisfies the obligation's independence rule;
- reviewed Evidence and criterion scope are explicit;
- verdict and reasoning are present.

Success: append Review, related Evidence if any, and `review.submitted`; then
recalculate the Review Obligation and completion gates.

A `fail` or `needs_changes` verdict does not mutate the Goal Contract. It blocks
completion and can make executor or revalidation work role-ready according to
policy.

## 12. Completion decisions

### Evaluate Leaf Completion

This is a derived decision; a Runtime cannot force `done`.

Allowed only when:

- Goal is accepted, a closed leaf, and valid;
- every Acceptance Criterion has sufficient passing valid Evidence;
- all required Review Obligations are satisfied;
- completion-blocking Risks are resolved or accepted by authority;
- no blocking Candidate or Rewire decision is pending;
- required dependencies and input snapshots remain valid;
- no policy gate remains unmet.

Success event: `goal.satisfied`, recording criterion/Evidence/Review/Risk facts
used by the decision.

Failure returns every currently known unmet gate. It never partially marks the
Goal satisfied.

### Evaluate Parent Completion

Allowed only when:

- decomposition is `closed_compound`;
- required child Goals are satisfied and valid;
- the parent has passing Evidence for its own end-to-end criteria;
- known-requirement coverage has no blocking unresolved item;
- blocking Risks, Candidate Goals, and Rewire decisions are closed;
- no relevant Goal or input is `needs_revalidation` or `invalidated`.

Success event: `goal.satisfied` for the parent, with independent parent Evidence.

## 13. Candidate Goal and Rewire decisions

### Submit Candidate Goal

Runtime or user inputs a complete draft semantic proposal, discovery provenance,
suggested relations, impacts, Risks, and blocking mode.

The Coordinator validates shape and authority, appends `candidate.submitted`, and
returns an impact preview. It does not create a formal Goal.

### Decide Candidate

Only the configured human/product authority can approve or reject. Approval:

1. creates a new formal Goal identity with accepted semantics;
2. preserves Candidate and old Goal history;
3. creates a pending Rewire Proposal;
4. keeps the new Goal ineligible for Claim until required Rewire decisions close;
5. does not retarget any active Run.

Rejection or dismissal records reason and ends the Candidate gate without
deleting the proposal.

### Preview Rewire

This pure decision computes:

- relation edges to add or deactivate;
- newly conflicting active Claims;
- Runs that may no longer be safe;
- Evidence/input snapshots that may no longer support completion;
- reverse dependency closure requiring revalidation;
- Goals whose readiness or parent completion would change.

### Confirm Rewire

Only configured authority may confirm. The atomic semantic boundary:

```text
re-evaluate proposal against current authority facts
if stale or newly unsafe: reject with updated impact preview
otherwise:
  append edge add/deactivate events
  mark affected validity projections
  block/revoke affected work only through explicit events
  append rewire.applied and impact report
```

No active Run changes target Goal. A Runtime must release or terminate its old
Run and obtain a new Claim when new work is ready.

## 14. Revalidation and invalidation propagation

Propagation begins from a confirmed fact, not from an unaudited model guess.

Inputs can include:

- changed Input Binding or immutable snapshot;
- triggered invalidating Risk;
- active relation Rewire;
- accepted correcting/replacing/invalidating Goal;
- newly confirmed Impact conflict;
- strengthened policy that existing Evidence cannot satisfy.

Deterministic propagation:

1. Identify directly affected Goals, Evidence, Claims, and Runs.
2. Compare affected surfaces, bindings, and Evidence provenance.
3. Mark directly unreliable Goals `needs_revalidation` or `invalidated` according
   to the triggering fact.
4. Traverse active reverse dependency edges in stable identity order.
5. Mark dependents `needs_revalidation` when they consumed an affected output or
   when policy requires conservative propagation.
6. Recalculate Ready Sets and parent completion.
7. Return the complete impact report and appended events.

Previously passing Evidence remains historical and visible. It simply stops
counting toward current completion while invalid or out of scope.

## 15. Operation catalog

| Operation | Success result | Main failure reasons | Event | Idempotency |
| --- | --- | --- | --- | --- |
| `query_ready` | role-specific Ready Set | none; blockers appear per Goal | none | pure read |
| `explain_goal` | passing and blocking predicates | unknown Goal/unauthorized scope | none | pure read |
| `claim_goal` | Claim and Lease | readiness, conflict, Risk, policy, actor | `claim.created` | write key required |
| `renew_claim` | renewed Lease | expired, not owner, revoked, policy | `lease.renewed` | write key required |
| `release_claim` | released Claim | not owner/authority | `claim.released` | write key required |
| `start_run` | Run | inactive Claim, duplicate active Run, invalid Goal | `run.started` | write key required |
| `report_run` | transitioned Run | invalid transition/actor | `run.*` | write key required |
| `submit_evidence` | immutable Evidence | bad provenance, criterion, locator | `evidence.submitted` | write key required |
| `query_reviewable` | review-role Ready Set | none; blockers appear per obligation | none | pure read |
| `claim_review` | reviewer Claim | independence, capability, conflict | `claim.created` | write key required |
| `submit_review` | Review verdict | independence, scope, inactive Claim | `review.submitted` | write key required |
| `evaluate_completion` | satisfaction or complete blocker set | Evidence, Review, Risk, validity, coverage | `goal.satisfied` on success | write key required for transition |
| `submit_candidate_goal` | pending Candidate | malformed semantics/unauthorized actor | `candidate.submitted` | write key required |
| `decide_candidate` | approved/rejected Candidate | human authority required/stale proposal | `candidate.*` | write key required |
| `preview_rewire` | impact report | unknown/stale references | none | pure read |
| `confirm_rewire` | applied Rewire and revalidation impact | authority, stale facts, unsafe transition | `rewire.applied` | write key required |
| `update_coordination_fact` | audited relation/risk/impact/policy/input change | authority, invariant, active safety gate | fact-specific event | write key required |

## 16. Acceptance scenarios

### Scenario A: normal pull and completion

1. Runtime queries executor Ready Set.
2. Board returns a closed leaf Goal with reasons and policy.
3. Runtime chooses it and calls `claim_goal`.
4. Coordinator atomically rechecks and creates Claim/Lease.
5. Runtime starts and completes a Run, then submits criterion-linked Evidence.
6. Required reviewers independently claim and submit passing verdicts.
7. Completion evaluation appends `goal.satisfied`.

Expected: no Task copy exists; all facts reference one `goal_id`.

### Scenario B: concurrent Claim race

Two Runtimes request the same executor Goal against nearly identical snapshots.

Expected: the authority transaction creates one Claim. The other request observes
the active Claim and receives `claim.already_active` or an Impact conflict. Both
cannot succeed.

### Scenario C: expired Lease

A Runtime stops renewing and the authority deadline passes.

Expected: the old Claim no longer blocks a new Claim after expiry processing. A
late renewal receives `lease.expired`; it cannot revive the old Lease.

### Scenario D: newly discovered business requirement

An active Run discovers that deletion must be reversible, outside the accepted
business logic.

Expected: Runtime submits Candidate Goal and can enter
`blocked_pending_decision`. Approval creates a new Goal and pending Rewire. The
active Run keeps its original `goal_id` and is never retargeted.

### Scenario E: newly discovered Impact Surface

A Run discovers an undeclared write to a surface used by another active Claim.

Expected: the coordination proposal is audited; confirmed conflict blocks or
revokes work through explicit events and marks affected Goals for revalidation.
No new business Goal is required solely to add the surface fact.

### Scenario F: independent Review gate

Executor submits passing self Evidence, but policy requires one adversarial
reviewer.

Expected: Goal remains unsatisfied. Executor cannot claim the adversarial role.
An independent reviewer receives the obligation in its Ready Set.

### Scenario G: false parent completion prevention

All known children are satisfied, but the parent end-to-end criterion has no
Evidence and one deferred requirement's revisit condition has triggered.

Expected: parent completion is blocked by
`parent.end_to_end_acceptance_missing` and `coverage.unresolved_blocking`.

## 17. Coordinator invariants

1. Equivalent authoritative facts and request produce the same semantic decision.
2. A failed write appends no partial domain effect.
3. One idempotency key cannot represent two canonical payloads.
4. A Ready query never creates a Claim or assignment.
5. Claim creation rechecks all gates atomically.
6. Expired Leases cannot be renewed or revived.
7. Active Runs are never retargeted to a new Goal.
8. Executor and independent reviewer identity rules cannot be bypassed.
9. Completion is derived from current valid Evidence and policy, not Run status.
10. Rewire history is additive; deactivated edges remain auditable.
11. Revalidation preserves historical Evidence while removing its current force.
12. Parent completion runs an independent gate.
13. Every rejection can be explained with stable structured reasons.
14. The Coordinator never launches, selects, or dispatches a Runtime.

## 18. Open decisions handed to later Goals

Blocks identity-sensitive Claim implementation:

- MVP Actor trust basis: self-declared local Actor, process-bound identity, or
  credential-bound identity.

Blocks SQLite Contract:

- authority-time and Lease-expiry cleanup mechanism;
- event/projection persistence strategy;
- exact idempotency-key storage scope;
- transaction isolation and uniqueness enforcement.

Blocks transport Contract:

- CLI/MCP operation names, serialization, pagination, cursors, and error envelope.

Does not block this Coordinator semantic boundary:

- concrete database library;
- concrete identifier format;
- visual TaskBoard or Goal Spine layout.

## 19. `GB-002-02` acceptance audit

| Acceptance condition | Result | Evidence |
| --- | --- | --- |
| Every decision declares inputs, result, reasons, event, and idempotency | self-check passed | Sections 3–4 and 15 |
| Readiness, Review readiness, and completion are deterministic | self-check passed | Sections 6 and 12 |
| Policy can only strengthen inherited minimums | self-check passed | Section 5 |
| Impact and Risk gates are structured and explainable | self-check passed | Sections 7–8 |
| Candidate/Rewire/revalidation never retarget active Runs | self-check passed | Sections 13–14 |
| Claim is atomic recheck-and-create | self-check passed | Section 9 |
| Required scenarios exist | self-check passed | Section 16 |
| Storage, transport, Runtime, and TypeScript remain out of scope | self-check passed | Sections 1–2 and 18 |
