# Molis Work Canonical Domain Contract

Status: Draft deliverable of `GB-002-01`. The executable Work Order remains
`specs/molis-work-mvp/molis-work.md`; this document is a scoped design artifact,
not a second source of development status.

## 1. Outcome and business meaning

Molis Work is a Runtime-neutral source of truth for progressively defining Goals,
determining what work is safe to claim, and deciding whether results have enough
evidence to satisfy the accepted business outcome.

In plain language:

> A user records the result they want and explains how the business behavior
> should work. The Board keeps that promise stable, while separately tracking
> dependencies, risks, affected areas, execution attempts, and reviews as new
> facts become known. A Runtime asks what is ready, chooses a Goal, and attempts
> to claim it. The Board never launches or dispatches the Runtime. Work is only
> complete when the original acceptance conditions and required reviews have
> evidence.

This contract defines domain meaning only. It does not select database tables,
transactions, TypeScript modules, CLI syntax, MCP payloads, UI layout, or Runtime
process behavior.

## 2. Three truth layers

Molis Work separates three kinds of truth so that one mutable `status` or document
does not mix business meaning with current execution state.

| Layer | Question answered | Change rule |
| --- | --- | --- |
| Goal semantics | What result was accepted, and what counts as correct? | Immutable after acceptance; changed meaning creates a new Goal |
| Coordination facts | How does this Goal currently relate to other work, risks, policies, and affected areas? | Explicit audited events; may cause revalidation |
| Runtime facts | Who claimed what, what happened, and what evidence or review exists? | Append-only execution history and derived projections |

The absence of a Goal Contract version is intentional. A new business meaning is
a new Goal connected to history by a semantic relation. Coordination facts and
Runtime facts evolve without pretending the accepted Goal itself was rewritten.

## 3. Authority and writers

| Actor | May write | May not write |
| --- | --- | --- |
| User / authorized product owner | accept Goal semantics, confirm Candidate Goals and rewires, set or weaken policy, provide human verdict | fabricate Runtime Evidence |
| Runtime executor | query, claim, renew/release, report Run facts, submit Evidence, submit Candidate Goals | dispatch other Runtimes, accept its own Candidate, mutate accepted Goal semantics |
| Independent reviewer | claim a Review obligation, submit verdict and Evidence | rewrite the executor Run or accepted Goal |
| Molis Work Coordinator | validate, derive readiness, enforce policy/conflict, atomically transition allowed state, append events | choose a Runtime or invent business decisions |

The Coordinator is a deterministic authority boundary, not an orchestrator. Its
answers depend only on canonical Board state, actor capabilities, declared role,
and the requested operation.

An Actor Reference identifies the principal behind an authoritative action:

```yaml
actor_id: stable principal reference
kind: user | runtime | reviewer | board_system
display_name: non-authoritative label
trust_basis: self_declared | process_bound | credential_bound
capabilities: declared or verified capabilities
```

The MVP trust basis is still an open decision, but every write must carry an
`actor_id`; anonymous semantic, coordination, execution, or review writes are not
allowed.

## 4. Canonical entities

| Entity | Identity | Write authority / owner | Lifecycle boundary |
| --- | --- | --- | --- |
| Board | `board_id` | user policy authority; Coordinator validates writes | active, archived |
| Goal | `goal_id` | user accepts semantics | draft, accepted; later validity and fulfillment are separate axes |
| Acceptance Criterion | `goal_id + criterion_id` | owned by Goal semantics | immutable with accepted Goal |
| Known Requirement | `requirement_id` | Board coverage authority | covered, deferred, out, unresolved |
| Goal Relation | `relation_id` | proposer plus required confirmation authority | proposed, active, inactive |
| Input Binding | `binding_id` | Coordinator under relation/input policy | proposed, confirmed, inactive |
| Impact Binding | `binding_id` | proposer plus required confirmation authority | proposed, confirmed, inactive |
| Risk | `risk_id` | named Risk owner; Board enforces gates | open, triggered, resolved, accepted, expired |
| Policy Binding | `policy_binding_id` | user or delegated policy authority | active, replaced, withdrawn with audit |
| Claim / Lease | `claim_id` | Coordinator creates for requesting Actor | active, released, expired, revoked |
| Run | `run_id` | claiming Runtime reports facts | started, blocked, completed, failed, abandoned |
| Evidence | `evidence_id` | producing Actor; Coordinator validates linkage | append-only; later evidence may supersede but not rewrite it |
| Review Obligation | `obligation_id` | Coordinator derives from policy | pending, satisfied, waived |
| Review | `review_id` | independent reviewing Actor | submitted verdict remains historical |
| Candidate Goal | `candidate_id` | Runtime/user proposes; user decides | pending, approved, rejected, dismissed, superseded |
| Rewire Proposal | `rewire_id` | Coordinator computes; user confirms | pending, confirmed, rejected, applied |
| Domain Event | Board event identity | Coordinator appends for authorized Actor | append-only |

