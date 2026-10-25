import { ActionError, type ActionDefinition, type BoundActionClient, type HostOfferedOriginalFile } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Readable } from "node:stream";
import { fencedMaterials, instructed, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ONBOARDING_NOTES, ONBOARDING_OWNER, ONBOARDING_PROPOSAL } from "./agent-definitions/system-prompts.js";
import { createHash, randomUUID } from "node:crypto";
import { PAGES_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/pages";
import { TODO_ORGANIZE_MATERIAL_CHARS, TODO_PLUGIN_ID, type TodoBatch } from "@molis-ai/molis-work-contracts/modules/todo";
import { withContextJourneys, type CallTiming, type ContextJourney, type ContextReference, type ImportFile } from "./context-onboarding-store.js";
import { contextFilePath, contextSources, readContextSource } from "./context-onboarding-sources.js";
import { diskFull, dropStagedNotes, readStagedNote, readStagedText, removeJourneyStaging, stageContextUpload, stageNote, stagedFilePath, stagedFileSize, stagedJourneyIds, isStagedDigest } from "./context-onboarding-staging.js";
import type { PeriodicTasks } from "./periodic-tasks.js";
import { configuredTextPort, type TextModelPort } from "./configured-text-port.js";
import { prepareContextDocument } from "./context-onboarding-documents.js";
import { ARTIFACTS_PLUGIN_ID, artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { completeMolisWorkOnboarding } from "./onboarding.js";
import { descriptionFromSummary, setProjectDescription } from "./project-arrival.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { L } from "./web-locale.js";
import { hostLog } from "./host-log.js";

export interface ContextOnboardingPorts {
  withCatalog: LocalWebCatalogRunner;
  /** The person's actions in the new project; with `original_file`, for one import that comes with a file the Host staged. */
  actions?: (home: string, projectId: string, original_file?: HostOfferedOriginalFile) => Promise<BoundActionClient>;
  /** The person's own (Home) actions, for todo drafts made before the project exists. */
  homeActions?: (home: string, signal: AbortSignal) => BoundActionClient;
  model?: (home: string) => Promise<TextModelPort>;
  readSource?: typeof readContextSource;
}
// The local Host is the single writer. Persistent checkpoints survive restarts;
// this map prevents two requests starting the same job in the current process.
const running = new Map<string, Promise<void>>();
const key = (home: string, id: string) => home + ":" + id;
export function readContextJourney(home: string, id: string): ContextJourney {
  const journey = withContextJourneys(home, store => store.get(id));
  if (journey.staging_removed && journey.phase !== "complete") {
    journey.requires_reselection = true;
    journey.error = "这轮整理超过 30 天没有继续，暂存的文件已清理以腾出空间。原记录已保留，请重新选择资料开始一轮整理。";
    return journey;
  }
  // Do not reinterpret old Cognia identities as Artifact identities, nor a material whose text sat in the row before staging
  // (2026-10-22). Keep the historical journey intact and offer a fresh selection without reading its old store.
  if (journey.phase !== "complete" && [...journey.sources.flatMap(s => s.references ?? []), ...(journey.summary?.references ?? [])]
    .some(ref => !ref.source_id || !isStagedDigest(ref.original?.sha256) || !isStagedDigest(ref.text?.sha256)) || (journey.todo && !Array.isArray(journey.todo.batches))) {
    journey.requires_reselection = true;
    journey.error = "这轮资料使用旧版存储。原记录已保留，请重新选择资料开始一轮整理。";
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
    const scope = (s: typeof next) => JSON.stringify([s.path, s.files, s.text, s.url, s.connection_id, s.days, s.metadata, s.excluded]);
    // Completed imports are fixed snapshots. Only a changed scope invalidates them.
    return previous && scope(previous) === scope(next) ? { ...previous, ...next } : next;
  });
  journey.auto_start = input.auto_start === true;
  journey.previewed = input.previewed === true;
  if (journey.oauth_status === "pending" && !journey.sources.some(s => s.kind === "gmail" && s.selected)) {
    journey.oauth_status = "cancelled"; journey.auto_start = false;
  }
  return withContextJourneys(home, store => store.save(journey));
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
  const refs = [...journey.summary?.references ?? [], ...journey.sources.flatMap(s => s.references ?? [])];
  const ref = isStagedDigest(sha256) ? refs.find(r => r.text?.sha256 === sha256) : undefined;
  if (!ref) throw new Error("找不到这份材料的正文");
  return readStagedText(home, id, ref.text);
}
export function reopenContextJourney(home: string, id: string): ContextJourney {
  const journey = readContextJourney(home, id);
  if (running.has(key(home, id)) || journey.adoption || journey.phase === "complete") throw new Error("当前正在保存或已经采用，不能更改来源");
  journey.phase = "selecting"; journey.error = null; journey.auto_start = false;
  return withContextJourneys(home, store => store.save(journey));
}
/** Onboarding's own calls: its instructions, recorded under its own owner, with no other feature's role in front of them. */
export async function contextModel(home: string, ports: ContextOnboardingPorts): Promise<TextModelPort> {
  return ports.model ? ports.model(home)
    : configuredTextPort(home, { owner: ONBOARDING_OWNER, timeoutMs: 180_000, unavailableReason: "材料已保存。请在设置中连接文字模型，再回来继续整理。" });
}
export function startContextJourney(home: string, id: string, ports: ContextOnboardingPorts): ContextJourney {
  if (running.has(key(home, id))) return readContextJourney(home, id);
  const journey = readContextJourney(home, id);
  if (journey.requires_reselection) throw new Error(journey.error!);
  if (journey.phase === "complete" || (journey.phase === "review" && journey.summary)) return journey;
  if (journey.adoption) throw new Error("已确认项目内容，请继续保存项目");
  if (!journey.sources.some(s => s.selected)) throw new Error("请选择至少一个来源，或创建空白项目");
  journey.phase = "reading"; journey.summary = null; journey.error = null; journey.auto_start = false; journey.needs_model = false;
  withContextJourneys(home, store => store.save(journey));
  const job = Promise.resolve().then(() => organize(home, journey, ports)).finally(() => running.delete(key(home, id)));
  running.set(key(home, id), job);
  return journey;
}
export async function waitContextJourney(home: string, id: string): Promise<ContextJourney> {
  await running.get(key(home, id)); return readContextJourney(home, id);
}
async function organize(home: string, journey: ContextJourney, ports: ContextOnboardingPorts): Promise<void> {
  const save = () => withContextJourneys(home, store => store.save(journey));
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
      if (source.references) continue;
      source.error = undefined; save();
      try {
        const input = await (ports.readSource ?? readContextSource)(home, source);
        const reading = source.reading?.total === input.files.length ? source.reading : { done: 0, total: input.files.length, references: [], issues: [] };
        const counted = Boolean(source.files?.length);
        const sizeOf = async (file: ImportFile) => { if (counted) return stagedSize(file); const size = file.bytes?.length ?? 0; bytes.total += size; return size; };
        for (const file of input.files.slice(0, reading.done)) bytes.done += await sizeOf(file);
        source.reading = reading; save();
        // The checkpoint is written every 100 files or every second, whichever comes first: the row holds every reference so far, so a
        // write per file would cost the square of the file count. A restart reads those few files again, which staging makes cheap.
        let saved = Date.now();
        for (const file of input.files.slice(reading.done)) {
          const read = await prepareContextDocument(home, journey.id, source.kind, file);
          if ("reference" in read) reading.references.push(read.reference); else reading.issues.push(read.issue);
          bytes.done += await sizeOf(file); reading.done++;
          if (reading.done % 100 === 0 || Date.now() - saved >= 1000) { save(); saved = Date.now(); }
        }
        source.references = reading.references; source.issues = reading.issues; source.skipped = reading.issues.length;
        source.reading = undefined; source.files = undefined; source.text = undefined;
      } catch (error) {
        // The disk is full: the whole round stops at this file, and 继续整理 goes on from it.
        if (diskFull(error)) throw new Error("磁盘空间不足，已读取的材料仍在。腾出空间后点「继续整理」，会从这份文件接着读。");
        source.error = error instanceof Error ? error.message : "读取失败，请重试";
      }
      save();
    }
    bytes.done = bytes.total; save();
    const refs = journey.sources.filter(s => s.selected).flatMap(s => s.references ?? []);
    const unique = [...new Map(refs.map(r => [r.source_id + ":" + r.version, r])).values()].map((r, i) => ({ ...r, label: "S" + (i + 1) }));
    if (!unique.length) throw new Error("还没有读到正文，请检查来源范围后重试");
    const ai = await contextModel(home, ports); journey.model = ai.runtimeLabel ?? null; save();
    if (!ai.completeText) { journey.needs_model = true; throw new Error(ai.unavailableReason ?? "材料已保存。请在设置中连接文字模型，再回来继续整理。"); }
    // Todo drafts come from the same materials, beside the overview; a failure there never stops the overview.
    const drafts = draftTodos(home, journey, unique, ports, save);
    const raw = await summarizeContext(home, unique, ai, journey, save);
    await drafts;
    journey.summary = parseContextSummary(raw, unique); journey.phase = "review"; journey.error = null; save();
  } catch (error) {
    journey.phase = "failed"; journey.error = error instanceof Error ? error.message.slice(0, 600) : "整理失败，材料已保留"; save();
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
      let end = Math.min(offset + 12_000, body.length);
      if (end < body.length && /[\uD800-\uDBFF]/u.test(body[end - 1]!)) end--;
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
async function summarizeContext(home: string, references: ContextReference[], ai: TextModelPort, journey: ContextJourney, save: () => unknown): Promise<string> {
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
    let total = 0;
    for await (const _ of batchesOf(evidence())) total++;
    if (total <= 1) break;
    checkpoint.stage = stage++; checkpoint.completed = 0; checkpoint.total = total; count(); save();
    const notes: { labels: string[]; key: string }[] = [];
    let inSize = 0, outSize = 0;
    for await (const batch of batchesOf(evidence())) {
      const key = createHash("sha256").update(cacheKey + JSON.stringify(batch)).digest("hex");
      const labels = [...new Set(batch.flatMap(item => item.labels))];
      let note = await readStagedNote(home, journey.id, key);
      if (note === null) {
        note = await timedCall(checkpoint.timing, () => ai.completeText!(wrap(ONBOARDING_NOTES, batch), { signal: AbortSignal.timeout(180_000) }));
        parseContextSummary(note, references.filter(r => labels.includes(r.label)));
        if (note.length > 8_000) throw new Error("分批整理结果过长，请重试；已完成批次和原文已保留。");
        await stageNote(home, journey.id, key, note);
        checkpoint.notes.push(key);
      }
      notes.push({ labels, key }); inSize += JSON.stringify(batch).length; outSize += JSON.stringify({ labels, body: note }).length;
      checkpoint.completed++; shrink = Math.min(0.5, Math.max(0.02, outSize / inSize)); count(); save();
    }
    before += total;
    if (outSize >= inSize) {
      const keys = notes.map(note => note.key);
      await dropStagedNotes(home, journey.id, keys);
      checkpoint.notes = checkpoint.notes.filter(key => !keys.includes(key)); checkpoint.completed = 0; save();
      throw new Error("模型未能归纳长材料，请重试或更换模型；原文与此前完成的批次已保留。");
    }
    evidence = () => noteEvidence(home, journey.id, notes);
  }
  const final: Evidence[] = [];
  for await (const item of evidence()) final.push(item);
  checkpoint.stage = stage; checkpoint.completed = 0; checkpoint.total = 1; checkpoint.batches = { done: before, all: before + 1 }; save();
  const result = await timedCall(checkpoint.timing, () => ai.completeText!(wrap(ONBOARDING_PROPOSAL, final), { signal: AbortSignal.timeout(180_000) }));
  checkpoint.completed = 1; checkpoint.batches = { done: before + 1, all: before + 1 }; save();
  return result;
}
export function parseContextSummary(raw: string, references: ContextReference[]): NonNullable<ContextJourney["summary"]> {
  const parts = /^# ([^\r\n]{1,120})\r?\n([\s\S]+)$/u.exec(raw.trim());
  if (!parts || parts[2]!.length > 100_000) throw new Error("模型没有返回有效摘要，请重试。材料已保留。");
  const body = parts[2]!.trim(), labels = [...body.matchAll(/\[S(\d+)\]/gu)].map(m => "S" + m[1]);
  if (!labels.length || labels.some(label => !references.some(r => r.label === label))) throw new Error("摘要缺少有效来源，未采用模型结果。请重新整理。");
  return { title: parts[1]!.trim(), body, references };
}
/**
 * A text in parts of at most `size` characters, cut after a line end where there is one in the second half of the part, and never
 * inside a surrogate pair. Pages and Todo each take a bounded text per call; a material of any length goes as several.
 */
