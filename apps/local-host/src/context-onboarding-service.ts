import { realpath } from "node:fs/promises";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError, type ActionDefinition, type BoundActionClient, type HostOfferedOriginalFile } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  ONBOARDING_DRAFT_GET_MAX, ONBOARDING_DRAFT_KEEP_MAX, ONBOARDING_DRAFT_MATERIALS_MAX, ONBOARDING_DRAFT_PART_CHARS,
  type OnboardingDraftBatch, type OnboardingDraftGetInput, type OnboardingDraftInput, type OnboardingDraftKeepInput,
} from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import type { Readable } from "node:stream";
import { fencedMaterials, instructed, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ONBOARDING_NOTES, ONBOARDING_PROPOSAL } from "./agent-definitions/system-prompts.js";
import { createHash, randomUUID } from "node:crypto";
import {
  withContextJourneys,
  type CallTiming,
  type ContextJourney,
  type ContextReference,
  type ImportFile,
} from "./context-onboarding-store.js";
import { codeRoot, contextFilePath, contextSources, readContextSource } from "./context-onboarding-sources.js";
import {
  classifyContextModelFailure,
  commitHeldSecretDecision,
  computeScopeDelta,
  deduplicateSelectedReferences,
  mergeSourceIncrementally,
  prepareHeldSecretDecision,
  readScopePathTags,
  stageHeldSecretDecision,
} from "./context-onboarding-delta.js";
import { importAdoptedMaterialsAndSummary } from "./context-onboarding-adopt.js";
import {
  diskFull,
  dropStagedNotes,
  hasStagedText,
  isStagedDigest,
  readStagedNote,
  readStagedText,
  removeJourneyStaging,
  stageContextUpload,
  stageNote,
  stagedFileSize,
  stagedJourneyIds,
} from "./context-onboarding-staging.js";
import type { PeriodicTasks } from "./periodic-tasks.js";
import { ONBOARDING_TEXT_MODEL_MISSING, onboardingTextModel, type TextModelPort } from "./configured-text-port.js";
import type { HostTextCommitResult } from "./host-complete-text.js";
import { prepareContextDocument } from "./context-onboarding-documents.js";
import { readOnboardingSessions, sessionKeyOf } from "./context-onboarding-sessions.js";
import { partTitle, textParts } from "./context-onboarding-parts.js";
import { ARTIFACTS_PLUGIN_ID } from "@molis-ai/molis-work-module-artifacts";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { assertOnboardingWritable, completeMolisWorkOnboarding } from "./onboarding.js";
import { descriptionFromSummary, setProjectDescription } from "./project-arrival.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostLog } from "./host-log.js";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ONBOARDING_TAKE_MATERIALS_MAX, type OnboardingCodeRootTake, type OnboardingTakeResult } from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import type { OnboardingMaterialKind, OnboardingTaker } from "./onboarding-takers.js";
import { withObservationSource } from "@molis-ai/molis-work-service-observation";

export interface ContextOnboardingPorts {
  withCatalog: LocalWebCatalogRunner;
  /** The person's actions in the new project; with `original_file`, for one import that comes with a file the Host staged. */
  actions?: (home: string, projectId: string, original_file?: HostOfferedOriginalFile) => Promise<BoundActionClient>;
  /** The person's call of one taker's own declared Home action (drafts are made before the project exists), with its permissions only. */
  takeAtHome?: (definition: ActionDefinition, signal: AbortSignal) => BoundActionClient;
  model?: (home: string) => Promise<TextModelPort<string>>;
  readSource?: typeof readContextSource;
  /**
   * The actions of an existing project's AI (not the person): the round reads the external sessions filed to that project through them,
   * so the project's AI read permit decides (batch 35 item 1, sessions-rebuild contract design §7.4). None offered without it.
   */
  sessions?: (home: string, projectId: string, signal: AbortSignal) => Promise<BoundActionClient>;
  /** The plugins that declare they take a kind of onboarding material (`onboardingTakers`, contract-design §2.5); none offered without it. */
  takers?: (kind: OnboardingMaterialKind) => readonly OnboardingTaker[];
  /** The person's call of one taker's own declared action in the new project, with that action's permissions only (§7.7 C1). */
  take?: (home: string, projectId: string, definition: ActionDefinition) => Promise<BoundActionClient>;
}

// The local Host is the single writer. Persistent checkpoints survive restarts;
// these maps prevent duplicate runs in the current process and cancel superseded organize passes (ONB-45, C8, C11).
const running = new Map<string, Promise<void>>();
const controllers = new Map<string, AbortController>();
const key = (home: string, id: string) => home + ":" + id;
const STALE_EPOCH = Symbol("stale_epoch");

export function readContextJourney(home: string, id: string): ContextJourney {
  const journey = withContextJourneys(home, store => store.get(id));
  if (journey.staging_removed && journey.phase !== "complete") {
    journey.requires_reselection = true;
    journey.error = "这轮整理超过 30 天没有继续，暂存的文件已清理以腾出空间。原记录已保留，请重新选择资料开始一轮整理。";
    return journey;
  }
  if (journey.oauth_status === "pending" && Date.now() > (journey.oauth_expires_at ?? Date.parse(journey.updated_at) + 10 * 60_000)) {
    journey.oauth_status = "failed"; journey.auto_start = false;
    journey.error = "Google 授权已过期，已选材料仍在。请重新连接，或跳过 Gmail。";
    withContextJourneys(home, store => store.save(journey));
  }
  if (["reading", "adopting"].includes(journey.phase) && !running.has(key(home, id))) {
    journey.phase = "failed";
    journey.error = journey.adoption ? "项目保存已中断，确认的内容仍在。可以继续保存。" : "上次整理已中断，已读取的材料仍在。可以继续。";
    withContextJourneys(home, store => store.save(journey));
  }
  return journey;
}

const IDLE_STAGING_MS = 30 * 24 * 60 * 60_000;
/**
 * What onboarding keeps on disk for rounds that will not use it (user 2026-10-22): the staging of a round left unfinished for 30
 * days (its files can be gigabytes), of a finished round whose cleanup did not go through, and of one whose record is gone. A
 * round's record stays; opened again, it asks for its files to be chosen anew. Rounds running in this process are left alone.
 */