### 4.1 Board

The Board is the authority boundary for one workspace or project.

Canonical responsibilities:

- identify the Root Goal and project scope;
- hold accepted Goals and known-requirement coverage;
- define policy defaults and minimums;
- define the Impact Surface namespace;
- append authoritative domain events;
- expose derived Goal Spine and TaskBoard projections.

Operational display preferences are not business Goal semantics.

### 4.2 Goal

A Goal is an accepted or draft promise about an observable result. It is not an
execution attempt and it is not a container for mutable progress notes.

Canonical semantic fields:

```yaml
goal_id: stable identity
board_id: owning Board
outcome: observable result
why: reason this result matters
business_logic: non-technical description of actors, conditions, behavior, result, and exceptions
in_scope: behavior and results included
out_of_scope: explicit exclusions
constraints: rules the result must obey
required_inputs: semantic capabilities or information required, without binding to a mutable producer
promised_outputs: results or artifacts the Goal commits to produce
acceptance_criteria: independently decidable pass/fail criteria
accepted_by: actor that accepted the semantic contract
accepted_at: acceptance event time
```

`business_logic` is mandatory before acceptance. A reader must understand it
without knowing class names, framework concepts, endpoint names, database tables,
or implementation architecture.

An accepted Goal does not gain a new business version. If `outcome`, business
logic, scope, constraints, semantic inputs/outputs, or acceptance meaning changes,
create a new Goal and connect it with `extends`, `replaces`, `corrects`, or
`invalidates`.

Editable operational metadata can include display title, labels, planning owner,
and priority. It is audited, but it cannot redefine readiness, safety, or what
counts as business completion without becoming an explicit coordination fact or
new Goal semantics.

### 4.3 Plan and Task projections

There is no independently writable canonical `Plan` entity. A Plan is a
point-in-time projection of a selected Goal or Root Goal that explains:

- the relevant accepted Goal subtree;
- the current Goal Frontier;
- active dependency order and safe parallel groups;
- blocked Goals and their reasons;
- current risks, Review gates, and revisit conditions;
- which role-specific leaf Goals can be claimed next.

If a user changes a decision while viewing a Plan, the write targets the
canonical Goal, Relation, Risk, Policy, or Candidate/Rewire object. Regenerating
the Plan then reflects the new truth. Plan order is explanatory unless backed by
an active dependency or conflict fact; a displayed list position alone never
becomes an execution dependency.

There is no canonical `Task` entity.

A TaskBoard row is a projection of a Goal that is currently a closed leaf and is
eligible for a role-specific action. It uses the same `goal_id`. Claim, Run,
Evidence, and Review records refer to that Goal instead of copying it.

This prevents divergent pairs such as “Goal done, Task open” or “Task acceptance
changed but Goal acceptance did not.”

Therefore the transformation is:

```text
Goal Spine + active coordination facts -> Plan projection
closed leaf Goal + role readiness       -> TaskBoard projection
Claim + Run + Evidence + Review         -> execution projection
```

### 4.4 Acceptance Criterion

An Acceptance Criterion is an owned semantic part of a Goal. It must allow a
reviewer or deterministic check to decide pass or fail independently.

```yaml
criterion_id: stable within the Goal
goal_id: owning Goal
statement: behavior or result that must be true
decision_method: automated_check | measurement | inspection | human_decision
pass_condition: explicit rule
target:
  operator: optional comparison operator
  value: optional expected value
  unit: optional unit
required_evidence: acceptable evidence kinds or sources
```

“Implement the domain properly” is not an acceptance criterion. “Create, read,
update, and delete operations conform to the declared interface, and tests prove
the four operations plus duplicate-contact rejection” is independently decidable.

### 4.5 Known Requirement

A Known Requirement records coverage, not execution state.

```yaml
requirement_id: stable identity
statement: known user need, constraint, concern, or request
disposition: covered | deferred | out | unresolved
owner_goal_id: required when covered
reason: required for out; recommended otherwise
revisit_condition: required for deferred
blocking: whether unresolved coverage blocks a gate
```

