import { isDeepStrictEqual } from "node:util";
import type { NodeRecoveryInspection } from "@prologue/sdk/node";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assertProjectSessionDeletionPlan, type ProjectSessionDeletionPlan } from "./prologue-project-deletion.js";
import { readSessionIndex, sessionIndexKind } from "./prologue-session-index-reader.js";
import type { SessionIndex } from "./prologue-session-index.js";
import { assertSessionOwner, originalSessionPurge, sessionConflict, sessionPurgePreview, type PrologueSessionPurgeTarget } from "./prologue-session-purge.js";

export interface ColdSessionPurgeTarget extends PrologueSessionPurgeTarget { readonly indexed: boolean; readonly parent_run?: AgentRunRef }
export interface ProjectSessionPurgePreparationInput { readonly sourcePlan: ProjectSessionDeletionPlan; readonly operationId: string; readonly signal?: AbortSignal }
export interface ProjectSessionPurgeVerificationInput { readonly plan: ProjectSessionDeletionPlan; readonly signal?: AbortSignal }
type Reader = Pick<NodeRecoveryInspection, "storage" | "inspectSession">;
type Observed = Awaited<ReturnType<Reader["inspectSession"]>>;

/** Validate each complete relationship before combining equal targets across original projects. */
export function fixedColdSessionTargets(standalone: readonly PrologueSessionPurgeTarget[], plans: readonly ProjectSessionDeletionPlan[]) {
  const projects = structuredClone(plans);
  const targets: ColdSessionPurgeTarget[] = structuredClone(standalone).map(target => ({ ...target, indexed: true }));
  const standaloneIds = new Set(targets.map(target => target.session.session_id));
  if (standaloneIds.size !== targets.length) throw sessionConflict();
  for (const plan of projects) {
    assertProjectSessionDeletionPlan(plan);
    for (const item of plan.sessions) {
      const target: ColdSessionPurgeTarget = { session: item.session, owner: item.owner, decision: item.decision,
        preview: item.preview, indexed: item.indexed, ...(item.parent_run ? { parent_run: item.parent_run } : {}) };
      if (standaloneIds.has(item.session.session_id)) throw sessionConflict();
      const existing = targets.find(value => value.session.session_id === item.session.session_id);
      if (existing) { if (!isDeepStrictEqual(existing, target)) throw sessionConflict(); }
      else targets.push(target);
    }
  }
  for (const target of targets) sessionPurgePreview(target);
  return { targets, projects };
}

/** A tombstoned Index is still an Index identity; raw targets must never acquire or erase it. */
export async function assertRawSessionIndexAbsent(storage: Reader["storage"], kind: string, id: string, current: () => void): Promise<void> {
  current(); const record = await storage.get({ kind, id }); current();
  if (record !== undefined) throw sessionConflict();
}

export function assertColdSessionObservation(target: ColdSessionPurgeTarget, observed: Observed, held?: SessionIndex["lifecycle"], complete = false): void {
  const preview = sessionPurgePreview(target);
  if (observed.state === "absent") throw sessionConflict();
  if (observed.state === "present") {
    if (complete || held && held.phase !== "prepared" || observed.sessionState !== target.decision.expected_state
      || !isDeepStrictEqual(observed.preview, preview)) throw sessionConflict();
  } else if (target.indexed && !held || !isDeepStrictEqual(observed.termination.preview, preview)
    || complete && observed.termination.phase !== "complete"
    || held && held.phase !== "prepared" && (observed.termination.phase !== "complete" || observed.termination.version !== held.receipt?.version)) throw sessionConflict();
}

async function readIndex(reader: Reader, kind: string, target: ColdSessionPurgeTarget, current: () => void) {
  if (!target.indexed) { await assertRawSessionIndexAbsent(reader.storage, kind, target.session.session_id, current); return undefined; }
  const saved = await readSessionIndex(reader.storage, kind, target.session.session_id, current);
  current(); if (!saved) throw sessionConflict(); assertSessionOwner(saved.value, target.session, target.owner);
  return saved;
}

async function verifyIndex(reader: Reader, kind: string, id: string, version: number | undefined, current: () => void) {
  const after = await reader.storage.get({ kind, id }); current();
  if (version === undefined ? after !== undefined : !after || after.tombstoned || after.version !== version) throw sessionConflict();
}

