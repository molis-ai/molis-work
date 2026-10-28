import { isDeepStrictEqual } from "node:util";
import type { NodeRecoveryInspection } from "@prologue/sdk/node";
import type { AgentRunRef, AgentSessionOwner, AgentSessionPurgePreview, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { assertProjectSessionDeletionPlan, type ProjectSessionDeletionPlan } from "./prologue-project-deletion.js";
import { readSessionIndex, sessionIndexKind } from "./prologue-session-index-reader.js";
import type { SessionIndex } from "./prologue-session-index.js";
import { assertSessionOwner, completedSessionPurgeIndex, originalSessionPurge, sessionConflict, sessionPurgeFacts, sessionPurgePreview, type PrologueSessionPurgeTarget } from "./prologue-session-purge.js";

export interface ColdSessionPurgeTarget extends PrologueSessionPurgeTarget { readonly indexed: boolean; readonly parent_run?: AgentRunRef }
export interface ProjectSessionPurgePreparationInput { readonly sourcePlan: ProjectSessionDeletionPlan; readonly operationId: string; readonly signal?: AbortSignal }
export interface ProjectSessionPurgeVerificationInput { readonly plan: ProjectSessionDeletionPlan; readonly signal?: AbortSignal }
export interface SessionPurgePreparationInput {
  /** Trusted T1 Index/SDK join, excluding Sessions already held by a Catalog project decision. */
  readonly source: { readonly session: AgentSessionRef; readonly owner: AgentSessionOwner;
    readonly termination: { readonly preview: Omit<AgentSessionPurgePreview, "state">; readonly phase: "cleaning" | "complete"; readonly version: number } };
  readonly operationId: string;
  readonly signal?: AbortSignal;
}
export interface SessionPurgeVerificationInput { readonly target: PrologueSessionPurgeTarget; readonly signal?: AbortSignal }
type Reader = Pick<NodeRecoveryInspection, "storage" | "inspectSession">;
type Observed = Awaited<ReturnType<Reader["inspectSession"]>>;
type Identity = Pick<ColdSessionPurgeTarget, "session" | "owner" | "indexed" | "parent_run">;

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

async function readIndex(reader: Reader, kind: string, target: Identity, current: () => void) {
  if (!target.indexed) { await assertRawSessionIndexAbsent(reader.storage, kind, target.session.session_id, current); return undefined; }
  const saved = await readSessionIndex(reader.storage, kind, target.session.session_id, current);
  current(); if (!saved) throw sessionConflict(); assertSessionOwner(saved.value, target.session, target.owner);
  return saved;
}

async function verifyIndex(reader: Reader, kind: string, id: string, version: number | undefined, current: () => void) {
  const after = await reader.storage.get({ kind, id }); current();
  if (version === undefined ? after !== undefined : !after || after.tombstoned || after.version !== version) throw sessionConflict();
}

/** Retain the same Index observation across later group reads and target effects. */
export async function verifyColdSessionIndexes(reader: Reader, appId: string, versions: ReadonlyMap<string, number | undefined>, current: () => void): Promise<void> {
  current();
  for (const [id, version] of versions) await verifyIndex(reader, sessionIndexKind(appId), id, version, current);
  current();
}

/** The entire original group is checked before its first target effect, just as in the online project owner. */
export async function inspectColdSessionTarget(reader: Reader, appId: string, target: ColdSessionPurgeTarget, current: () => void): Promise<number | undefined> {
  const kind = sessionIndexKind(appId), saved = await readIndex(reader, kind, target, current);
  const held = saved && originalSessionPurge(saved.value, target);
  const observed = await reader.inspectSession({ ref: sessionPurgePreview(target).sessionRef });
  current(); assertColdSessionObservation(target, observed, held);
  await verifyIndex(reader, kind, target.session.session_id, saved?.version, current);
  return saved?.version;
}

/** One actual target observation; only a trusted raw project item can supply a former state. */
async function prepareTarget(reader: Reader, kind: string, item: Identity, operationId: string, current: () => void,
  signal?: AbortSignal, original?: ColdSessionPurgeTarget) {
  current(); const saved = await readIndex(reader, kind, item, current);
  const observed = await reader.inspectSession({ ref: { kind: "session", id: item.session.session_id, revision: 1 }, ...(signal ? { signal } : {}) });
  current(); if (observed.state === "absent") throw sessionConflict();
  const held = saved?.value.lifecycle;
  if (held && held.action !== "purge" && held.phase !== "complete") throw sessionConflict();
  const prior = held?.action === "purge" ? held : undefined;
  if (observed.state === "purged" && !prior) {
    if (saved || !original) throw sessionConflict();
    assertColdSessionObservation(original, observed);
  }
  const sdk = prior?.preview ?? (observed.state === "present" ? observed.preview : observed.termination.preview);
  const state = prior?.decision.expected_state ?? (observed.state === "present" ? observed.sessionState : original?.decision.expected_state);
  if (!sdk || !state) throw sessionConflict();
  const target: ProjectSessionDeletionPlan["sessions"][number] = { ...item, state: observed.state === "present" ? observed.sessionState : "purged",
    preview: { session: structuredClone(item.session), version: sdk.atVersion, state, runs: sdk.runs, resources: sdk.resources, destroys_key: sdk.destroysKey },
    decision: prior ? structuredClone(prior.decision) : { operation_id: operationId, expected_version: sdk.atVersion, expected_state: state } };
  assertColdSessionObservation(target, observed, prior);
  return { target, version: saved?.version };
}

/** First standalone target only; source versions never authorize a target effect. */
export async function prepareSessionPurge(reader: Reader, appId: string, request: SessionPurgePreparationInput,
  current: () => void): Promise<PrologueSessionPurgeTarget> {
  const source = structuredClone(request.source), operationId = request.operationId;
  const preview = sessionPurgeFacts(source.session, source.termination.preview);
  if (!["cleaning", "complete"].includes(source.termination.phase)
    || source.termination.version !== preview.atVersion + (source.termination.phase === "complete" ? 2 : 1)
    || typeof operationId !== "string" || !operationId.trim() || operationId.length > 200) throw sessionConflict();
  const kind = sessionIndexKind(appId);
  const { target, version } = await prepareTarget(reader, kind, { session: source.session, owner: source.owner, indexed: true }, operationId, current, request.signal);
  await verifyIndex(reader, kind, target.session.session_id, version, current); current();
  return { session: target.session, owner: target.owner, decision: target.decision, preview: target.preview };
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
    const { target, version } = await prepareTarget(reader, kind, item, `${operationId}:${plan.sessions.length}`, current, request.signal, item);
    plan.sessions.push(target); versions.push(version);
  }
  // A later await cannot publish earlier Index facts after they have changed.
  for (let i = 0; i < plan.sessions.length; i++) await verifyIndex(reader, kind, plan.sessions[i]!.session.session_id, versions[i], current);
  current(); return plan;
}