Molis Work guarantees disposition of known requirements; it does not claim to know
every future requirement.

### 4.6 Goal Relation

A Goal Relation is a separately audited coordination or semantic edge. It is not
embedded mutable text inside an accepted Goal.

```yaml
relation_id: stable identity
from_goal_id: source
to_goal_id: target
type: relation type
state: proposed | active | inactive
provenance: actor, reason, and discovery source
confirmed_by: required when policy demands confirmation
created_at: event time
deactivated_at: optional event time
```

Canonical relation types:

| Type | Meaning |
| --- | --- |
| `part_of` | child contributes to a parent Goal |
| `depends_on` | source cannot proceed until target satisfies the required gate |
| `conflicts_with` | source and target cannot safely hold the specified concurrent claims |
| `mitigates` | source Goal performs work that reduces a Risk attached to target |
| `extends` | source adds a new result without claiming the target was wrong |
| `replaces` | source becomes the preferred result in place of target |
| `corrects` | source fixes an incorrect accepted meaning while preserving history |
| `invalidates` | source establishes that target can no longer be relied upon |
| `migrates_from` | source carries a result from an older representation or system |

Relations are changed through add/deactivate events. Historical edges are never
silently deleted. A confirmed rewire can change active dependency edges without
creating a fake Goal Contract version.

### 4.7 Required Input and Input Binding

A Goal's `required_inputs` describe semantic needs, for example “an accepted
customer identity rule.” An Input Binding is the current coordination fact that
connects that need to a producer, artifact, decision, or immutable snapshot.

Changing a binding does not necessarily change the Goal. It must be audited and
may mark the Goal `needs_revalidation` if the new input is not equivalent to the
one used by existing Evidence.

Progressive decomposition is also controlled by an audited coordination fact:

```yaml
goal_id: governed abstract or compound Goal
decompose_when: observable event or condition
latest_decompose_at: latest safe milestone or gate
blocks_parent_completion: whether unresolved decomposition prevents closure
state: inactive | waiting | triggered | satisfied
```

When `decompose_when` triggers, the Goal enters a decomposition-needed projection.
A Runtime may propose Candidate child Goals; only confirmed children enter the
formal Spine.

### 4.8 Impact Surface and Binding

An Impact Surface names an area where concurrent Goals can interact.

Recommended namespaces:

```text
code:        implementation area
api:         externally consumed contract
data:        logical data model or durable records
rule:        business or validation rule
decision:    architectural or product decision
artifact:    generated or reviewed artifact
external:    third-party system or contract
resource:    finite or exclusive execution resource
```

A Goal-to-surface binding is a coordination fact:

```yaml
binding_id: stable identity
goal_id: affected Goal
surface: typed surface key
access: read | write | decide | exclusive
input_snapshot: optional immutable digest for safe reads
state: proposed | confirmed | inactive
provenance: actor, reason, and discovery source
```

Baseline conflict semantics:

| Existing / requested | read | write | decide | exclusive |
| --- | --- | --- | --- | --- |
| read | safe | safe only with a pinned immutable read snapshot | conflict | conflict |
| write | safe only with a pinned immutable read snapshot | conflict | conflict | conflict |
| decide | conflict | conflict | conflict | conflict |
| exclusive | conflict | conflict | conflict | conflict |

AI may propose bindings. The Board only enforces confirmed bindings and must show
which surfaces caused a block. Discovery of an omitted surface is an audited fact
update and can trigger revalidation; it is not automatically a new business Goal.

### 4.9 Risk and Goal Risk Link

A Risk describes uncertainty and impact. It is not executable work.

```yaml
risk_id: stable identity
description: uncertain event or condition
probability: explicit scale or estimate
impact: consequence and severity
affected_surfaces: where the consequence appears
trigger: observable condition
treatment: accept | mitigate | avoid | defer
blocking_mode: none | claim | completion | invalidate_on_trigger
revisit_condition: when it must be reconsidered
owner: accountable actor or role
state: open | triggered | resolved | accepted | expired
```

A Goal Risk Link attaches the Risk to affected Goals without changing their
business meaning. If mitigation requires work, create a new Goal and connect it
with `mitigates`.

### 4.10 Policy and Policy Binding

Policies describe execution and verification requirements independently of Goal
business semantics.

Execution policy:

```yaml
goal_mode: required | preferred | disabled
required_capabilities: actor/runtime capabilities
lease_rules: duration and renewal constraints
```

