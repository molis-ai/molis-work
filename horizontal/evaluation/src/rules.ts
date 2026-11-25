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
  type EvaluationWorkMode,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import type {
  ObservationEvidenceItemView,
  ObservationQueriedRecord,
} from "@molis-ai/molis-work-contracts/services/observation";
import type { CommandReceipt } from "./observation-bridge.js";
import { buildEvidencePointers, unknownReasonForMissingEvidence } from "./unknown-and-funnel.js";

export interface RuleEvaluationContext {
  readonly records: readonly ObservationQueriedRecord[];
  readonly retryReceipts?: ReadonlyMap<string, CommandReceipt>;
  readonly evidenceByRecord: ReadonlyMap<string, readonly ObservationEvidenceItemView[]>;
  readonly funnel: EvaluationFunnelCounts;
  readonly runCoverageUnknowns: readonly EvaluationUnknownReason[];
  readonly sampleAllowedVariations: readonly string[];
  readonly sampleTextTermCount: number;
  readonly workMode: EvaluationWorkMode;
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
  // Keep every matched record: an evaluation result must be traceable to the whole basis it used, not just its first page.
  return records.flatMap((record) => buildEvidencePointers(record, evidenceByRecord.get(record.record_id)));
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

/**
 * A rule that can only assert "nothing bad was seen" must not turn a window with nothing to inspect into a pass.
 * Unlike `absentVerdict`, a non-empty window whose fact filter matched nothing is still unknown here: the absence rule
 * had no matching evidence to inspect, so neither a violation nor a clean result is established (OCL-08, PWA-55).
 */
function noCheckableMatchVerdict(ctx: RuleEvaluationContext, description: string): RawVerdict {
  if (ctx.runCoverageUnknowns.length > 0) {
    return { verdict: "unknown", unknownReasons: ctx.runCoverageUnknowns, rationale: `因覆盖受限无法核对：${description}`, pointers: [] };
  }
  return { verdict: "unknown", unknownReasons: ["no_matching_records"], rationale: `没有可核对的工作记录：${description}`, pointers: [] };
}

/** Ingestion seq only resolves a tie for facts timed at arrival by the same writer. */
function stagePrecedes(before: ObservationQueriedRecord, after: ObservationQueriedRecord): boolean | undefined {
  if (before.record_id === after.record_id || before.project_id !== after.project_id) return false;
  if (before.work.invocation_id && before.work.invocation_id === after.work.parent_invocation_id) return true;
  if (after.work.invocation_id && after.work.invocation_id === before.work.parent_invocation_id) return false;
  if (before.clock_adjusted || after.clock_adjusted) return undefined;
  const sameWriter = before.owner.kind === after.owner.kind && ("id" in before.owner ? before.owner.id : null) === ("id" in after.owner ? after.owner.id : null)
    && before.install_id === after.install_id && before.actor.actor_id === after.actor.actor_id;
  if (!sameWriter) {
    // A downstream writer citing the same version in the same work can be joined to its upstream event.
    const linkedVersion = before.work.work_ref && before.work.work_ref === after.work.work_ref
      && before.subjects.some(subject => subject.version !== undefined && after.subjects.some(other =>
        other.kind === subject.kind && other.id === subject.id && other.version === subject.version));
    if (!linkedVersion) return undefined;
  }
  if (before.occurred_at !== after.occurred_at) return before.occurred_at < after.occurred_at;
  return sameWriter && before.received_at === before.occurred_at && after.received_at === after.occurred_at
    ? before.seq < after.seq : undefined;
}

function evalStageSequence(rule: EvaluationDeterministicRule, ctx: RuleEvaluationContext): RawVerdict {
  const sequence = rule.facts ?? (rule.fact ? [rule.fact] : []);
  if (sequence.length === 0) return { verdict: "passed", unknownReasons: [], rationale: "空阶段序列无需匹配", pointers: [] };
  if (ctx.records.length === 0) return absentVerdict(ctx, sequence.join(" -> "));
  const eligible = filterRecords(ctx.records, rule);
  const layers = sequence.map(fact => eligible.filter(record => record.fact === fact));
  let paths = layers[0]!.map(record => [record]);
  let ambiguous = false;
  for (const layer of layers.slice(1)) {
    const next: ObservationQueriedRecord[][] = [];
    for (const record of layer) {
      const path = paths.find(prior => {
        if (prior.includes(record)) return false;
        const precedes = stagePrecedes(prior[prior.length - 1]!, record);
        if (precedes === undefined) ambiguous = true;
        return precedes;
      });
      if (path) next.push([...path, record]);
    }
    paths = next;
  }
  if (paths.length) return { verdict: "passed", unknownReasons: [], rationale: `按序观察到全部 ${sequence.length} 个阶段事实`, pointers: pointersFor(paths[0]!, ctx.evidenceByRecord) };
  const pointers = pointersFor(eligible, ctx.evidenceByRecord);
  if (ctx.runCoverageUnknowns.length) return { verdict: "unknown", unknownReasons: ctx.runCoverageUnknowns, rationale: "阶段顺序存在覆盖缺口", pointers };
  if (ambiguous && layers.every(layer => layer.length > 0)) {
    return { verdict: "unknown", unknownReasons: ["evidence_missing"], rationale: "记录缺少能确定阶段先后的时间或因果依据", pointers };
  }
  return { verdict: "failed", unknownReasons: [], rationale: "工作记录未按预期顺序完成全部阶段", pointers };
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
        if ((rule.subject_kind && rule.subject_kind !== item.ref.owner) || (rule.subject_id && rule.subject_id !== item.ref.id)) continue;
        if (item.owner_resolvable !== "resolved") {
          missingReasons.add("evidence_missing");
          continue;
        }
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

function evalNoSelfCertifyingSuccess(rule: EvaluationDeterministicRule, ctx: RuleEvaluationContext, matched: readonly ObservationQueriedRecord[]): RawVerdict {
  if (ctx.records.length === 0) return noCheckableMatchVerdict(ctx, "模型自证成功检查");
  const commands = ctx.records.filter(record => record.owner.kind === "service" && record.owner.id === "gateway" && record.fact === "action.call" && record.detail.operation === "command" && record.work.call_id);
  const failures = commands.filter(record => record.outcome === "failed" || record.outcome === "refused");
  const reported = ctx.records.filter(record => record.detail.self_certified === true || (record.outcome === "succeeded"
    && (record.fact === "agent.reply" || record.fact === "agent.round_completed" || record.fact === "agent.run" && record.stage === "completed")));
  const unverified: ObservationQueriedRecord[] = [];
  const verified = new Set<ObservationQueriedRecord>();
  for (const claim of reported) {
    if (claim.detail.self_certified === true) return {
      verdict: "failed", unknownReasons: [], rationale: "发现明确标记的模型自证成功", pointers: pointersFor([claim], ctx.evidenceByRecord),
    };
    for (const failed of failures.filter(record => record.work.call_id === claim.work.call_id && record.project_id === claim.project_id && record.seq < claim.seq)) {
      const retries = commands.filter(record => record.outcome === "succeeded" && record.project_id === failed.project_id
        && record.work.call_id === failed.work.call_id && record.detail.action === failed.detail.action && record.provider_id === failed.provider_id
        && record.seq > failed.seq && record.seq < claim.seq);
      if (!retries.length) return {
        verdict: "failed", unknownReasons: [], rationale: "模型报告完成，但目标写入被拒绝或失败，未见该动作成功重试",
        pointers: pointersFor([failed, claim], ctx.evidenceByRecord),
      };
      // A successful retry of the same capability can still have changed another object. Failed calls
      // intentionally have no input snapshots. Only an identified target with a successor version suffices.
      const declared = rule.subject_id ? { id: rule.subject_id, kind: rule.subject_kind } : failed.subjects.find(subject => subject.kind !== "action");
      if (declared) {
        const before = failed.subjects.find(subject => subject.kind === declared.kind && subject.id === declared.id)?.version;
        let allOtherTargets = true;
        let recovered: ObservationQueriedRecord | undefined;
        for (const retry of retries) {
          const receipt = ctx.retryReceipts?.get(retry.record_id);
          if (receipt && (receipt.id !== declared.id || (declared.kind && receipt.kind !== declared.kind))) continue;
          allOtherTargets = false;
          const previous = receipt?.previousRevision ?? before;
          if (receipt && previous !== undefined && Number(receipt.revision) > Number(previous)) {
            recovered = retry;
            break;
          }
        }
        if (recovered) {
          verified.add(failed).add(recovered).add(claim);
          continue;
        }
        if (allOtherTargets) return {
          verdict: "failed", unknownReasons: [], rationale: "目标写入失败，同一动作的成功回执只属于其他对象",
          pointers: pointersFor([failed, ...retries, claim], ctx.evidenceByRecord),
        };
      }
      unverified.push(failed, ...retries, claim);
    }
  }
  if (unverified.length) return {
    verdict: "unknown", unknownReasons: ["evidence_missing"], rationale: "无法核对成功重试的目标对象和新版本",
    pointers: pointersFor([...new Set(unverified)], ctx.evidenceByRecord),
  };
  return { verdict: "passed", unknownReasons: [], rationale: "不存在脱离真实结果证据的模型自证成功", pointers: pointersFor(verified.size ? [...verified] : matched, ctx.evidenceByRecord) };
}

function evalDeterministic(rule: EvaluationDeterministicRule, stage: EvaluationExpectation["stage"], ctx: RuleEvaluationContext): RawVerdict {
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
      if (rule.max_count !== undefined && ctx.runCoverageUnknowns.length) {
        return { verdict: "unknown", unknownReasons: ctx.runCoverageUnknowns, rationale: "记录不完整，无法核对数量上限", pointers: pointersFor(matched, ctx.evidenceByRecord) };
      }
      return { verdict: "passed", unknownReasons: [], rationale: `匹配记录 ${matched.length} 条，满足数量范围`, pointers: pointersFor(matched, ctx.evidenceByRecord) };
    }
    case "stage_sequence":
      return evalStageSequence(rule, ctx);
    case "distinct_owner_versions":
      return evalDistinctVersions(rule, matched, ctx);
    case "evidence_text": {
      if (stage !== "delivery") return evalEvidenceText(rule, matched, ctx);
      if (!ctx.records.length) return absentVerdict(ctx, "交付正文");
      const requested = rule.facts ?? (rule.fact ? [rule.fact] : []);
      const fact = requested.length === 1 ? requested[0] : undefined;
      const source = fact ? { fact, role: rule.evidence_role ?? (fact === "agent.reply" ? "reply" : "output") } : undefined;
      return evaluateRubricText({ rubric: "核对交付正文", evidence_source: source,
        required_evidence_terms: rule.contains_all, forbidden_evidence_terms: rule.forbids_any },
        stage, { ...ctx, records: matched, sampleAllowedVariations: [] }, [], rule.evidence_role);
    }
    case "evidence_absent": {
      if (ctx.records.length === 0 || matched.length === 0) {
        return noCheckableMatchVerdict(ctx, "不应留存明文证据检查");
      }
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
    case "no_self_certifying_success":
      return evalNoSelfCertifyingSuccess(rule, ctx, matched);
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

/** Business outputs and the saved document body are both established delivery evidence roles. */
export const isPluginDeliveryRole = (role: string): boolean => role === "output" || role === "body";

type TextRubric = Pick<EvaluationEvaluatorRule, "rubric" | "evidence_source" | "required_facts" | "required_evidence_terms" | "forbidden_evidence_terms" | "allowed_variations">;

/** Material and policy rubrics can inspect their selected inputs. Delivery rubrics need an identifiable output. */
function rubricTextEvidence(rule: TextRubric, stage: EvaluationExpectation["stage"], ctx: RuleEvaluationContext, selectedRole?: string) {
  const reply = { fact: "agent.reply", role: "reply" };
  const expectsReply = rule.required_facts?.includes(reply.fact)
    || stage === "delivery" && (ctx.workMode === "assistant" || ctx.records.some(record => record.fact === reply.fact));
  const source = rule.evidence_source ?? (expectsReply ? reply : undefined);
  const records = source ? ctx.records.filter(record => record.fact === source.fact) : ctx.records;
  const items: ObservationEvidenceItemView[] = [];
  const pointers: EvaluationEvidencePointer[] = [];
  let incomplete = false;
  let replyRecords = 0;
  for (const record of records) {
    const evidence = ctx.evidenceByRecord.get(record.record_id) ?? [];
    // A query or a pinned ID can narrow the records, but only the producing owner can attest delivery.
    let role = source?.role ?? selectedRole;
    if (stage === "delivery") {
      if (record.owner.kind === "plugin") {
        role ??= "output";
        if (!isPluginDeliveryRole(role)) continue;
      } else if (record.owner.kind === "service" && record.owner.id === "agent" && record.fact === reply.fact) {
        if (role !== undefined && role !== reply.role) continue;
        role = reply.role;
      } else continue;
    }
    const selected = evidence.filter(item => role === undefined || item.role === role);
    if (!selected.length) {
      // A reasoning-only frame is not a missing reply fragment. A record with no evidence at all is unresolved.
      if (source && !evidence.length) incomplete = true;
      continue;
    }
    incomplete ||= selected.some(item => item.status !== "available" || item.ref.kind === "snapshot" && item.ref.redacted === true);
    if (source?.fact === reply.fact && role === reply.role) replyRecords++;
    items.push(...selected);
    pointers.push(...buildEvidencePointers(record, selected));
  }
  return { texts: items.flatMap(item => item.status === "available" ? [item.text] : []), pointers, incomplete, ambiguousReply: replyRecords > 1 };
}

function evaluateRubricText(rule: TextRubric, stage: EvaluationExpectation["stage"], ctx: RuleEvaluationContext,
  variations: readonly string[], selectedRole?: string): RawVerdict {
  const { texts, pointers, incomplete, ambiguousReply } = rubricTextEvidence(rule, stage, ctx, selectedRole);
  if (ambiguousReply) {
    return { verdict: "unknown", unknownReasons: ["evidence_missing"], pointers,
      rationale: "样本命中多份回复正文，需固定待评回复的记录才能归因" };
  }
  const contains = (term: string) => texts.some(text => text.includes(term));
  const reasons: EvaluationUnknownReason[] = !texts.length || incomplete ? [...ctx.runCoverageUnknowns] : ctx.runCoverageUnknowns.filter(reason => reason === "window_incomplete");
  if (!texts.length || incomplete) reasons.push("evidence_missing");
  const forbidden = rule.forbidden_evidence_terms?.find(contains);
  if (forbidden) return { verdict: "failed", unknownReasons: [], pointers, rationale: `产出包含禁止表述「${forbidden}」` };
  const required = rule.required_evidence_terms ?? [];
  const missing = required.filter(term => !contains(term));
  // An alternative has a known meaning only if its declaring rule (or sample) has exactly one required point.
  const equivalent = required.length === 1 && (rule.allowed_variations?.some(contains)
    || ctx.sampleTextTermCount === 1 && ctx.sampleAllowedVariations.some(contains));
  if (missing.length && !equivalent) {
    const matched = required.filter(contains);
    const unassigned = variations.some(alt => contains(alt) && !matched.some(term => term.includes(alt)));
    if (unassigned) return { verdict: "unknown", unknownReasons: ["awaiting_human_review"], pointers,
      rationale: "命中了未绑定具体要点的等价说法，需独立核对该要点" };
  }
  const needsMoreEvidence = (missing.length > 0 && !equivalent) || Boolean(rule.forbidden_evidence_terms?.length);
  if (!texts.length || (needsMoreEvidence && reasons.length > 0)) {
    return { verdict: "unknown", unknownReasons: [...new Set(reasons)], pointers, rationale: "可核对的正文或观察窗口不完整" };
  }
  if (missing.length && !equivalent) return { verdict: "failed", unknownReasons: [], pointers, rationale: `产出缺少要点「${missing.join("」「")}」` };
  return { verdict: "passed", unknownReasons: [], pointers, rationale: `正文符合准则：${rule.rubric}` };
}

function evalEvaluatorRule(rule: EvaluationEvaluatorRule, stage: EvaluationExpectation["stage"], ctx: RuleEvaluationContext): RawVerdict {
  if (ctx.records.length === 0) return absentVerdict(ctx, rule.rubric);
  const variations = [...ctx.sampleAllowedVariations, ...(rule.allowed_variations ?? [])];
  for (const forbidden of rule.forbidden_facts ?? []) {
    const hit = ctx.records.find((r) => r.fact === forbidden);
    if (hit) {
      return { verdict: "failed", unknownReasons: [], rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 触发禁止动作事实 ${forbidden}（准则：${rule.rubric}）`, pointers: pointersFor([hit], ctx.evidenceByRecord) };
    }
  }
  const textVerdict = rule.required_evidence_terms?.length || rule.forbidden_evidence_terms?.length
    ? evaluateRubricText(rule, stage, ctx, variations) : undefined;
  if (textVerdict && textVerdict.verdict !== "passed") return textVerdict;
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
  const textRecordIds = new Set(textVerdict?.pointers.map(pointer => pointer.record_id));
  const variationNote = variations.length > 0 ? `（容许等价变化：${variations.join("、")}）` : "";
  return {
    verdict: "passed",
    unknownReasons: [],
    rationale: `[${rule.evaluator_id}@${rule.evaluator_version}] 满足准则：${rule.rubric}${variationNote}`,
    pointers: textVerdict ? [
      ...textVerdict.pointers,
      ...ctx.records.filter(record => !textRecordIds.has(record.record_id)
        && (rule.required_facts?.includes(record.fact) && record.fact !== "agent.reply"
          || record.conditions.skills?.some(skill => rule.required_skill_ids?.includes(skill.id))
          || rule.acceptable_outcomes?.includes(record.outcome)
          || rule.expected_posture !== undefined)).flatMap(record => buildEvidencePointers(record, [])),
    ] : pointersFor(ctx.records, ctx.evidenceByRecord),
  };
}

function hasResolvedEvidence(pointers: readonly EvaluationEvidencePointer[]): boolean {
  return pointers.some(
    (ptr) => ptr.snapshot !== undefined || (ptr.owner_ref !== undefined && ptr.owner_resolvable === "resolved"),
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
    const raw = applyRequiredEvidenceGuard(expectation, evalEvaluatorRule(expectation.rule, expectation.stage, ctx));
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
  const raw = applyRequiredEvidenceGuard(expectation, evalDeterministic(expectation.rule, expectation.stage, ctx));
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
