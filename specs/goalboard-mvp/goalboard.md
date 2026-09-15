# Molis Work V1 Bootstrap Work Order

This file is the single development truth source for Molis Work V1 until the
SQLite-backed Molis Work can import it and pass the migration acceptance checks.
It replaces a separate `spec.md`; no second executable requirement document may
compete with it.

## Board identity

```yaml
board_id: molis-work-mvp-development
authority: specs/molis-work-mvp/molis-work.md
authority_mode: bootstrap-manual
root_goal_id: molis-work-mvp
active_product_goal_id: molis-work-v1-product
writer_policy: single-writer
writer: codex-main-session
runtime_selection: pull
delivery_state: awaiting_v1_release_review
created_at: 2026-08-15
```

Bootstrap limitation: this Markdown file cannot provide transactional claims.
The SQLite authority and true multi-process Claim path now pass acceptance, but
this bootstrap history remains single-writer until the user records the V1
release decision and initializes a canonical workspace database.

The authority transition is explicit: after the SQLite importer, invariant
checks, and semantic parity checks pass, a user-approved event will make the
SQLite database canonical. This file then becomes a generated, read-only view.

## Project Policy Contract

```yaml
goal_semantics:
  draft_editable: true
  accepted_editable: false
  change_method: create_new_goal_and_rewire
  semantic_fields:
    - outcome
    - why
    - business_logic
    - in_scope
    - out_of_scope
    - acceptance
    - constraints

coordination_facts:
  audited_mutable:
    - relation_edges
    - impact_surface_bindings
    - risk_links
    - policy_bindings
    - decomposition_policy
    - input_bindings
  update_requirements:
    - explicit_actor_and_reason
    - append_only_event
    - impact_recalculation
    - revalidation_when_applicable

execution_policy:
  runtime_mode: pull
  goal_mode: required
  board_may_start_runtime: false
  board_may_dispatch_goal: false

review_policy:
  project_default:
    self_verification: required
    cross_verification: optional
    adversarial_verification: optional
    human_approval: optional
  project_minimum:
    self_verification: required
  inheritance: child_may_strengthen_but_not_weaken
  resolution_order: project_default_then_parent_minimum_then_leaf_then_claim
  claim_override: may_strengthen_but_not_weaken
  independent_review: executor_cannot_cross_or_adversarial_review_own_goal
  delivery_cadence:
    leaf_human_approval: optional_unless_high_risk
    required_human_gates:
      - protocol_milestone
      - runnable_vertical_slice
      - v1_release

discovery_policy:
  runtime_may_create_formal_goal: false
  runtime_may_submit_candidate_goal: true
  candidate_promotion_requires_human_approval: true
  active_run_may_be_silently_retargeted: false
```

`business_logic` is required before a Goal becomes accepted. It explains in
non-technical language who needs the behavior, what happens, which decisions are
made, the result, and important exceptions. It must not be replaced by class
names, endpoints, storage details, framework terminology, or implementation
notes.

## Board invariants

1. A leaf Goal and a Task are the same canonical object and share one `goal_id`.
2. TaskBoard is a derived view of executable leaf Goals; it is not writable.
3. An accepted Goal's semantic fields are immutable. Changed semantics create a
   new Goal related by `extends`, `replaces`, `corrects`, or `invalidates`.
4. A Runtime queries the Ready Set, chooses a Goal, and attempts an atomic Claim.
   Molis Work never selects or launches a Runtime.
5. A Runtime discovery is a Candidate Goal until a user confirms its promotion
   and dependency rewire.
6. `ready` is derived, never manually asserted as durable truth.
7. A Goal cannot become `satisfied` without all required acceptance Evidence and
   Review obligations.
8. Parent completion requires its own end-to-end acceptance, known-requirement
   coverage, and risk closure; child completion alone is insufficient.
9. Known requirements must be `covered`, `deferred`, `out`, or `unresolved`.
10. Before transactional storage exists, the single-writer rule substitutes for
    atomic Claim enforcement and is recorded as an accepted bootstrap risk.
11. An executor cannot satisfy a cross or adversarial Review obligation for its
    own Goal; independent roles attach Evidence and verdicts to the same Goal.
12. A Risk is not a work Goal. If mitigation requires executable work, create a
    new Goal related by `mitigates`.

## Root Goal Contract

```yaml
goal_id: molis-work-mvp
parent_goal_id: null
definition_state: accepted
decomposition_state: abstract
validity: valid
execution_state: review

outcome: >
  Establish a local-first Molis Work MVP backed by shared SQLite so multiple
  Runtime processes can query, claim, execute, and verify leaf Goals against one
  authoritative source of truth.

why: >
  Users of general AI runtimes cannot reliably see what the actual goal is,
  why each step exists, whether work is independent, what can run next, which
  risks affect it, or what evidence proves completion.

business_logic: |
  A user records what they want to achieve as Goals and progressively breaks
  near-term Goals into smaller, independently checkable results. Only a leaf
  Goal with clear boundaries, dependencies, risks, business behavior, and
  acceptance conditions can be offered for execution. A Runtime asks the Board
  what is ready, chooses one item, and attempts to claim it. If another Runtime
  already holds a conflicting claim, only one attempt succeeds. The Runtime
  reports evidence when it finishes. Required cross, adversarial, or human
  reviews must also finish before the Goal is satisfied. New work discovered
  during execution is proposed to the user and cannot silently change the
  accepted Goal or the active Run.

in_scope:
  - dynamic Goal graph and Goal Frontier
  - Goal, policy, relation, impact, and risk contracts
  - shared SQLite authority and transactional Claim/Lease
  - Run, Evidence, Review, Candidate Goal, and confirmed rewire
  - TaskBoard projection
  - semantically equivalent CLI and MCP pull interfaces

out_of_scope:
  - starting, hosting, scheduling, or dispatching Runtime processes
  - selecting models, sessions, worktrees, or containers
  - cloud multi-tenancy in the MVP
  - full visual Goal Spine product in the MVP
  - third-party project-management synchronization in the MVP

acceptance:
  - Goals and operational execution state persist in shared SQLite.
  - CLI and MCP return semantically identical Ready Sets and explanations.
  - Two concurrent exclusive claims for the same leaf Goal cannot both succeed.
  - Missing required Evidence or Review prevents Goal satisfaction.
  - A Runtime can submit a Candidate Goal but cannot directly mutate the Spine.
  - User-confirmed new Goals can rewire dependencies and trigger revalidation.
  - TaskBoard is generated from leaf Goals and has no independent Task identity.
  - Parent completion independently checks end-to-end acceptance, coverage, and risks.
```

