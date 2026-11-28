import type {
  EvaluationEvidencePointer,
  EvaluationFunnelCounts,
  EvaluationObservedConditions,
  EvaluationSampleView,
  EvaluationUnknownReason,
  EvaluationWorkMode,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import {
  OBSERVATION_SERVICE_PREFIXES,
  type ObservationCoverageGetOutput,
  type ObservationEvidenceItemView,
  type ObservationOutcome,
  type ObservationQueriedRecord,
  type ObservationService,
  type ObservationSourceClass,
} from "@molis-ai/molis-work-contracts/services/observation";

/**
 * Declared owner & mode classification helpers shared by funnel attribution, action-command inspection,
 * and delivery-source checks. Defaults preserve existing evaluation semantics while avoiding scattered literals.
 */
export const DEFAULT_BUSINESS_WORK_SERVICES: ReadonlySet<ObservationService> = new Set<ObservationService>(["assistant"]);
export const ACTION_COMMAND_SERVICE: ObservationService = "gateway";
export const AGENT_DELIVERY_SERVICE: ObservationService = "agent";
export const REPLY_EXPECTED_WORK_MODES: ReadonlySet<EvaluationWorkMode> = new Set<EvaluationWorkMode>(["assistant"]);

export function isBusinessWorkOwner(
  owner: ObservationQueriedRecord["owner"],
  services: ReadonlySet<ObservationService> = DEFAULT_BUSINESS_WORK_SERVICES,
): boolean {
  return owner.kind === "plugin" || (owner.kind === "service" && services.has(owner.id));
}

export function isActionCommandRecord(
  record: ObservationQueriedRecord,
  service: ObservationService = ACTION_COMMAND_SERVICE,
): boolean {
  return record.owner.kind === "service"
    && record.owner.id === service
    && record.fact === `${OBSERVATION_SERVICE_PREFIXES[service]}.call`
    && record.detail.operation === "command";
}

export function isAgentReplyRecord(record: ObservationQueriedRecord): boolean {
  return record.owner.kind === "service"
    && record.owner.id === AGENT_DELIVERY_SERVICE
    && record.fact === `${OBSERVATION_SERVICE_PREFIXES[AGENT_DELIVERY_SERVICE]}.reply`;
}

export function workModeExpectsReply(workMode: EvaluationWorkMode): boolean {
  return REPLY_EXPECTED_WORK_MODES.has(workMode);
}

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

export type FunnelStage = Exclude<keyof EvaluationFunnelCounts, "execution_basis">;

export function emptyFunnelSets(): Record<FunnelStage, Set<string>> {
  return {
    presented: new Set(), viewed: new Set(), selected: new Set(), executed: new Set(),
    completed: new Set(), adopted: new Set(), modified_after_adoption: new Set(), undone_or_reworked: new Set(),
  };
}

export function funnelCounts(sets: Record<FunnelStage, Set<string>>): EvaluationFunnelCounts {
  return {
    execution_basis: "owner_work", presented: sets.presented.size, viewed: sets.viewed.size,
    selected: sets.selected.size, executed: sets.executed.size, completed: sets.completed.size,
    adopted: sets.adopted.size, modified_after_adoption: sets.modified_after_adoption.size,
    undone_or_reworked: sets.undone_or_reworked.size,
  };
}

export function collectFunnel(
  records: readonly ObservationQueriedRecord[],
  businessWorkServices: ReadonlySet<ObservationService> = DEFAULT_BUSINESS_WORK_SERVICES,
): Record<FunnelStage, Set<string>> {
  const stages = emptyFunnelSets();
  for (const record of records) {
    const owner = [record.project_id, record.install_id, record.owner.kind, "id" in record.owner ? record.owner.id : null];
    const work = record.work.work_ref;
    const businessOwner = isBusinessWorkOwner(record.owner, businessWorkServices);
    if (businessOwner && work && (record.stage === "executed" || record.stage === "completed")) {
      const key = JSON.stringify([...owner, work]);
      if (record.outcome === "succeeded" || record.stage === "executed" && record.outcome === "failed") stages.executed.add(key);
      if (record.stage === "completed" && record.outcome === "succeeded") stages.completed.add(key);
    }
    if (record.outcome !== "succeeded" && record.outcome !== "waiting") continue;
    const stageKeys = record.subjects.length ? record.subjects.map(s => [s.kind, s.id, s.version]) : [null];
    const add = (stage: FunnelStage) => {
      if (!work && !record.detail.receipt_id) {
        stages[stage].add(record.record_id);
        return;
      }
      for (const subject of stageKeys) {
        stages[stage].add(JSON.stringify([...owner, work, record.detail.receipt_id ?? null, subject]));
      }
    };
    if (PRESENTED_FACTS.has(record.fact) || record.stage === "presented") add("presented");
    if (VIEWED_FACTS.has(record.fact) || record.stage === "viewed") add("viewed");
    if (record.outcome !== "succeeded") continue;
    if (SELECTED_FACTS.has(record.fact) || record.stage === "selected" || (record.fact === "ui.candidates" && record.stage === "chosen")) add("selected");
    if (ADOPTED_FACTS.has(record.fact) || record.stage === "adopted" || record.detail.adopted === true) add("adopted");
    if (MODIFIED_AFTER_ADOPTION_FACTS.has(record.fact) || record.stage === "modified_after_adoption" || record.detail.modified_after_adoption === true) add("modified_after_adoption");
    if (UNDONE_OR_REWORKED_FACTS.has(record.fact) || record.stage === "undone" || record.stage === "reworked" || record.detail.undone === true || record.detail.reworked === true) add("undone_or_reworked");
  }
  return stages;
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
  const since = sample.query.since ?? sample.window?.since;
  const until = sample.query.until ?? sample.window?.until;
  const untilMs = until && /^\d{4}-\d{2}-\d{2}$/u.test(until) ? Date.parse(until + "T23:59:59.999Z") : Date.parse(until ?? evaluatedAt);
  const pausedAt = coverage.recording.paused_at;
  if (coverage.recording.state === "paused" && (!pausedAt || Date.parse(pausedAt) <= untilMs)
      && (!since || Date.parse(since) <= Date.parse(evaluatedAt))) {
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

export function unknownReasonForMissingEvidence(_reason: string): EvaluationUnknownReason {
  // A missing evidence snapshot is `evidence_missing`, even when the snapshot's own reason is expired or purged:
  // `coverage_gap_*` is for missing records, not for an existing record whose snapshot cannot be unsealed (design §4.2).
  return "evidence_missing";
}
