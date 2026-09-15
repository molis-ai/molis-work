# Molis Work V1 SQLite Authority Contract

`GB-002-03` deliverable. The Work Order remains `molis-work.md`.

## Authority boundary

- One SQLite file is authoritative for one local Workspace.
- CLI, MCP and Web processes open the same file directly.
- Network filesystems, replication and multi-device writes are outside V1.
- JSON and Markdown are import/export views, never competing writable truth.

Connection policy:

```text
PRAGMA journal_mode = WAL
PRAGMA synchronous = FULL
PRAGMA foreign_keys = ON
PRAGMA busy_timeout = 5000
```

`FULL` is intentional: Molis Work favors durable truth over maximum write speed.
Every operation captures authority time once and uses it throughout its decision.

## Canonical tables

| Table | Canonical responsibility |
| --- | --- |
| `boards` | Workspace authority, active product Goal, metadata |
| `goals` | Accepted/draft Goal semantics and independent state axes |
| `acceptance_criteria` | Decidable Goal acceptance rules |
| `coverage_items` | covered/deferred/out/unresolved known requirements |
| `goal_relations` | active and historical Goal graph edges |
| `input_bindings` | semantic input to current producer/snapshot binding |
| `impact_bindings` | typed surface and read/write/decide/exclusive access |
| `risks` / `goal_risks` | Risk truth and Goal links |
| `policy_bindings` | project/ancestor/leaf policy facts |
| `claims` | role Claim and Lease authority |
| `runs` | immutable execution attempts and terminal facts |
| `evidence` | criterion-linked proof and provenance |
| `review_obligations` / `reviews` | required independent verification and verdicts |
| `candidates` | Runtime/user proposed Goal semantics and decision |
| `rewires` | proposed/applied relation and revalidation impact |
| `idempotency_records` | original outcome of every write key |
| `events` | append-only authoritative event sequence |

JSON columns may hold bounded semantic arrays or payloads. Identities, states,
foreign keys, conflict keys and query filters remain typed columns with indexes.

## Transaction rules

All writes use an `IMMEDIATE` transaction.

Within one transaction a write must:

1. look up an existing idempotency result;
2. reject key reuse with a different canonical request hash;
3. capture authority time;
4. re-evaluate permissions, policy, state, Risks and conflicts;
5. write the domain object transition;
6. append its event;
7. store the idempotency outcome;
8. commit all effects together.

Any thrown error rolls back every effect. Read queries never append events.

### Claim

`claim_goal` performs readiness recheck, expired-Lease filtering, Impact conflict
evaluation, Claim insertion, `claim.created`, and idempotency result in one
transaction.

Database constraints provide a final safety net:

- one active executor/revalidator Claim per Goal;
- one active reviewer Claim per unresolved obligation and actor;
- unique `(board_id, actor_id, operation, idempotency_key)`;
- foreign keys from Claim, Run, Evidence and Review to canonical identities.

Cross-Goal Impact conflicts are evaluated inside the same `IMMEDIATE` transaction,
so a second writer cannot commit from a stale conflict snapshot.

### Lease

A Lease is active only when `state = active` and `expires_at > authority_time`.
An expired Lease is treated as inactive during decisions. Materializing
`lease.expired` is idempotent housekeeping and is never required for correctness.
Expired Leases cannot be renewed.

### Completion and Rewire

Completion rechecks Evidence, Reviews, Risks, dependencies, validity and coverage
before appending `goal.satisfied`.

Rewire confirmation rechecks the preview basis, applies edge add/deactivate
events, updates validity projections and records the impact report atomically.
It never changes an active Run's `goal_id`.

## Events and projections

`events.seq` is the Board cursor. It is not a Goal Contract version.

Canonical tables are current projections updated in the same transaction as the
event. A snapshot response includes the latest committed cursor. Rebuilding every
projection from events is not required in V1, but events must retain enough actor,
reason and object information for audit and migration diagnosis.

## Migration

V1 provides:

- fresh database initialization;
- idempotent schema migration by numbered storage migrations;
- explicit import of compatible V3 JSON fields;
- a clear `regenerate` result for V3 information that cannot map safely.

Storage migration numbers are implementation compatibility metadata, not Goal
Contract versions. Import never overwrites an existing Board without an explicit
target and authority action.

## Verification

- Opening a fresh database creates every table, index and pragma.
- Reopening applies no duplicate migration.
- A write failure leaves no object, event or idempotency residue.
- Repeating a write key returns the original result; a different payload fails.
- Two store instances racing for one Goal yield one active Claim.
- Expired Lease no longer blocks a new Claim and cannot be renewed.
- Foreign-key and uniqueness violations are rejected.
- Snapshot cursor and current projections commit together.