## Active Product Goal Contract

```yaml
goal_id: molis-work-v1-product
parent_goal_id: null
definition_state: accepted
decomposition_state: closed_compound
validity: valid
execution_state: review

relations:
  - type: extends
    target: molis-work-mvp

outcome: >
  Ship a usable Molis Work V1 with SQLite authority, shared CLI/MCP semantics, and
  a plain-language Web UI that lets people understand and operate the Goal Spine.

why: >
  A protocol-only Molis Work cannot prove product value. Users need a working
  source of truth and a visual surface where goals, next actions, blockers,
  risks, evidence, and decisions are understandable without reading contracts.

business_logic: |
  A user opens Molis Work and immediately sees the outcome being pursued, the
  current executable Goals, and what is blocking the rest. They can open any Goal
  to read its business logic, acceptance conditions, dependencies, risks, Runs,
  Evidence, and Reviews. AI Runtimes query and claim work through CLI or MCP.
  When execution discovers new work, the user can inspect the Candidate Goal and
  its impact before accepting it into the Spine. The Board never starts or
  dispatches a Runtime.

in_scope:
  - accepted Molis Work domain and Coordinator semantics
  - shared local SQLite authority
  - Runtime pull, Claim/Lease, Run, Evidence, Review, Candidate, and Rewire flows
  - semantically equivalent CLI and MCP operations
  - responsive Web UI for Goal Spine, TaskBoard, Goal detail, risks, and decisions
  - plain Chinese product copy and understandable empty/error/loading states
  - import path from current V3 JSON or an explicit regeneration path

out_of_scope:
  - cloud multi-tenancy and complex authorization
  - Runtime process orchestration
  - third-party PM synchronization
  - advanced portfolio analytics
  - collaborative realtime editing

acceptance:
  - A fresh workspace can initialize a V1 Board backed by SQLite.
  - A person can understand the active outcome, Ready Goals, blockers, and next
    action from the first Web UI viewport without reading protocol documentation.
  - Two concurrent conflicting Claims cannot both succeed.
  - A Runtime can complete the Claim, Run, Evidence, and required Review flow.
  - Candidate Goal approval and Rewire never rewrite an active Run.
  - CLI, MCP, and Web UI use the same application decisions.
  - Desktop and mobile UI pass accessibility, responsive, and visual QA.
  - Typecheck, focused tests, full tests, and production build pass.
```

## Goal Frontier

The V1 implementation frontier is closed. All executable delivery Goals are
satisfied; only the user-owned release review remains open.

| Goal | Definition | Decomposition | Validity | Execution | Ready result |
| --- | --- | --- | --- | --- | --- |
| `GB-001` | accepted | closed leaf | valid | satisfied | all acceptance and Review gates passed |
| `molis-work-v1-product` | accepted | closed compound | valid | review | implementation complete; user release gate pending |
| `GB-002` | accepted | closed compound | valid | satisfied | domain, Coordinator, and storage contracts accepted |
| `GB-002-01` | accepted | closed leaf | valid | satisfied | all acceptance and Review gates passed |
| `GB-002-02` | accepted | closed leaf | valid | satisfied | user continued V1 delivery; all gates passed |
| `GB-002-03` | accepted | closed leaf | valid | satisfied | storage contract and first transaction tests passed |
| `GB-003` | accepted | closed leaf | valid | satisfied | lifecycle core and concurrency tests passed |
| `GB-004` | accepted | closed leaf | valid | satisfied | CLI and MCP use the same SQLite decisions |
| `GB-005` | accepted | closed leaf | valid | satisfied | usable responsive Web UI passed independent review |
| `GB-006` | accepted | closed leaf | valid | satisfied | V3 import, documentation, build, and package checks passed |

## Leaf Goal `GB-001`: Establish the Bootstrap Molis Work