function textParts(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + size, text.length);
    const line = end < text.length ? text.lastIndexOf("\n", end - 1) : -1;
    if (line >= offset + size / 2) end = line + 1;
    else if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
    parts.push(text.slice(offset, end)); offset = end;
  }
  return parts;
}
/** A part's title: the name, cut to fit, then which part it is, so the cut never takes the part number. */
function partTitle(title: string, part: number, parts: number, max: number): string {
  const suffix = parts > 1 ? L(" · 第 {k} / {n} 部分", { k: part, n: parts }) : "";
  return (title.length + suffix.length <= max ? title : title.slice(0, max - suffix.length - 1).replace(/[\uD800-\uDBFF]$/u, "") + "…") + suffix;
}

const TODO_MATERIALS = 50;
/**
 * Every material for Todo's organizer, which takes 50 materials a call and reads the first TODO_ORGANIZE_MATERIAL_CHARS of each:
 * long ones in parts of that size, so all of the text is read, 50 a batch.
 */
async function* todoBatches(home: string, id: string, references: ContextReference[]): AsyncGenerator<{ title: string; text: string }[]> {
  let batch: { title: string; text: string }[] = [];
  for (const ref of references) {
    const parts = textParts(await readStagedText(home, id, ref.text), TODO_ORGANIZE_MATERIAL_CHARS);
    for (const [index, text] of parts.entries()) {
      if (!text.trim()) continue;
      batch.push({ title: partTitle(ref.title, index + 1, parts.length, 200), text });
      if (batch.length === TODO_MATERIALS) { yield batch; batch = []; }
    }
  }
  if (batch.length) yield batch;
}
/**
 * Todo drafts from every material, beside the overview (user 2026-10-22: no 50-material cap): one organizer call per batch, each
 * kept as it lands, so a retry goes on after the last one; the batches' drafts are one list to confirm. A failure never stops the
 * overview.
 */