export async function removeIdleJourneyStaging(home: string, now = Date.now()): Promise<number> {
  let removed = 0;
  for (const { id, modified_ms } of await stagedJourneyIds(home)) {
    if (running.has(key(home, id))) continue;
    const journey = withContextJourneys(home, store => { try { return store.find(id); } catch { return undefined; } });
    if (journey === undefined) continue; // not a round's id: not this store's directory to remove
    const idle = now - (journey ? Date.parse(journey.updated_at) : modified_ms) >= IDLE_STAGING_MS;
    if (journey?.phase !== "complete" && !idle) continue;
    await removeJourneyStaging(home, id); removed++;
    if (journey && journey.phase !== "complete") { journey.staging_removed = true; withContextJourneys(home, store => store.save(journey)); }
  }
  return removed;
}
/** The cleanup above, when the Host starts and every six hours. */
export function registerOnboardingStagingCleanup(home: string, periodic: PeriodicTasks): void {
  const run = () => removeIdleJourneyStaging(home);
  periodic.every({ id: "onboarding-staging-cleanup", title: "清理超过 30 天未继续的开始使用暂存", owner: "onboarding", intervalMs: 6 * 60 * 60_000, run,
    onError: error => hostLog.warn("onboarding", "staging_cleanup_failed", error) });
  void run().catch(error => hostLog.warn("onboarding", "staging_cleanup_failed", error));
}

export function selectContextSources(home: string, id: string, input: Record<string, unknown>): ContextJourney {
  const journey = readContextJourney(home, id);
  if (journey.requires_reselection) throw new Error(journey.error!);
  if (journey.phase !== "selecting" || journey.adoption) throw new Error("整理已经开始；请返回清单调整范围");
  journey.sources = contextSources(input.sources).map(next => {
    const previous = journey.sources.find(s => s.kind === next.kind);
    return mergeSourceIncrementally(previous, next);
  });
  journey.scope_delta = computeScopeDelta(journey);
  if (journey.summary && journey.scope_delta && (journey.scope_delta.added_count > 0 || journey.scope_delta.removed_count > 0)) {
    journey.stale_summary = { title: journey.summary.title, body: journey.summary.body, at: journey.updated_at, model: journey.model };
    journey.summary = null;
  }
  journey.auto_start = input.auto_start === true;
  journey.previewed = input.previewed === true;
  // Which plugin drafts, when several declare it (contract-design §2.5); kept by its id and checked against the takers when the round runs.
  if (typeof input.drafts_taker === "string" && input.drafts_taker.length <= 200) journey.drafts_taker = input.drafts_taker;
  if (journey.oauth_status === "pending" && !journey.sources.some(s => s.kind === "gmail" && s.selected)) {
    journey.oauth_status = "cancelled"; journey.auto_start = false;
  }
  return withContextJourneys(home, store => store.save(journey));
}

/**
 * Records the person's explicit choice (`strip` | `raw` | `exclude`) for a held secret-like file (`C2`, `S-onboarding-secret-hold`).
 * Unapproved secret-like files never enter `references` or model synthesis; `"strip"` stages variable names without values; `"raw"`
 * approves only that exact `(kind, path, sha256)` digest.
 */
export async function decideContextSecret(
  home: string,
  id: string,
  input: Record<string, unknown>,
  ports: ContextOnboardingPorts,
  guard?: { readonly signal?: AbortSignal; readonly beforeEffect?: () => Promise<void> | void },
): Promise<ContextJourney> {
  guard?.signal?.throwIfAborted();
  const sKey = typeof input.key === "string" && isStagedDigest(input.key) ? input.key : "";
  const decision = input.decision === "strip" || input.decision === "raw" || input.decision === "exclude" ? input.decision : null;
  if (!sKey || !decision) throw new Error("密钥处理选项无效");
  const snapshot = readContextJourney(home, id);
  if (snapshot.requires_reselection) throw new Error(snapshot.error!);
  if (snapshot.adoption || snapshot.phase === "complete") throw new Error("当前正在保存或已经采用，不能更改来源");
  const { prepared } = await prepareHeldSecretDecision(home, snapshot, sKey, decision, guard?.signal);
  guard?.signal?.throwIfAborted();
  await guard?.beforeEffect?.();
  const staged = prepared ? await stageHeldSecretDecision(home, id, prepared) : undefined;
  const k = key(home, id);
  const wasRunning = running.has(k);
  if (wasRunning) {
    controllers.get(k)?.abort();
    controllers.delete(k);
    running.delete(k);
  }
  const journey = wasRunning ? withContextJourneys(home, store => store.get(id)) : readContextJourney(home, id);
  if (journey.staging_removed && journey.phase !== "complete") {
    journey.requires_reselection = true;
    journey.error = "这轮整理超过 30 天没有继续，暂存的文件已清理以腾出空间。原记录已保留，请重新选择资料开始一轮整理。";
  }
  if (journey.requires_reselection) throw new Error(journey.error!);
  if (journey.adoption || journey.phase === "complete") throw new Error("当前正在保存或已经采用，不能更改来源");
  journey.epoch = (journey.epoch ?? 0) + 1;
  commitHeldSecretDecision(journey, sKey, decision, staged);
  const selected = journey.sources.filter(s => s.selected);
  const remainingHeld = selected.some(s => (s.held_secrets?.length ?? 0) > 0 || (s.reading?.held_secrets?.length ?? 0) > 0);
  const hasReadable = selected.some(s => (s.references?.length ?? 0) > 0 || !s.references);
  const reorganize = wasRunning || (input.reorganize !== false && journey.phase !== "selecting" && (
    decision === "strip" || decision === "raw" || (decision === "exclude" && journey.phase === "failed" && !remainingHeld && hasReadable)
  ));
  if (reorganize && journey.summary) {
    journey.stale_summary = { title: journey.summary.title, body: journey.summary.body, at: journey.updated_at, model: journey.model };
    journey.summary = null;
    journey.phase = "failed";
  } else if (!reorganize && decision === "exclude" && journey.phase === "failed" && !remainingHeld && !hasReadable) {
    journey.error = "已排除疑似密钥文件；当前没有其余可读材料，请返回调整来源或直接创建空白项目。";
    journey.failure_kind = null;
  }
  withContextJourneys(home, store => store.save(journey));
  return reorganize ? startContextJourney(home, id, ports) : readContextJourney(home, id);
}

/**
 * One file the person chose, sent as the raw body while the round is still being chosen: staged in the journey under its digest,
 * any size. The selection then names it by that digest; its bytes never pass through the selection or the journey's row.
 */