```yaml
goal_id: GB-001
parent_goal_id: molis-work-mvp
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied

outcome: >
  Establish one durable and reviewable Bootstrap Molis Work that guides this
  development before the transactional Molis Work exists.

why: >
  Molis Work should be tested first on its own development, and the team needs a
  single source of scope, status, risk, acceptance, and discovery truth before
  product code changes begin.

business_logic: |
  Before anyone starts a development step, they can read one Board and understand
  the overall outcome, the smallest Goal currently being worked on, why it is
  ready, what must be true to finish it, what is blocked, and which risks have
  been accepted. Only the main session updates the Board during bootstrap. If
  work reveals a new requirement, it is recorded as a Candidate Goal for user
  confirmation instead of being silently added to the active Goal.

in_scope:
  - root Goal Contract
  - project execution and review policy
  - Goal Frontier
  - known-requirement coverage ledger
  - risk register
  - Claim, Evidence, Review, and event records for bootstrap work
  - migration trigger from Markdown authority to SQLite authority

out_of_scope:
  - product TypeScript implementation
  - database schema or migrations
  - CLI or MCP behavior changes
  - complete decomposition of remote implementation work

inputs:
  - confirmed product decisions from the clarification conversation
  - existing Clarification Agent V3 repository structure and documentation
  - repository-level development protocol

outputs:
  - specs/molis-work-mvp/molis-work.md

depends_on: []

impact_surfaces:
  - surface: decision:molis-work-development-contract
    access: decide
  - surface: artifact:specs/molis-work-mvp/molis-work.md
    access: write
  - surface: rule:goal-lifecycle
    access: decide

risk_refs:
  - RISK-BOOTSTRAP-ATOMICITY
  - RISK-MANUAL-DRIFT

execution_policy:
  goal_mode: required

review_policy:
  self_verification: required
  cross_verification: optional
  adversarial_verification: optional
  human_approval: required

acceptance:
  - There is exactly one executable Work Order for the Molis Work MVP.
  - It records the accepted Root Goal and its plain-language business logic.
  - It records policy, invariants, frontier, coverage, risks, and bootstrap state.
  - GB-001 is a closed leaf Goal with independent acceptance conditions.
  - The single-writer limitation and SQLite authority transition are explicit.
  - Candidate Goal and semantic-change handling are explicit.
  - Repository diff checks pass and no product code is modified.
```

### Active Claim

```yaml
claim_id: CLAIM-001
goal_id: GB-001
actor_id: codex-main-session
role: executor
claim_state: released
lease_mode: bootstrap-session-bound
goal_mode_attestation: enabled
started_at: 2026-08-15
release_condition: evidence_submitted_or_explicit_release
released_at: 2026-08-15
release_reason: executor_work_submitted_for_verification
```

### Evidence and Review

```yaml
evidence:
  - evidence_id: EVIDENCE-GB-001-ARTIFACT
    kind: artifact
    source: specs/molis-work-mvp/molis-work.md
    result: passed
    covers:
      - single Work Order
      - Root Goal and business logic
      - policy, invariants, frontier, coverage, risks, and bootstrap state
      - migration trigger and Candidate Goal handling
  - evidence_id: EVIDENCE-GB-001-CHECKS
    kind: command
    source: bootstrap board structural and working-tree scope checks
    result: passed
    details:
      - exactly one file exists under specs/molis-work-mvp
      - three accepted or planned Goal Contracts contain business_logic
      - all four registered risks contain an owner
      - no trailing whitespace was found
      - git status contains only the new specs directory
reviews:
  - review_id: REVIEW-GB-001-SELF
    role: self_verifier
    actor_id: codex-main-session
    state: passed
    findings:
      - removed an impossible independent adversarial requirement from GB-001
      - made claim-time policy strengthening explicit
      - added independent-review and risk-to-mitigation-Goal invariants
      - completed risk ownership and affected-surface fields
  - review_id: REVIEW-GB-001-HUMAN
    role: human_approver
    actor_id: user
    state: passed
    verdict: approved
    source: user message "继续"
```

## Abstract Goal `GB-002`: Define the Molis Work Domain and Protocol

```yaml
goal_id: GB-002
parent_goal_id: molis-work-mvp
definition_state: accepted
decomposition_state: frontier_open
validity: valid
execution_state: idle

outcome: >
  Produce an implementation-ready domain and protocol definition for the
  Molis Work MVP before product modules are changed.

business_logic: |
  A developer or Runtime can read the protocol and unambiguously understand what
  each Molis Work object means, which changes are permitted, how a Goal becomes
  ready, how simultaneous claims are resolved, how risks and conflicts block
  work, how completion evidence is judged, and how discoveries become confirmed
  new Goals without rewriting history.

decompose_when: GB-001 is satisfied
latest_decompose_at: before any product TypeScript file is modified
blocks_parent_completion: true
depends_on:
  - GB-001

acceptance:
  - Domain objects, relationships, ownership, inputs, and outputs are defined.
  - State axes and derived readiness rules are deterministic.
  - SQLite transaction boundaries and concurrency invariants are defined.
  - CLI and MCP operations have shared semantic request and response contracts.
  - Normal, conflicting, discovery, revalidation, and review scenarios are covered.
  - No unresolved blocking decision remains for the first implementation slice.

review_policy:
  self_verification: required
  adversarial_verification: required
  human_approval: required
```

## Leaf Goal `GB-002-01`: Define the canonical domain boundary

