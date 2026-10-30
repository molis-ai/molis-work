import { createHash } from "node:crypto";
import { feedErrors } from "./contract/feed.js";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord, FeedSourceRunRecord } from "./projection.js";
import type { FeedSourceSyncInput, FeedSourceSyncResult } from "./source-ports.js";
import { createFeedSourceSyncGuard } from "./source-sync-guard.js";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** One published, hash-checked finding of a research library, as whoever reads the repository hands it over. */
export interface ResearchLibraryEntry {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly url: string;
  readonly published_at: string;
  readonly tags: readonly string[];
  readonly provenance: Readonly<Record<string, unknown>>;
}

export interface ResearchLibrarySyncPorts {
  readonly feed: FeedApplication;
  /** Reads the repository's published findings at one revision: the platform's `repository.read`, or the Host's own reader. */
  read(request: { repository: string; source_id: string }, options: { signal?: AbortSignal }): Promise<{ revision: string; entries: readonly ResearchLibraryEntry[] }>;
  /** One write after the call has been checked again; the Runtime's `commit`, or just the operation where writes are not transactions of the caller's. */
  commit<T>(operation: () => T): Promise<T>;
}

/**
 * Pulls a research library source: the immutable packages published in a GitHub repository become items, one per package, and a package
 * republished under the same id moves its item to the new version together with its material.
 */
export async function syncResearchLibrary(ports: ResearchLibrarySyncPorts, source: FeedSourceRecord, input: FeedSourceSyncInput): Promise<FeedSourceSyncResult> {
  const { feed } = ports;
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(input.idempotencyKey)) throw feedErrors.source_idempotency_required("同步需要 8–128 位幂等键");
  if (!source.enabled || source.status === "paused" || source.status === "disconnected") throw feedErrors.source_paused("来源已暂停，请先恢复");
  const beforeEffect = createFeedSourceSyncGuard(feed, source, input);
  // Every write of this pull checks the source again inside its transaction: one changed while the commit waited gets nothing (FI-C-05).
  const commit = <T>(operation: () => T): Promise<T> => ports.commit(() => { beforeEffect.check(); return operation(); });
  await beforeEffect();
  const operationId = `research-sync-${hash(`${source.source_id}:${input.idempotencyKey}`).slice(0, 32)}`;
  const previous = feed.sources.runByOperationId(source.project_id, operationId);
  if (previous?.phase === "terminal") return { source: feed.sources.get(source.project_id, source.source_id), run: previous, created: 0, deduped: 0, replayed: true };
  const at = new Date().toISOString();
  const run: FeedSourceRunRecord = {
    project_id: source.project_id, source_id: source.source_id, operation_id: operationId,
    run_id: `run-${hash(operationId).slice(0, 32)}`, phase: "running", outcome: null, empty: false,
    error_code: null, receipt: null, created_count: 0, deduped_count: 0,
    recovery_count: previous ? previous.recovery_count + 1 : 0, started_at: at, completed_at: null, updated_at: at,
  };
  await commit(() => feed.sources.upsertRun(run));
  try {
    const repository = String(source.config.repository ?? "");
    const researchSource = String(source.config.research_source ?? "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("仓库配置无效");
    input.signal?.throwIfAborted();
    const { revision, entries } = await ports.read({ repository, source_id: researchSource }, { ...(input.signal ? { signal: input.signal } : {}) });
    await beforeEffect();
    const { created, deduped } = await commit(() => {
      let created = 0, deduped = 0;
      const existing = new Map(feed.snapshot(source.project_id).feed_items.filter(item => item.source_id === source.source_id).map(item => [item.external_id, item]));
      for (const entry of entries) {
        input.signal?.throwIfAborted();
        const current = feed.sources.get(source.project_id, source.source_id);
        if (!current.enabled) throw new Error("来源已暂停");
        const externalId = `${repository}:${researchSource}:${entry.id}`;
        // An unrelated repository commit does not change an immutable research package.
        if (existing.get(externalId)?.materials.some(material => material.provenance.manifest_sha256 === entry.provenance.manifest_sha256)) { deduped++; continue; }
        // Reaching here for a known package means its manifest changed (a package republished under the same id):
        // the item moves to the new version together with its material, so the two never mix versions.
        const ingested = feed.ingestItem({ source: current, externalId, refresh: true,
          title: entry.title, summary: entry.summary, body: entry.body, url: entry.url,
          occurredAt: entry.published_at, tags: [...entry.tags], attention: false,
          material: { material_id: `research-${hash(`${repository}:${entry.id}`).slice(0, 32)}`,
            canonical_url: entry.url, title: entry.title, source_name: source.name, published_at: entry.published_at,
            preview: entry.body, content_hash: hash(entry.body), content_ref: `research:${entry.id}`,
            content_available: false, content_type: "text/markdown", character_count: entry.body.length,
            captured_at: at, provenance: { ...entry.provenance }, selected_for_context: false },
        });
        if (ingested.created) created++; else deduped++;
      }
      return { created, deduped };
    });
    await feed.flushPendingJudgments();
    await beforeEffect();
    const completed = new Date().toISOString();
    const terminal: FeedSourceRunRecord = { ...run, phase: "terminal", outcome: "completed", empty: entries.length === 0,
      created_count: created, deduped_count: deduped, completed_at: completed, updated_at: completed,
      receipt: { repository, source_id: researchSource, revision, verified_packages: true } };
    const saved = await commit(() => {
      feed.sources.upsertRun(terminal);
      const latest = feed.sources.get(source.project_id, source.source_id);
      return feed.sources.upsert({ ...latest, status: latest.enabled ? "active" : "paused", cursor: { revision },
        last_sync_at: completed, last_outcome: "completed", last_error_code: null, updated_at: completed });
    });
    return { source: saved, run: terminal, created, deduped, replayed: false };
  } catch (error) {
    await beforeEffect();
    const completed = new Date().toISOString();
    await commit(() => {
      feed.sources.upsertRun({ ...run, phase: "interrupted", error_code: "research_library_sync_failed", updated_at: completed });
      const latest = feed.sources.get(source.project_id, source.source_id);
      feed.sources.upsert({ ...latest, status: latest.enabled ? "error" : "paused", last_error_code: "research_library_sync_failed", updated_at: completed });
    });
    // Git errors can contain credential-bearing URLs from a helper; never return raw stderr.
    const message = error instanceof Error && !("stderr" in error) ? error.message : "无法读取 GitHub 研究库，请检查本机 Git 登录与仓库权限后重试";
    throw feedErrors.source_sync_interrupted(message);
  }
}