export async function stageContextFile(home: string, id: string, path: unknown, body: Readable | Buffer): Promise<{ path: string; staged: string; size_bytes: number }> {
  const journey = readContextJourney(home, id);
  if (journey.requires_reselection) throw new Error(journey.error!);
  if (journey.phase !== "selecting" || journey.adoption) throw new Error("整理已经开始；请返回清单调整范围");
  const name = contextFilePath(path);
  const staged = await stageContextUpload(home, id, body).catch(error => {
    throw diskFull(error) ? new Error("磁盘空间不足，这份文件没有存下。腾出空间后再上传。") : error;
  });
  return { path: name, staged: staged.sha256, size_bytes: staged.size_bytes };
}
/** The whole text read out of one of this round's materials (the cite dialog shows it); only a material of this journey. */
export async function contextReferenceText(home: string, id: string, sha256: string): Promise<string> {
  const journey = readContextJourney(home, id);
  const refs = [...journey.summary?.references ?? [], ...journey.sources.flatMap(s => [...(s.references ?? []), ...(s.reused_references ?? [])])];
  const ref = isStagedDigest(sha256) ? refs.find(r => r.text?.sha256 === sha256) : undefined;
  if (!ref) throw new Error("找不到这份材料的正文");
  return readStagedText(home, id, ref.text);
}

/**
 * Returns a round to source selection (`ONB-40`, `ONB-45`, `C8`, `C11`):
 * - Refuses only when adoption is already accepted/saving or the project is complete.
 * - When `organize()` is actively running in `reading`, cancels the active pass and bumps `epoch` so any late response from the
 *   cancelled pass is discarded and never overwrites the new scope.
 */
export function reopenContextJourney(home: string, id: string): ContextJourney {
  const existing = withContextJourneys(home, store => store.get(id));
  if (existing.adoption || existing.phase === "complete") throw new Error("当前正在保存或已经采用，不能更改来源");
  const k = key(home, id);
  if (running.has(k)) {
    controllers.get(k)?.abort();
    controllers.delete(k);
    running.delete(k);
  }
  const journey = readContextJourney(home, id);
  if (journey.adoption || journey.phase === "complete") throw new Error("当前正在保存或已经采用，不能更改来源");
  journey.epoch = (journey.epoch ?? 0) + 1;
  journey.phase = "selecting";
  journey.error = null;
  journey.failure_kind = null;
  journey.auto_start = false;
  return withContextJourneys(home, store => store.save(journey));
}

export function startContextJourney(home: string, id: string, ports: ContextOnboardingPorts): ContextJourney {
  const k = key(home, id);
  if (running.has(k)) return readContextJourney(home, id);
  const journey = readContextJourney(home, id);
  if (journey.requires_reselection) throw new Error(journey.error!);
  if (journey.phase === "complete" || (journey.phase === "review" && journey.summary)) return journey;
  if (journey.adoption) throw new Error("已确认项目内容，请继续保存项目");
  if (!journey.sources.some(s => s.selected)) throw new Error("请选择至少一个来源，或创建空白项目");
  const runEpoch = (journey.epoch ?? 0) + 1;
  journey.epoch = runEpoch;
  if (journey.summary) {
    journey.stale_summary = { title: journey.summary.title, body: journey.summary.body, at: journey.updated_at, model: journey.model };
  }
  journey.phase = "reading";
  journey.summary = null;
  journey.error = null;
  journey.failure_kind = null;
  journey.late_ignored = null;
  journey.auto_start = false;
  journey.needs_model = false;
  withContextJourneys(home, store => store.save(journey));
  const working = structuredClone(journey);
  const controller = new AbortController();
  controllers.set(k, controller);
  const job = Promise.resolve()
    .then(() => organize(home, working, runEpoch, controller.signal, ports))
    .finally(() => {
      if (running.get(k) === job) running.delete(k);
      if (controllers.get(k) === controller) controllers.delete(k);
    });
  running.set(k, job);
  return journey;
}

export async function waitContextJourney(home: string, id: string): Promise<ContextJourney> {
  await running.get(key(home, id)); return readContextJourney(home, id);
}

/** The person's AI tool sessions as a source's files, through the Host's reader of them (BL-177); refused when this Host has none. */
async function readSessionsSource(home: string, journey: ContextJourney, ports: ContextOnboardingPorts, signal: AbortSignal) {
  if (!ports.sessions) throw new Error("这里读不了外部会话");
  const read = await readOnboardingSessions(await ports.sessions(home, journey.project_id, signal), signal);
  if ("refused" in read) throw new Error(read.refused);
  return read;
}

