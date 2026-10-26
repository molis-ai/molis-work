import { createHash } from "node:crypto";
import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import { readResearchRepository } from "./research-repository-read.js";
import { createFeedSourceSyncGuard, type FeedApplication, type FeedSourceRecord, type FeedSourceRunRecord, type FeedSourceSyncResult, type FeedSourceSyncInput } from "@molis-ai/molis-work-plugin-feed";

const running = new Map<string, { idempotencyKey: string; promise: Promise<FeedSourceSyncResult> }>();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

export function syncResearchLibrarySource(
  home: string, feed: FeedApplication, source: FeedSourceRecord,
  input: FeedSourceSyncInput,
): Promise<FeedSourceSyncResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(input.idempotencyKey)) {
    throw feedErrors.source_idempotency_required("同步需要 8–128 位幂等键");
  }
  if (!source.enabled || source.status === "paused" || source.status === "disconnected") {
    throw feedErrors.source_paused("来源已暂停，请先恢复");
  }
  const key = `${home}:${source.project_id}:${source.source_id}`;
  const beforeEffect = createFeedSourceSyncGuard(feed, source, input);
  const active = running.get(key);
  if (active) {
    if (active.idempotencyKey !== input.idempotencyKey) throw feedErrors.source_sync_interrupted("该来源正在拉取，请稍后重试");
    return active.promise.then(async result => { await beforeEffect(); return result; });
  }
  const promise = sync();
  running.set(key, { idempotencyKey: input.idempotencyKey, promise });
  void promise.finally(() => running.delete(key)).catch(() => undefined);
  return promise;

  async function sync(): Promise<FeedSourceSyncResult> {
    await beforeEffect();
    const operationId = `research-sync-${hash(`${source.source_id}:${input.idempotencyKey}`).slice(0, 32)}`;
    const previous = feed.getSourceRunByOperationId(source.project_id, operationId);
    if (previous?.phase === "terminal") return { source: feed.getSource(source.project_id, source.source_id), run: previous, created: 0, deduped: 0, replayed: true };
    const at = new Date().toISOString();
    const run: FeedSourceRunRecord = {
      project_id: source.project_id, source_id: source.source_id, operation_id: operationId,
      run_id: `run-${hash(operationId).slice(0, 32)}`, phase: "running", outcome: null, empty: false,
      error_code: null, receipt: null, created_count: 0, deduped_count: 0,
      recovery_count: previous ? previous.recovery_count + 1 : 0, started_at: at, completed_at: null, updated_at: at,
    };
    feed.upsertSourceRun(run);
    try {
      const repository = String(source.config.repository ?? "");
      const researchSource = String(source.config.research_source ?? "");
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("仓库配置无效");
      input.signal?.throwIfAborted();
      const { revision, entries } = await readResearchRepository(home, { repository, source_id: researchSource }, { signal: input.signal });
      await beforeEffect();
      let created = 0, deduped = 0;
      const existing = new Map(feed.snapshot(source.project_id).feed_items.filter(item => item.source_id === source.source_id).map(item => [item.external_id, item]));
      for (const entry of entries) {
        input.signal?.throwIfAborted();
        const current = feed.getSource(source.project_id, source.source_id);
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
            captured_at: at, provenance: entry.provenance, selected_for_context: false },
        });
        if (ingested.created) created++; else deduped++;
      }
      await feed.flushPendingJudgments();
      await beforeEffect();
      const completed = new Date().toISOString();
      const terminal: FeedSourceRunRecord = { ...run, phase: "terminal", outcome: "completed", empty: entries.length === 0,
        created_count: created, deduped_count: deduped, completed_at: completed, updated_at: completed,
        receipt: { repository, source_id: researchSource, revision, verified_packages: true } };
      feed.upsertSourceRun(terminal);
      const latest = feed.getSource(source.project_id, source.source_id);
      const saved = feed.upsertSource({ ...latest, status: latest.enabled ? "active" : "paused", cursor: { revision },
        last_sync_at: completed, last_outcome: "completed", last_error_code: null, updated_at: completed });
      return { source: saved, run: terminal, created, deduped, replayed: false };
    } catch (error) {
      await beforeEffect();
      const completed = new Date().toISOString();
      feed.upsertSourceRun({ ...run, phase: "interrupted", error_code: "research_library_sync_failed", updated_at: completed });
      const latest = feed.getSource(source.project_id, source.source_id);
      feed.upsertSource({ ...latest, status: latest.enabled ? "error" : "paused", last_error_code: "research_library_sync_failed", updated_at: completed });
      // Git errors can contain credential-bearing URLs from a helper; never return raw stderr.
      const message = error instanceof Error && !('stderr' in error) ? error.message : "无法读取 GitHub 研究库，请检查本机 Git 登录与仓库权限后重试";
      throw feedErrors.source_sync_interrupted(message);
    }
  }
}
