import type { DatabaseSync } from "node:sqlite";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  type ObservationCoverageEntryView,
  type ObservationCoverageGapView,
  type ObservationCoverageGetInput,
  type ObservationCoverageGetOutput,
  type ObservationEntry,
  type ObservationEvidence,
  type ObservationEvidenceGetInput,
  type ObservationEvidenceGetOutput,
  type ObservationEvidenceItemView,
  type ObservationOutcome,
  type ObservationQueriedRecord,
  type ObservationQueryInput,
  type ObservationQueryOutput,
  type ObservationRecord,
  type ObservationSourceClass,
  type ObservationSubject,
  type ObservationSubjectResolution,
} from "@molis-ai/molis-work-contracts/services/observation";
import {
  authorizeObservationScope,
  authorizeObservationUse,
  authorizeRecordProject,
  coverageProjectFilter,
  recordsProjectFilter,
} from "./access.js";
import { classifyCoverageKind, classifyRecordKind, classifyScopeGroup } from "./classification.js";
import { OBSERVATION_COVERAGE_PLAN } from "./coverage-plan.js";
import { observationErrors } from "./errors.js";
import { snapshotText } from "./evidence.js";
import type { ObservationKeys } from "./keys.js";
import { readStoredSettings, recordingStateOf } from "./management-state.js";
import { rowsAs, type CoverageGapRow, type CoverageRow } from "./queries.js";
import type { ObservationEnvironment } from "./records.js";
import type { ObservationWriter } from "./writer.js";

const SIMULATED_SOURCE_CLASSES = ["demo", "replay", "trial", "system_check"] as const;
const LATE_ARRIVAL_LAG_MS = 5_000;

interface StoredRecordRow {
  readonly seq: number;
  readonly record_id: string;
  readonly owner_kind: "plugin" | "service" | "shell";
  readonly owner_id: string | null;
  readonly fact: string;
  readonly provider_id: string | null;
  readonly stage: string | null;
  readonly outcome: ObservationOutcome;
  readonly actor_id: string;
  readonly actor_kind: "user" | "runtime" | null;
  readonly audience: string;
  readonly delegated_by: string | null;
  readonly entry: ObservationEntry;
  readonly project_id: string | null;
  readonly install_id: string | null;
  readonly occurred_at: string;
  readonly received_at: string;
  readonly clock_adjusted: number;
  readonly call_id: string | null;
  readonly invocation_id: string | null;
  readonly parent_invocation_id: string | null;
  readonly runtime_session_id: string | null;
  readonly run_id: string | null;
  readonly work_ref: string | null;
  readonly source_class: ObservationSourceClass;
  readonly subjects: string;
  readonly conditions: string;
  readonly detail: string;
  readonly evidence: string;
  readonly coalesced_count: number | null;
  readonly coalesced_last_at: string | null;
}

const optional = <K extends string, V>(key: K, value: V | null): { [P in K]?: V } => (value === null ? {} : { [key]: value }) as { [P in K]?: V };

function parseQueryTimestamp(raw: string, endOfDay = false): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    const expanded = endOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
    const ms = Date.parse(expanded);
    if (!Number.isFinite(ms)) throw observationErrors.invalid_query("日期格式无效");
    return new Date(ms).toISOString();
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) throw observationErrors.invalid_query("时间格式无效");
  return new Date(ms).toISOString();
}

function openForRead(writer: ObservationWriter): { db: DatabaseSync; keys: ObservationKeys } {
  writer.flush();
  const opened = writer.database();
  if (!opened) throw observationErrors.store_unavailable("工作记录库当前不可用");
  return opened;
}

function toObservationRecord(row: StoredRecordRow): ObservationRecord {
  return {
    record_id: row.record_id,
    owner: row.owner_kind === "shell" ? { kind: "shell" } : { kind: row.owner_kind, id: row.owner_id! } as ObservationRecord["owner"],
    fact: row.fact,
    ...optional("stage", row.stage),
    outcome: row.outcome,
    actor: {
      actor_id: row.actor_id,
      actor_kind: row.actor_kind,
      audience: row.audience,
      ...optional("delegated_by", row.delegated_by),
    },
    entry: row.entry,
    project_id: row.project_id,
    ...optional("install_id", row.install_id),
    subjects: JSON.parse(row.subjects) as readonly ObservationSubject[],
    occurred_at: row.occurred_at,
    received_at: row.received_at,
    ...(row.clock_adjusted ? { clock_adjusted: true as const } : {}),
    work: {
      call_id: row.call_id,
      ...optional("invocation_id", row.invocation_id),
      ...optional("parent_invocation_id", row.parent_invocation_id),
      ...optional("runtime_session_id", row.runtime_session_id),
      ...optional("run_id", row.run_id),
      ...optional("work_ref", row.work_ref),
    },
    source_class: row.source_class,
    conditions: JSON.parse(row.conditions),
    detail: JSON.parse(row.detail),
    evidence: JSON.parse(row.evidence),
    ...(row.coalesced_count ? { coalesced: { count: row.coalesced_count, last_at: row.coalesced_last_at! } } : {}),
  };
}

