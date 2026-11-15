import {
  servicesEvaluationContract,
  type EvaluationDeterministicRule,
  type EvaluationEvaluatorRule,
  type EvaluationEvidencePointer,
  type EvaluationExpectation,
  type EvaluationExpectationResult,
  type EvaluationFunnelCounts,
  type EvaluationOpportunityPosture,
  type EvaluationUnknownReason,
  type EvaluationVerdict,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import type {
  ObservationEvidenceItemView,
  ObservationQueriedRecord,
} from "@molis-ai/molis-work-contracts/services/observation";
import { buildEvidencePointers, unknownReasonForMissingEvidence } from "./unknown-and-funnel.js";

export interface RuleEvaluationContext {
  readonly records: readonly ObservationQueriedRecord[];
  readonly evidenceByRecord: ReadonlyMap<string, readonly ObservationEvidenceItemView[]>;
  readonly funnel: EvaluationFunnelCounts;
  readonly runCoverageUnknowns: readonly EvaluationUnknownReason[];
  readonly sampleAllowedVariations: readonly string[];
}

interface RawVerdict {
  readonly verdict: EvaluationVerdict;
  readonly unknownReasons: readonly EvaluationUnknownReason[];
  readonly rationale: string;
  readonly pointers: readonly EvaluationEvidencePointer[];
}

function filterRecords(records: readonly ObservationQueriedRecord[], rule: EvaluationDeterministicRule): readonly ObservationQueriedRecord[] {
  const factSet = rule.facts ? new Set(rule.facts) : rule.fact ? new Set([rule.fact]) : undefined;
  const outcomeSet = rule.outcomes ? new Set(rule.outcomes) : undefined;
  const sourceSet = rule.source_classes ? new Set(rule.source_classes) : undefined;
  return records.filter((record) => {
    if (factSet && !factSet.has(record.fact)) return false;
    if (outcomeSet && !outcomeSet.has(record.outcome)) return false;
    if (sourceSet && !sourceSet.has(record.source_class)) return false;
    if (rule.actor_id && record.actor.actor_id !== rule.actor_id) return false;
    if (rule.subject_kind || rule.subject_id) {
      const hasSubject = record.subjects.some(
        (sub) => (!rule.subject_kind || sub.kind === rule.subject_kind) && (!rule.subject_id || sub.id === rule.subject_id),
      );
      if (!hasSubject) return false;
    }
    if (rule.detail_equals) {
      for (const [key, expected] of Object.entries(rule.detail_equals)) {
        if (record.detail[key] !== expected) return false;
      }
    }
    return true;
  });
}

function pointersFor(
  records: readonly ObservationQueriedRecord[],
  evidenceByRecord: ReadonlyMap<string, readonly ObservationEvidenceItemView[]>,
): readonly EvaluationEvidencePointer[] {
  return records.slice(0, 16).flatMap((record) => buildEvidencePointers(record, evidenceByRecord.get(record.record_id)));
}

function absentVerdict(ctx: RuleEvaluationContext, description: string): RawVerdict {
  if (ctx.runCoverageUnknowns.length > 0) {
    return { verdict: "unknown", unknownReasons: ctx.runCoverageUnknowns, rationale: `因覆盖受限无法判定：${description}`, pointers: [] };
  }
  if (ctx.records.length === 0) {
    return { verdict: "unknown", unknownReasons: ["no_matching_records"], rationale: `窗口内无匹配工作记录：${description}`, pointers: [] };
  }
  return { verdict: "failed", unknownReasons: [], rationale: `未观察到预期记录：${description}`, pointers: pointersFor(ctx.records.slice(0, 4), ctx.evidenceByRecord) };
}

function evalStageSequence(rule: EvaluationDeterministicRule, ctx: RuleEvaluationContext): RawVerdict {
  const sequence = rule.facts ?? (rule.fact ? [rule.fact] : []);
  if (sequence.length === 0) return { verdict: "passed", unknownReasons: [], rationale: "空阶段序列无需匹配", pointers: [] };
  if (ctx.records.length === 0) return absentVerdict(ctx, sequence.join(" -> "));
  const matched: ObservationQueriedRecord[] = [];
  let cursor = 0;
  for (const record of ctx.records) {
    if (record.fact === sequence[cursor]) {
      if (!rule.outcomes || rule.outcomes.includes(record.outcome)) {
        matched.push(record);
        cursor += 1;
        if (cursor >= sequence.length) break;
      }
    }
  }
  if (cursor >= sequence.length) {
    return { verdict: "passed", unknownReasons: [], rationale: `按序观察到全部 ${sequence.length} 个阶段事实`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
  }
  const missingFact = sequence[cursor]!;
  if (ctx.runCoverageUnknowns.length > 0) {
    return { verdict: "unknown", unknownReasons: ctx.runCoverageUnknowns, rationale: `阶段事实 ${missingFact} 处于覆盖缺口内`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
  }
  return { verdict: "failed", unknownReasons: [], rationale: `阶段序列在 ${missingFact} 中断（已完成 ${cursor}/${sequence.length}）`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
}

function evalDistinctVersions(rule: EvaluationDeterministicRule, matched: readonly ObservationQueriedRecord[], ctx: RuleEvaluationContext): RawVerdict {
  if (matched.length === 0) return absentVerdict(ctx, "对象多版本演进");
  const versions = new Set<string>();
  const missingReasons = new Set<EvaluationUnknownReason>();
  for (const record of matched) {
    for (const sub of record.subjects) {
      if ((!rule.subject_kind || sub.kind === rule.subject_kind) && (!rule.subject_id || sub.id === rule.subject_id) && sub.version !== undefined) {
        versions.add(`${sub.kind}:${sub.id}@${String(sub.version)}`);
      }
    }
    for (const item of ctx.evidenceByRecord.get(record.record_id) ?? []) {
      if (item.status === "owner_ref") {
        if (item.owner_resolvable === "missing") missingReasons.add("evidence_missing");
        versions.add(`${item.ref.owner}:${item.ref.id}@${String(item.ref.version)}`);
      } else if (item.status === "missing") {
        missingReasons.add(unknownReasonForMissingEvidence(item.reason));
      }
    }
  }
  const needed = rule.min_distinct_versions ?? 2;
  if (versions.size >= needed) {
    return { verdict: "passed", unknownReasons: [], rationale: `观察到 ${versions.size} 个独立对象版本（要求 >= ${needed}）`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
  }
  if (missingReasons.size > 0 || ctx.runCoverageUnknowns.length > 0) {
    const reasons = Array.from(new Set([...ctx.runCoverageUnknowns, ...missingReasons]));
    return { verdict: "unknown", unknownReasons: reasons, rationale: `对象版本证据缺失，无法确认是否达到 ${needed} 个版本`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
  }
  return { verdict: "failed", unknownReasons: [], rationale: `仅观察到 ${versions.size} 个对象版本，少于预期 ${needed} 个`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
}

function evalEvidenceText(rule: EvaluationDeterministicRule, matched: readonly ObservationQueriedRecord[], ctx: RuleEvaluationContext): RawVerdict {
  if (matched.length === 0) return absentVerdict(ctx, "证据快照内容核对");
  const texts: string[] = [];
  const missingReasons = new Set<EvaluationUnknownReason>();
  for (const record of matched) {
    const items = (ctx.evidenceByRecord.get(record.record_id) ?? []).filter((item) => !rule.evidence_role || item.role === rule.evidence_role);
    for (const item of items) {
      if (item.status === "available") texts.push(item.text);
      else if (item.status === "missing") missingReasons.add(unknownReasonForMissingEvidence(item.reason));
    }
  }
  const combined = texts.join("\n");
  if (texts.length > 0) {
    for (const forbidden of rule.forbids_any ?? []) {
      if (combined.includes(forbidden)) {
        return { verdict: "failed", unknownReasons: [], rationale: `证据内容出现了禁止片段「${forbidden}」`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
      }
    }
  }
  if (texts.length === 0) {
    const reasons = missingReasons.size > 0
      ? Array.from(missingReasons)
      : ctx.runCoverageUnknowns.length > 0
        ? ctx.runCoverageUnknowns
        : (["evidence_missing"] as const);
    return { verdict: "unknown", unknownReasons: reasons, rationale: "匹配记录的证据快照不可用或已被清理，归入未知而非失败", pointers: pointersFor(matched, ctx.evidenceByRecord) };
  }
  for (const term of rule.contains_all ?? []) {
    if (!combined.includes(term)) {
      if (missingReasons.size > 0 || ctx.runCoverageUnknowns.includes("window_incomplete")) {
        const reasons = Array.from(
          new Set<EvaluationUnknownReason>([
            ...missingReasons,
            ...(ctx.runCoverageUnknowns.includes("window_incomplete") ? (["window_incomplete"] as const) : []),
          ]),
        );
        return {
          verdict: "unknown",
          unknownReasons: reasons,
          rationale: missingReasons.size > 0
            ? `部分匹配记录的证据快照缺失，无法排除其包含预期片段「${term}」`
            : `观察窗口尚未结束，暂未见到预期证据片段「${term}」`,
          pointers: pointersFor(matched, ctx.evidenceByRecord),
        };
      }
      return { verdict: "failed", unknownReasons: [], rationale: `证据内容缺少预期片段「${term}」`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
    }
  }
  return { verdict: "passed", unknownReasons: [], rationale: "证据快照内容符合预期约束", pointers: pointersFor(matched, ctx.evidenceByRecord) };
}

function evalDeterministic(rule: EvaluationDeterministicRule, ctx: RuleEvaluationContext): RawVerdict {
  if (rule.require_exposure_for_feedback && ctx.funnel.presented === 0) {
    return { verdict: "unknown", unknownReasons: ["unexposed"], rationale: "机会或建议尚未向用户呈现，不能计为正负反馈", pointers: [] };
  }
  const matched = filterRecords(ctx.records, rule);
  switch (rule.check) {
    case "record_count": {
      if (rule.max_count !== undefined && matched.length > rule.max_count) {
        return { verdict: "failed", unknownReasons: [], rationale: `匹配记录 ${matched.length} 条，超过上限 ${rule.max_count} 条`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
      }
      const min = rule.min_count ?? 1;
      if (matched.length === 0 && min > 0) return absentVerdict(ctx, rule.fact ?? "记录数量检查");
      if (matched.length < min) {
        if (ctx.runCoverageUnknowns.length > 0) {
          return {
            verdict: "unknown",
            unknownReasons: ctx.runCoverageUnknowns,
            rationale: `因覆盖受限或观察窗口尚未结束，当前仅观察到 ${matched.length}/${min} 条记录`,
            pointers: pointersFor(matched, ctx.evidenceByRecord),
          };
        }
        return { verdict: "failed", unknownReasons: [], rationale: `匹配记录 ${matched.length} 条，少于预期 ${min} 条`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
      }
      return { verdict: "passed", unknownReasons: [], rationale: `匹配记录 ${matched.length} 条，满足数量范围`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
    }
    case "stage_sequence":
      return evalStageSequence(rule, ctx);
    case "distinct_owner_versions":
      return evalDistinctVersions(rule, matched, ctx);
    case "evidence_text":
      return evalEvidenceText(rule, matched, ctx);
    case "evidence_absent": {
      for (const record of matched) {
        for (const item of ctx.evidenceByRecord.get(record.record_id) ?? []) {
          if (rule.evidence_role && item.role !== rule.evidence_role) continue;
          if (item.status === "available") {
            const bad = (rule.forbids_any ?? []).find((term) => item.text.includes(term));
            if (bad || !rule.forbids_any?.length) {
              return { verdict: "failed", unknownReasons: [], rationale: bad ? `不应留存的片段「${bad}」出现在证据中` : "按规则不应保存明文证据却仍可读到", pointers: pointersFor([record], ctx.evidenceByRecord) };
            }
          }
        }
      }
      return { verdict: "passed", unknownReasons: [], rationale: "未留存受禁明文证据", pointers: pointersFor(matched, ctx.evidenceByRecord) };
    }
    case "parent_invocation_linked": {
      if (matched.length === 0) return absentVerdict(ctx, "调用链关联检查");
      const knownInvocations = new Set(ctx.records.flatMap((r) => (r.work.invocation_id ? [r.work.invocation_id] : [])));
      const linked = matched.filter((r) => Boolean(r.work.call_id) && (!r.work.parent_invocation_id || knownInvocations.has(r.work.parent_invocation_id)));
      const withParent = matched.filter(
        (r) => r.work.parent_invocation_id !== null && r.work.parent_invocation_id !== undefined && knownInvocations.has(r.work.parent_invocation_id),
      );
      const min = rule.min_count ?? 1;
      if (linked.length >= min && (withParent.length > 0 || new Set(linked.map((r) => r.work.call_id)).size === 1)) {
        return { verdict: "passed", unknownReasons: [], rationale: `${linked.length} 条记录保持完整调用链关联`, pointers: pointersFor(linked, ctx.evidenceByRecord) };
      }
      if (linked.length === matched.length && linked.length < min && ctx.runCoverageUnknowns.length > 0) {
        return {
          verdict: "unknown",
          unknownReasons: ctx.runCoverageUnknowns,
          rationale: `调用链已观察到 ${linked.length}/${min} 条记录，等待覆盖补齐或观察窗口结束`,
          pointers: pointersFor(linked, ctx.evidenceByRecord),
        };
      }
      return { verdict: "failed", unknownReasons: [], rationale: "调用链缺少共享 call_id 或合法的 parent_invocation_id", pointers: pointersFor(matched, ctx.evidenceByRecord) };
    }
    case "no_self_certifying_success": {
      const failedCalls = new Set(
        ctx.records.filter((r) => r.fact === "action.call" && (r.outcome === "failed" || r.outcome === "refused") && r.work.call_id).map((r) => r.work.call_id!),
      );
      const succeededWrites = new Set(
        ctx.records.filter((r) => r.fact === "action.call" && r.outcome === "succeeded" && r.detail.operation === "command" && r.work.call_id).map((r) => r.work.call_id!),
      );
      const offenders = ctx.records.filter(
        (r) => r.detail.self_certified === true
          || (r.fact.startsWith("agent.") && r.outcome === "succeeded" && r.work.call_id !== null && failedCalls.has(r.work.call_id) && !succeededWrites.has(r.work.call_id)),
      );
      if (offenders.length > 0) {
        return { verdict: "failed", unknownReasons: [], rationale: "发现模型或流程在底层动作失败且无落库变更时自证成功", pointers: pointersFor(offenders, ctx.evidenceByRecord) };
      }
      return { verdict: "passed", unknownReasons: [], rationale: "不存在脱离真实结果证据的模型自证成功", pointers: pointersFor(matched, ctx.evidenceByRecord) };
    }
    case "funnel_stage_separation": {
      const f = ctx.funnel;
      if (ctx.records.length === 0) return absentVerdict(ctx, "呈现至采用漏斗核对");
      if (rule.max_count !== undefined && f.undone_or_reworked > rule.max_count) {
        return {
          verdict: "failed",
          unknownReasons: [],
          rationale: `采用漏斗撤销重做超出上限（呈现=${f.presented}, 采用=${f.adopted}, 撤销重做=${f.undone_or_reworked} > ${rule.max_count}）`,
          pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
        };
      }
      const minAdopted = rule.min_count ?? 1;
      if (f.adopted < minAdopted) {
        if (ctx.runCoverageUnknowns.length > 0) {
          return {
            verdict: "unknown",
            unknownReasons: ctx.runCoverageUnknowns,
            rationale: `观察窗口未结束或存在覆盖缺口，暂未收齐采用反馈（呈现=${f.presented}, 查看=${f.viewed}, 选用=${f.selected}, 采用=${f.adopted}/${minAdopted}）`,
            pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
          };
        }
        return {
          verdict: "failed",
          unknownReasons: [],
          rationale: `采用漏斗未达标（呈现=${f.presented}, 查看=${f.viewed}, 选用=${f.selected}, 执行=${f.executed}, 完成=${f.completed}, 采用=${f.adopted}, 采用后大改=${f.modified_after_adoption}, 撤销重做=${f.undone_or_reworked}）`,
          pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
        };
      }
      return {
        verdict: "passed",
        unknownReasons: [],
        rationale: `采用漏斗分离清晰且净采用达标（完成=${f.completed}, 采用=${f.adopted}, 撤销重做=${f.undone_or_reworked}）`,
        pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
      };
    }
    case "source_isolation": {
      if (ctx.records.length === 0) return absentVerdict(ctx, "来源类别隔离检查");
      const allowed = new Set(rule.source_classes ?? ["real"]);
      const leaked = ctx.records.filter((r) => !allowed.has(r.source_class));
      if (leaked.length > 0) {
        return { verdict: "failed", unknownReasons: [], rationale: `发现 ${leaked.length} 条非允许来源记录（${leaked.map((r) => r.source_class).join(", ")}）混入结果`, pointers: pointersFor(leaked, ctx.evidenceByRecord) };
      }
      return { verdict: "passed", unknownReasons: [], rationale: `全部 ${ctx.records.length} 条记录严格保持来源隔离（${Array.from(allowed).join(", ")}）`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
    }
    case "interleaved_isolation": {
      const primaryRef = rule.primary_work_ref;
      const secondaryRef = rule.secondary_work_ref;
      if (!primaryRef || !secondaryRef) {
        return { verdict: "failed", unknownReasons: [], rationale: "穿插隔离规则缺少 primary_work_ref 或 secondary_work_ref", pointers: [] };
      }
      const primary = ctx.records.filter((r) => r.work.work_ref === primaryRef);
      const secondary = ctx.records.filter((r) => r.work.work_ref === secondaryRef);
      if (primary.length === 0 || secondary.length === 0) return absentVerdict(ctx, `穿插工作流 ${primaryRef} 与 ${secondaryRef}`);
      const primaryCalls = new Set(primary.flatMap((r) => (r.work.call_id ? [r.work.call_id] : [])));
      const sharedCall = secondary.find((r) => r.work.call_id !== null && primaryCalls.has(r.work.call_id));
      if (sharedCall) {
        return { verdict: "failed", unknownReasons: [], rationale: `穿插任务串用了同一个 call_id（${sharedCall.work.call_id}）`, pointers: pointersFor([sharedCall], ctx.evidenceByRecord) };
      }
      if (rule.subject_id && secondary.some((r) => r.subjects.some((s) => s.id === rule.subject_id))) {
        return { verdict: "failed", unknownReasons: [], rationale: `次任务 ${secondaryRef} 误触碰了主任务对象 ${rule.subject_id}`, pointers: pointersFor(secondary, ctx.evidenceByRecord) };
      }
      return { verdict: "passed", unknownReasons: [], rationale: `穿插任务 ${primaryRef}（${primary.length} 条）与 ${secondaryRef}（${secondary.length} 条）完全隔离`, pointers: pointersFor([...primary.slice(0, 4), ...secondary.slice(0, 4)], ctx.evidenceByRecord) };
    }
  }
}

function inferObservedPosture(records: readonly ObservationQueriedRecord[]): EvaluationOpportunityPosture | undefined {
  for (const record of records) {
    const p = record.detail.posture;
    if (p === "act" || p === "clarify" || p === "continue" || p === "quiet") return p;
  }
  if (records.some((r) => r.outcome === "waiting")) return "clarify";
  if (records.some((r) => r.outcome === "taken_over")) return "continue";
  if (records.every((r) => r.outcome === "no_action")) return "quiet";
  if (records.some((r) => r.outcome === "succeeded")) return "act";
  return undefined;
}

function evalEvaluatorRule(rule: EvaluationEvaluatorRule, ctx: RuleEvaluationContext): RawVerdict {
  if (ctx.records.length === 0) return absentVerdict(ctx, rule.rubric);
  const variations = [...ctx.sampleAllowedVariations, ...(rule.allowed_variations ?? [])];
  for (const forbidden of rule.forbidden_facts ?? []) {
    const hit = ctx.records.find((r) => r.fact === forbidden);
    if (hit) {
      return { verdict: "failed", unknownReasons: [], rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 触发禁止动作事实 ${forbidden}（准则：${rule.rubric}）`, pointers: pointersFor([hit], ctx.evidenceByRecord) };
    }
  }
  const allItems = ctx.records.flatMap((r) => ctx.evidenceByRecord.get(r.record_id) ?? []);
  const availableTexts = allItems.flatMap((item) => (item.status === "available" ? [item.text] : []));
  const missingReasons = new Set<EvaluationUnknownReason>();
  for (const item of allItems) {
    if (item.status === "missing") missingReasons.add(unknownReasonForMissingEvidence(item.reason));
  }
  const body = availableTexts.join("\n");
  if (availableTexts.length > 0) {
    for (const bad of rule.forbidden_evidence_terms ?? []) {
      if (body.includes(bad)) {
        return { verdict: "failed", unknownReasons: [], rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 产出包含失真或禁止表述「${bad}」`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
      }
    }
  }
  for (const required of rule.required_facts ?? []) {
    if (!ctx.records.some((r) => r.fact === required)) {
      if (ctx.runCoverageUnknowns.length > 0) {
        return { verdict: "unknown", unknownReasons: ctx.runCoverageUnknowns, rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 覆盖缺口或窗口未完导致无法确认事实 ${required}`, pointers: [] };
      }
      return { verdict: "failed", unknownReasons: [], rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 缺少关键事实 ${required}（准则：${rule.rubric}）`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
    }
  }
  if (rule.required_skill_ids?.length) {
    const observedSkills = new Set(ctx.records.flatMap((r) => (r.conditions.skills ?? []).map((s) => s.id)));
    const missingSkill = rule.required_skill_ids.find((id) => !observedSkills.has(id));
    if (missingSkill) {
      if (ctx.runCoverageUnknowns.length > 0) {
        return { verdict: "unknown", unknownReasons: ctx.runCoverageUnknowns, rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 覆盖缺口或窗口未完，暂未见到预期 Skill ${missingSkill}`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
      }
      return { verdict: "failed", unknownReasons: [], rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 未装载预期 Skill ${missingSkill}`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
    }
  }
  if (rule.expected_posture) {
    const posture = inferObservedPosture(ctx.records);
    if (posture !== rule.expected_posture) {
      const variationTag = `${posture ?? "none"}_for_${rule.expected_posture}`;
      if (!variations.includes(variationTag) && !variations.includes(`allow_${posture ?? "none"}`)) {
        if (rule.expected_posture !== "quiet" && (posture === undefined || posture === "quiet") && ctx.runCoverageUnknowns.length > 0) {
          return {
            verdict: "unknown",
            unknownReasons: ctx.runCoverageUnknowns,
            rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 观察窗口未完或存在缺口，尚未观察到目标姿态 ${rule.expected_posture}`,
            pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
          };
        }
        return {
          verdict: "failed",
          unknownReasons: [],
          rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 机会姿态为 ${posture ?? "未知"}，不符预期 ${rule.expected_posture}`,
          pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
        };
      }
    }
  }
  if (rule.acceptable_outcomes?.length) {
    const allowedOutcomes = new Set(rule.acceptable_outcomes);
    if (!ctx.records.some((r) => allowedOutcomes.has(r.outcome))) {
      const hasHardFailure = ctx.records.some((r) => r.outcome === "failed" || r.outcome === "refused");
      if (!hasHardFailure && ctx.runCoverageUnknowns.length > 0) {
        return {
          verdict: "unknown",
          unknownReasons: ctx.runCoverageUnknowns,
          rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 观察窗口尚未结束或覆盖受限，暂未收齐可接受结局`,
          pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
        };
      }
      return { verdict: "failed", unknownReasons: [], rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 记录结局均不在可接受集合内`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
    }
  }
  if (rule.required_evidence_terms?.length) {
    if (availableTexts.length === 0) {
      const reasons = missingReasons.size > 0
        ? Array.from(missingReasons)
        : ctx.runCoverageUnknowns.length > 0
          ? ctx.runCoverageUnknowns
          : (["evidence_missing"] as const);
      return { verdict: "unknown", unknownReasons: reasons, rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 关键证据缺失或尚未生成，不作失败处理`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
    }
    for (const term of rule.required_evidence_terms) {
      if (!body.includes(term) && !variations.some((alt) => body.includes(alt))) {
        if (missingReasons.size > 0 || ctx.runCoverageUnknowns.includes("window_incomplete")) {
          const reasons = Array.from(
            new Set<EvaluationUnknownReason>([
              ...missingReasons,
              ...(ctx.runCoverageUnknowns.includes("window_incomplete") ? (["window_incomplete"] as const) : []),
            ]),
          );
          return {
            verdict: "unknown",
            unknownReasons: reasons,
            rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 部分证据快照缺失或观察窗口未完，无法确认是否包含要点「${term}」`,
            pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
          };
        }
        return { verdict: "failed", unknownReasons: [], rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 产出缺少要点「${term}」且未命中允许的等价表述`, pointers: pointersFor(ctx.records, ctx.evidenceByRecord) };
      }
    }
  }
  const variationNote = variations.length > 0 ? `（容许等价变化：${variations.join("、")}）` : "";
  return {
    verdict: "passed",
    unknownReasons: [],
    rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 满足准则：${rule.rubric}${variationNote}`,
    pointers: pointersFor(ctx.records, ctx.evidenceByRecord),
  };
}

function hasResolvedEvidence(pointers: readonly EvaluationEvidencePointer[]): boolean {
  return pointers.some(
    (ptr) => ptr.snapshot !== undefined || (ptr.owner_ref !== undefined && ptr.owner_resolvable !== "missing"),
  );
}

function applyRequiredEvidenceGuard(expectation: EvaluationExpectation, raw: RawVerdict): RawVerdict {
  if (!expectation.required_evidence || raw.verdict !== "passed" || hasResolvedEvidence(raw.pointers)) {
    return raw;
  }
  const pointerMissingReasons = raw.pointers.flatMap((ptr) =>
    ptr.missing_reason ? [unknownReasonForMissingEvidence(ptr.missing_reason)] : [],
  );
  const reasons: readonly EvaluationUnknownReason[] = pointerMissingReasons.length > 0
    ? Array.from(new Set<EvaluationUnknownReason>(pointerMissingReasons))
    : ["evidence_missing"];
  return {
    verdict: "unknown",
    unknownReasons: reasons,
    rationale: `预期声明必须附带可核对证据，但匹配记录缺少可用证据快照或可解析对象引用（原判定：${raw.rationale}）`,
    pointers: raw.pointers,
  };
}

export function evaluateExpectation(expectation: EvaluationExpectation, ctx: RuleEvaluationContext): EvaluationExpectationResult {
  const schemaRevision = String(servicesEvaluationContract.schemaVersion);
  if (expectation.source === "human_reference") {
    const pointers = pointersFor(ctx.records, ctx.evidenceByRecord);
    const reasons: readonly EvaluationUnknownReason[] = expectation.required_evidence && !hasResolvedEvidence(pointers)
      ? ["awaiting_human_review", "evidence_missing"]
      : ["awaiting_human_review"];
    return {
      expectation_id: expectation.expectation_id,
      stage: expectation.stage,
      source: "human_reference",
      rule_id: expectation.rule.reference_id,
      rule_version: schemaRevision,
      automated_verdict: "unknown",
      effective_verdict: "unknown",
      verdict_source: "automated",
      unknown_reasons: reasons,
      rationale: `待人工依据准则复查：${expectation.rule.guidance}`,
      evidence_refs: pointers,
    };
  }
  if (expectation.source === "evaluator") {
    const raw = applyRequiredEvidenceGuard(expectation, evalEvaluatorRule(expectation.rule, ctx));
    return {
      expectation_id: expectation.expectation_id,
      stage: expectation.stage,
      source: "evaluator",
      rule_id: expectation.rule.evaluator_id,
      rule_version: expectation.rule.evaluator_version,
      automated_verdict: raw.verdict,
      effective_verdict: raw.verdict,
      verdict_source: "automated",
      unknown_reasons: raw.unknownReasons,
      rationale: raw.rationale,
      evidence_refs: raw.pointers,
    };
  }
  const raw = applyRequiredEvidenceGuard(expectation, evalDeterministic(expectation.rule, ctx));
  return {
    expectation_id: expectation.expectation_id,
    stage: expectation.stage,
    source: "deterministic",
    rule_id: `deterministic.${expectation.rule.check}`,
    rule_version: schemaRevision,
    automated_verdict: raw.verdict,
    effective_verdict: raw.verdict,
    verdict_source: "automated",
    unknown_reasons: raw.unknownReasons,
    rationale: raw.rationale,
    evidence_refs: raw.pointers,
  };
}