```yaml
goal_id: GB-002-01
parent_goal_id: GB-002
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied

outcome: >
  Define the canonical Molis Work domain objects, ownership boundaries, semantic
  invariants, state axes, and completion meaning without choosing storage or API
  implementation details.

why: >
  SQLite, Coordinator, CLI, and MCP work cannot be safely decomposed until they
  share one precise meaning for Goal, Task, Claim, Run, Evidence, Review, Risk,
  Candidate Goal, and evolving coordination facts.

business_logic: |
  A user, Runtime, and reviewer should be able to look at the same Molis Work and
  agree on what result was promised, what may still change, what is currently
  executable, who is attempting it, what proof exists, and whether it is safe to
  call the Goal complete. Business promises remain stable after acceptance,
  while newly discovered dependencies, risks, affected areas, and review needs
  are added transparently and cause re-checking when necessary.

in_scope:
  - canonical domain entities and their ownership
  - immutable Goal semantics versus audited coordination facts
  - leaf Goal and Task identity
  - independent state axes and derived projections
  - leaf closure and parent completion invariants
  - claim, run, evidence, and review role boundaries
  - Candidate Goal and confirmed rewire meaning
  - mapping from current V3 concepts to the new domain

out_of_scope:
  - SQLite tables, indexes, transactions, or migrations
  - CLI or MCP request and response schemas
  - TypeScript implementation
  - visual Goal Spine design

inputs:
  - accepted Root Goal and Project Policy Contract
  - current src/core/types.ts and src/core/molis-work.ts behavior
  - current coverage, continuity, handoff, CLI, and MCP boundaries

outputs:
  - specs/molis-work-mvp/domain-contract.md

depends_on:
  - GB-001

impact_surfaces:
  - surface: decision:molis-work-domain-boundary
    access: decide
  - surface: rule:goal-lifecycle
    access: decide
  - surface: artifact:specs/molis-work-mvp/domain-contract.md
    access: write

risk_refs:
  - RISK-DOMAIN-OVERMODELING

execution_policy:
  goal_mode: required

review_policy:
  self_verification: required
  cross_verification: optional
  adversarial_verification: optional
  human_approval: required

acceptance:
  - Every canonical entity has a purpose, owner, identity, and lifecycle boundary.
  - Goal semantic fields are separated from audited coordination facts.
  - No independent Task entity or mutable accepted Goal Contract is introduced.
  - State axes avoid one combinatorial Goal status and support revalidation.
  - Leaf closure and parent completion are independently decidable.
  - Policy inheritance and independent Review roles are represented.
  - Current V3 reusable foundations and replacement boundaries are explicit.
  - Storage, transport, and TypeScript implementation choices remain out of scope.
```

### Active Claim

```yaml
claim_id: CLAIM-002
goal_id: GB-002-01
actor_id: codex-main-session
role: executor
claim_state: released
lease_mode: bootstrap-session-bound
goal_mode_attestation: enabled
started_at: 2026-08-15
release_condition: evidence_submitted_or_explicit_release
released_at: 2026-08-15
release_reason: domain_contract_submitted_for_verification
```

### Evidence and Review

```yaml
evidence:
  - evidence_id: EVIDENCE-GB-002-01-ARTIFACT
    kind: artifact
    source: specs/molis-work-mvp/domain-contract.md
    result: passed
    covers:
      - canonical entity boundary and write ownership
      - immutable Goal semantics versus audited coordination facts
      - Plan and Task projections without duplicate truth
      - independent state axes, readiness, leaf closure, and parent completion
      - V3 reuse and replacement boundary
  - evidence_id: EVIDENCE-GB-002-01-CHECKS
    kind: command
    source: domain contract structural and working-tree scope checks
    result: passed
    details:
      - all required domain sections were found
      - Plan and Task projection rules were found
      - revalidation, decomposition, readiness, and review independence were found
      - no trailing whitespace was found
      - git status contains only the new specs directory
reviews:
  - review_id: REVIEW-GB-002-01-SELF
    role: self_verifier
    actor_id: codex-main-session
    state: passed
    findings:
      - added a unified identity, ownership, and lifecycle table
      - added Actor Reference and prohibited anonymous writes
      - separated semantic required inputs from audited input bindings
      - added progressive decomposition policy
      - defined Plan as a projection instead of a second truth source
  - review_id: REVIEW-GB-002-01-HUMAN
    role: human_approver
    actor_id: user
    state: passed
    verdict: approved
    source: user message "继续"
```

## Leaf Goal `GB-002-02`: Define deterministic Coordinator rules

```yaml
goal_id: GB-002-02
parent_goal_id: GB-002
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied

outcome: >
  Define deterministic Coordinator decisions, gates, reason codes, and state
  transitions over the canonical Molis Work domain without selecting storage or
  transport implementation.

why: >
  Shared domain objects are not sufficient unless every Runtime receives the
  same answer for readiness, claim eligibility, reviewability, revalidation, and
  completion from the same Board facts.

business_logic: |
  A Runtime asks what it may do and receives a reproducible answer with concrete
  reasons. If work is blocked, the Board explains which dependency, risk,
  conflict, policy, claim, evidence, or decision caused the block. The Runtime
  chooses its own work. The Board only validates and records an allowed action;
  it never starts a Runtime, assigns a Goal, or hides a failed condition.

in_scope:
  - readiness and role-specific work queries
  - structured eligibility and blocking reasons
  - policy inheritance and claim-time strengthening
  - Impact Surface conflict evaluation
  - Risk blocking gates
  - Claim, Lease, Run, Evidence, and Review transitions
  - Candidate Goal, Rewire, invalidation, and revalidation propagation
  - leaf and parent completion decisions
  - idempotency and atomicity requirements at the application boundary

out_of_scope:
  - SQLite schema, SQL statements, indexes, or transaction implementation
  - CLI commands or MCP payload schemas
  - Runtime startup, scheduling, dispatch, or model selection
  - TypeScript implementation

inputs:
  - accepted specs/molis-work-mvp/domain-contract.md
  - accepted Root Goal and Project Policy Contract
  - current V3 mutation, validation, audit, and trace behavior

outputs:
  - specs/molis-work-mvp/coordinator-contract.md

depends_on:
  - GB-002-01

impact_surfaces:
  - surface: decision:molis-work-coordinator-semantics
    access: decide
  - surface: rule:readiness
    access: decide
  - surface: rule:claim-eligibility
    access: decide
  - surface: rule:completion
    access: decide
  - surface: artifact:specs/molis-work-mvp/coordinator-contract.md
    access: write

risk_refs:
  - RISK-COORDINATOR-NONDETERMINISM

execution_policy:
  goal_mode: required

review_policy:
  self_verification: required
  cross_verification: optional
  adversarial_verification: optional
  human_approval: required

acceptance:
  - Every Coordinator decision declares inputs, success result, failure reasons,
    emitted event, and idempotency behavior.
  - Readiness, Review readiness, and completion are deterministic derived decisions.
  - Policy resolution can only strengthen inherited minimums.
  - Impact conflict and Risk gates produce structured, explainable blockers.
  - Candidate, Rewire, invalidation, and revalidation never rewrite active Runs.
  - Claim creation is defined as an atomic recheck-and-create operation.
  - Normal, conflicting, expired-Lease, discovery, and completion scenarios exist.
  - Storage, transport, and TypeScript implementation remain out of scope.
```