export interface ReadActionDeps {
  readonly env: ObservationEnvironment;
  readonly writer: ObservationWriter;
}

export async function handleRecordsQuery(
  deps: ReadActionDeps,
  caller: ActionCallContext,
  input: ObservationQueryInput,
): Promise<ObservationQueryOutput> {
  const { db } = openForRead(deps.writer);
  const stored = readStoredSettings(db);
  const effectiveUse = authorizeObservationUse(caller, input.use, stored);
  const scope = await authorizeObservationScope(deps.env, caller, input);
  const projFilter = recordsProjectFilter(scope);

  const sinceIso = input.since !== undefined ? parseQueryTimestamp(input.since, false) : undefined;
  const untilIso = input.until !== undefined ? parseQueryTimestamp(input.until, true) : undefined;
  if (sinceIso !== undefined && untilIso !== undefined && Date.parse(sinceIso) > Date.parse(untilIso)) {
    throw observationErrors.invalid_query("查询起始时间不能晚于结束时间");
  }

  const baseWhere: string[] = [];
  const baseParams: (string | number)[] = [];
  if (projFilter.sql) { baseWhere.push(projFilter.sql); baseParams.push(...projFilter.params); }

  for (const key of ["work_ref", "call_id", "invocation_id", "runtime_session_id", "run_id", "fact", "owner_kind", "owner_id", "entry", "actor_id"] as const) {
    const val = input[key];
    if (val !== undefined) { baseWhere.push(`${key} = ?`); baseParams.push(val); }
  }
  if (input.outcomes && input.outcomes.length > 0) {
    baseWhere.push(`outcome IN (${input.outcomes.map(() => "?").join(", ")})`);
    baseParams.push(...input.outcomes);
  }
  if (input.source_classes && input.source_classes.length > 0) {
    baseWhere.push(`source_class IN (${input.source_classes.map(() => "?").join(", ")})`);
    baseParams.push(...input.source_classes);
  } else if (input.include_simulated === false || (input.include_simulated !== true && effectiveUse === "assistant")) {
    baseWhere.push(`source_class NOT IN (${SIMULATED_SOURCE_CLASSES.map(() => "?").join(", ")})`);
    baseParams.push(...SIMULATED_SOURCE_CLASSES);
  }
  if (sinceIso !== undefined) { baseWhere.push("occurred_at >= ?"); baseParams.push(sinceIso); }
  if (untilIso !== undefined) { baseWhere.push("occurred_at <= ?"); baseParams.push(untilIso); }
  if (input.platform_version !== undefined) {
    baseWhere.push("json_extract(conditions, '$.platform_version') = ?");
    baseParams.push(input.platform_version);
  }
  if (input.subject !== undefined) {
    const subConds = ["json_extract(s.value, '$.kind') = ?"];
    const subParams: (string | number)[] = [input.subject.kind];
    if (input.subject.id !== undefined) {
      subConds.push("json_extract(s.value, '$.id') = ?");
      subParams.push(input.subject.id);
    }
    if (input.subject.version !== undefined) {
      subConds.push("CAST(json_extract(s.value, '$.version') AS TEXT) = ?");
      subParams.push(String(input.subject.version));
    }
    baseWhere.push(`EXISTS (SELECT 1 FROM json_each(records.subjects) AS s WHERE ${subConds.join(" AND ")})`);
    baseParams.push(...subParams);
  }

  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const kindFilter = input.kinds && input.kinds.length > 0 ? new Set(input.kinds) : undefined;
  const emptyKinds = input.kinds !== undefined && input.kinds.length === 0;

  let maxSeenOccurredAt: string | null = null;
  if (input.after_seq !== undefined && input.after_seq > 0) {
    const prevWhere = projFilter.sql ? `WHERE seq <= ? AND ${projFilter.sql}` : "WHERE seq <= ?";
    maxSeenOccurredAt = (db.prepare(`SELECT MAX(occurred_at) AS latest FROM records ${prevWhere}`)
      .get(input.after_seq, ...projFilter.params) as { latest: string | null } | undefined)?.latest ?? null;
  }

  const collected: Array<{ row: StoredRecordRow; base: ObservationRecord; kind: ObservationQueriedRecord["kind"]; late: boolean }> = [];
  if (!emptyKinds) {
    let cursor = input.after_seq ?? 0;
    const batchSize = kindFilter ? Math.max(limit * 2, 200) : limit + 1;
    while (collected.length <= limit) {
      const stepWhere = ["seq > ?", ...baseWhere];
      const rows = rowsAs<StoredRecordRow>(
        db.prepare(`SELECT * FROM records WHERE ${stepWhere.join(" AND ")} ORDER BY seq LIMIT ?`).all(cursor, ...baseParams, batchSize),
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        cursor = row.seq;
        const base = toObservationRecord(row);
        const operation = typeof base.detail.operation === "string" ? base.detail.operation : undefined;
        const kind = classifyRecordKind({
          owner_kind: row.owner_kind,
          owner_id: row.owner_id,
          fact: row.fact,
          entry: row.entry,
          audience: row.audience,
          source_class: row.source_class,
          provider_id: row.provider_id,
          ...(operation ? { operation } : {}),
        });
        const lagLate = Date.parse(row.received_at) - Date.parse(row.occurred_at) > LATE_ARRIVAL_LAG_MS;
        const outOfOrderLate = maxSeenOccurredAt !== null && row.occurred_at < maxSeenOccurredAt;
        if (maxSeenOccurredAt === null || row.occurred_at > maxSeenOccurredAt) maxSeenOccurredAt = row.occurred_at;
        if (kindFilter && !kindFilter.has(kind)) continue;
        collected.push({ row, base, kind, late: lagLate || outOfOrderLate });
        if (collected.length > limit) break;
      }
      if (rows.length < batchSize) break;
    }
  }

  const has_more = collected.length > limit;
  const page = has_more ? collected.slice(0, limit) : collected;
  const next_seq = page.length > 0 ? page.at(-1)!.row.seq : null;

  const records: ObservationQueriedRecord[] = [];
  for (const item of page) {
    let subject_status: ObservationSubjectResolution[] | undefined;
    if (input.resolve_subjects === true) {
      subject_status = [];
      for (const subject of item.base.subjects) {
        const status = deps.env.resolveSubject
          ? await deps.env.resolveSubject(item.row.project_id, subject, caller)
          : "unverified";
        subject_status.push({ ...subject, status });
      }
    }
    records.push({
      ...item.base,
      seq: item.row.seq,
      kind: item.kind,
      late: item.late,
      ...(subject_status ? { subject_status } : {}),
    });
  }

  return {
    records,
    next_seq,
    has_more,
    recording: recordingStateOf(db, stored, projFilter),
  };
}