Verification policy can require:

- self verification;
- one or more cross reviewers;
- one or more adversarial reviewers;
- human approval;
- evidence kinds for specific Acceptance Criteria.

Policy resolution order:

```text
project default
  -> ancestor minimum requirements
  -> leaf-specific strengthening
  -> claim-time strengthening
```

No lower layer may weaken a higher minimum. Weakening an accepted policy binding
requires its configured authority, normally the user. The resolved policy is
recorded with a Claim so the Runtime knows what it accepted. Later strengthening
can create new Review obligations or revalidation but cannot silently claim that
the Runtime originally attested to a mode it did not use.

### 4.11 Claim and Lease

A Claim is a Runtime request for permission to perform a role on a Goal. It is
created only if the Coordinator atomically rechecks eligibility.

```yaml
claim_id: stable identity
goal_id: target Goal
actor_id: claiming Runtime or reviewer
role: executor | cross_reviewer | adversarial_reviewer | revalidator
capabilities: declared capabilities
goal_mode_attestation: declared Runtime Goal Mode state
resolved_policy: policy accepted at claim time
state: active | released | expired | revoked
claimed_at: authority time
expires_at: lease deadline
renewed_at: optional authority time
release_reason: optional terminal reason
```

The Lease is the time boundary of an active Claim; it is not a separate business
Task. At most one active executor Claim may exist for the same leaf Goal. Claims
on different Goals may also conflict through confirmed Impact Surface bindings.

The Board returns rejection reasons. It never chooses another Goal or starts a
Runtime after a failed Claim.

### 4.12 Run

A Run is one execution attempt under an executor or revalidator Claim.

```yaml
run_id: stable identity
goal_id: target Goal
claim_id: authorizing Claim
actor_id: Runtime
role: executor | revalidator
state: started | blocked | completed | failed | abandoned
started_at: authority time
ended_at: optional authority time
block_reason: optional structured reason
output_refs: produced artifact or result references
discovery_refs: Candidate Goals, Risks, or coordination facts found during work
```

Retries create new Runs. They do not create new Goals and do not mutate old Run
facts. A blocking discovery can move the active work projection to
`blocked_pending_decision` while the accepted Goal remains unchanged.

### 4.13 Evidence

Evidence connects observable proof to one or more Acceptance Criteria.

```yaml
evidence_id: stable identity
goal_id: proved Goal
criterion_ids: criteria addressed
producer_actor_id: producer
run_id: optional producing Run
review_id: optional producing Review
kind: test | measurement | artifact | inspection | attestation | human_verdict
locator: reproducible source or artifact reference
digest: immutable content digest when possible
captured_at: authority time
result: passed | failed | inconclusive
```

Submitting Evidence does not by itself satisfy a Goal. The Coordinator checks
criterion coverage, policy, provenance, validity, and required verdicts.

### 4.14 Review Obligation and Review

A Review Obligation is derived from resolved policy and attached to the same Goal.
It is not another business Goal.

```yaml
obligation_id: stable identity
goal_id: reviewed Goal
role: self_verifier | cross_reviewer | adversarial_reviewer | human_approver
required_count: number of passing independent verdicts
independence_rule: actor constraints
criterion_scope: criteria or whole Goal
state: pending | satisfied | waived
```

A Review records one actor's work and verdict:

```yaml
review_id: stable identity
obligation_id: fulfilled obligation
claim_id: optional reviewer Claim
actor_id: reviewer
verdict: pass | fail | needs_changes | inconclusive
evidence_refs: reviewed or newly produced Evidence
reasoning: concise decision rationale
submitted_at: authority time
```

The executor may perform self verification but cannot satisfy cross or
adversarial independence for its own Goal. Waiving an obligation requires the
authority specified by policy and remains visible in history.

### 4.15 Candidate Goal and Rewire Proposal

A Runtime can submit a Candidate Goal when it discovers a result outside the
accepted scope or a changed business meaning.

```yaml
candidate_id: stable identity
submitted_by: actor
discovered_in_run_id: optional Run
proposed_goal: complete draft Goal semantics, including business_logic
proposed_relations: suggested semantic and coordination edges
proposed_impacts: suggested Impact Surface bindings
proposed_risks: new or linked Risks
blocking_mode: none | current_run | dependent_claims
state: pending | approved | rejected | dismissed | superseded
decision: actor, reason, and time
```