async function organize(home: string, journey: ContextJourney, runEpoch: number, signal: AbortSignal, ports: ContextOnboardingPorts): Promise<void> {
  const isCurrent = () => {
    const latest = withContextJourneys(home, store => store.find(journey.id));
    return Boolean(latest && (latest.epoch ?? 0) === runEpoch);
  };
  const save = () => {
    if (!isCurrent()) throw STALE_EPOCH;
    return withContextJourneys(home, store => store.save(journey));
  };
  let reachedModel = false;
  try {
    // Bytes, not files, say how far reading has come (2026-10-22): one large file can be most of the wait. Staged files are counted
    // from the disk before reading starts, what the Host reads itself (mail, pasted text) as it is read; every pass counts again,
    // so a restart never counts a file twice.
    const stagedSize = (file: ImportFile) => file.staged ? stagedFileSize(home, journey.id, file.staged) : Promise.resolve(0);
    const bytes = journey.reading_bytes = { done: 0, total: 0 };
    for (const source of journey.sources.filter(s => s.selected)) {
      if (source.references) { const read = source.references.reduce((sum, ref) => sum + ref.original.size_bytes, 0); bytes.done += read; bytes.total += read; }
      else for (const file of source.files ?? []) bytes.total += await stagedSize(file);
    }
    save();
    // Reading is a queue: one file at a time, each saved as it is read, so a restart resumes after the last one (no limits, 2026-10-22).
    for (const source of journey.sources.filter(s => s.selected)) {
      signal.throwIfAborted();
      if (source.references) continue;
      // A new project has no sessions filed to it and no permit yet: the person chose them for the step after the project is made.
      if (source.kind === "sessions" && !journey.existing) continue;
      source.error = undefined; save();
      try {
        const sessions = source.kind === "sessions" ? await readSessionsSource(home, journey, ports, signal) : null;
        const titles: Record<string, string> = sessions?.titles ?? {};
        const input = sessions ?? await (ports.readSource ?? readContextSource)(home, source);
        signal.throwIfAborted();
        const reusedByPath = new Map((source.reused_references ?? []).map(r => [r.path, r]));
        const reading = source.reading?.total === input.files.length
          ? source.reading
          : { done: 0, total: input.files.length, references: [], issues: [], held_secrets: [] };
        const counted = Boolean(source.files?.length);
        const sizeOf = async (file: ImportFile) => { if (counted) return stagedSize(file); const size = file.bytes?.length ?? 0; bytes.total += size; return size; };
        for (const file of input.files.slice(0, reading.done)) bytes.done += await sizeOf(file);
        source.reading = reading; save();
        // The checkpoint is written every 100 files or every second, whichever comes first: the row holds every reference so far, so a
        // write per file would cost the square of the file count. A restart reads those few files again, which staging makes cheap.
        let saved = Date.now();
        for (const file of input.files.slice(reading.done)) {
          signal.throwIfAborted();
          const prevRef = !file.bytes && !file.reason ? reusedByPath.get(file.path) : undefined;
          const canReuse = prevRef
            && (!file.staged || prevRef.original.sha256 === file.staged)
            && await hasStagedText(home, journey.id, prevRef.text);
          if (canReuse && prevRef) {
            reading.references.push(prevRef);
          } else {
            const read = await prepareContextDocument(home, journey.id, source.kind, file, signal, journey.secret_decisions);
            const session = source.kind === "sessions" ? sessionKeyOf(file.path) : null;
            if ("reference" in read && session) Object.assign(read.reference, { session_key: session, title: titles[file.path] ?? read.reference.title });
            if ("reference" in read) reading.references.push(read.reference);
            else if ("secret_hold" in read) (reading.held_secrets ??= []).push(read.secret_hold);
            else if ("issue" in read) reading.issues.push(read.issue);
          }
          bytes.done += await sizeOf(file); reading.done++;
          if (reading.done % 100 === 0 || Date.now() - saved >= 1000) { save(); saved = Date.now(); }
        }
        source.references = reading.references;
        source.issues = reading.issues;
        source.skipped = reading.issues.length;
        source.held_secrets = reading.held_secrets?.length ? reading.held_secrets : undefined;
        source.reused_references = undefined;
        source.reading = undefined;
        source.files = undefined;
        source.text = undefined;
      } catch (error) {
        if (error === STALE_EPOCH || signal.aborted) throw error;
        // The disk is full: the whole round stops at this file, and 继续整理 goes on from it.
        if (diskFull(error)) throw new Error("磁盘空间不足，已读取的材料仍在。腾出空间后点「继续整理」，会从这份文件接着读。");
        source.error = error instanceof Error ? error.message : "读取失败，请重试";
      }
      save();
    }
    bytes.done = bytes.total;
    const selectedSources = journey.sources.filter(s => s.selected);
    journey.last_read_paths = readScopePathTags(selectedSources);
    const unique = deduplicateSelectedReferences(selectedSources);
    save();
    if (!unique.length) {
      // The sessions were the round's material and could not be read (the permit is off, say): the organizing does not run, and says why.
      const refused = selectedSources.find(s => s.kind === "sessions" && s.error);
      if (refused && journey.existing) throw new Error(refused.error);
      if (selectedSources.some(s => s.held_secrets?.length)) {
        throw new Error("检测到疑似密钥文件，默认未发送给模型；请先选择只发变量名、不发或原样发送。");
      }
      throw new Error("还没有读到正文，请检查来源范围后重试");
    }
    const ai = await onboardingTextModel(home, ports.model);
    signal.throwIfAborted();
    journey.model = ai.runtimeLabel ?? null; save();
    if (!ai.completeText) { journey.needs_model = true; throw new Error(ai.unavailableReason ?? ONBOARDING_TEXT_MODEL_MISSING); }
    reachedModel = true;
    // Drafts come from the same materials, beside the overview; a failure there never stops the overview.
    const drafts = draftFromMaterials(home, journey, unique, signal, ports, save);
    const answer = await summarizeContext(home, unique, ai, journey, signal, save);
    await drafts;
    signal.throwIfAborted();
    if (!isCurrent()) throw STALE_EPOCH;
    answer.validateResult();
    const parsed = parseContextSummary(answer.value, unique);
    const citedLabels = new Set(parsed.references.filter(r => r.used_in_summary).map(r => r.label));
    for (const source of selectedSources) {
      for (const ref of source.references ?? []) {
        ref.used_in_summary = !ref.duplicate_of && citedLabels.has(ref.label);
      }
    }
    journey.summary = parsed;
    journey.stale_summary = null;
    journey.scope_delta = null;
    journey.failure_kind = null;
    journey.phase = "review";
    journey.error = null;
    save();
  } catch (error) {
    if (error === STALE_EPOCH || !isCurrent()) {
      // Late response from a superseded scope/model pass is discarded and noted without touching the current round (ONB-45, C11).
      if (reachedModel) {
        withContextJourneys(home, store => {
          const cur = store.find(journey.id);
          if (cur && (cur.epoch ?? 0) !== runEpoch && cur.phase !== "complete") {
            cur.late_ignored = { at: new Date().toISOString(), model: journey.model ?? null };
            store.save(cur);
          }
        });
      }
      return;
    }
    if (signal.aborted) return;
    // Whole characters, not UTF-16 units: unit 600 can fall inside a two-unit character. The first slice bounds what is spread.
    journey.phase = "failed";
    journey.failure_kind = classifyContextModelFailure(error, journey.needs_model === true);
    journey.error = error instanceof Error ? [...error.message.slice(0, 1_200)].slice(0, 600).join("") : "整理失败，材料已保留";
    withContextJourneys(home, store => {
      const cur = store.find(journey.id);
      if (cur && (cur.epoch ?? 0) === runEpoch) store.save(journey);
    });
  }
}

type Evidence = { body: string; labels: string[]; title?: string; part?: number };
const BATCH_LIMIT = 80_000;
/** A batch's note is at most 8,000 characters of at most 80,000 in: a round's notes are about a tenth of its input until measured. */
const NOTE_SHRINK = 0.1;

/** A model call, its time added to the phase's: the page divides the rest by the calls done to say how long it may take. */
async function timedCall<T>(timing: CallTiming, call: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await call();
  timing.ms += Date.now() - started; timing.calls++;
  return result;
}
/** Calls still to come: the rest of this round, the rounds its notes will make (each about `shrink` of the one before), the final one. */
function summaryCallsLeft(total: number, completed: number, shrink: number): number {
  let left = total - completed + 1;
  for (let next = Math.ceil(total * shrink); next > 1; next = Math.ceil(next * shrink)) left += next;
  return left;
}

