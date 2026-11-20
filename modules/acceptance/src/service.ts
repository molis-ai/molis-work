import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { acceptanceErrors, type AcceptanceDecideRequest, type AcceptanceDeliverRequest, type AcceptanceEvidenceRef, type AcceptanceGap, type AcceptanceReadRequest, type AcceptanceReadResult, type AcceptanceReportInput,
  type AcceptanceReportRequest, type AcceptanceSetRequest, type AcceptanceSubject, type AcceptanceTier, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { SqliteBaselineDatabase } from "@molis-ai/molis-work-storage";
import { acceptanceView, currentRequirements, standsOn, type DecisionVoucher, type DeliveryRow } from "./state.js";
import { AcceptanceStore } from "./store.js";

/** Who is calling, as the Host established it: never read from an action's input. `session` is a session the Host itself bound. */
export interface AcceptanceCaller { project_id: string; actor_id: string; person: boolean; session: string | null }

/** What the platform can look up about cited evidence, asked as the caller. A lookup that fails is evidence that could not be read. */
export interface AcceptanceEvidencePorts {
  /** Whether this exact version is in the 成果库 for the caller to read. */
  artifactReadable(reference: { artifact_id: string; version: number }): Promise<boolean>;
  /** The Agent Host's own record of commands in one round of the caller's own session; "none" when that session has no such round. */
  checkRun(runId: string, callIds: readonly string[]): Promise<{ commands: ReadonlyArray<{ call_id: string; recorded: boolean; exit_code: number | null; timed_out: boolean; cancelled: boolean; changed_after: boolean }> } | "none">;
  /** The call was cancelled: a failed lookup is then the cancellation, not unreadable evidence. */
  stopped(): boolean;
  /** Re-checks caller authority after async evidence lookups, immediately before committing to SQLite. */
  beforeCommit?(): Promise<void>;
  /** Synchronous authority fence checked inside the SQLite transaction and when a lookup throws due to caller revocation. */
  assertCurrent?(): void;
}

interface Finding { tier: AcceptanceTier; gap: AcceptanceGap | null }
const SELF: Finding = { tier: "self_reported", gap: null };
const gap = (kind: AcceptanceGap): Finding => ({ tier: "self_reported", gap: kind });
const clean = (value: string | undefined) => { const text = value?.trim(); return text ? text : null; };
const sameSubject = (a: AcceptanceSubject["subject"], b: AcceptanceSubject["subject"]) => a.kind === b.kind && a.id === b.id;

/**
 * How far the evidence a report cites backs it, for the delivery it says it checked — found by the platform and never taken from the
 * reporter (PWA-144). Machine-checked means every cited command was run by the platform in the very round that made this version, in
 * the reporter's own session, ended normally with exit 0, and the round wrote nothing after it. Whatever cannot be established
 * stays the reporter's own word with what was missing; nothing here refuses the report.
 */
async function weigh(report: AcceptanceReportInput, delivery: DeliveryRow, caller: AcceptanceCaller, ports: AcceptanceEvidencePorts): Promise<Finding> {
  const evidence = report.evidence ?? [];
  if (!evidence.length) return SELF;
  const lookup = async <T>(read: () => Promise<T>): Promise<T | "unreadable"> => {
    try { return await read(); } catch (error) {
      if (ports.stopped()) throw error;
      ports.assertCurrent?.();
      return "unreadable";
    }
  };
  for (const reference of evidence) {
    if (reference.kind === "artifact_version" && await lookup(() => ports.artifactReadable(reference)) !== true) return gap("evidence_unreadable");
  }
  const receipts = evidence.flatMap(reference => reference.kind === "command_receipt" ? [reference] : []);
  // Readable evidence and no command: a known session other than the one that made this version checked it (contract-design §10.9
  // question 2). The maker saying so again, or a session nobody bound, stays the reporter's own word.
  if (!receipts.length) return caller.session && delivery.made_in_session && delivery.made_in_session !== caller.session ? { tier: "peer_reviewed", gap: null } : SELF;
  // No platform session behind the call: nothing it cites can be looked up as its own.
  if (!caller.session) return gap("evidence_missing");
  // A command of another round, or of a session that did not make this version, says nothing about this version.
  if (!delivery.made_in_run || delivery.made_in_session !== caller.session || receipts.some(reference => reference.run_id !== delivery.made_in_run)) return gap("wrong_object");
  const run = await lookup(() => ports.checkRun(delivery.made_in_run!, [...new Set(receipts.map(reference => reference.call_id))].sort()));
  if (run === "unreadable") return gap("evidence_unreadable");
  if (run === "none") return gap("wrong_object");
  if (run.commands.some(command => !command.recorded)) return gap("evidence_missing");
  if (run.commands.some(command => command.exit_code !== 0 || command.timed_out || command.cancelled)) return gap("check_failed");
  if (run.commands.some(command => command.changed_after)) return gap("wrong_object");
  return { tier: "machine_checked", gap: null };
}

/**
 * Requirements, deliveries, checks and the person's decisions for the objects of a project (specs/proactive-assistant §7.3.1). Every
 * operation is scoped to the caller's project; nothing here knows which plugin an object belongs to beyond the name it is filed under.
 */
export class AcceptanceService {
  constructor(private readonly store: AcceptanceStore, private readonly now: () => string = () => new Date().toISOString(), private readonly vouched?: DecisionVoucher) {}

  /** The caller's project is the library's: a call made in one project never reads or writes another's record. */
  private scoped(caller: AcceptanceCaller): void {
    if (caller.project_id !== this.store.projectId) throw acceptanceErrors.scope("要求与认可记在调用所在的项目里");
  }

  private subject(input: AcceptanceSubject): AcceptanceSubject {
    const subject = { provider_id: input.provider_id.trim(), subject: { kind: input.subject.kind.trim(), id: input.subject.id.trim() } };
    if (!subject.provider_id || !subject.subject.kind || !subject.subject.id) throw acceptanceErrors.scope("要写明是谁的哪一个对象");
    return subject;
  }
  private view(caller: AcceptanceCaller, subject: AcceptanceSubject): AcceptanceView {
    this.scoped(caller);
    const subjectNo = this.store.subjectNo(subject, null);
    return acceptanceView(subject, subjectNo === null ? { requirements: [], deliveries: [], checks: [], decisions: [] } : this.store.rows(subjectNo), this.vouched);
  }
  private known(caller: AcceptanceCaller, subject: AcceptanceSubject): number {
    this.scoped(caller);
    const subjectNo = this.store.subjectNo(subject, null);
    if (subjectNo === null) throw acceptanceErrors.subject_unknown("这个对象上还没有挂要求");
    return subjectNo;
  }

  /** Every object asked for, out of the one open store, in the order asked. */
  read(caller: AcceptanceCaller, request: AcceptanceReadRequest): AcceptanceReadResult { return { views: request.subjects.map(subject => this.view(caller, this.subject(subject))) }; }

  /**
   * The list as it should stand. A requirement whose words or whose need of the person changed gets its next version, and what was
   * checked and decided for the earlier one stops counting; one no longer listed is withdrawn. Once something was delivered only the
   * person changes what was asked: an executor cannot move the bar it is measured against (PWA-146).
   */
  set(caller: AcceptanceCaller, request: AcceptanceSetRequest, assertCurrent?: () => void): AcceptanceView {
    const subject = this.subject(request.subject), at = this.now();
    const listed = request.requirements.map(item => ({ requirement_id: item.id.trim(), statement: item.statement.trim(), expected: clean(item.expected), part: clean(item.part), requires_person: item.requires_person === true }));
    if (listed.some(item => !item.requirement_id || !item.statement) || new Set(listed.map(item => item.requirement_id)).size !== listed.length) throw acceptanceErrors.invalid("每项要求要有不重复的编号和一句说明");
    this.store.write(() => {
      assertCurrent?.();
      this.scoped(caller);
      const subjectNo = this.store.subjectNo(subject, { at })!, rows = this.store.rows(subjectNo);
      if (rows.deliveries.length && !caller.person) throw acceptanceErrors.requirements_fixed("已经交付过，之后只有用户本人能改要求");
      const latest = new Map(rows.requirements.map(row => [row.requirement_id, row]));
      listed.forEach((item, position) => {
        const last = latest.get(item.requirement_id);
        const same = last && !last.withdrawn && last.statement === item.statement && last.expected === item.expected && last.part === item.part && last.requires_person === item.requires_person;
        if (!same) this.store.addRequirement(subjectNo, { ...item, version: (last?.version ?? 0) + 1, withdrawn: false, position, by_person: caller.person, created_at: at }, caller.actor_id);
      });
      for (const last of currentRequirements(rows.requirements)) {
        if (!listed.some(item => item.requirement_id === last.requirement_id)) this.store.addRequirement(subjectNo, { ...last, version: last.version + 1, withdrawn: true, by_person: caller.person, created_at: at }, caller.actor_id);
      }
    });
    return this.view(caller, subject);
  }

  /**
   * One more delivered version. The first touches every requirement; a later one must say which it touched, and only those go back
   * to "not yet checked or decided" — the rest keep what was found and decided on the version they stand on. Delivering satisfies
   * nothing (PWA-146). `made_in` is kept only when the Agent Host confirms the round is one of the caller's own session.
   */
  async deliver(caller: AcceptanceCaller, request: AcceptanceDeliverRequest, ports: AcceptanceEvidencePorts): Promise<AcceptanceView> {
    const subject = this.subject(request.subject), version = request.version.trim(), at = this.now();
    if (!version) throw acceptanceErrors.invalid("要写明交付的确切版本");
    let madeIn: string | null = null;
    if (request.made_in && caller.session) {
      try { if (await ports.checkRun(request.made_in.run_id, []) !== "none") madeIn = request.made_in.run_id; } catch (error) {
        if (ports.stopped()) throw error;
        ports.assertCurrent?.();
      }
    }
    await ports.beforeCommit?.();
    if (ports.stopped()) throw new ActionError("actions.cancelled", "请求已取消");
    ports.assertCurrent?.();
    this.store.write(() => {
      if (ports.stopped()) throw new ActionError("actions.cancelled", "请求已取消");
      ports.assertCurrent?.();
      const subjectNo = this.known(caller, subject), rows = this.store.rows(subjectNo), last = rows.deliveries.at(-1);
      if (rows.deliveries.some(item => item.version === version)) throw acceptanceErrors.invalid("这个版本已经记过交付；返工后的版本要有自己的版本号");
      const ids = new Set(currentRequirements(rows.requirements).map(row => row.requirement_id));
      let touches: string[] | null = null;
      if (last) {
        if (!request.touches) throw acceptanceErrors.invalid("再次交付要写明这一版动了哪几项要求");
        touches = [...new Set(request.touches.map(id => id.trim()))];
        const unknown = touches.find(id => !ids.has(id));
        if (unknown !== undefined) throw acceptanceErrors.requirement_unknown("这一版写明动到的要求不在清单里", { requirement_id: unknown });
      }
      this.store.addDelivery(subjectNo, { round: (last?.round ?? 0) + 1, version, summary: clean(request.summary), touches, made_in_session: madeIn ? caller.session : null, made_in_run: madeIn, delivered_at: at }, caller.actor_id);
    });
    return this.view(caller, subject);
  }

  /**
   * A check of each named requirement, saved whatever it is worth. Evidence of another object or of a version that was never
   * delivered is saved as "wrong object", evidence of a delivered version the requirement no longer stands on as "out of date";
   * otherwise the platform weighs what is cited. Only a report with nothing to weigh against (nothing delivered yet, an unknown
   * requirement) is refused.
   */
  async report(caller: AcceptanceCaller, request: AcceptanceReportRequest, ports: AcceptanceEvidencePorts): Promise<AcceptanceView> {
    const subject = this.subject(request.subject), at = this.now();
    const before = this.store.rows(this.known(caller, subject));
    if (!before.deliveries.length) throw acceptanceErrors.version_unknown("还没有记过交付，没有可核对的版本");
    // `null`: not this object, or not a version that was ever delivered — nothing to weigh.
    const findings: Array<Finding | null> = [];
    for (const report of request.reports) {
      const delivery = before.deliveries.find(item => item.version === report.checked.version.trim());
      findings.push(!delivery || (report.checked.subject && !sameSubject(report.checked.subject, subject.subject)) ? null : await weigh(report, delivery, caller, ports));
    }
    await ports.beforeCommit?.();
    if (ports.stopped()) throw new ActionError("actions.cancelled", "请求已取消");
    ports.assertCurrent?.();
    this.store.write(() => {
      if (ports.stopped()) throw new ActionError("actions.cancelled", "请求已取消");
      ports.assertCurrent?.();
      const subjectNo = this.known(caller, subject), rows = this.store.rows(subjectNo), current = currentRequirements(rows.requirements);
      request.reports.forEach((report, index) => {
        const requirement = current.find(row => row.requirement_id === report.requirement_id.trim());
        if (!requirement) throw acceptanceErrors.requirement_unknown("报告的要求不在清单里", { requirement_id: report.requirement_id });
        const stands = standsOn(rows.deliveries, requirement.requirement_id)!, checked = report.checked.version.trim(), found = findings[index] ?? null;
        // Evidence of a delivered version the requirement does not stand on cannot prove the one it does, whatever it is worth there.
        const finding = found === null ? gap("wrong_object") : checked !== stands.version ? gap("evidence_stale") : found;
        this.store.addCheck(subjectNo, { requirement_id: requirement.requirement_id, requirement_version: requirement.version, round: rows.deliveries.at(-1)!.round, kind: report.kind ?? "engineering", verdict: report.verdict,
          tier: finding.tier, gap: finding.gap, checked_version: checked, method: report.method.trim(), observed: report.observed.trim(), evidence: (report.evidence ?? []) as AcceptanceEvidenceRef[], reported_at: at },
        { session: caller.session, actor_id: caller.actor_id });
      });
    });
    return this.view(caller, subject);
  }

  /**
   * The person's selection, applied as it was frozen or not at all: the delivery being looked at must still be the current one and
   * every listed requirement still at the version shown. Each accepted or returned requirement is recorded against the delivery it
   * stands on, under one decision id; requirements not listed are untouched. Only the person's own call reaches here.
   */
  decide(caller: AcceptanceCaller, request: AcceptanceDecideRequest, decisionId: string = randomUUID(), beforeCommit?: () => void): AcceptanceView {
    if (!caller.person) throw acceptanceErrors.scope("只有用户本人能认可或退回");
    const subject = this.subject(request.subject), at = this.now();
    const items = [...request.accepts.map(item => ({ ...item, decision: "accepted" as const, note: null as string | null })), ...request.returns.map(item => ({ ...item, decision: "returned" as const, note: clean(item.note) }))];
    if (!items.length || new Set(items.map(item => item.id)).size !== items.length) throw acceptanceErrors.invalid("要列出认可或退回的要求，同一项只能出现一次");
    if (items.some(item => item.decision === "returned" && !item.note)) throw acceptanceErrors.note_required("退回要写原因");
    return this.store.write(() => {
      const subjectNo = this.known(caller, subject), rows = this.store.rows(subjectNo), current = currentRequirements(rows.requirements), latest = rows.deliveries.at(-1);
      const prior = rows.decisions.filter(row => row.decision_id === decisionId);
      if (prior.length) {
        if (prior.length !== items.length || prior.some(row => row.actor_id !== caller.actor_id)) throw acceptanceErrors.invalid("决定编号已经被别的决定使用");
      } else {
        if (!latest) throw acceptanceErrors.version_unknown("还没有记过交付，没有可认可的版本");
        if (latest.version !== request.version.trim()) throw acceptanceErrors.selection_changed("交付的版本在你看过之后变了，请按现在的版本再看一遍", { version: latest.version });
        for (const item of items) {
          const requirement = current.find(row => row.requirement_id === item.id);
          if (!requirement || requirement.version !== item.version) throw acceptanceErrors.selection_changed("有一项要求在你看过之后变了，请按现在的内容再看一遍", { requirement_id: item.id });
          const stands = standsOn(rows.deliveries, requirement.requirement_id)!;
          this.store.addDecision(subjectNo, { decision_id: decisionId, requirement_id: requirement.requirement_id, requirement_version: requirement.version, stands_round: stands.round, version: stands.version,
            decision: item.decision, note: item.note, actor_id: caller.actor_id, decided_at: at });
        }
      }
      // The trusted-decision record goes in first: the view counts a decision only once its record is in this library (`vouched`).
      beforeCommit?.();
      return this.view(caller, subject);
    });
  }
}

/**
 * The service on one project's library (contract-design §10.2): the caller holds the connection and its transaction. `vouched` says
 * which trusted decisions this library holds the record of (the Host reads it from the project approvals); `now` is for tests.
 */
export function openAcceptance(db: SqliteBaselineDatabase, projectId: string, options: { now?: () => string; vouched?: DecisionVoucher } = {}): AcceptanceService {
  return new AcceptanceService(new AcceptanceStore(db, projectId), options.now, options.vouched);
}