Approval creates a new formal `goal_id`; the Candidate remains historical input.
The Board computes a Rewire Proposal showing edges to add/deactivate, claims or
Evidence affected, and Goals requiring revalidation. The user confirms the
rewire. Active Runs are never silently retargeted.

### 4.16 Domain Event and Projection

Every accepted semantic action, coordination update, and Runtime fact produces an
append-only Domain Event with actor, reason, authority time, object identity, and
payload. Current tables or in-memory objects are projections of that history.

The event sequence is audit history, not a sequence of Goal Contract versions.

TaskBoard and Goal Spine are also projections:

- TaskBoard shows role-specific executable leaf Goals and current work facts.
- Goal Spine shows causal, decomposition, replacement, correction, invalidation,
  mitigation, and migration relations over time.

## 5. Independent state axes

The canonical model must not use one combinatorial Goal status.

### Definition axis

```text
draft -> accepted
```

A rejected proposal remains a Candidate; it never becomes a rejected formal Goal.
Accepted does not transition back to draft.

### Decomposition axis

```text
abstract
frontier_open
closed_leaf
closed_compound
```

- `abstract`: outcome exists, but no executable decomposition is currently open.
- `frontier_open`: accepted child Goals exist or further near-term decomposition
  is required.
- `closed_leaf`: business logic, boundary, inputs, outputs, risks, and acceptance
  are sufficient for independent execution.
- `closed_compound`: all known decomposition coverage is currently closed, while
  the parent still has its own completion gate.

Decomposition is a coordination fact and may reopen after confirmed discovery.
Changing a former leaf to a compound never retargets an active Run; the discovery
must be resolved first.

### Validity axis

```text
valid | needs_revalidation | invalidated
```

`needs_revalidation` preserves previous Evidence while declaring that it cannot
currently support downstream completion. `invalidated` means the Goal result may
remain historical but cannot be relied on for current readiness or parent closure.

### Fulfillment axis

```text
unmet -> satisfied
```

Satisfaction records that the accepted Goal Contract passed its gates at a point
in history. Later coordination changes affect validity rather than rewriting that
historical fact. A new business requirement creates another Goal instead of
changing what the old satisfaction meant.

### Derived work projection

TaskBoard columns such as `ready`, `claimed`, `running`, `blocked`, `verification`,
and `revalidation_required` are derived from Goal axes plus Claim, Run, Risk,
Policy, Evidence, and Review facts. They are not writable Goal states.

## 6. Readiness and completion invariants

### Executor readiness

```text
ready_for_execution(goal, actor) =
  goal.definition == accepted
  AND goal.decomposition == closed_leaf
  AND goal.validity == valid
  AND goal.fulfillment == unmet
  AND required dependencies are satisfied and valid
  AND required inputs have acceptable bindings
  AND no Risk blocks claim
  AND no confirmed Impact Surface conflicts with active Claims
  AND actor capabilities and Goal Mode satisfy resolved policy
  AND no conflicting Claim is active
```

The response includes reasons and supporting fact identities. A Runtime chooses
from the returned set; the Board does not rank a choice into a dispatch command.

### Review readiness

A Goal is reviewable for a role when the corresponding obligation is pending,
required executor Evidence exists, the actor satisfies independence rules, and no
conflicting reviewer Claim exists.

### Leaf closure

A Goal is a closed leaf only when all are true:

1. `outcome` is independently observable.
2. `business_logic` explains the complete business loop in non-technical language.
3. In-scope and out-of-scope boundaries are explicit.
4. Semantic inputs and promised outputs are explicit.
5. Every Acceptance Criterion has a decidable pass condition and evidence need.
6. Required dependencies and current bindings are known or explicitly blocked.
7. Risks have treatment, blocking mode, owner, and revisit condition.
8. Impact Surface proposals have reached the confirmation state required by policy.
9. No unresolved decision can change the accepted business meaning.
10. The Goal does not hide another independently valuable business outcome.

### Leaf satisfaction

A leaf Goal can be satisfied only when:

- every Acceptance Criterion has passing, valid Evidence;
- required Review obligations have passing verdicts;
- completion-blocking Risks are resolved or accepted by the required authority;
- no blocking Candidate Goal remains pending;
- Goal validity is `valid`;
- the completion transition is appended by the Coordinator.

### Parent completion

A parent Goal can close only when:

- its decomposition state is `closed_compound`;
- required child Goals are satisfied and valid;
- the parent's own end-to-end Acceptance Criteria pass;
- all known requirements have a valid disposition;
- blocking Risks and Candidate Goals are closed;
- no required dependency or child is `needs_revalidation` or `invalidated`.

