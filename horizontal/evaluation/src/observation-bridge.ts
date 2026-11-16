import type {
  ActionCallContext,
  ActionClient,
  ActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  EVALUATION_PROVIDER_ID,
  type EvaluationSampleInput,
  type EvaluationSampleView,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import {
  OBSERVATION_PROVIDER_ID,
  observationActions,
  type ObservationCoverageGetOutput,
  type ObservationEvidenceGetOutput,
  type ObservationEvidenceItemView,
  type ObservationHoldPutResult,
  type ObservationHoldReleaseResult,
  type ObservationQueriedRecord,
  type ObservationQueryInput,
  type ObservationQueryOutput,
} from "@molis-ai/molis-work-contracts/services/observation";

function obsRef(action: { readonly capability_id: string; readonly version: number }): ActionReference {
  return { capability_id: action.capability_id, version: action.version, provider_id: OBSERVATION_PROVIDER_ID };
}

export function effectiveQueryForSample(
  sample: Pick<EvaluationSampleView, "project_id" | "query" | "window">,
  extra?: Partial<ObservationQueryInput>,
): ObservationQueryInput {
  return {
    ...sample.query,
    ...(sample.query.project_id === undefined && !sample.query.all_projects && sample.project_id !== undefined
      ? { project_id: sample.project_id }
      : {}),
    ...(sample.query.since === undefined && sample.window?.since ? { since: sample.window.since } : {}),
    ...(sample.query.until === undefined && sample.window?.until ? { until: sample.window.until } : {}),
    ...extra,
    use: "evaluation",
  };
}

export async function queryAllObservationRecords(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  query: ObservationQueryInput,
): Promise<readonly ObservationQueriedRecord[]> {
  // `limit` is the caller's explicit ceiling. Without one, read the whole sample instead of silently stopping at the
  // observation action's page size: a large work is still one work, and a truncated prefix must not pass (PWA-51, OCL-14).
  const maxTotal = query.limit ?? Number.POSITIVE_INFINITY;
  const collected: ObservationQueriedRecord[] = [];
  let afterSeq = query.after_seq;
  while (collected.length < maxTotal) {
    const remaining = maxTotal - collected.length;
    const pageLimit = Number.isFinite(remaining) ? Math.min(500, remaining) : 500;
    const page = await client.invoke(nestedCaller, obsRef(observationActions.recordsQuery), {
      ...query,
      ...(afterSeq !== undefined ? { after_seq: afterSeq } : {}),
      limit: pageLimit,
      use: "evaluation",
    }) as ObservationQueryOutput;
    collected.push(...page.records);
    if (!page.has_more || page.next_seq === null || page.records.length === 0) break;
    afterSeq = page.next_seq;
  }
  return collected;
}

export async function fetchObservationEvidenceMap(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  records: readonly ObservationQueriedRecord[],
): Promise<ReadonlyMap<string, readonly ObservationEvidenceItemView[]>> {
  const map = new Map<string, readonly ObservationEvidenceItemView[]>();
  for (const record of records) {
    if (record.evidence.length === 0) continue;
    const out = await client.invoke(nestedCaller, obsRef(observationActions.evidenceGet), {
      record_id: record.record_id,
      use: "evaluation",
    }) as ObservationEvidenceGetOutput;
    map.set(record.record_id, out.items);
  }
  return map;
}

export async function readObservationCoverage(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  sample: Pick<EvaluationSampleView, "project_id" | "query" | "window">,
): Promise<ObservationCoverageGetOutput> {
  const coverageInput = {
    use: "evaluation" as const,
    ...(sample.query.all_projects
      ? { all_projects: true }
      : sample.project_id !== undefined
        ? { project_id: sample.project_id }
        : sample.query.project_id !== undefined
          ? { project_id: sample.query.project_id }
          : { all_projects: true }),
    ...(sample.window?.since ?? sample.query.since ? { since: sample.window?.since ?? sample.query.since } : {}),
    ...(sample.window?.until ?? sample.query.until ? { until: sample.window?.until ?? sample.query.until } : {}),
  };
  return await client.invoke(nestedCaller, obsRef(observationActions.coverageGet), coverageInput) as ObservationCoverageGetOutput;
}

export async function resolveSampleHoldRecordIds(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  sample: Pick<EvaluationSampleInput, "project_id" | "query" | "window" | "pinned_record_ids">,
): Promise<readonly string[]> {
  if (sample.pinned_record_ids !== undefined) {
    if (sample.pinned_record_ids.length === 0) {
      await readObservationCoverage(client, nestedCaller, sample);
    }
    return sample.pinned_record_ids;
  }
  const records = await queryAllObservationRecords(client, nestedCaller, effectiveQueryForSample(sample));
  return records.map((r) => r.record_id);
}

export async function commitEvaluationSampleHold(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  sample: Pick<EvaluationSampleInput, "sample_id" | "version" | "title" | "project_id" | "hold_expires_at">,
  recordIds: readonly string[],
): Promise<{ readonly holdId: string | null; readonly heldCount: number }> {
  if (recordIds.length === 0) {
    return { holdId: null, heldCount: 0 };
  }
  const holdId = `eval:${sample.sample_id}:v${sample.version}`;
  const result = await client.invoke(nestedCaller, obsRef(observationActions.holdsPut), {
    hold_id: holdId,
    sample_id: `${sample.sample_id}@${sample.version}`,
    owner: EVALUATION_PROVIDER_ID,
    note: `评测样本留存：${sample.title}`,
    ...(sample.project_id !== undefined ? { project_id: sample.project_id } : {}),
    ...(sample.hold_expires_at !== undefined ? { expires_at: sample.hold_expires_at } : {}),
    record_ids: recordIds,
  }) as ObservationHoldPutResult;
  return { holdId: result.hold.hold_id, heldCount: result.hold.active_record_count };
}

export async function releaseEvaluationSampleHolds(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  holdIds: readonly string[],
): Promise<readonly string[]> {
  const releasedHoldIds: string[] = [];
  for (const holdId of holdIds) {
    const res = await client.invoke(nestedCaller, obsRef(observationActions.holdsRelease), { hold_id: holdId }) as ObservationHoldReleaseResult;
    releasedHoldIds.push(...res.released_hold_ids);
  }
  return releasedHoldIds;
}