export async function handleEvidenceGet(
  deps: ReadActionDeps,
  caller: ActionCallContext,
  input: ObservationEvidenceGetInput,
): Promise<ObservationEvidenceGetOutput> {
  const { db, keys } = openForRead(deps.writer);
  const stored = readStoredSettings(db);
  const effectiveUse = authorizeObservationUse(caller, input.use, stored);
  const isPerson = caller.audience === "user" && caller.actor_id === LOCAL_PERSON_ACTOR_ID && !caller.delegated_by;
  if (!isPerson && caller.project_id === null) {
    throw observationErrors.forbidden("非项目上下文的调用不能读取工作记录证据");
  }

  const row = db.prepare("SELECT record_id, project_id, source_class, evidence FROM records WHERE record_id = ?")
    .get(input.record_id) as { record_id: string; project_id: string | null; source_class: ObservationSourceClass; evidence: string } | undefined;
  if (!row) {
    throw observationErrors.not_found("找不到这条工作记录");
  }
  await authorizeRecordProject(deps.env, caller, row.project_id);

  if (effectiveUse === "assistant" && (SIMULATED_SOURCE_CLASSES as readonly string[]).includes(row.source_class)) {
    throw observationErrors.forbidden("模拟、演示或回放记录的证据不供主动助理使用");
  }

  const parsed = JSON.parse(row.evidence) as readonly ObservationEvidence[];
  const filtered = input.role !== undefined ? parsed.filter((item) => item.role === input.role) : parsed;
  const items: ObservationEvidenceItemView[] = [];

  for (const item of filtered) {
    if (item.ref.kind === "missing") {
      items.push({ role: item.role, status: "missing", reason: item.ref.reason, ref: item.ref });
      continue;
    }
    if (item.ref.kind === "owner") {
      const owner_resolvable = deps.env.resolveSubject
        ? await deps.env.resolveSubject(row.project_id, { kind: item.ref.owner, id: item.ref.id, version: item.ref.version }, caller)
        : "unverified";
      items.push({ role: item.role, status: "owner_ref", ref: item.ref, owner_resolvable });
      continue;
    }
    // `snapshot`:
    const hasBlob = db.prepare("SELECT 1 FROM evidence_blobs WHERE digest = ?").get(item.ref.digest) !== undefined;
    if (!hasBlob) {
      items.push({ role: item.role, status: "missing", reason: "expired", ref: item.ref });
      continue;
    }
    try {
      const text = snapshotText(db, keys, item.ref.digest);
      if (text === undefined) {
        items.push({ role: item.role, status: "missing", reason: "expired", ref: item.ref });
      } else {
        items.push({
          role: item.role,
          status: "available",
          ref: item.ref,
          text,
          media_type: item.ref.media_type,
          bytes: item.ref.bytes,
          ...(item.ref.redacted ? { redacted: true as const } : {}),
        });
      }
    } catch {
      items.push({ role: item.role, status: "missing", reason: "not_obtained", ref: item.ref });
    }
  }

  return {
    record_id: row.record_id,
    items,
  };
}