async function verifyTarget(reader: Reader, kind: string, target: ColdSessionPurgeTarget, current: () => void, signal?: AbortSignal) {
  const saved = await readIndex(reader, kind, target, current);
  const held = saved && originalSessionPurge(saved.value, target);
  if (target.indexed && (held?.phase !== "complete" || !held.receipt
    || !isDeepStrictEqual(saved?.value, completedSessionPurgeIndex(target, held.receipt)))) throw sessionConflict();
  const observed = await reader.inspectSession({ ref: sessionPurgePreview(target).sessionRef, ...(signal ? { signal } : {}) });
  current(); assertColdSessionObservation(target, observed, held, true);
  return saved?.version;
}

export async function verifySessionPurge(reader: Reader, appId: string, request: SessionPurgeVerificationInput, current: () => void): Promise<void> {
  const target = { ...structuredClone(request.target), indexed: true };
  sessionPurgePreview(target);
  const kind = sessionIndexKind(appId), version = await verifyTarget(reader, kind, target, current, request.signal);
  await verifyIndex(reader, kind, target.session.session_id, version, current); current();
}

/** Exact original proof; never enumerate current projects or mutate a later Index. */
export async function verifyProjectSessionPurge(reader: Reader, appId: string, request: ProjectSessionPurgeVerificationInput,
  current: () => void): Promise<void> {
  const plan = structuredClone(request.plan); assertProjectSessionDeletionPlan(plan);
  const kind = sessionIndexKind(appId), versions: Array<number | undefined> = [];
  for (const target of plan.sessions) {
    versions.push(await verifyTarget(reader, kind, target, current, request.signal));
  }
  for (let i = 0; i < plan.sessions.length; i++) await verifyIndex(reader, kind, plan.sessions[i]!.session.session_id, versions[i], current);
  current();
}