/** Every material's text, in parts of at most 12,000 characters, read from the journey's staging one material at a time. */
async function* materialEvidence(home: string, id: string, references: ContextReference[]): AsyncGenerator<Evidence> {
  for (const ref of references) {
    const body = await readStagedText(home, id, ref.text);
    let offset = 0, part = 1;
    while (offset < body.length) {
      const end = cutHead(body, Math.min(offset + 12_000, body.length)).length;
      yield { labels: [ref.label], title: ref.title, part: part++, body: body.slice(offset, end) };
      offset = end;
    }
  }
}
async function* noteEvidence(home: string, id: string, notes: { labels: string[]; key: string }[]): AsyncGenerator<Evidence> {
  for (const note of notes) yield { labels: note.labels, body: (await readStagedNote(home, id, note.key)) ?? "" };
}
/** Consecutive evidence in batches whose serialized size stays within one model call. */
async function* batchesOf(items: AsyncIterable<Evidence>): AsyncGenerator<Evidence[]> {
  let batch: Evidence[] = [], size = 2;
  for await (const item of items) {
    const length = JSON.stringify(item).length + 1;
    if (length > BATCH_LIMIT) throw new Error("单份材料的标题信息过长，请缩短标题后重试；原文已保留。");
    if (batch.length && size + length > BATCH_LIMIT) { yield batch; batch = []; size = 2; }
    batch.push(item); size += length;
  }
  if (batch.length) yield batch;
}

/**
 * The summary, built in rounds of batches however much there is (no limits, 2026-10-22): the texts are read from staging as the
 * batches need them, each batch's note is staged under the batch's digest, and the checkpoint keeps only the round and counts.
 * A round that is one batch is the final proposal. Only bounded batches ever go to a model.
 */
async function summarizeContext(
  home: string,
  references: ContextReference[],
  ai: TextModelPort<HostTextCommitResult>,
  journey: ContextJourney,
  signal: AbortSignal,
  save: () => unknown,
): Promise<HostTextCommitResult> {
  const cacheKey = JSON.stringify([journey.model, references.map(r => [r.source_id, r.version, r.label])]);
  if (journey.synthesis?.key !== cacheKey || !Array.isArray(journey.synthesis.notes)) journey.synthesis = { key: cacheKey, stage: 1, completed: 0, total: 0, notes: [], batches: { done: 0, all: 0 }, timing: { ms: 0, calls: 0 } };
  const checkpoint = journey.synthesis;
  // Every call of the summary, done and to come: the rounds before this one, this one, and the estimated rest. Counted again on
  // every pass (notes staged by an earlier pass count as done without a call), so a restart never counts a batch twice.
  let before = 0, shrink = NOTE_SHRINK;
  const count = () => { checkpoint.batches = { done: before + checkpoint.completed, all: before + checkpoint.completed + summaryCallsLeft(checkpoint.total, checkpoint.completed, shrink) }; };
  // Registered instructions (editable in “Prompt 与 Character”), then this batch's materials, fenced under the fixed notice (S-13).
  const wrap = (instruction: InstructionPrompt, data: unknown) => instructed(instruction, fencedMaterials(data, "MATERIALS_" + randomUUID()));
  let evidence = () => materialEvidence(home, journey.id, references), stage = 1;
  for (;;) {
    signal.throwIfAborted();
    let total = 0;
    for await (const _ of batchesOf(evidence())) total++;
    if (total <= 1) break;
    checkpoint.stage = stage++; checkpoint.completed = 0; checkpoint.total = total; count(); save();
    const notes: { labels: string[]; key: string }[] = [];
    let inSize = 0, outSize = 0;
    for await (const batch of batchesOf(evidence())) {
      signal.throwIfAborted();
      const bKey = createHash("sha256").update(cacheKey + JSON.stringify(batch)).digest("hex");
      const labels = [...new Set(batch.flatMap(item => item.labels))];
      let note = await readStagedNote(home, journey.id, bKey);
      if (note === null) {
        const answer = await timedCall(checkpoint.timing, () => ai.completeText!(wrap(ONBOARDING_NOTES, batch), { signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]) }));
        signal.throwIfAborted();
        note = answer.value;
        parseContextSummary(note, references.filter(r => labels.includes(r.label)));
        if (note.length > 8_000) throw new Error("分批整理结果过长，请重试；已完成批次和原文已保留。");
        await stageNote(home, journey.id, bKey, note, () => {
          signal.throwIfAborted();
          answer.validateResult();
        });
        signal.throwIfAborted();
        checkpoint.notes.push(bKey);
      }
      notes.push({ labels, key: bKey }); inSize += JSON.stringify(batch).length; outSize += JSON.stringify({ labels, body: note }).length;
      checkpoint.completed++; shrink = Math.min(0.5, Math.max(0.02, outSize / inSize)); count(); save();
    }
    before += total;
    if (outSize >= inSize) {
      const keys = notes.map(note => note.key);
      await dropStagedNotes(home, journey.id, keys);
      checkpoint.notes = checkpoint.notes.filter(k => !keys.includes(k)); checkpoint.completed = 0; save();
      throw new Error("模型未能归纳长材料，请重试或更换模型；原文与此前完成的批次已保留。");
    }
    evidence = () => noteEvidence(home, journey.id, notes);
  }
  const final: Evidence[] = [];
  for await (const item of evidence()) final.push(item);
  signal.throwIfAborted();
  checkpoint.stage = stage; checkpoint.completed = 0; checkpoint.total = 1; checkpoint.batches = { done: before, all: before + 1 }; save();
  const result = await timedCall(checkpoint.timing, () => ai.completeText!(wrap(ONBOARDING_PROPOSAL, final), { signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]) }));
  signal.throwIfAborted();
  checkpoint.completed = 1; checkpoint.batches = { done: before + 1, all: before + 1 }; save();
  return result;
}

export function parseContextSummary(raw: string, references: ContextReference[]): NonNullable<ContextJourney["summary"]> {
  const parts = /^# ([^\r\n]{1,120})\r?\n([\s\S]+)$/u.exec(raw.trim());
  if (!parts || parts[2]!.length > 100_000) throw new Error("模型没有返回有效摘要，请重试。材料已保留。");
  const body = parts[2]!.trim(), labels = [...body.matchAll(/\[S(\d+)\]/gu)].map(m => "S" + m[1]);
  if (!labels.length || labels.some(label => !references.some(r => r.label === label))) throw new Error("摘要缺少有效来源，未采用模型结果。请重新整理。");
  const cited = new Set(labels);
  return { title: parts[1]!.trim(), body, references: references.map(r => ({ ...r, used_in_summary: cited.has(r.label) })) };
}

/**
/**
 * The taker of `kind` this round uses (contract-design §2.5): the only one, or the one the person chose among several. Undefined when
 * there is none, or several and no choice.
 */
