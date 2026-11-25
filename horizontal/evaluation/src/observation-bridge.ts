import {
  actionResultSubject,
  type ActionCallContext,
  type ActionClient,
  type ActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  EVALUATION_PROVIDER_ID,
  type EvaluationSampleInput,
  type EvaluationRunView,
  type EvaluationSampleView,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import {
  OBSERVATION_PROVIDER_ID,
  observationActions,
  type ObservationCoverageGetOutput,
  type ObservationEvidenceGetOutput,
  type ObservationEvidenceItemView,
  type ObservationHoldPutResult,
  type ObservationHoldView,
  type ObservationHoldListOutput,
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

/**
 * Read identities from the records an attempt actually cited. The caller's current observation scope and evaluation-use
 * grant apply on every page, including to a replay. A sample can be removed and registered again under the same ID and
 * version, so its current pins, and the accumulated sample hold, cannot supply missing members of a historical attempt.
 */
export async function readRunFunnelEvidence(client: ActionClient, caller: ActionCallContext, runs: readonly EvaluationRunView[]) {
  const members = new Map(runs.map(run => [run.run_id, new Set(run.replay?.replay_record_ids
    ?? run.expectation_results.flatMap(expectation => expectation.evidence_refs.map(ref => ref.record_id)))]));
  const ids = [...new Set([...members.values()].flatMap(batch => [...batch]))];
  const found = new Map<string, ObservationQueriedRecord>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    const page = await client.invoke(caller, obsRef(observationActions.recordsQuery), {
      record_ids: batch, limit: batch.length, use: "evaluation", all_projects: true, include_simulated: true,
    } satisfies ObservationQueryInput) as ObservationQueryOutput;
    for (const row of page.records) found.set(row.record_id, row);
  }
  return new Map([...members].map(([id, ids]) => [id, [...ids].flatMap(key => found.get(key) ?? [])]));
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

export interface CommandReceipt {
  readonly kind: string;
  readonly id: string;
  readonly revision: string;
  readonly previousRevision?: number;
}

function jsonEvidence(items: readonly ObservationEvidenceItemView[], role: string): unknown {
  const item = items.find(entry => entry.role === role);
  if (item?.status !== "available" || item.redacted || item.media_type !== "application/json") return;
  try { return JSON.parse(item.text); } catch { return; }
}

/** Interpret only an already retained success against its own provider's versioned result declaration. */
export async function readRetryReceipts(clientFor: (caller: ActionCallContext) => ActionClient, caller: ActionCallContext,
  records: readonly ObservationQueriedRecord[], evidenceByRecord: ReadonlyMap<string, readonly ObservationEvidenceItemView[]>): Promise<Map<string, CommandReceipt>> {
  const receipts = new Map<string, CommandReceipt>();
  const commands = records.filter(r => r.owner.kind === "service" && r.owner.id === "gateway" && r.fact === "action.call" && r.detail.operation === "command");
  const failures = commands.filter(r => r.outcome === "failed" || r.outcome === "refused");
  for (const record of commands) {
    if (record.outcome !== "succeeded" || !record.provider_id || !failures.some(failed => failed.project_id === record.project_id
      && failed.work.call_id === record.work.call_id && failed.detail.action === record.detail.action && failed.provider_id === record.provider_id)) continue;
    const action = typeof record.detail.action === "string" && /^(.+)@(\d+)$/u.exec(record.detail.action);
    if (!action) continue;
    const scoped = { ...caller, project_id: record.project_id };
    const reference = { capability_id: action[1]!, version: Number(action[2]), provider_id: record.provider_id };
    const view = await clientFor(scoped).discoverOne(scoped, reference);
    if (!view?.action.result_subject) continue;
    const items = evidenceByRecord.get(record.record_id) ?? [];
    const result = actionResultSubject(view.action, undefined, jsonEvidence(items, "result"));
    if (!result?.revision) continue;
    const input = jsonEvidence(items, "input");
    const previousRevision = typeof input === "object" && input && "id" in input && input.id === result.subject.id
      && "expected_revision" in input && typeof input.expected_revision === "number" ? input.expected_revision : undefined;
    receipts.set(record.record_id, { ...result.subject, revision: result.revision, previousRevision });
  }
  return receipts;
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
    ...(sample.query.since ?? sample.window?.since ? { since: sample.query.since ?? sample.window?.since } : {}),
    ...(sample.query.until ?? sample.window?.until ? { until: sample.query.until ?? sample.window?.until } : {}),
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

export const sampleHoldTarget = (sampleId: string, version: number, holdId = `eval:${sampleId}:v${version}`) => ({
  hold_id: holdId, owner: EVALUATION_PROVIDER_ID, sample_id: `${sampleId}@${version}`,
});

export async function readSampleHold(client: ActionClient, caller: ActionCallContext, sample: Pick<EvaluationSampleView, "sample_id" | "version">): Promise<ObservationHoldView | undefined> {
  const target = sampleHoldTarget(sample.sample_id, sample.version);
  const result = await client.invoke(caller, obsRef(observationActions.holdsList), {
    sample_id: target.sample_id, include_expired: true,
  }) as ObservationHoldListOutput;
  return result.holds.find(hold => hold.owner === target.owner && hold.hold_id === target.hold_id);
}

export async function commitEvaluationSampleHold(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  target: ReturnType<typeof sampleHoldTarget>,
  details: Partial<Pick<ObservationHoldView, "note" | "project_id" | "expires_at">>,
  recordIds: readonly string[],
  append: boolean,
): Promise<ObservationHoldView> {
  const result = await client.invoke(nestedCaller, obsRef(observationActions.holdsPut), {
    ...target, require_same_identity: true, append_records: append, record_ids: recordIds,
    ...(details.note !== undefined ? { note: details.note } : {}),
    ...(details.project_id !== undefined ? { project_id: details.project_id } : {}),
    ...(details.expires_at !== undefined ? { expires_at: details.expires_at } : {}),
  }) as ObservationHoldPutResult;
  return result.hold;
}

export async function releaseEvaluationSampleHolds(
  client: ActionClient,
  nestedCaller: ActionCallContext,
  targets: readonly ReturnType<typeof sampleHoldTarget>[],
): Promise<readonly string[]> {
  const result = await client.invoke(nestedCaller, obsRef(observationActions.holdsRelease), { targets }) as ObservationHoldReleaseResult;
  return result.released_hold_ids;
}
