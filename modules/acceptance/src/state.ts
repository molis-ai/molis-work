import type { AcceptanceCheck, AcceptanceEvidenceRef, AcceptanceHistoryEntry, AcceptancePersonDecision, AcceptanceRequirementState, AcceptanceSubject, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";

/** The rows of one subject, as the store keeps them (requirements and deliveries in this library's order; checks and decisions by clock). */
export interface RequirementRow { seq: number; requirement_id: string; version: number; statement: string; expected: string | null; part: string | null; requires_person: boolean; withdrawn: boolean; position: number; by_person: boolean; created_at: string }
export interface DeliveryRow { round: number; version: string; summary: string | null; touches: string[] | null; made_in_session: string | null; made_in_run: string | null; delivered_at: string }
export interface CheckRow extends AcceptanceCheck { check_id: string; clock: number; requirement_id: string; round: number }
export interface DecisionRow extends AcceptancePersonDecision { clock: number; requirement_id: string; stands_round: number; origin_ref: string }
export interface SubjectRows { requirements: RequirementRow[]; deliveries: DeliveryRow[]; checks: CheckRow[]; decisions: DecisionRow[] }
/** Whether this library holds the trusted-decision record a decision stands on; the Host answers it from the project approvals (§10.5). */
export type DecisionVoucher = (decisionId: string) => boolean;

const touched = (delivery: DeliveryRow, id: string) => delivery.touches === null || delivery.touches.includes(id);

/** The order every device gives checks and decisions of one subject: the subject's logical clock, ties broken by id (§10.5). */
export const byClock = <T extends { clock: number }>(id: (row: T) => string) => (a: T, b: T) => a.clock - b.clock || (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0);
export const checkOrder = byClock<CheckRow>(row => row.check_id);
export const decisionOrder = byClock<DecisionRow>(row => `${row.decision_id}\u0000${row.requirement_id}`);

/** The requirements that stand now: each one's latest row, without the withdrawn, in the order they were last listed. */
export function currentRequirements(rows: readonly RequirementRow[]): RequirementRow[] {
  const latest = new Map<string, RequirementRow>();
  for (const row of rows) latest.set(row.requirement_id, row);
  return [...latest.values()].filter(row => !row.withdrawn).sort((a, b) => a.position - b.position || a.seq - b.seq);
}

/**
 * The delivery a requirement's state is about: the last one that touched it, and the current one for a requirement no delivery
 * names (it was written after them, and is judged against what is there now). Null before anything is delivered.
 */
export function standsOn(deliveries: readonly DeliveryRow[], id: string): DeliveryRow | null {
  for (let index = deliveries.length - 1; index >= 0; index -= 1) if (touched(deliveries[index]!, id)) return deliveries[index]!;
  return deliveries.at(-1) ?? null;
}

const check = (row: CheckRow): AcceptanceCheck => ({ kind: row.kind, verdict: row.verdict, tier: row.tier, gap: row.gap, requirement_version: row.requirement_version,
  checked_version: row.checked_version, method: row.method, observed: row.observed, evidence: row.evidence as AcceptanceEvidenceRef[], reported_at: row.reported_at });
const decision = (row: DecisionRow): AcceptancePersonDecision => ({ decision_id: row.decision_id, origin: row.origin, decision: row.decision, note: row.note, requirement_version: row.requirement_version,
  version: row.version, actor_id: row.actor_id, decided_at: row.decided_at });
const passes = (item: AcceptanceCheck | null) => item?.verdict === "supports" && (item.tier === "machine_checked" || item.tier === "peer_reviewed") && item.gap === null;

/**
 * What stands for each requirement right now, worked out from the logs and from nothing else (PWA-144～146):
 * - a check counts only when it was made for this version of the requirement, against the delivery the requirement stands on, and
 *   the platform itself found it machine-checked or peer-reviewed; the executor's own word, evidence of another version or object,
 *   missing or unreadable evidence and a failed command are gaps, shown with the check that had them;
 * - the person's decision counts only for this version of the requirement on that delivery, so a later delivery that touches the
 *   requirement, or a change of the requirement, puts it back to undecided and leaves every other requirement as it was; so does a
 *   `contradicts` check later than the decision on the same delivery (user 2026-11-05, adopted for every subject 2026-11-18);
 * - a decision made through the trusted-decision entry counts only where its record is in this library (`vouched`): one synced from
 *   another device before its record arrived waits;
 * - a requirement that needs the person is satisfied only by the person; one that does not is satisfied by a passing check or by
 *   the person, and never while the person has returned it. Nothing here reads whether a run finished.
 */
export function acceptanceView(subject: AcceptanceSubject, rows: SubjectRows, vouched: DecisionVoucher = () => true): AcceptanceView {
  const current = rows.deliveries.at(-1) ?? null;
  const checks = [...rows.checks].sort(checkOrder), decisions = [...rows.decisions].sort(decisionOrder);
  const requirements = currentRequirements(rows.requirements).map((row): AcceptanceRequirementState => {
    const stands = standsOn(rows.deliveries, row.requirement_id);
    const mine = checks.filter(item => item.requirement_id === row.requirement_id);
    const live = stands ? mine.filter(item => item.requirement_version === row.version && item.round >= stands.round) : [];
    const latest = (kind: AcceptanceCheck["kind"]) => live.filter(item => item.kind === kind).at(-1) ?? null;
    const engineering = latest("engineering"), handsOn = latest("hands_on"), last = live.at(-1) ?? null;
    const contradicted = [engineering, handsOn].some(item => item?.verdict === "contradicts");
    const verified = !contradicted && [engineering, handsOn].some(passes);
    const made = stands ? decisions.filter(item => item.requirement_id === row.requirement_id && item.requirement_version === row.version && item.stands_round === stands.round).at(-1) ?? null : null;
    const awaiting = made !== null && made.origin === "trusted_decision" && !vouched(made.decision_id);
    const overturned = made !== null && live.some(item => item.verdict === "contradicts" && item.clock > made.clock);
    const decided = made && !awaiting && !overturned ? made : null;
    const person: AcceptanceRequirementState["person"] = decided ? decided.decision
      // Without a passing check a delivered requirement is the person's to accept or return, whether or not it was asked of them.
      : row.requires_person || (stands !== null && !verified) ? "pending" : "not_needed";
    const earlier = mine.length > live.length || decisions.some(item => item.requirement_id === row.requirement_id && item !== decided);
    const gap: AcceptanceRequirementState["gap"] = !stands || verified ? null : contradicted ? "contradicted" : last ? last.gap ?? "self_only" : mine.length ? "evidence_stale" : "evidence_missing";
    const history: AcceptanceHistoryEntry[] = [
      ...rows.requirements.filter(item => item.requirement_id === row.requirement_id && !item.withdrawn).map((item): AcceptanceHistoryEntry => ({ type: "requirement", at: item.created_at, requirement_version: item.version, statement: item.statement, by_person: item.by_person })),
      ...rows.deliveries.map((item): AcceptanceHistoryEntry => ({ type: "delivery", at: item.delivered_at, version: item.version, round: item.round, touched: touched(item, row.requirement_id) })),
      ...mine.map((item): AcceptanceHistoryEntry => ({ type: "check", at: item.reported_at, ...check(item) })),
      ...decisions.filter(item => item.requirement_id === row.requirement_id).map((item): AcceptanceHistoryEntry => ({ type: "decision", at: item.decided_at, ...decision(item) })),
    ].map((entry, index) => ({ entry, index })).sort((a, b) => a.entry.at.localeCompare(b.entry.at) || a.index - b.index).map(item => item.entry);
    return { id: row.requirement_id, version: row.version, statement: row.statement, expected: row.expected, part: row.part, requires_person: row.requires_person,
      stands_on: stands?.version ?? null, carried: stands !== null && current !== null && stands.round !== current.round,
      recheck: decided?.decision === "returned" ? "returned" : stands && !live.length && !decided && row.version > 1 && earlier ? "requirement_changed" : null,
      check: engineering ? check(engineering) : null, hands_on: handsOn ? check(handsOn) : null, verified, gap, person, decision: decided ? decision(decided) : null,
      awaiting_voucher: awaiting, satisfied: person === "accepted" || (!row.requires_person && verified && person !== "returned"), history };
  });
  const count = (test: (item: AcceptanceRequirementState) => boolean) => requirements.filter(test).length;
  return { subject, version: current?.version ?? null, round: current?.round ?? 0, requirements,
    counts: { total: requirements.length, verified: count(item => item.verified), needs_person: count(item => item.person !== "not_needed"), accepted: count(item => item.person === "accepted"), satisfied: count(item => item.satisfied) },
    complete: requirements.length > 0 && requirements.every(item => item.satisfied),
    changes: current && current.round > 1 ? { summary: current.summary, touched: requirements.filter(item => touched(current, item.id)).map(item => item.id) } : null };
}