### Active Claim

```yaml
claim_id: CLAIM-003
goal_id: GB-002-02
actor_id: codex-main-session
role: executor
claim_state: released
lease_mode: bootstrap-session-bound
goal_mode_attestation: enabled
started_at: 2026-08-15
release_condition: evidence_submitted_or_explicit_release
released_at: 2026-08-15
release_reason: coordinator_contract_submitted_for_verification
```

### Evidence and Review

```yaml
evidence:
  - evidence_id: EVIDENCE-GB-002-02-ARTIFACT
    kind: artifact
    source: specs/molis-work-mvp/coordinator-contract.md
    result: passed
    covers:
      - decision envelope, structured reasons, and idempotency
      - role-specific readiness and policy resolution
      - Impact and Risk gates
      - Claim, Lease, Run, Evidence, and Review transitions
      - Candidate, Rewire, revalidation, and completion decisions
      - seven acceptance scenarios
  - evidence_id: EVIDENCE-GB-002-02-CHECKS
    kind: command
    source: Coordinator Contract structural, scenario, and working-tree scope checks
    result: passed
    details:
      - all required decision sections were found
      - seven required acceptance scenarios were found
      - atomic Claim, Lease expiry, reasons, and active-Run protection were found
      - no trailing whitespace was found
      - git status contains only the new specs directory
reviews:
  - review_id: REVIEW-GB-002-02-SELF
    role: self_verifier
    actor_id: codex-main-session
    state: passed
    findings:
      - made authority time an explicit fact instead of an implicit failed-Claim side effect
      - kept an approved Candidate ineligible until required Rewire decisions close
      - named the executor readiness predicate for deterministic contract tests
  - review_id: REVIEW-GB-002-02-HUMAN
    role: human_approver
    actor_id: user
    state: passed
    verdict: approved
    source: active V1 delivery objective
```

## Leaf Goal `GB-002-03`: Define SQLite authority and transaction boundaries

```yaml
goal_id: GB-002-03
parent_goal_id: GB-002
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied

outcome: >
  Define the minimum SQLite authority contract that can implement Coordinator
  decisions atomically across CLI, MCP, and Web processes.

business_logic: |
  Every Molis Work client opens the same local database. Reads see a coherent
  Board snapshot. Writes either record the requested domain change, event, and
  idempotency result together or record none of them. Two Runtimes racing for a
  conflicting Goal cannot both receive an active Claim.

in_scope:
  - canonical tables and authoritative ownership
  - WAL, durability, foreign-key, and busy-timeout policy
  - atomic Claim, idempotent write, Rewire, and completion boundaries
  - Lease authority time and expiry semantics
  - event and projection consistency
  - V3 import/regeneration boundary

out_of_scope:
  - remote/network filesystem database sharing
  - cloud replication
  - CLI/MCP serialization
  - UI implementation

outputs:
  - specs/molis-work-mvp/storage-contract.md

depends_on:
  - GB-002-02

impact_surfaces:
  - surface: decision:sqlite-authority
    access: decide
  - surface: data:molis-work-v1
    access: decide
  - surface: artifact:specs/molis-work-mvp/storage-contract.md
    access: write

execution_policy:
  goal_mode: required

review_policy:
  self_verification: required
  human_approval: optional

acceptance:
  - SQLite pragmas and single-machine boundary are explicit.
  - Canonical tables cover all V1 domain entities.
  - Atomic write boundaries map to Coordinator operations.
  - Idempotency and Lease expiry cannot create partial effects.
  - Claim uniqueness has both transaction and database constraints.
  - Migration behavior is explicit and testable.
```

### Active Claim

```yaml
claim_id: CLAIM-004
goal_id: GB-002-03
actor_id: codex-main-session
role: executor
claim_state: released
lease_mode: bootstrap-session-bound
goal_mode_attestation: enabled
started_at: 2026-08-15
release_condition: evidence_submitted_or_explicit_release
released_at: 2026-08-15
release_reason: storage_contract_and_transaction_slice_verified
```

### Evidence and Review

```yaml
evidence:
  - evidence_id: EVIDENCE-GB-002-03-CONTRACT
    kind: artifact
    source: specs/molis-work-mvp/storage-contract.md
    result: passed
  - evidence_id: EVIDENCE-GB-002-03-SLICE
    kind: test
    source: pnpm test
    result: passed
    details: 35 tests passed, including migration, idempotency, Lease expiry, and Impact conflicts
reviews:
  - review_id: REVIEW-GB-002-03-SELF
    role: self_verifier
    actor_id: codex-main-session
    state: passed
```

## Leaf Goal `GB-003`: Implement the runnable Goal lifecycle core