Child status aggregation alone is never sufficient.

## 7. Example: Customer Domain Goal

```yaml
goal_id: customer-domain-crud
outcome: Provide reusable customer record behavior to application services.
why: Other customer-facing flows need one consistent definition of customer data.
business_logic: |
  A customer can be created with a name and unique contact method, viewed later,
  updated without taking another customer's contact method, and deleted so that
  normal lookup no longer returns the record. Invalid or duplicate information
  is rejected with an understandable reason.
in_scope:
  - create, retrieve, update, and delete customer records
  - unique contact rule
out_of_scope:
  - user interface
  - authorization
  - data migration
required_inputs:
  - accepted customer identity rule
promised_outputs:
  - reusable customer CRUD behavior
acceptance_criteria:
  - statement: valid customer can be created and retrieved
    decision_method: automated_check
    pass_condition: test passes
  - statement: customer can be updated and deleted
    decision_method: automated_check
    pass_condition: update and delete tests pass
  - statement: duplicate contact is rejected
    decision_method: automated_check
    pass_condition: duplicate-contact test observes the declared business error
```

Later discovery that the Goal also writes `data:customer-record` adds or confirms
an Impact Surface binding. It does not change the business Goal. A new requirement
that deletion must be reversible changes the business logic and creates a new
Goal related by `corrects` or `replaces`.

## 8. Current V3 mapping

The existing code provides useful foundations but does not yet implement this
domain.

| Current V3 concept | Reuse | Required evolution |
| --- | --- | --- |
| `MolisWorkData` as shared core state | keep one core used by CLI and MCP | split semantic, coordination, and Runtime facts; move authority to SQLite |
| `GoalNode.one_liner` | keep as display metadata | add canonical outcome, why, business logic, scope, criteria, and stable identity |
| single `GoalStatus` | keep only for legacy import/display | replace canonical meaning with independent axes and derived work projection |
| coverage ledger | keep the known-coverage idea | use covered/deferred/out/unresolved with explicit blocking and provenance |
| string inputs/outputs | keep the continuity intent | separate semantic needs/promises from typed bindings and immutable snapshots |
| mutation validation in `Molis Work` | keep deterministic invariant enforcement | move to use-case/Coordinator boundaries over transactional authority |
| trace with state hashes | keep auditability and deterministic evidence | evolve to append-only domain events and derived projections |
| `continuityReport` warnings | keep explainability | derive from typed relations, bindings, and Goal closure rules |
| `audit` | keep explicit gates | evaluate criterion Evidence, policies, risks, coverage, and validity |
| handoff template | keep cross-session purpose | generate from Goal, Run, Evidence, Risks, and pending decisions without LLM placeholders |
| JSON persistence | keep import/export readability | no longer canonical after SQLite authority transition |
| CLI/MCP shared core | keep | expose the same application use cases and contract tests |

The current V3 `schema_version` is a storage compatibility concern. It must not be
reinterpreted as a mutable version of an accepted Goal Contract.

## 9. Non-blocking and blocking open decisions

### Blocks identity-sensitive Claim implementation

- Actor trust boundary: self-declared local actor, process-bound identity, or
  verifiable credentials.

### Blocks legacy migration Goal

- V3 JSON treatment: one-time import, compatibility reader, or explicit
  regeneration.

### Does not block this domain boundary

- Concrete identifier format.
- SQLite table layout and event/projection storage strategy.
- CLI command names and MCP tool names.
- Goal Spine visual layout.

## 10. `GB-002-01` acceptance audit

| Acceptance condition | Result | Evidence |
| --- | --- | --- |
| Every entity has purpose, owner, identity, and lifecycle boundary | self-check passed | Sections 3–4 |
| Goal semantics are separate from coordination facts | self-check passed | Sections 2, 4.2, 4.6–4.10 |
| No independent Task or mutable accepted Goal version | self-check passed | Sections 4.2–4.3 |
| Independent state axes support revalidation | self-check passed | Section 5 |
| Leaf and parent completion are decidable | self-check passed | Section 6 |
| Policy inheritance and independent Review roles exist | self-check passed | Sections 4.10 and 4.14 |
| V3 reuse and replacement boundaries are explicit | self-check passed | Section 8 |
| Storage, transport, and TypeScript stay out of scope | self-check passed | Sections 1 and 9 |