export function chosenTaker(ports: Pick<ContextOnboardingPorts, "takers">, kind: OnboardingMaterialKind, chosen: string | undefined): OnboardingTaker | undefined {
  const takers = ports.takers?.(kind) ?? [];
  return takers.length === 1 ? takers[0] : takers.find(one => one.plugin_id === chosen);
}

/**
 * Every material for the drafts taker, which takes 50 materials a call and reads ONBOARDING_DRAFT_PART_CHARS characters of each:
 * long ones in parts of that size, so all of the text is read, 50 a batch.
 */
async function* draftBatches(home: string, id: string, references: ContextReference[]): AsyncGenerator<{ title: string; text: string }[]> {
  let batch: { title: string; text: string }[] = [];
  for (const ref of references) {
    const parts = textParts(await readStagedText(home, id, ref.text), ONBOARDING_DRAFT_PART_CHARS, "characters");
    for (const [index, text] of parts.entries()) {
      if (!text.trim()) continue;
      batch.push({ title: partTitle(ref.title, index + 1, parts.length, 200), text });
      if (batch.length === ONBOARDING_DRAFT_MATERIALS_MAX) { yield batch; batch = []; }
    }
  }
  if (batch.length) yield batch;
}
/**
 * Drafts from every material, beside the overview (user 2026-10-22: no 50-material cap), by the `drafts` taker: one call per batch,
 * each kept as it lands (the platform-shaped batch, as the page shows it), so a retry goes on after the last one; the batches' drafts are
 * one list to confirm. A failure never stops the overview; with no plugin that drafts, the round goes on without drafts.
 */
async function draftFromMaterials(
  home: string,
  journey: ContextJourney,
  references: ContextReference[],
  signal: AbortSignal,
  ports: ContextOnboardingPorts,
  save: () => unknown,
): Promise<void> {
  if (!ports.takeAtHome) return;
  // Batches belong to the materials they came from; after the person chose again, the drafts start over.
  const bKey = createHash("sha256").update(JSON.stringify(references.map(r => [r.source_id, r.version]))).digest("hex").slice(0, 16);
  const taker = chosenTaker(ports, "drafts", journey.drafts_taker);
  if (journey.drafts?.key === bKey && journey.drafts.status === "ready" && journey.drafts.plugin_id === (taker?.plugin_id ?? null)) return;
  let total = 0;
  for await (const _ of draftBatches(home, journey.id, references)) total++;
  const same = journey.drafts?.key === bKey && journey.drafts.plugin_id === taker?.plugin_id;
  if (!taker) { journey.drafts = { plugin_id: null, surface: null, status: "none", key: bKey, batches: [], total, error: null, timing: { ms: 0, calls: 0 } }; save(); return; }
  const drafts: NonNullable<ContextJourney["drafts"]> = journey.drafts = { plugin_id: taker.plugin_id, surface: taker.project_plugin_id, status: "pending", key: bKey,
    batches: same ? journey.drafts!.batches : [], total, error: null, timing: same ? journey.drafts!.timing : { ms: 0, calls: 0 } }; save();
  try {
    const completed = drafts.batches.length;
    if (total > completed) {
      let index = 0;
      for await (const materials of draftBatches(home, journey.id, references)) {
        signal.throwIfAborted();
        if (++index <= completed) continue;
        // Each batch keeps its own cancellation window.
        const client = ports.takeAtHome(taker.take, AbortSignal.any([signal, AbortSignal.timeout(20 * 60_000)]));
        // The journey id and the batch number make a retried pass return the same drafts instead of drafting twice.
        const { batch } = await timedCall(drafts.timing, () => client.invoke(taker.take as ActionDefinition<OnboardingDraftInput, { batch: OnboardingDraftBatch }>, { origin: "onboarding",
          title: total > 1 ? uiText.text("workbench.context-onboarding-service.todos-found-while-getting-started-batch-k-n", { k: index, n: total }) : uiText.text("workbench.context-onboarding-service.todos-found-while-getting-started"), request_id: `onboarding:${journey.id}:${bKey}:${index}`, materials }));
        drafts.batches.push({ batch_id: batch.batch_id, snapshot: batch }); save();
      }
    }
    drafts.status = "ready";
  } catch (error) {
    if (error === STALE_EPOCH || signal.aborted) return;
    // Whole characters, not UTF-16 units: unit 300 can fall inside a two-unit character. The first slice bounds what is spread.
    drafts.status = "failed"; drafts.error = error instanceof Error ? [...error.message.slice(0, 600)].slice(0, 300).join("") : "待办草稿没整理成";
  }
  save();
}

/**
 * The batches a journey kept without a snapshot (drafted before version 2), read again from their taker at Home by id, at most 50 a
 * call. Only answered, never written back: the journey is saved whole, and a write here would undo what an adoption saved meanwhile.
 */
export async function draftSnapshots(journey: ContextJourney, ports: Pick<ContextOnboardingPorts, "takers" | "takeAtHome">, signal: AbortSignal): Promise<ReadonlyMap<string, OnboardingDraftBatch>> {
  const missing = journey.drafts?.batches.filter(batch => !batch.snapshot).map(batch => batch.batch_id) ?? [];
  const taker = journey.drafts?.plugin_id ? ports.takers?.("drafts").find(one => one.plugin_id === journey.drafts!.plugin_id) : undefined;
  if (!missing.length || !taker?.drafts || !ports.takeAtHome) return new Map();
  const client = ports.takeAtHome(taker.drafts.get, signal), found = new Map<string, OnboardingDraftBatch>();
  for (let start = 0; start < missing.length; start += ONBOARDING_DRAFT_GET_MAX) {
    const { batches } = await client.invoke(taker.drafts.get as ActionDefinition<OnboardingDraftGetInput, { batches: OnboardingDraftBatch[] }>, { ids: missing.slice(start, start + ONBOARDING_DRAFT_GET_MAX) });
    for (const batch of batches) found.set(batch.batch_id, batch);
  }
  return found;
}