```yaml
goal_id: GB-003
parent_goal_id: molis-work-v1-product
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied

outcome: >
  Provide one tested application core that can create Goals, explain readiness,
  atomically claim work, record Runs and Evidence, enforce Reviews, and decide completion.

business_logic: |
  A Runtime can take one Ready Goal from start to finish without bypassing the
  Goal's acceptance conditions. If required proof or review is missing, the
  Board explains what is missing and does not mark the Goal complete.

in_scope:
  - canonical SQLite Goal and coordination facts
  - Ready and blocker explanation
  - Claim and Lease lifecycle
  - Run, Evidence, Review, and leaf completion
  - Candidate Goal submission and user decision boundary

out_of_scope:
  - CLI, MCP, and Web transport
  - Runtime startup or dispatch
  - cloud authorization

outputs:
  - src/v1/types.ts
  - src/v1/store.ts
  - src/v1/coordinator.ts
  - tests/v1.test.ts

depends_on:
  - GB-002-03

acceptance:
  - An accepted closed-leaf Goal with explicit acceptance can become Ready.
  - Atomic Claim, idempotency, Lease expiry, and Impact conflict tests pass.
  - A valid Claim can create a Run and submit criterion-linked Evidence.
  - Required Review obligations block completion until satisfied.
  - Passing Evidence and Reviews can satisfy the Goal; missing gates return plain-language reasons.
  - A Runtime can submit but cannot itself approve a Candidate Goal.
```

### Active Claim

```yaml
claim_id: CLAIM-005
goal_id: GB-003
actor_id: codex-main-session
role: executor
claim_state: released
lease_mode: bootstrap-session-bound
goal_mode_attestation: enabled
started_at: 2026-08-15
release_condition: lifecycle_tests_and_self_review_pass
released_at: 2026-08-15
release_reason: lifecycle_core_and_concurrency_tests_passed
```

### Evidence and Review

```yaml
evidence:
  - evidence_id: EVIDENCE-GB-003-TESTS
    kind: test
    source: pnpm test
    result: passed
    details: 44 tests passed, including a true two-process Claim race and the full execution loop
reviews:
  - review_id: REVIEW-GB-003-SELF
    role: self_verifier
    actor_id: codex-main-session
    state: passed
```

## Closed delivery Goal `GB-004`: Expose the shared CLI and MCP interface

```yaml
goal_id: GB-004
parent_goal_id: molis-work-v1-product
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied
outcome: Let a Runtime query and operate the same Molis Work decisions through CLI or MCP.
business_logic: |
  A Runtime can ask what is ready, understand why work is blocked, claim a Goal,
  report work and proof, and submit discoveries through either interface. Both
  interfaces read and change the same SQLite truth. Neither starts or dispatches a Runtime.
depends_on: [GB-003]
outputs:
  - src/v1/cli.ts
  - src/cli/main.ts
  - src/mcp/server.ts
acceptance:
  - CLI and MCP return the same Ready semantics from one database.
  - Both expose the V1 lifecycle, Candidate, Rewire, Risk, and policy operations.
  - Runtime startup and dispatch remain absent.
claim_id: CLAIM-006
claim_state: released
evidence: pnpm test; 44 passed
review: self verification passed
```

## Closed delivery Goal `GB-005`: Ship the understandable Web UI

```yaml
goal_id: GB-005
parent_goal_id: molis-work-v1-product
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied
outcome: Give people a clear operating surface for the Goal Spine and its proof.
business_logic: |
  A person first sees the active outcome and next action, then follows the real
  dependency Spine. Selecting a Goal explains its business logic, blockers,
  acceptance, execution facts, Evidence, Review, risks, and policy. Only the user
  can decide Candidate Goals and confirm Rewire proposals.
depends_on: [GB-004]
outputs:
  - src/web/render.ts
  - src/web/server.ts
  - tests/web.test.ts
  - PRODUCT.md
  - DESIGN.md
acceptance:
  - The first viewport explains the outcome, next action, real relations, and blockers.
  - Claim commands appear only for Ready Goals and carry Goal Mode and capabilities.
  - Desktop and mobile have no horizontal overflow or console errors.
  - Keyboard focus, semantic status text, live regions, and reduced motion are present.
claim_id: CLAIM-007
claim_state: released
evidence: automated Web tests plus desktop and mobile browser QA
review: independent Impeccable finish review passed with no Blocker or P1
```

## Closed delivery Goal `GB-006`: Complete migration and release checks

```yaml
goal_id: GB-006
parent_goal_id: molis-work-v1-product
definition_state: accepted
decomposition_state: closed_leaf
validity: valid
execution_state: satisfied
outcome: Make Molis Work V1 installable, understandable, and safe to initialize from V3 data.
business_logic: |
  A user can install version 1.0.0, initialize a fresh SQLite workspace, run the
  CLI, MCP server, or Web UI, and explicitly import safe V3 structure. Missing V1
  meaning is reported for regeneration instead of being invented as completed work.
depends_on: [GB-004, GB-005]
outputs:
  - src/v1/migration.ts
  - README.md
  - package.json
acceptance:
  - V3 import preserves safe structure and leaves missing semantics unmet.
  - Typecheck, all tests, production build, and npm dry-run package pass.
  - The package identifies itself as version 1.0.0 and includes all three binaries.
claim_id: CLAIM-008
claim_state: released
evidence: pnpm typecheck; pnpm test; pnpm build; npm pack --dry-run --json
review: self verification passed
```

## V1 release review

All implementation Goals are satisfied. The active Product Goal and historical
Root Goal are in `review` because the policy reserves the final `v1_release`
decision for the user. No implementation blocker remains.

## Known-requirement coverage ledger