/** The entire original group is checked before its first target effect, just as in the online project owner. */
export async function inspectColdSessionTarget(reader: Reader, appId: string, target: ColdSessionPurgeTarget, current: () => void): Promise<Observed> {
  const kind = sessionIndexKind(appId), saved = await readIndex(reader, kind, target, current);
  const held = saved && originalSessionPurge(saved.value, target);
  const observed = await reader.inspectSession({ ref: sessionPurgePreview(target).sessionRef });
  current(); assertColdSessionObservation(target, observed, held);
  await verifyIndex(reader, kind, target.session.session_id, saved?.version, current);
  return observed;
}

/** First target plan only. Existing target originals go directly to execution/proof unchanged. */
export async function prepareProjectSessionPurge(reader: Reader, appId: string, request: ProjectSessionPurgePreparationInput,
  current: () => void): Promise<ProjectSessionDeletionPlan> {
  const source = structuredClone(request.sourcePlan), operationId = request.operationId;
  assertProjectSessionDeletionPlan(source);
  if (!operationId.trim() || operationId.length > 180) throw sessionConflict();
  const plan: ProjectSessionDeletionPlan = { project_id: source.project_id, operation_id: operationId, sessions: [] };
  const kind = sessionIndexKind(appId), versions: Array<number | undefined> = [];
  for (const item of source.sessions) {
    current(); const saved = await readIndex(reader, kind, item, current);
    const observed = await reader.inspectSession({ ref: sessionPurgePreview(item).sessionRef, ...(request.signal ? { signal: request.signal } : {}) });
    current(); if (observed.state === "absent") throw sessionConflict();
    const held = saved?.value.lifecycle;
    if (held && held.action !== "purge" && held.phase !== "complete") throw sessionConflict();
    const prior = held?.action === "purge" ? held : undefined;
    // A raw terminal has no App Index decision: the trusted original proves its former state only when the entire preview matches.
    if (!saved && observed.state === "purged") assertColdSessionObservation(item, observed);
    const sdk = prior?.preview ?? (observed.state === "present" ? observed.preview : observed.termination.preview);
    if (!sdk) throw sessionConflict();
    const state = prior?.decision.expected_state ?? (observed.state === "present" ? observed.sessionState : item.decision.expected_state);
    const target: ProjectSessionDeletionPlan["sessions"][number] = { ...item, state: observed.state === "present" ? observed.sessionState : "purged",
      preview: { session: structuredClone(item.session), version: sdk.atVersion, state, runs: sdk.runs, resources: sdk.resources, destroys_key: sdk.destroysKey },
      decision: prior ? structuredClone(prior.decision) : { operation_id: `${operationId}:${plan.sessions.length}`, expected_version: sdk.atVersion, expected_state: state } };
    assertColdSessionObservation(target, observed, prior);
    plan.sessions.push(target); versions.push(saved?.version);
  }
  // A later await cannot publish earlier Index facts after they have changed.
  for (let i = 0; i < plan.sessions.length; i++) await verifyIndex(reader, kind, plan.sessions[i]!.session.session_id, versions[i], current);
  current(); return plan;
}

/** Exact original proof; never enumerate current projects or mutate a later Index. */
export async function verifyProjectSessionPurge(reader: Reader, appId: string, request: ProjectSessionPurgeVerificationInput,
  current: () => void): Promise<void> {
  const plan = structuredClone(request.plan); assertProjectSessionDeletionPlan(plan);
  const kind = sessionIndexKind(appId), versions: Array<number | undefined> = [];
  for (const target of plan.sessions) {
    const saved = await readIndex(reader, kind, target, current);
    const held = saved && originalSessionPurge(saved.value, target);
    if (target.indexed && held?.phase !== "complete") throw sessionConflict();
    const observed = await reader.inspectSession({ ref: sessionPurgePreview(target).sessionRef, ...(request.signal ? { signal: request.signal } : {}) });
    current(); assertColdSessionObservation(target, observed, held, true); versions.push(saved?.version);
  }
  for (let i = 0; i < plan.sessions.length; i++) await verifyIndex(reader, kind, plan.sessions[i]!.session.session_id, versions[i], current);
  current();
}