export async function adoptContextJourney(home: string, id: string, input: Record<string, unknown>, ports: ContextOnboardingPorts): Promise<ContextJourney> {
  if (running.has(key(home, id))) { await running.get(key(home, id)); return readContextJourney(home, id); }
  const journey = readContextJourney(home, id);
  if (journey.requires_reselection) throw new Error(journey.error!);
  if (journey.phase === "complete") return journey;
  if (!journey.adoption && input.blank !== true && !(journey.phase === "review" && journey.summary)
    && !(input.materials_only === true && journey.phase === "failed" && journey.sources.some(s => s.selected && s.references?.length))) throw new Error("请先完成整理");
  const title = journey.adoption?.title ?? (typeof input.title === "string" ? input.title.trim() : "");
  const body = journey.adoption?.body ?? (input.blank === true ? "" : typeof input.body === "string" ? input.body.trim() : journey.summary?.body ?? "");
  if (!title || [...title].length > 120 || body.length > 100_000) throw new Error("请输入 1–120 字的项目名称，摘要最多 100,000 字符");
  // The round ends by writing down that onboarding is done. A record this build may not replace refuses here, before the accepted text is
  // kept or anything is made: the person stays where they were, with no project left behind (upgrade-chain-design §2.6).
  assertOnboardingWritable(home);
  // Persist the accepted text before creating anything. A retry cannot overwrite
  // edits made later in Pages or change the adopted material set.
  // The materials and the summary are kept as documents by a plugin that declares it does (contract-design §2.5): with none, or several and
  // no choice, nothing is made and the person is told before the project exists.
  const chosen = journey.adoption?.documents ? undefined : chosenTaker(ports, "documents", typeof input.documents_taker === "string" ? input.documents_taker : undefined);
  const documents = journey.adoption?.documents ?? (chosen && { plugin_id: chosen.plugin_id, project_plugin_id: chosen.project_plugin_id });
  if (!documents) throw new Error((ports.takers?.("documents").length ?? 0) > 1 ? "请先选择用哪个插件保存文档" : "没有能保存文档的插件，项目没有建；装上一个能保存文档的插件后再继续");
  // Only drafts this round made can be kept, however many batches there were. A batch kept without a snapshot is read again first; when
  // that fails, what the person ticked in it is kept as ticked and the keep step answers for it.
  const kept = Array.isArray(input.keep) ? input.keep.filter((value): value is string => typeof value === "string") : [];
  let drafted: ReadonlySet<string> | null = new Set(journey.drafts?.batches.flatMap(batch => batch.snapshot?.candidates.map(candidate => candidate.candidate_id) ?? []) ?? []);
  if (!journey.adoption && kept.length && journey.drafts?.batches.some(batch => !batch.snapshot)) {
    const read = await draftSnapshots(journey, ports, AbortSignal.timeout(60_000)).catch(() => null);
    drafted = read ? new Set([...drafted, ...[...read.values()].flatMap(batch => batch.candidates.map(candidate => candidate.candidate_id))]) : null;
    if (running.has(key(home, id))) { await running.get(key(home, id)); return readContextJourney(home, id); }
  }
  const keep = [...new Set(kept.filter(value => !drafted || drafted.has(value)))];
  // The folder goes to a plugin the person picked among those that declare they take one; the folder is their own chosen folder as this
  // round read it, never a path from the request (ONB-44, batch12-design §7.3).
  // A round for an existing project only adds what it read: no blank start, and no folder handed on as a new project's.
  if (journey.existing && !journey.adoption && (input.blank === true || typeof input.take === "string")) throw new Error("给已有项目补的材料只能采用整理结果");
  const wanted = typeof input.take === "string" && input.blank !== true ? input.take : null;
  const taker = wanted ? ports.takers?.("code_root").find(one => one.plugin_id === wanted) : undefined, root = wanted ? codeRoot(journey) : null;
  if (wanted && !journey.adoption && !(taker && root)) throw new Error("这个文件夹不能这样交出去：只有你自己选的、顶层有项目文件的文件夹，交给声明了能接手的插件");
  journey.adoption ??= { title, body, blank: input.blank === true, keep, ...(taker && root ? { take: { plugin_id: taker.plugin_id, project_plugin_id: taker.project_plugin_id, code_root: root } } : {}) };
  journey.adoption.documents ??= documents;
  journey.phase = "adopting"; journey.error = null;
  withContextJourneys(home, store => store.save(journey));
  // The person brings their own materials in (design §3「用户导入」): everything this adoption records, the actions it calls included, is an
  // import, kept apart from work done in the project later. The scope ends with the adoption.
  const job = withObservationSource("imported", () => Promise.resolve().then(async () => {
    try {
      // A round for an existing project makes no project and leaves its folders and description as they are; the summary still goes to
      // the documents taker this round uses, as a new project's does, so it is added when the project does not have it (adding it twice
      // changes nothing).
      if (journey.existing) await ports.withCatalog({ homeDirectory: home }, catalog => {
        catalog.addProjectPlugin({ project_id: journey.project_id, plugin_id: journey.adoption!.documents!.project_plugin_id, actor_id: LOCAL_PERSON_ACTOR_ID });
      });
      else await ports.withCatalog({ homeDirectory: home }, async catalog => {
        await catalog.createProject({ display_name: journey.adoption!.title, actor_id: LOCAL_PERSON_ACTOR_ID, project_id: journey.project_id });
        catalog.addProjectPlugin({ project_id: journey.project_id, plugin_id: journey.adoption!.documents!.project_plugin_id, actor_id: LOCAL_PERSON_ACTOR_ID });
        // Artifact imports use the platform service in every project.
        const take = journey.adoption!.take;
        if (take) {
          catalog.addProjectPlugin({ project_id: journey.project_id, plugin_id: take.project_plugin_id, actor_id: LOCAL_PERSON_ACTOR_ID });
          // The person's code folder becomes the project's output: their choice, kept by Projects and written here, not by the plugin
          // (and, with it, the project is trusted: batch12-design §3, user 2026-11-13). Once: a retry does not undo an output the person changed since.
          if (!take.output_set) {
            await catalog.commit(() => catalog.changeDirectories({ project_id: journey.project_id, actor_id: LOCAL_PERSON_ACTOR_ID,
              change: { kind: "set_output", target: { workspace_path: take.code_root } }, expected_revision: catalog.projectDirectories(journey.project_id).revision }));
            take.output_set = true; withContextJourneys(home, store => store.save(journey));
          }
        }
      });
      // The chooser introduces the new project in the words the person accepted (a blank start has none). Safe to repeat.
      if (!journey.adoption!.blank && !journey.existing) setProjectDescription(home, journey.project_id, descriptionFromSummary(journey.adoption!.body));
      if (!ports.actions) throw new Error("当前环境没有提供动作服务，已确认内容仍保留");
      const client = await ports.actions(home, journey.project_id);
      const actions = Object.assign(client, { forOriginal: (path: string) => ports.actions!(home, journey.project_id, { path, install_id: ARTIFACTS_PLUGIN_ID }) });
      const documentsTaker = ports.takers?.("documents").find(one => one.plugin_id === journey.adoption!.documents!.plugin_id);
      if (!documentsTaker || !ports.take) throw new Error("保存文档的插件现在不可用，已确认内容仍保留；稍后可以继续保存");
      const keeper = await ports.take(home, journey.project_id, documentsTaker.take);
      const handed = await importAdoptedMaterialsAndSummary({ home, id, journey, actions, documents: { client: keeper, action: documentsTaker.take } });
      await keepDrafts(home, journey, ports);
      await handToTaker(home, journey, handed, ports);
      if (!journey.existing) completeMolisWorkOnboarding(home, journey.project_id);
      journey.phase = "complete"; journey.error = null;
      // The project now holds the materials; what the round staged goes. The project is made either way: a staging that cannot be
      // removed now is only space, and must not turn a finished project back into a failure.
      await removeJourneyStaging(home, id).catch(error => hostLog.warn("onboarding", "staging_not_removed", error));
    } catch (error) {
      journey.phase = "failed";
      journey.error = diskFull(error) ? "磁盘空间不足，项目没有保存完；确认的内容仍在。腾出空间后可以继续保存。" : error instanceof Error ? error.message : "项目保存未完成，请重试";
    }
    withContextJourneys(home, store => store.save(journey));
  })).finally(() => running.delete(key(home, id)));
  running.set(key(home, id), job); await job;
  return readContextJourney(home, id);
}