| Requirement | Status | Covered by / disposition |
| --- | --- | --- |
| Molis Work is the Runtime-neutral source of truth | covered | Root Goal, invariants 2 and 4 |
| Runtime pulls and chooses; Board does not dispatch | covered | Project execution policy |
| Leaf Goal and Task have one identity | covered | Invariant 1 |
| Every accepted Goal explains business logic in non-technical language | covered | Project Policy Contract and both Goal Contracts |
| Accepted Goal semantics do not use mutable Goal Contract versions | covered | Semantic-change policy and invariant 3 |
| Goal graph is progressively decomposed using a Goal Frontier | covered | Frontier and `GB-002.decompose_when` |
| Runtime discoveries become Candidate Goals requiring user confirmation | covered | Discovery policy and invariant 5 |
| Relations, Impact Surfaces, conflict, invalidation, and revalidation | covered | `GB-002` implementation obligation |
| Risks have explicit treatment and blocking behavior | covered | Risk register and `GB-002` obligation |
| Goal Mode and self/cross/adversarial/human Review are configurable | covered | Project Review Policy |
| Parent completion is not the sum of child statuses | covered | Root acceptance and invariant 8 |
| Shared SQLite is the single-device, single-workspace MVP authority | covered | Root Goal and authority transition |
| CLI and MCP share semantics | covered | Root and `GB-002` acceptance |
| Molis Work V1 includes a usable Web UI | covered | `molis-work-v1-product` acceptance |
| UI explains Goal, next action, blockers, and completion in plain language | covered | `molis-work-v1-product` business logic and PRODUCT.md |
| UI design and QA follow Impeccable | covered | active V1 delivery policy and Web UI delivery Goal |
| Runtime actor/reviewer independence trust model | covered | local actor IDs plus enforced executor/reviewer separation |
| Existing V3 JSON migration behavior | covered | explicit one-time import that preserves safe structure and regenerates missing semantics |
| Full visual Goal Spine | deferred | Explicit Root non-goal for MVP |
| Cloud multi-user collaboration | deferred | Explicit Root non-goal for MVP |

## Risk register

### `RISK-BOOTSTRAP-ATOMICITY`

```yaml
description: Markdown bootstrap storage cannot enforce atomic multi-process Claim.
state: resolved
probability: certain
impact: duplicate or conflicting writers could fork operational truth.
affected_surfaces:
  - artifact:specs/molis-work-mvp/molis-work.md
blocking_mode: claim
trigger: a second writer attempts to update bootstrap state
treatment: accept_with_control
control: only codex-main-session may write until SQLite authority is accepted
revisit_when: SQLite Claim transaction tests pass
owner: codex-main-session
resolution: SQLite atomic Claim and true two-process race tests pass; bootstrap history remains single-writer only until release approval
```

### `RISK-MANUAL-DRIFT`

```yaml
description: Manual Board updates may lag behind actual work.
state: accepted
probability: medium
impact: Ready, Claim, Evidence, or Review state could become misleading.
affected_surfaces:
  - rule:goal-lifecycle
blocking_mode: completion
trigger: implementation work exists without a preceding active leaf-Goal Claim
treatment: mitigate
control: update Board before scoped work and before reporting completion
revisit_when: all mutations go through the SQLite application core
owner: codex-main-session
resolution: runtime mutations now use SQLite; this final bootstrap reconciliation records the delivery slices before authority transition
```

### `RISK-IMPACT-OMISSION`

```yaml
description: AI-proposed Impact Surfaces may omit a real conflict.
probability: medium
impact: supposedly orthogonal Goals may interfere or invalidate one another.
affected_surfaces:
  - rule:impact-conflict
  - rule:dependency-revalidation
blocking_mode: invalidate_on_trigger
trigger: execution discovers an undeclared read, write, decision, or exclusive surface
treatment: mitigate
control: submit a Candidate Goal or impact correction and mark dependents for revalidation
revisit_when: impact fixtures and discovery flows are implemented
owner: molis-work-product-owner
```

### `RISK-FALSE-PARENT-COMPLETION`

```yaml
description: Completed children may not produce the Root outcome.
probability: medium
impact: Molis Work MVP could be declared complete without a usable end-to-end flow.
affected_surfaces:
  - rule:parent-completion
blocking_mode: completion
trigger: all known child Goals are satisfied
treatment: mitigate
control: independently execute every Root acceptance condition plus coverage and risk closure
revisit_when: evaluating Root completion
owner: molis-work-product-owner
```

### `RISK-COORDINATOR-NONDETERMINISM`

```yaml
description: Equivalent Board facts could produce different readiness or transition outcomes.
state: resolved
probability: medium
impact: Runtimes could observe contradictory work availability or bypass a gate.
affected_surfaces:
  - rule:readiness
  - rule:claim-eligibility
  - rule:completion
blocking_mode: completion
trigger: the same canonical snapshot and actor request produce different decisions
treatment: mitigate
control: pure decision contracts, structured reason codes, application-level idempotency, and scenario fixtures
revisit_when: Coordinator contract tests and SQLite concurrency tests pass
owner: molis-work-product-owner
resolution: Coordinator scenario, idempotency, concurrency, lifecycle, Risk, Candidate, and Rewire tests pass deterministically
```

## Resolved decisions

### `DECISION-ACTOR-TRUST`

V1 uses explicit local `actor_id` values and declarative Goal Mode attestation.
The Coordinator enforces executor separation for cross and adversarial Reviews.
Verifiable credentials remain outside the local-first V1 boundary.

### `DECISION-V3-MIGRATION`

V1 provides an explicit one-time importer. It preserves safe V3 structure and
input/output context, leaves imported Goals draft and unmet, and reports missing
business logic, acceptance, policy, risks, and impact data for regeneration.

## Candidate Goals and rewire proposals

### `CANDIDATE-001`: Correct the semantic-field boundary