async function draftTodos(home: string, journey: ContextJourney, references: ContextReference[], ports: ContextOnboardingPorts, save: () => unknown): Promise<void> {
  if (!ports.homeActions) return;
  // Batches belong to the materials they came from; after the person chose again, the drafts start over.
  const key = createHash("sha256").update(JSON.stringify(references.map(r => [r.source_id, r.version]))).digest("hex").slice(0, 16);
  if (journey.todo?.key === key && journey.todo.status === "ready") return;
  let total = 0;
  for await (const _ of todoBatches(home, journey.id, references)) total++;
  const todo: NonNullable<ContextJourney["todo"]> = journey.todo = { status: "pending", key, batches: journey.todo?.key === key ? journey.todo.batches : [], total, error: null, timing: journey.todo?.key === key ? journey.todo.timing : { ms: 0, calls: 0 } }; save();
  try {
    let index = 0;
    for await (const materials of todoBatches(home, journey.id, references)) {
      if (++index <= todo.batches.length) continue;
      // The journey id and the batch number make a retried pass return the same drafts instead of organizing twice.
      const todoActions = ports.homeActions!(home, AbortSignal.timeout(20 * 60_000));
      const extract = await shipped<TodoExtract, { batch: TodoBatch }>(todoActions, "todo.organize.extract", 1, TODO_PLUGIN_ID);
      const { batch } = await timedCall(todo.timing, () => todoActions.invoke(extract, { origin: "onboarding",
        title: total > 1 ? L("开始使用时整理的待办（第 {k} / {n} 批）", { k: index, n: total }) : L("开始使用时整理的待办"), request_id: `onboarding:${journey.id}:${key}:${index}`, materials }));
      todo.batches.push(batch); save();
    }
    todo.status = "ready";
  } catch (error) {
    todo.status = "failed"; todo.error = error instanceof Error ? error.message.slice(0, 300) : "待办草稿没整理成";
  }
  save();
}
/**
 * A Pages document's body is at most 1,500,000 characters encoded, and Pages turns the markdown into its own structure. The Host does
 * not build that structure (PG-031); it bounds it from above: every line or table cell adds at most PAGE_NODE_CHARS of structure,
 * every mark character (a mark splits the text) PAGE_MARK_CHARS, and an escaped character five. Parts start at 400,000 characters
 * and halve until the bound fits; were the bound ever short, Pages refuses the part and the save fails rather than cutting text.
 */
