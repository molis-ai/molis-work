import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { goalErrors } from "./module/errors.js";
import { goalEventAssessmentKey, type GoalEventJudgmentAssessment, type GoalEventJudgmentBasisInput, type ReportGoalEventsInput } from "./contract/goals.js";

/** What the 成果库 says of who made a version: the plugin, and what it was fixed from. */
export interface GoalEvidenceArtifact {
  producer_plugin_id: string;
  origin: { kind: string; revision?: string };
}

/** The platform's facts about commands a round of the caller's own session ran (`agent.evidence.check`). */
export interface GoalEvidenceRunCheck {
  owner_plugin_id: string;
  commands: ReadonlyArray<{ call_id: string; recorded: boolean; exit_code: number | null; timed_out: boolean; cancelled: boolean; changed_after: boolean }>;
}

export interface GoalEvidencePorts {
  /** The Goal's confirmed deliverables, read in a window of their own. */
  deliverables(goalId: string): readonly ArtifactReference[];
  /** The sessions that said "supports" of the requirement on their own word alone. */
  selfSupportingSessions(goalId: string, requirementId: string): ReadonlySet<string>;
  /** A version in the 成果库 as this caller may read it; null when it is not there. */
  readArtifact(caller: ActionExecutionContext, reference: ArtifactReference): Promise<GoalEvidenceArtifact | null>;
  /** Asked as the caller, and answered only about a round of the caller's own session; "none" when that session has no such round. */
  checkRun(caller: ActionExecutionContext, runId: string, callIds: readonly string[]): Promise<GoalEvidenceRunCheck | "none">;
}

type ReportEvents = Omit<ReportGoalEventsInput, "project_id" | "actor_id" | "actor_kind" | "trusted">;
const SELF: GoalEventJudgmentAssessment = { tier: "self_reported", gap: null };
const gap = (kind: NonNullable<GoalEventJudgmentAssessment["gap"]>): GoalEventJudgmentAssessment => ({ tier: "self_reported", gap: kind });
const sameVersion = (a: ArtifactReference, b: ArtifactReference) => a.artifact_id === b.artifact_id && a.version === b.version;

/**
 * How far each "supports" of a report is backed, worked out before anything is saved and never taken from the reporter (evidence
 * contract, user decisions 2026-11-11). Every basis must name a confirmed deliverable of the Goal, or the whole report is refused.
 * A basis with command receipts is machine-verified only when the platform ran every one of them in the very round that made the
 * checked version, each ended normally with exit 0, and that round wrote nothing after. A basis without receipts is a peer review
 * only from a platform session other than the one that made the version, that has not itself reported the requirement done on its
 * own word, and only where the maker is known to be another session or another session has reported it done. Whatever cannot be
 * established stays the reporter's own word, with what was missing; nothing here fails the report for lack of evidence.
 */
export async function assessGoalReport(ports: GoalEvidencePorts, caller: ActionExecutionContext, input: ReportEvents): Promise<NonNullable<ReportGoalEventsInput["trusted"]>> {
  const session = caller.runtime_session_id ?? null, assessments = new Map<string, GoalEventJudgmentAssessment>();
  const based = (input.events ?? []).flatMap((event, index) => (Array.isArray(event?.judgments) ? event.judgments : [])
    .flatMap(judgment => wellFormed(judgment?.basis) ? [{ index, requirement: judgment.requirement_id, verdict: judgment.verdict, basis: judgment.basis }] : []));
  if (!based.length) return { reporter_session: session, assessments };
  const deliverables = ports.deliverables(input.goal_id);
  for (const { basis, requirement } of based) {
    if (!deliverables.some(item => sameVersion(item, checkedOf(basis)))) {
      throw goalErrors["goals.event_report.basis_not_deliverable"]("依据核对的版本不是这个目标已确认的交付物", { requirement_id: requirement, checked: checkedOf(basis) });
    }
  }
  const artifacts = new Map<string, Promise<GoalEvidenceArtifact | null | "unreadable">>();
  const artifactOf = (reference: ArtifactReference) => {
    const key = `${reference.artifact_id}@${reference.version}`;
    if (!artifacts.has(key)) artifacts.set(key, ports.readArtifact(caller, reference).catch(error => rethrowStopped(caller, error, "unreadable" as const)));
    return artifacts.get(key)!;
  };
  for (const { index, requirement, verdict, basis } of based) {
    if (verdict !== "supports") continue;
    assessments.set(goalEventAssessmentKey(index, requirement), await assess(ports, caller, session, input.goal_id, requirement, basis, artifactOf));
  }
  return { reporter_session: session, assessments };
}

