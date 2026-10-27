import type {
  ShelfAiPorts,
  ShelfExecutionControl,
  ShelfItemRecord,
  ShelfJobOutcome,
  ShelfJobRecord,
  ShelfMaterialPorts,
  ShelfRecipeId,
  ShelfRunJobInput,
} from "./contract.js";
import type { PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { newId, now, publicItem, saveCatalog, sha256, type CatalogFile, type ShelfCatalogAccess, type StoredItem } from "./catalog.js";
import { assertOriginsUntouched, contentHash } from "./copy-checks.js";
import { appendEvent } from "./copy-tree.js";
import { beforeShelfEffect } from "./effect.js";
import { isShelfFailure, readShelfCopy, shelfErrors } from "./errors.js";
import { previewFor, resultKind, resultMime, uniqueTitle } from "./item-names.js";
import { activeJobs, jobKey } from "./job-registry.js";
import {
  currentCheck,
  extractLocally,
  failureCopy,
  planJob,
  stageJob,
  type JobOutcomeState,
  type JobPlan,
  type StagedJob,
} from "./job-steps.js";

export const SHELF_JOB_TIMEOUT_MS = 10 * 60 * 1000;

type RunLifetime = ReturnType<typeof createExecutionLifetime>;

/** What a run carries from its first write to its last: the plan, the staged copy, what it has learned and the checks it repeats. */
interface RunContext {
  plan: JobPlan;
  staged: StagedJob;
  lifetime: RunLifetime;
  state: JobOutcomeState;
  assertCurrent: () => void;
  beforeCommit: () => Promise<void>;
}

/** A run of a recipe over selected materials, and the stop for a run another request started. */
export class ShelfJobs {
  constructor(private readonly access: ShelfCatalogAccess, private readonly materials: ShelfMaterialPorts, private readonly ai?: ShelfAiPorts) {}

  private get files() { return this.access.files; }

  /**
   * DropAgent `JobService.start`: copy the selected materials into read-only `input/`,
   * call the shared AI port (or on-device extractor) on the copy, collect one
   * deliverable, then check the original is still byte for byte what it was.
   */
  async runJob(input: ShelfRunJobInput, control?: ShelfExecutionControl): Promise<ShelfJobOutcome> {
    await beforeShelfEffect(control);
    const plan = planJob(input, this.access, { materials: this.materials, ai: this.ai });
    await assertOriginsUntouched(this.materials, plan.items, control?.signal);
    const copyHashes = new Map<string, string>();
    for (const item of plan.items) copyHashes.set(item.item_id, contentHash(this.files, item));

    const staged = await stageJob(this.access, plan, newId("job"));
    const controller = new AbortController(), key = jobKey(this.access.root, staged.jobId);
    const lifetime = createExecutionLifetime({ signal: control?.signal ? AbortSignal.any([control.signal, controller.signal]) : controller.signal,
      timeout: { milliseconds: SHELF_JOB_TIMEOUT_MS, reason: shelfErrors.job_timeout("任务超时，未继续保存结果") } });
    activeJobs.set(key, controller);
    const state: JobOutcomeState = {};
    const assertCurrent = currentCheck(this.access, plan, staged, copyHashes);
    // The original is read asynchronously, so it is checked here, before each effect and the final write, not inside that write.
    const beforeCommit = async () => {
      await lifetime.wait(Promise.resolve(control?.beforeEffect?.()));
      lifetime.assertActive(); assertCurrent(); state.validateResult?.();
      await lifetime.wait(assertOriginsUntouched(this.materials, plan.items, lifetime.signal)); lifetime.assertActive();
    };
    const run: RunContext = { plan, staged, lifetime, state, assertCurrent, beforeCommit };
    try {
      await beforeCommit();
      const output = plan.spec.requires_agent ? await this.generate(run) : await extractLocally(this.access, this.materials, plan, staged, lifetime, beforeCommit);
      return await this.commitSuccess(run, output);
    } catch (error) {
      await beforeCommit();
      return await this.recordFailure(run, error);
    } finally {
      activeJobs.delete(key);
      lifetime.dispose();
    }
  }

  /** The model path: the shared AI port reads the frozen copies and returns one deliverable. */
  private async generate(run: RunContext): Promise<string> {
    const { plan, staged, lifetime, state, beforeCommit } = run;
    const result = await lifetime.wait(this.ai!.generate({ recipe: plan.spec.recipe as Exclude<ShelfRecipeId, "extract_text">,
      option_id: plan.optionId, ...(plan.shortcut ? { shortcut_prompt: plan.shortcut.prompt } : {}), selection: plan.ai.selected!, files: this.files, root: staged.inputRoot,
      sources: plan.items.map((item, index) => ({ relative_path: staged.workNames[index], name: item.name, kind: item.kind, mime: item.mime })),
    }, { signal: lifetime.signal, beforeEffect: beforeCommit }));
    state.validateResult = result.validateResult;
    state.execution = result.execution;
    state.coverage = result.coverage;
    await beforeCommit();
    return result.text;
  }

  /** Output, result and the finished row are one write, checked again inside it: a write waits its turn, so a cancel may land first. */
  private commitSuccess(run: RunContext, output: string): Promise<ShelfJobOutcome> {
    const { plan, staged, lifetime, state, assertCurrent } = run;
    return this.files.write((writer) => {
      lifetime.assertActive(); assertCurrent(); state.validateResult?.();
      writer.replaceFileAtomic(staged.outputFile, Buffer.from(output));
      appendEvent(writer, staged.jobRoot, "写入 output/");
      const catalog = this.access.from(writer);
      const result = this.fileResult(writer, catalog, { outputFile: staged.outputFile, outputName: staged.outputName, jobId: staged.jobId,
        sourceItemIds: plan.items.map((item) => item.item_id), status: "done", coverage: state.coverage });
      const finished: ShelfJobRecord = {
        ...staged.running,
        ...(state.execution ? { execution: state.execution } : {}),
        ...(state.coverage?.length ? { material_coverage: state.coverage } : {}),
        status: "succeeded",
        result_item_id: result.item_id,
        finished_at: now(),
      };
      catalog.jobs = catalog.jobs.map((job) => job.job_id === staged.jobId ? finished : job);
      saveCatalog(writer, catalog);
      return { job: finished, result, origin_hash: plan.items[0].origin_hash };
    });
  }

  /** A cancel leaves the shelf as it was; a failure leaves a row saying why, in the same write as the closed job. */
  private async recordFailure(run: RunContext, error: unknown): Promise<never> {
    const { plan, staged, state } = run;
    if (isShelfFailure(error) && error.code === "shelf.configuration_changed") throw error;
    const cancelled = isShelfFailure(error) && error.code === "shelf.cancelled";
    const reason = failureCopy(error);
    const closed: ShelfJobRecord = {
      ...staged.running,
      ...((isShelfFailure(error) ? error.execution : state.execution) ? { execution: isShelfFailure(error) ? error.execution : state.execution } : {}),
      status: cancelled ? "cancelled" : "failed",
      error: cancelled ? null : reason,
      finished_at: now(),
    };
    await this.files.write((writer) => {
      const catalog = this.access.from(writer);
      catalog.jobs = catalog.jobs.map((job) => job.job_id === staged.jobId ? closed : job);
      if (!cancelled) this.fileResult(writer, catalog, { outputFile: null, outputName: staged.outputName, jobId: staged.jobId, sourceItemIds: plan.items.map((item) => item.item_id), status: "failed", failureReason: reason });
      saveCatalog(writer, catalog);
    });
    throw isShelfFailure(error) ? error : shelfErrors.job_failed(reason);
  }

  /**
   * The deliverable becomes a shelf copy of its own, so results survive job
   * cleanup. An authorized failure files its reason, without exposing an invalid partial result. The caller saves `catalog`.
   */
  private fileResult(writer: PluginOwnerFilesWriter, catalog: CatalogFile, options: {
    outputFile: string | null;
    outputName: string;
    jobId: string;
    sourceItemIds: readonly string[];
    status: "done" | "failed";
    failureReason?: string | null;
    coverage?: readonly string[];
  }): ShelfItemRecord {
    const taken = catalog.items.filter((item) => item.group === "result").map((item) => item.name);
    const name = uniqueTitle(options.outputName, taken);
    const resultId = newId("item");
    const kind = resultKind(name);
    let relative = "";
    let bytes: Buffer | null = null;
    if (options.outputFile && writer.stat(options.outputFile)) {
      relative = `files/${resultId}/${name}`;
      writer.copyFile(options.outputFile, relative);
      bytes = readShelfCopy(writer, relative);
    }
    const result: StoredItem = {
      item_id: resultId,
      group: "result",
      kind,
      name,
      relative_path: relative,
      mime: resultMime(name),
      size_bytes: bytes?.byteLength ?? 0,
      origin_hash: bytes ? sha256(bytes) : "",
      hidden: false,
      created_at: now(),
      source_item_id: options.sourceItemIds[0] ?? null,
      source_item_ids: [...options.sourceItemIds],
      job_id: options.jobId,
      preview_text: bytes ? previewFor(kind, bytes) : null,
      children: [],
      status: options.status,
      failure_reason: options.failureReason ?? null,
      ...(options.coverage?.length ? { material_coverage: options.coverage } : {}),
    };
    catalog.items.unshift(result);
    return publicItem(result);
  }

  /** Stop a run from another request; the materials stay, no result is filed. */
  async cancelJob(jobId: string): Promise<ShelfJobRecord> {
    const job = this.access.read().jobs.find((entry) => entry.job_id === jobId);
    if (!job) throw shelfErrors.item_not_found("这个任务不存在");
    if (job.status !== "running") return job;
    activeJobs.get(jobKey(this.access.root, jobId))?.abort(shelfErrors.cancelled("任务已取消"));
    // Decided on the row the write finds: a run that finished in the meantime keeps its own record.
    return this.files.write((writer) => {
      const catalog = this.access.from(writer);
      const live = catalog.jobs.find((entry) => entry.job_id === jobId);
      if (!live) throw shelfErrors.item_not_found("这个任务不存在");
      if (live.status !== "running") return live;
      const cancelled: ShelfJobRecord = { ...live, status: "cancelled", finished_at: now() };
      catalog.jobs = catalog.jobs.map((entry) => entry.job_id === jobId ? cancelled : entry);
      saveCatalog(writer, catalog);
      return cancelled;
    });
  }
}