const PAGE_PART_CHARS = 400_000, PAGE_BODY_MAX = 1_400_000, PAGE_NODE_CHARS = 160, PAGE_MARK_CHARS = 80;
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;
const pageBound = (text: string) => text.length + PAGE_NODE_CHARS * (1 + count(text, /[\n|]/gu)) + PAGE_MARK_CHARS * count(text, /[*`[_~]/gu)
  + 5 * count(text, /["\\\u0000-\u0009\u000b-\u001f]/gu);
function* pageParts(text: string): Generator<string> {
  for (const part of textParts(text, PAGE_PART_CHARS)) {
    if (pageBound(part) <= PAGE_BODY_MAX || part.length < 2) yield part;
    else {
      let half = Math.ceil(part.length / 2);
      if (/[\uD800-\uDBFF]/u.test(part[half - 1]!)) half--;
      yield* pageParts(part.slice(0, half)); yield* pageParts(part.slice(half));
    }
  }
}
/**
 * One action of a plugin that ships with the Host, found in the caller's directory by its public identity (PG-031): the Host names the
 * capability and that plugin's provider (pinned exactly, as for Goals: a same-named capability of another plugin is never picked, #1207),
 * and never imports the plugin's package. Not registered or not granted here: refused, nothing written.
 */
async function shipped<I, O>(actions: BoundActionClient, capability_id: string, version: number, provider_id: string): Promise<ActionDefinition<I, O>> {
  const view = (await actions.discover()).find(one => one.capability_id === capability_id && one.version === version && one.provider.provider_id === provider_id);
  if (!view) throw new ActionError("actions.dependency_missing", `${capability_id}@${version} 未在当前项目登记或未获授权`);
  return { ...view, provider_id } as ActionDefinition<I, O>;
}
type PagesCreated = { document: { id: string } };
type TodoExtract = { origin: "onboarding"; title: string; request_id: string; materials: { title: string; text: string }[] };
type TodoDecision = { candidate_id: string; action: "add" | "merge" | "update" | "complete" | "reopen" };
export async function adoptContextJourney(home: string, id: string, input: Record<string, unknown>, ports: ContextOnboardingPorts): Promise<ContextJourney> {
  if (running.has(key(home, id))) { await running.get(key(home, id)); return readContextJourney(home, id); }
  const journey = readContextJourney(home, id);
  if (journey.requires_reselection) throw new Error(journey.error!);
  if (journey.phase === "complete") return journey;
  if (!journey.adoption && input.blank !== true && !(journey.phase === "review" && journey.summary)
    && !(input.materials_only === true && journey.phase === "failed" && journey.sources.some(s => s.selected && s.references?.length))) throw new Error("请先完成整理");
  const title = journey.adoption?.title ?? (typeof input.title === "string" ? input.title.trim() : "");
  const body = journey.adoption?.body ?? (input.blank === true ? "" : typeof input.body === "string" ? input.body.trim() : journey.summary?.body ?? "");
  if (!title || title.length > 120 || body.length > 100_000) throw new Error("请输入 1–120 字的项目名称，摘要最多 100,000 字符");
  // Persist the accepted text before creating anything. A retry cannot overwrite
  // edits made later in Pages or change the adopted material set.
  // Only drafts this round made can be kept, however many batches there were.
  const drafted = new Set(journey.todo?.batches.flatMap(batch => batch.candidates.map(candidate => candidate.candidate_id)) ?? []);
  const todoSelected = Array.isArray(input.todo_selected) ? [...new Set(input.todo_selected.filter((value): value is string => typeof value === "string" && drafted.has(value)))] : [];
  journey.adoption ??= { title, body, blank: input.blank === true, todo_selected: todoSelected }; journey.phase = "adopting"; journey.error = null;
  withContextJourneys(home, store => store.save(journey));
  const job = Promise.resolve().then(async () => {
    try {
      await ports.withCatalog({ homeDirectory: home }, async catalog => {
        await catalog.createProject({ display_name: journey.adoption!.title, actor_id: LOCAL_PERSON_ACTOR_ID, project_id: journey.project_id });
        catalog.addProjectPlugin({ project_id: journey.project_id, plugin_id: "pages", actor_id: LOCAL_PERSON_ACTOR_ID });
        catalog.addProjectPlugin({ project_id: journey.project_id, plugin_id: "artifacts", actor_id: LOCAL_PERSON_ACTOR_ID });
      });
      // The chooser introduces the new project in the words the person accepted (a blank start has none). Safe to repeat.
      if (!journey.adoption!.blank) setProjectDescription(home, journey.project_id, descriptionFromSummary(journey.adoption!.body));
      if (!ports.actions) throw new Error("当前环境没有提供动作服务，已确认内容仍保留");
      const client = await ports.actions(home, journey.project_id);
      const actions = Object.assign(client, { forOriginal: (path: string) => ports.actions!(home, journey.project_id, { path, install_id: ARTIFACTS_PLUGIN_ID }) });
      {
        // Pages' own create: Pages turns the markdown into its document, and the same request id returns the same document on a retry.
        const create = await shipped<{ request_id: string; title: string; markdown?: string }, PagesCreated>(actions, "pages.create", 2, PAGES_PLUGIN_ID);
        const refs = journey.adoption!.blank ? [] : journey.summary?.references ?? journey.sources.filter(s => s.selected).flatMap(s => s.references ?? []);
        if (!journey.summary) refs.forEach((ref, index) => { ref.label = "S" + (index + 1); });
        journey.artifact_references = refs.flatMap(ref => ref.artifact ? [ref.artifact] : []);
        // One material at a time, each saved as it lands, so a retry goes on after the last one; its staged original is offered to
        // the 成果库 by the Host (any size), and its whole text becomes its Pages documents.
        for (const ref of refs) {
          if (!ref.artifact) {
            const offered = await actions.forOriginal(await stagedFilePath(home, id, ref.original.sha256));
            const registered = await offered.invoke(artifactsActions.importFile, { source: "file", filename: "material.md", title: ref.title,
              source_id: "onboarding:" + id + ":" + ref.source_id, content: await readStagedText(home, id, ref.text), original_file: { filename: ref.original.filename, mime: ref.original.mime } });
            ref.artifact = { artifact_id: registered.artifact_id, version: registered.version };
            journey.artifact_references.push(ref.artifact);
            withContextJourneys(home, store => store.save(journey));
          }
          if (!ref.documents) {
            // The whole text, in as many documents as Pages needs (“第 k / N 部分”); each part's request is its own, so a retry goes on.
            const parts = [...pageParts(`原标题：${ref.title}\n\n来源：${ref.path} · 版本 ${ref.version}\n\n${await readStagedText(home, id, ref.text)}`)], documents: string[] = [];
            for (const [index, body] of parts.entries()) {
              documents.push((await actions.invoke(create, { request_id: id + ":sources:" + ref.label + (parts.length > 1 ? ":" + (index + 1) : ""),
                title: partTitle(`[${ref.label}] ${ref.title}`, index + 1, parts.length, 80), markdown: body })).document.id);
            }
            ref.documents = documents;
            withContextJourneys(home, store => store.save(journey));
          }
        }
        const sources = refs.map(r => `[${r.label}] [${r.title.replace(/[\[\]]/gu, "")}](/projects/${journey.project_id}/?openPlugin=pages&openItem=${r.documents![0]}&openTitle=${encodeURIComponent(r.title)}) · ${r.path} · 版本 ${r.version}`).join("\n\n");
        // The page is the person's, written in the interface language they made the project in (user decision 2026-10-15).
        const text = journey.adoption!.body + (sources ? "\n\n## " + L("资料来源") + "\n\n" + sources : "");
        const summaryTitle = L("{title} · 工作摘要", { title: journey.adoption!.title });
        const summaryText = summaryTitle.length > 80 ? `${L("项目：{title}", { title: journey.adoption!.title })}\n\n${text}` : text;
        const summary = (await actions.invoke(create, { request_id: id + ":summary", title: pageTitle(summaryTitle), ...(summaryText ? { markdown: summaryText } : {}) })).document;
        journey.document_id = summary.id;
        if (text.trim()) {
          const artifact = await actions.invoke(artifactsActions.importFile, { source: "file", filename: "summary.md", title: summaryTitle,
            source_id: "onboarding:" + id + ":summary", content: text });
          journey.artifact_references.push({ artifact_id: artifact.artifact_id, version: artifact.version });
        }
      }
      await adoptTodoDrafts(journey, actions);
      completeMolisWorkOnboarding(home, journey.project_id); journey.phase = "complete"; journey.error = null;
      // The project now holds the materials; what the round staged goes. The project is made either way: a staging that cannot be
      // removed now is only space, and must not turn a finished project back into a failure.
      await removeJourneyStaging(home, id).catch(error => hostLog.warn("onboarding", "staging_not_removed", error));
    } catch (error) {
      journey.phase = "failed";
      journey.error = diskFull(error) ? "磁盘空间不足，项目没有保存完；确认的内容仍在。腾出空间后可以继续保存。" : error instanceof Error ? error.message : "项目保存未完成，请重试";
    }
    withContextJourneys(home, store => store.save(journey));
  }).finally(() => running.delete(key(home, id)));
  running.set(key(home, id), job); await job;
  return readContextJourney(home, id);
}

/** The drafts the person kept, from every batch, become the new project's todos; the rest stay in Todo's “待你确认”. Safe to repeat. */
async function adoptTodoDrafts(journey: ContextJourney, actions: BoundActionClient): Promise<void> {
  const selected = new Set(journey.adoption?.todo_selected ?? []);
  if (!journey.todo?.batches.length || !selected.size || journey.todo.added) return;
  const relation = { same: "merge", update: "update", conflict: "update", maybe_done: "complete", reopen: "reopen" } as const;
  const batches: TodoBatch[] = [];
  const get = await shipped<{ id: string }, { batch: TodoBatch }>(actions, "todo.organize.get", 1, TODO_PLUGIN_ID);
  const apply = await shipped<{ id: string; expected_revision: number; decisions: TodoDecision[] }, { batch: TodoBatch }>(actions, "todo.organize.apply", 1, TODO_PLUGIN_ID);
  for (const kept of journey.todo.batches) {
    let { batch } = await actions.invoke(get, { id: kept.batch_id });
    const decisions = batch.candidates.filter(candidate => selected.has(candidate.candidate_id) && !candidate.decision)
      .map(candidate => ({ candidate_id: candidate.candidate_id, action: candidate.existing ? relation[candidate.existing.relation] : "add" as const }));
    // Todo takes 80 decisions a call.
    for (let start = 0; start < decisions.length; start += 80) {
      batch = (await actions.invoke(apply, { id: batch.batch_id, expected_revision: batch.revision, decisions: decisions.slice(start, start + 80) })).batch;
    }
    batches.push(batch);
  }
  journey.todo = { ...journey.todo, batches, added: batches.flatMap(batch => batch.candidates.flatMap(candidate => selected.has(candidate.candidate_id) && candidate.decision?.item_id ? [candidate.decision.item_id] : [])) };
}

function pageTitle(title: string): string {
  return partTitle(title, 1, 1, 80);
}

export function updateContextDraft(home: string, id: string, input: Record<string, unknown>): ContextJourney {
  const journey = readContextJourney(home, id);
  if (journey.phase !== "review" || !journey.summary || journey.adoption) throw new Error("这份摘要暂时不能修改");
  if (typeof input.title !== "string" || input.title.length > 120 || typeof input.body !== "string" || input.body.length > 100_000) throw new Error("摘要内容过长或无效");
  journey.summary.title = input.title; journey.summary.body = input.body;
  return withContextJourneys(home, store => store.save(journey));
}