export async function handleCoverageGet(
  deps: ReadActionDeps,
  caller: ActionCallContext,
  input: ObservationCoverageGetInput,
): Promise<ObservationCoverageGetOutput> {
  const { db } = openForRead(deps.writer);
  const stored = readStoredSettings(db);
  authorizeObservationUse(caller, input.use, stored);
  const scope = await authorizeObservationScope(deps.env, caller, input);
  const covFilter = coverageProjectFilter(scope);
  const recFilter = recordsProjectFilter(scope);

  const sinceIso = input.since !== undefined ? parseQueryTimestamp(input.since, false) : undefined;
  const untilIso = input.until !== undefined ? parseQueryTimestamp(input.until, true) : undefined;
  if (sinceIso !== undefined && untilIso !== undefined && Date.parse(sinceIso) > Date.parse(untilIso)) {
    throw observationErrors.invalid_query("查询起始时间不能晚于结束时间");
  }

  const covWhere: string[] = [];
  const covParams: (string | number)[] = [];
  if (covFilter.sql) { covWhere.push(covFilter.sql); covParams.push(...covFilter.params); }
  if (input.platform_version !== undefined) { covWhere.push("since_version = ?"); covParams.push(input.platform_version); }

  const measuredRows = rowsAs<CoverageRow & { updated_at: string }>(
    db.prepare(`
      SELECT owner, fact, entry, project_id, state, since, since_version, reason, truncated, redacted, by_rule, updated_at
      FROM coverage
      ${covWhere.length ? `WHERE ${covWhere.join(" AND ")}` : ""}
      ORDER BY owner, fact, entry, project_id
    `).all(...covParams),
  );

  const recording = recordingStateOf(db, stored, recFilter);
  const nowIso = deps.env.now().toISOString();
  const baselineSince = recording.complete_since ?? recording.earliest_record_at ?? nowIso;
  const defaultProjectId = scope.kind === "single" ? scope.project_id : "";

  const seenKeys = new Set<string>();
  const entries: ObservationCoverageEntryView[] = [];
  for (const row of measuredRows) {
    const key = `${row.owner}\u0000${row.fact}\u0000${row.entry}`;
    seenKeys.add(key);
    entries.push({
      owner: row.owner,
      fact: row.fact,
      entry: row.entry,
      project_id: row.project_id,
      kind: classifyCoverageKind(row.owner, row.fact, row.entry),
      scope_group: classifyScopeGroup(row.owner, row.entry),
      state: row.state,
      since: row.since,
      since_version: row.since_version,
      reason: row.reason,
      truncated: row.truncated,
      redacted: row.redacted,
      by_rule: row.by_rule,
      updated_at: row.updated_at,
    });
  }

  if (input.platform_version === undefined || input.platform_version === deps.env.platformVersion) {
    for (const plan of OBSERVATION_COVERAGE_PLAN) {
      for (const entry of plan.entries) {
        const key = `${plan.owner}\u0000${plan.fact}\u0000${entry}`;
        if (seenKeys.has(key)) continue;
        entries.push({
          owner: plan.owner,
          fact: plan.fact,
          entry,
          project_id: defaultProjectId,
          kind: classifyCoverageKind(plan.owner, plan.fact, entry),
          scope_group: classifyScopeGroup(plan.owner, entry),
          state: plan.state,
          since: baselineSince,
          since_version: deps.env.platformVersion,
          reason: plan.reason ?? null,
          truncated: 0,
          redacted: 0,
          by_rule: 0,
          updated_at: baselineSince,
        });
      }
    }
  }

  const gapWhere: string[] = [];
  const gapParams: (string | number)[] = [];
  if (covFilter.sql) { gapWhere.push(covFilter.sql); gapParams.push(...covFilter.params); }
  if (sinceIso !== undefined) { gapWhere.push("ended_at >= ?"); gapParams.push(sinceIso); }
  if (untilIso !== undefined) { gapWhere.push("started_at <= ?"); gapParams.push(untilIso); }

  const gapRows = rowsAs<CoverageGapRow & { gap_id: number }>(
    db.prepare(`
      SELECT gap_id, owner, fact, entry, project_id, state, started_at, ended_at, count, reason
      FROM coverage_gaps
      ${gapWhere.length ? `WHERE ${gapWhere.join(" AND ")}` : ""}
      ORDER BY gap_id DESC
    `).all(...gapParams),
  );

  const allGaps: ObservationCoverageGapView[] = gapRows.map((row) => ({
    gap_id: row.gap_id,
    owner: row.owner,
    fact: row.fact,
    entry: row.entry,
    project_id: row.project_id,
    kind: classifyCoverageKind(row.owner, row.fact, row.entry),
    scope_group: classifyScopeGroup(row.owner, row.entry),
    state: row.state,
    started_at: row.started_at,
    ended_at: row.ended_at,
    count: row.count,
    reason: row.reason,
  }));

  const scopeFilter = input.scope_filter && input.scope_filter !== "all" ? input.scope_filter : undefined;
  const filteredEntries = scopeFilter ? entries.filter((item) => item.scope_group === scopeFilter) : entries;
  const filteredGaps = scopeFilter
    ? allGaps.filter((item) => item.owner === "observation" && item.fact === "*" || item.scope_group === scopeFilter)
    : allGaps;

  const actWhere: string[] = [];
  const actParams: (string | number)[] = [];
  if (recFilter.sql) { actWhere.push(recFilter.sql); actParams.push(...recFilter.params); }
  if (sinceIso !== undefined) { actWhere.push("occurred_at >= ?"); actParams.push(sinceIso); }
  if (untilIso !== undefined) { actWhere.push("occurred_at <= ?"); actParams.push(untilIso); }
  if (input.platform_version !== undefined) {
    actWhere.push("json_extract(conditions, '$.platform_version') = ?");
    actParams.push(input.platform_version);
  }
  const totalRecords = (db.prepare(`SELECT COUNT(*) AS count FROM records ${actWhere.length ? `WHERE ${actWhere.join(" AND ")}` : ""}`)
    .get(...actParams) as { count: number } | undefined)?.count ?? 0;

  const recCountSql = recFilter.sql ? `WHERE ${recFilter.sql}` : "";
  const covVersionFilter = scope.kind === "single" ? { sql: "project_id = ?", params: [scope.project_id] } : covFilter;
  const covVersionRows = rowsAs<{ v: string | null }>(
    db.prepare(`SELECT DISTINCT since_version AS v FROM coverage ${covVersionFilter.sql ? `WHERE ${covVersionFilter.sql}` : ""}`).all(...covVersionFilter.params),
  );
  const recVersionRows = rowsAs<{ v: string | null }>(
    db.prepare(`SELECT DISTINCT json_extract(conditions, '$.platform_version') AS v FROM records ${recCountSql}`).all(...recFilter.params),
  );
  const versionSet = new Set<string>();
  for (const row of [...covVersionRows, ...recVersionRows]) if (row.v) versionSet.add(row.v);
  if (versionSet.size === 0 || scope.kind !== "single") versionSet.add(deps.env.platformVersion);

  return {
    recording,
    entries: filteredEntries,
    gaps: filteredGaps,
    versions: [...versionSet].sort(),
    activity_summary: {
      has_records: totalRecords > 0,
      total_records: totalRecords,
      has_gaps: filteredGaps.length > 0,
    },
  };
}
