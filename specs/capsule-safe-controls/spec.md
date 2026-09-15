# Capsule safe controls

## Background and goal

The Capsule can already show Molis Work's live Project, Goal, Claim, Run, Review, and Available facts. It does not yet have a truthful way to pause or resume work. A UI-only toggle would lie about the Runtime, while releasing the Claim or closing a terminal would destroy continuity.

This slice makes Capsule controls part of the same Molis Work truth source. A user can request a safe pause, the owning Runtime can acknowledge the safe boundary, and the user can request that the same Run resume. An actionable Goal can be opened from the Capsule, but the Capsule never impersonates a Runtime or bypasses Claim selection.

Completion level: internal complete for the control path, then included in the Capsule parent release build.

## Current behavior and evidence

- `RunRecord.state` only describes execution lifecycle: started, blocked, or a terminal result.
- Capsule expanded rows only open another Molis Work page.
- Releasing a Claim abandons its active Run; closing a PTY is therefore not a valid pause.
- Available is already the authoritative query for Goals that can be selected now.
- Local Web mutations already require the Molis Work control token, same-origin validation, and an idempotency key.

## User scenarios

1. While a Runtime is working, the user clicks **暂停**. Capsule immediately says that Molis Work has asked the Runtime to stop at a safe boundary. The Runtime remains owner of the same Claim and Run.
2. The Runtime observes the request, saves a coherent checkpoint, and acknowledges it. Capsule shows **已暂停** and keeps that Goal focused.
3. The user clicks **恢复**. Capsule says it is waiting for the same Runtime to continue. The Runtime acknowledges and the same Run returns to its previous working phase.
4. If the Run finishes, blocks, loses its Claim, or changes concurrently, the control returns the actual new state and a useful recovery action. It does not display generic success.
5. For an Available Goal, Capsule opens its Goal page and explains that Runtime selection happens in Molis Work. It does not create a Claim or Run itself.

## Scope

### In scope

- A canonical Run control overlay: `pause_requested`, `paused`, or `resume_requested`.
- User-authorized pause/resume requests through the local Web API.
- Owner-only Runtime acknowledgement through MCP.
- Derived Goal states and plain-language UI for pausing, paused, and resuming.
- Capsule actions, disabled/loading feedback, concurrency handling, and Project isolation.
- Idempotency, migration, lifecycle, Web, MCP, and Capsule tests.
- Runtime Skill guidance for observing and acknowledging requests.

### Out of scope

- Killing or suspending the terminal process.
- Releasing or transferring a Claim as a pause shortcut.
- Dispatching a Runtime from Capsule.
- Pausing an already blocked or ended Run.
- Automatic cross-device coordination.

## Design and decisions

### One Run, one control overlay

`runs.state` remains the execution lifecycle. Two nullable columns on the same canonical Run hold the temporary user control intent:

- `control_state`: `pause_requested | paused | resume_requested | null`
- `control_updated_at`: when that control state last changed

This is not a second work database or a second Run. It lets Molis Work distinguish “the Run still exists” from “the user asked it to wait”. Terminal Run transitions clear the overlay.

### Authority and transitions

- The local user may request `pause` only for an active, started Run with a valid active Claim and no current control request.
- The owning Runtime may acknowledge `paused` only after `pause_requested`.
- The local user may request `resume` only from `paused` while the same Claim is still valid.
- The owning Runtime may acknowledge `resumed` only after `resume_requested`; acknowledgement clears the overlay.
- Repeated requests with the same idempotency key replay. Concurrent or stale requests return a conflict with the real current state.
- The Run may still complete, fail, be abandoned, or become blocked while a request is in flight. Those transitions clear the overlay and their actual lifecycle state wins.
- Claim release, revocation, or expiry abandons the same Run and clears its overlay through the existing lifecycle recovery path.

### Derived state and Capsule behavior

- `pause_requested` derives `pausing`: “正在安全暂停”.
- `paused` derives `paused`: “已暂停”.
- `resume_requested` derives `resuming`: “正在恢复”.
- These states keep the same Goal and Run visible and never appear in Available.
- Working rows show **暂停** as a secondary action; paused rows show **恢复** as the primary action. Pending states disable repeat submission.
- Each mutation has an inline `aria-live` result. Errors name the problem and recovery.
- Available rows use **前往开始** and explicitly say that the main Goal page confirms the Runtime; no Claim or Run is created by Capsule.

## Inputs, outputs, and module boundaries

- `src/v1/store.ts`: migration and persisted Run control fields.
- `src/v1/types.ts`: Run control and derived work-state types.
- `src/v1/coordinator.ts`: request/acknowledgement transitions, authority, events, lifecycle cleanup, derived state.
- `src/mcp/server.ts`: owner acknowledgement tool.
- `src/web/server.ts`: authenticated Project-scoped Capsule mutation endpoint.
- `src/web/capsule.ts`: projection, labels, controls, loading/error feedback.
- `src/web/human-language.ts`, `src/web/render.ts`, `src/web/i18n.ts`: human-facing state semantics.
- `skills/goal-advance/references/execution.md`: Runtime pause/resume behavior.
- `tests/`: state machine, permissions, races, projection, Web API, and MCP coverage.

## Acceptance criteria

1. Pause keeps the same active Claim, Run, Goal focus, terminal, and all other Projects unchanged.
2. Resume rechecks Run ownership and Claim validity; it never creates another Claim or Run.
3. Success, pending, stale/conflict, invalid Claim, offline, retry, and duplicate-click outcomes are stated accurately.
4. Start is only offered for an Available Goal and routes to main Molis Work for Runtime selection.
5. Existing databases migrate without losing Runs or breaking foreign keys.
6. Type checks, focused tests, full tests, Rust tests, release build, and installed-app smoke tests pass before release handoff.

## Verification

- `pnpm test -- tests/v1.test.ts tests/capsule.test.ts tests/web.test.ts tests/mcp.test.ts`
- `pnpm test`
- `pnpm build`
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`
- Manual Capsule pass in the installed macOS app: working → pause requested → paused → resume requested → working; plus conflict/offline and Available Goal paths.

## Assumptions and open boundaries

- A pause is cooperative. Molis Work records intent and acknowledgement; it does not freeze an arbitrary process.
- A Claim remains a lease. If it expires while paused, Resume must refuse and route the user back to Molis Work for a new valid selection.
- The later `capsule-desktop-reliability` Goal owns launch/reopen/crash/offline reliability and release packaging beyond this control state machine.