/** Shape only, enough to read `checked`; the module refuses a malformed basis itself when the report is saved. */
function wellFormed(basis: unknown): basis is GoalEventJudgmentBasisInput {
  const checked = (basis as GoalEventJudgmentBasisInput | null | undefined)?.checked;
  return typeof checked?.artifact_id === "string" && Number.isSafeInteger(checked.version) && (basis as GoalEventJudgmentBasisInput).evidence?.every?.(ref => typeof ref === "object" && ref !== null) !== false;
}
const checkedOf = (basis: GoalEventJudgmentBasisInput): ArtifactReference => ({ artifact_id: basis.checked.artifact_id.trim(), version: basis.checked.version });

/** A cancelled call stops here; any other failure of a lookup is only evidence that could not be read (the write asks the caller's authority again). */
function rethrowStopped<T>(caller: ActionExecutionContext, error: unknown, otherwise: T): T {
  if (caller.signal?.aborted) throw error;
  if (error instanceof ActionError && error.code === "actions.cancelled") throw error;
  return otherwise;
}

async function assess(ports: GoalEvidencePorts, caller: ActionExecutionContext, session: string | null, goalId: string, requirement: string,
  basis: GoalEventJudgmentBasisInput, artifactOf: (reference: ArtifactReference) => Promise<GoalEvidenceArtifact | null | "unreadable">): Promise<GoalEventJudgmentAssessment> {
  const receipts = (basis.evidence ?? []).flatMap(ref => ref.kind === "command_receipt" ? [ref] : []);
  // No platform session behind the call: nothing it cites can be looked up as its own, and it is nobody's reviewer.
  if (!session) return gap("evidence_missing");
  const artifact = await artifactOf(checkedOf(basis));
  if (artifact === "unreadable" || artifact === null) return gap("evidence_unreadable");
  const madeIn = artifact.origin.kind === "pinned" && typeof artifact.origin.revision === "string" ? artifact.origin.revision : null;
  const check = (runId: string, callIds: readonly string[]) => ports.checkRun(caller, runId, callIds).catch(error => rethrowStopped(caller, error, "unreadable" as const));
  if (receipts.length) {
    // Every receipt must be of the round the version was fixed from; a command of another round says nothing about this version.
    if (!madeIn || receipts.some(ref => ref.run_id !== madeIn)) return gap("subject_mismatch");
    const run = await check(madeIn, [...new Set(receipts.map(ref => ref.call_id))]);
    if (run === "unreadable") return gap("evidence_unreadable");
    if (run === "none") return gap("subject_mismatch");
    if (run.owner_plugin_id !== artifact.producer_plugin_id) return gap("subject_mismatch");
    if (run.commands.some(command => !command.recorded)) return gap("evidence_missing");
    if (run.commands.some(command => command.exit_code !== 0 || command.timed_out || command.cancelled)) return gap("check_failed");
    if (run.commands.some(command => command.changed_after)) return gap("subject_mismatch");
    return { tier: "machine_verified", gap: null };
  }
  const selfSupporting = ports.selfSupportingSessions(goalId, requirement);
  if (selfSupporting.has(session)) return SELF;
  const own = madeIn ? await check(madeIn, []) : "none";
  if (own === "unreadable") return gap("evidence_unreadable");
  // The round that made the version is in this caller's own session: its saying so again is its own word.
  if (own !== "none") return SELF;
  // Another worker is known only where one has spoken: the session that made the version cannot be named from outside it.
  return selfSupporting.size > 0 ? { tier: "peer_reviewed", gap: null } : SELF;
}