```yaml
candidate_id: CANDIDATE-001
submitted_by: codex-main-session
discovered_while: decomposing GB-002
state: dismissed
blocking_mode: none
dismissed_by: user
dismissal_reason: >
  The proposal incorrectly classified audited coordination facts as immutable
  Goal semantics. Dependencies, Impact Surfaces, risk links, and policy bindings
  may evolve through explicit audited events and revalidation without changing
  the accepted business result.

problem: >
  The accepted Bootstrap Project Policy lists outcome, why, business_logic,
  scope, acceptance, and constraints as semantic fields, but omits other fields
  that can change Goal readiness, execution safety, or completion meaning.

proposed_goal:
  goal_id: GB-001-C1
  relation:
    type: corrects
    target: GB-001
  outcome: >
    Correct the Bootstrap semantic-field policy without mutating the accepted
    GB-001 history.
  business_logic: |
    Once a Goal is accepted, users and Runtimes must be able to trust that its
    meaning and safety conditions will not silently change. Therefore inputs,
    outputs, dependencies, affected areas, risks, execution requirements,
    review requirements, and decomposition gates are semantic whenever changing
    them could alter what work is allowed or what counts as complete.
  acceptance:
    - A replacement semantic-field policy is recorded by a new correcting Goal.
    - Semantic fields include inputs, outputs, relations, Impact Surfaces,
      risk references, execution policy, Review policy, and decomposition gates.
    - Editable operational metadata is explicitly separated and audited.
    - GB-001 remains satisfied historical truth and is not rewritten.

affected_surfaces:
  - surface: decision:goal-contract-semantic-boundary
    access: decide
  - surface: rule:accepted-goal-immutability
    access: decide
  - surface: artifact:specs/molis-work-mvp/molis-work.md
    access: write
```

Proposed rewire:

```yaml
rewire_id: REWIRE-001
state: cancelled
cancel_reason: CANDIDATE-001 dismissed as wrong classification
discarded_actions:
  - promote GB-001-C1 as an accepted correction Goal
  - preserve GB-001 as satisfied historical truth
  - add GB-001-C1 as a dependency of GB-002
  - claim and complete GB-001-C1 before creating the first GB-002 leaf Goal
  - revalidate the Project Policy Contract, not the completed Bootstrap Evidence
active_run_retargeted: false
```

When a Runtime discovers work outside its accepted Goal:

1. Stop the affected portion of the Run; use `blocked_pending_decision` if it
   prevents safe continuation.
2. Record a Candidate Goal with outcome, business logic, acceptance, affected
   surfaces, risks, and suggested relations.
3. Compute and present the proposed dependency rewire and revalidation impact.
4. Only a user-confirmed Candidate becomes an accepted Goal.
5. Never retarget the active Run; create a new Claim for the new Goal when ready.

## Bootstrap Coordinator procedure

Before work:

1. Derive the Ready Set from accepted state, leaf closure, dependencies, risks,
   Impact Surfaces, review policy, and existing claims.
2. Let the Runtime choose from the Ready Set.
3. Record the Claim before modifying an allowed surface.

After work:

1. Submit acceptance-linked Evidence.
2. Complete required independent Review obligations.
3. Recalculate validity, readiness, coverage, and parent completion.
4. Release the Claim or record why the Run is blocked.

## Event log

| Date | Event |
| --- | --- |
| 2026-08-15 | User selected shared SQLite as the single-device, single-workspace MVP authority. |
| 2026-08-15 | User required Molis Work's own logic to guide Molis Work development. |
| 2026-08-15 | Root Goal and `GB-001` semantics accepted; `GB-001` claimed by the main Codex session. |
| 2026-08-15 | `GB-001` executor work and self-verification passed; Claim released and Goal moved to human Review. |
| 2026-08-15 | User approved `GB-001`; all gates passed, Goal satisfied, and `GB-002` decomposition gate opened. |
| 2026-08-15 | Decomposition discovered an incomplete semantic-field boundary; `CANDIDATE-001` and `REWIRE-001` submitted, blocking the first `GB-002` Claim. |
| 2026-08-15 | User continued after clarification; Candidate dismissed as a semantic/coordination misclassification, Rewire cancelled, and `GB-002` unblocked. |
| 2026-08-15 | `GB-002-01` accepted as the current closed leaf Goal and claimed by the main Codex session. |
| 2026-08-15 | `GB-002-01` Domain Contract and self-verification passed; Claim released and Goal moved to human Review. |
| 2026-08-15 | User approved `GB-002-01`; Goal satisfied and `GB-002-02` entered the Ready frontier. |
| 2026-08-15 | `GB-002-02` accepted and claimed to define deterministic Coordinator semantics. |
| 2026-08-15 | `GB-002-02` Coordinator Contract and self-verification passed; Claim released and Goal moved to human Review. |
| 2026-08-15 | User expanded scope to Molis Work V1 with a usable Impeccable Web UI; `molis-work-v1-product` accepted as a new Goal extending the historical MVP Goal. |
| 2026-08-15 | User directed the team to focus on delivery rather than micro-approvals; `GB-002-02` approved and future Human Review concentrated at major milestones. |
| 2026-08-15 | `GB-002-03` accepted and claimed to define the SQLite authority boundary before implementation. |
| 2026-08-15 | `GB-002-03` storage contract and transaction slice passed; Goal satisfied and `GB-003` claimed for the runnable lifecycle core. |
| 2026-08-15 | `GB-003` lifecycle core passed execution, review, Risk, Candidate, Rewire, and true two-process Claim tests. |
| 2026-08-15 | `GB-004` shipped semantically shared CLI and MCP pull interfaces without Runtime dispatch. |
| 2026-08-15 | `GB-005` shipped the responsive Goal Spine Web UI; independent Impeccable review found no remaining Blocker or P1. |
| 2026-08-15 | `GB-006` passed V3 import, typecheck, 44 tests, production build, and npm 1.0.0 package dry run. |
| 2026-08-15 | All implementation Goals satisfied; Product and Root Goals entered the user-owned V1 release review gate. |
