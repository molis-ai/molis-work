import type {
  EvaluationEvidencePointer,
  EvaluationFunnelCounts,
  EvaluationObservedConditions,
  EvaluationSampleView,
  EvaluationUnknownReason,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import type {
  ObservationCoverageGetOutput,
  ObservationEvidenceItemView,
  ObservationOutcome,
  ObservationQueriedRecord,
  ObservationSourceClass,
} from "@molis-ai/molis-work-contracts/services/observation";

const PRESENTED_FACTS = new Set([
  "ui.opportunity.presented",
  "ui.suggestion.presented",
  "assistant.opportunity.presented",
  "assistant.suggestion.presented",
]);

const VIEWED_FACTS = new Set([
  "ui.opportunity.viewed",
  "ui.suggestion.viewed",
  "ui.view.opened",
]);

const SELECTED_FACTS = new Set([
  "ui.opportunity.selected",
  "ui.suggestion.selected",
  "ui.action.triggered",
]);

const ADOPTED_FACTS = new Set([
  "ui.outcome.adopted",
  "ui.suggestion.adopted",
]);

const MODIFIED_AFTER_ADOPTION_FACTS = new Set([
  "ui.outcome.modified_after_adoption",
  "ui.adoption.modified",
]);

const UNDONE_OR_REWORKED_FACTS = new Set([
  "ui.outcome.undone",
  "ui.outcome.reworked",
  "ui.action.undone",
]);

export function computeFunnelCounts(records: readonly ObservationQueriedRecord[]): EvaluationFunnelCounts {
  let presented = 0;
  let viewed = 0;
  let selected = 0;
  let executed = 0;
  let completed = 0;
  let adopted = 0;
  let modifiedAfterAdoption = 0;
  let undoneOrReworked = 0;
  for (const record of records) {
    if (PRESENTED_FACTS.has(record.fact) || record.stage === "presented") presented += 1;
    if (VIEWED_FACTS.has(record.fact) || record.stage === "viewed") viewed += 1;
    if (SELECTED_FACTS.has(record.fact) || record.stage === "selected") selected += 1;
    const isExecution = (record.fact === "action.call" && record.detail.operation !== "query")
      || record.fact.startsWith("agent.")
      || record.stage === "executed";
    if (isExecution) {
      executed += 1;
      if (record.outcome === "succeeded") completed += 1;
    } else if (record.stage === "completed" && record.outcome === "succeeded") {
      completed += 1;
    }
    if (ADOPTED_FACTS.has(record.fact) || record.stage === "adopted" || record.detail.adopted === true) {
      adopted += 1;
    }
    if (
      MODIFIED_AFTER_ADOPTION_FACTS.has(record.fact)
      || record.stage === "modified_after_adoption"
      || record.detail.modified_after_adoption === true
    ) {
      modifiedAfterAdoption += 1;
    }
    if (
      UNDONE_OR_REWORKED_FACTS.has(record.fact)
      || record.stage === "undone"
      || record.stage === "reworked"
      || record.detail.undone === true
      || record.detail.reworked === true
    ) {
      undoneOrReworked += 1;
    }
  }
  return {
    presented,
    viewed,
    selected,
    executed,
    completed,
    adopted,
    modified_after_adoption: modifiedAfterAdoption,
    undone_or_reworked: undoneOrReworked,
  };
}

export function extractObservedConditions(records: readonly ObservationQueriedRecord[]): EvaluationObservedConditions {
  const platformSet = new Set<string>();
  const modelMap = new Map<string, { readonly provider: string; readonly model_id: string }>();
  const skillMap = new Map<string, { readonly id: string; readonly version: string }>();
  const plugins: Record<string, string> = {};
  const sourceSet = new Set<ObservationSourceClass>();
  for (const record of records) {
    sourceSet.add(record.source_class);
    platformSet.add(record.conditions.platform_version);
    if (record.conditions.model) {
      const key = `${record.conditions.model.provider}:${record.conditions.model.model_id}`;
      modelMap.set(key, { provider: record.conditions.model.provider, model_id: record.conditions.model.model_id });
    }
    for (const skill of record.conditions.skills ?? []) {
      const textVersion = String(skill.version);
      skillMap.set(`${skill.id}:${textVersion}`, { id: skill.id, version: textVersion });
    }
    if (record.conditions.plugin) {
      plugins[record.conditions.plugin.id] = record.conditions.plugin.version;
    }
  }
  return {
    platform_versions: Array.from(platformSet).sort(),
    models: Array.from(modelMap.values()),
    skills: Array.from(skillMap.values()),
    plugins,
    record_count: records.length,
    source_classes: Array.from(sourceSet),
  };
}

export function countWorkOutcomes(records: readonly ObservationQueriedRecord[]): Readonly<Partial<Record<ObservationOutcome, number>>> {
  const counts: Partial<Record<ObservationOutcome, number>> = {};
  for (const record of records) {
    counts[record.outcome] = (counts[record.outcome] ?? 0) + 1;
  }
  return counts;
}

export function deriveRunCoverageUnknowns(
  coverage: ObservationCoverageGetOutput,
  sample: EvaluationSampleView,
  evaluatedAt: string,
): {
  readonly unknownReasons: readonly EvaluationUnknownReason[];
  readonly limitations: readonly string[];
} {
  const reasons = new Set<EvaluationUnknownReason>();
  const limitations: string[] = [];
  if (sample.window?.observation_cutoff_at) {
    const cutoffMs = Date.parse(sample.window.observation_cutoff_at);
    const evalMs = Date.parse(evaluatedAt);
    if (!Number.isNaN(cutoffMs) && !Number.isNaN(evalMs) && evalMs < cutoffMs) {
      reasons.add("window_incomplete");
      limitations.push(`观察窗口尚未结束（需至 ${sample.window.observation_cutoff_at}）`);
    }
  }
  if (coverage.recording.state === "paused") {
    reasons.add("coverage_gap_paused");
    limitations.push("工作记录当前处于暂停状态");
  }
  for (const gap of coverage.gaps) {
    if (gap.state === "expired") {
      reasons.add("coverage_gap_expired");
      limitations.push(`覆盖缺口：${gap.owner}/${gap.fact} 因到期清理缺失（${gap.count} 条）`);
    } else if (gap.state === "purged") {
      reasons.add("coverage_gap_purged");
      limitations.push(`覆盖缺口：${gap.owner}/${gap.fact} 因插件数据清除缺失（${gap.count} 条）`);
    } else if (gap.state === "lost" || gap.state === "unavailable") {
      reasons.add("coverage_gap_lost");
      limitations.push(`覆盖缺口：${gap.owner}/${gap.fact} 发生记录丢失或不可用（${gap.reason}）`);
    } else if (gap.state === "by_rule" && gap.reason === "recording_paused") {
      reasons.add("coverage_gap_paused");
      limitations.push(`覆盖缺口：窗口内曾暂停记录（${gap.started_at} 至 ${gap.ended_at}）`);
    }
  }
  for (const entry of coverage.entries) {
    if (entry.state === "expired" && !reasons.has("coverage_gap_expired")) {
      reasons.add("coverage_gap_expired");
      limitations.push(`覆盖状态：${entry.owner}/${entry.fact} 存在到期清理`);
    } else if (entry.state === "purged" && !reasons.has("coverage_gap_purged")) {
      reasons.add("coverage_gap_purged");
      limitations.push(`覆盖状态：${entry.owner}/${entry.fact} 已清除插件数据`);
    } else if (entry.state === "lost" && !reasons.has("coverage_gap_lost")) {
      reasons.add("coverage_gap_lost");
      limitations.push(`覆盖状态：${entry.owner}/${entry.fact} 存在丢失记录`);
    }
  }
  return { unknownReasons: Array.from(reasons), limitations };
}

export function buildEvidencePointers(
  record: ObservationQueriedRecord,
  items: readonly ObservationEvidenceItemView[] | undefined,
): readonly EvaluationEvidencePointer[] {
  if (!items || items.length === 0) {
    return [{
      record_id: record.record_id,
      seq: record.seq,
      fact: record.fact,
      occurred_at: record.occurred_at,
      outcome: record.outcome,
      source_class: record.source_class,
    }];
  }
  return items.map((item): EvaluationEvidencePointer => {
    const base: EvaluationEvidencePointer = {
      record_id: record.record_id,
      seq: record.seq,
      fact: record.fact,
      occurred_at: record.occurred_at,
      outcome: record.outcome,
      source_class: record.source_class,
      role: item.role,
    };
    if (item.status === "available") return { ...base, snapshot: item.ref };
    if (item.status === "owner_ref") return { ...base, owner_ref: item.ref, owner_resolvable: item.owner_resolvable };
    return { ...base, missing_reason: item.reason };
  });
}

export function unknownReasonForMissingEvidence(reason: string): EvaluationUnknownReason {
  if (reason === "expired") return "coverage_gap_expired";
  if (reason === "purged") return "coverage_gap_purged";
  return "evidence_missing";
}