/**
 * The folder goes to the plugin the person picked, by that plugin's own declared action, called as the person with its permissions
 * only (batch12-design §7.3, §7.7 C1). Once it answered, a retry does not call it again. Only the folder the person picked goes: when
 * the project's output is no longer it, nothing is handed. A plugin that is gone or refuses does not hold the round: the project and
 * its materials are already made, so the round completes, `take_result.not_taken` says why, and the person lands on the plugin's page.
 */
async function handToTaker(home: string, journey: ContextJourney, handed: readonly { version: ArtifactReference; title: string }[], ports: ContextOnboardingPorts): Promise<void> {
  const take = journey.adoption?.take;
  if (!take || journey.take_result) return;
  const done = (result: NonNullable<ContextJourney["take_result"]>) => { journey.take_result = result; withContextJourneys(home, store => store.save(journey)); };
  const notTaken = (why: "unavailable" | "moved" | "refused") => done({ open: null, materials: 0, of: handed.length, not_taken: why });
  const taker = ports.takers?.("code_root").find(one => one.plugin_id === take.plugin_id);
  if (!taker || !ports.take) return notTaken("unavailable");
  const output = await ports.withCatalog({ homeDirectory: home }, catalog => catalog.projectDirectories(journey.project_id).directories.find(folder => folder.roles.includes("output")));
  if (!output || output.canonical_path !== await realpath(take.code_root).catch(() => null)) return notTaken("moved");
  const materials = handed.slice(0, ONBOARDING_TAKE_MATERIALS_MAX).map(item => ({ ref: { subject: { kind: "artifact", id: artifactSubjectId(item.version) }, pin: { mode: "fixed" as const, version: item.version } }, title: item.title.slice(0, 500) }));
  let answered: OnboardingTakeResult;
  try {
    const client = await ports.take(home, journey.project_id, taker.take);
    answered = await client.invoke(taker.take as ActionDefinition<OnboardingCodeRootTake, OnboardingTakeResult>,
      { request_id: `onboarding:${journey.id}:take`, code_root: { workspace_id: output.workspace_id }, materials });
  } catch (error) {
    // A plugin's own refusal is final; a temporary failure or cancellation can be retried and is not called a refusal.
    const refused = error instanceof ActionError && (error.kind === "conflict" || error.kind === "forbidden");
    return notTaken(refused ? "refused" : "unavailable");
  }
  done({ open: answered.open, materials: materials.length, of: handed.length });
}

/**
 * The drafts the person kept, from every batch, go to the drafts taker in the new project; the rest wait there (in Todo's 「待你确认」).
 * Each batch is read again first for its current revision, and each part of a keep goes on from the revision the last one returned, so a
 * retry after a keep that stopped part way does not meet a stale revision; the taker skips a draft already decided. Safe to repeat.
 */
async function keepDrafts(home: string, journey: ContextJourney, ports: ContextOnboardingPorts): Promise<void> {
  const keep = new Set(journey.adoption?.keep ?? []), drafts = journey.drafts;
  if (!drafts?.batches.length || !keep.size || drafts.added || !drafts.plugin_id) return;
  const taker = ports.takers?.("drafts").find(one => one.plugin_id === drafts.plugin_id);
  if (!taker?.drafts || !ports.take) throw new Error("起草待办的插件现在不可用，已确认内容仍保留；稍后可以继续保存");
  const get = taker.drafts.get as ActionDefinition<OnboardingDraftGetInput, { batches: OnboardingDraftBatch[] }>;
  const keeper = taker.drafts.keep as ActionDefinition<OnboardingDraftKeepInput, { batch: OnboardingDraftBatch }>;
  const reading = await ports.take(home, journey.project_id, get), keeping = await ports.take(home, journey.project_id, keeper);
  const ids = drafts.batches.map(batch => batch.batch_id), latest: OnboardingDraftBatch[] = [];
  for (let start = 0; start < ids.length; start += ONBOARDING_DRAFT_GET_MAX) latest.push(...(await reading.invoke(get, { ids: ids.slice(start, start + ONBOARDING_DRAFT_GET_MAX) })).batches);
  const kept: OnboardingDraftBatch[] = [];
  for (let batch of latest) {
    const chosen = batch.candidates.filter(candidate => keep.has(candidate.candidate_id) && !candidate.decision).map(candidate => candidate.candidate_id);
    for (let start = 0; start < chosen.length; start += ONBOARDING_DRAFT_KEEP_MAX) {
      batch = (await keeping.invoke(keeper, { id: batch.batch_id, expected_revision: batch.revision, keep: chosen.slice(start, start + ONBOARDING_DRAFT_KEEP_MAX) })).batch;
    }
    kept.push(batch);
  }
  drafts.added = kept.flatMap(batch => batch.candidates.flatMap(candidate => keep.has(candidate.candidate_id) && candidate.decision?.item_id ? [candidate.decision.item_id] : []));
}

export function updateContextDraft(home: string, id: string, input: Record<string, unknown>): ContextJourney {
  const journey = readContextJourney(home, id);
  if (journey.phase !== "review" || !journey.summary || journey.adoption) throw new Error("这份摘要暂时不能修改");
  if (typeof input.title !== "string" || [...input.title].length > 120 || typeof input.body !== "string" || input.body.length > 100_000) throw new Error("摘要内容过长或无效");
  journey.summary.title = input.title; journey.summary.body = input.body;
  return withContextJourneys(home, store => store.save(journey));
}
