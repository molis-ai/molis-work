import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { readResearchLibrary } from "@molis-ai/molis-work-integration-github";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedApplication, FeedSourceRecord, FeedSourceRunRecord, FeedSourceSyncResult } from "@molis-ai/molis-work-plugin-feed";

const exec = promisify(execFile);
const running = new Map<string, { idempotencyKey: string; promise: Promise<FeedSourceSyncResult> }>();
const repositoryReads = new Map<string, Promise<{ revision: string; files: Map<string, string> }>>();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Host-owned Git cache; never fetches into a user's checkout or reads uncommitted files. */
async function repositorySnapshot(home: string, repository: string): Promise<{ revision: string; files: Map<string, string> }> {
  const directory = path.join(home, "cache", "research-library", hash(repository));
  const prior = repositoryReads.get(directory);
  if (prior) return prior;
  const read = (async () => {
    await mkdir(directory, { recursive: true });
    const git = async (args: string[]) => (await exec("git", ["-C", directory, ...args], {
      timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    })).stdout;
    try { await access(path.join(directory, "HEAD")); } catch { await git(["init", "--bare"]); }
    await git(["fetch", "--depth=1", `https://github.com/${repository}.git`, "main"]);
    const revision = (await git(["rev-parse", "FETCH_HEAD"])).trim();
    const files = new Map<string, string>();
    // A tree list bounds every subsequent read. Git blobs are pinned to revision.
    const names = (await git(["ls-tree", "-r", "--name-only", revision])).trim().split("\n");
    for (const name of names.filter((name) => name === "sources.json" || name === "catalog.json" || /^packages\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/(manifest.json|research.json|report.md)$/.test(name))) {
      files.set(name, await git(["show", `${revision}:${name}`]));
    }
    return { revision, files };
  })();
  repositoryReads.set(directory, read);
  try { return await read; } finally { repositoryReads.delete(directory); }
}

export function syncResearchLibrarySource(
  home: string, feed: FeedApplication, source: FeedSourceRecord,
  input: { idempotencyKey: string; signal?: AbortSignal },
): Promise<FeedSourceSyncResult> {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(input.idempotencyKey)) {
    throw new FeedDomainError("同步需要 8–128 位幂等键", "feed_source_idempotency_required");
  }
  if (!source.enabled || source.status === "paused" || source.status === "disconnected") {
    throw new FeedDomainError("来源已暂停，请先恢复", "feed_source_paused");
  }
  const key = `${home}:${source.board_id}:${source.source_id}`;
  const active = running.get(key);
  if (active) {
    if (active.idempotencyKey !== input.idempotencyKey) throw new FeedDomainError("该来源正在拉取，请稍后重试", "feed_source_sync_interrupted");
    return active.promise;
  }
  const promise = sync();
  running.set(key, { idempotencyKey: input.idempotencyKey, promise });
  void promise.finally(() => running.delete(key)).catch(() => undefined);
  return promise;

  async function sync(): Promise<FeedSourceSyncResult> {
    const operationId = `research-sync-${hash(`${source.source_id}:${input.idempotencyKey}`).slice(0, 32)}`;
    const previous = feed.getSourceRunByOperationId(source.board_id, operationId);
    if (previous?.phase === "terminal") return { source: feed.getSource(source.board_id, source.source_id), run: previous, created: 0, deduped: 0, replayed: true };
    const at = new Date().toISOString();
    const run: FeedSourceRunRecord = {
      board_id: source.board_id, source_id: source.source_id, operation_id: operationId,
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
      const snapshot = await repositorySnapshot(home, repository);
      const entries = await readResearchLibrary({ repository, source_id: researchSource, revision: snapshot.revision,
        async readText(name) { const text = snapshot.files.get(name); if (text === undefined) throw new Error(`发布包缺少 ${name}`); return text; },
      });
      let created = 0, deduped = 0;
      const existing = new Map(feed.snapshot(source.board_id).feed_items.filter(item => item.source_id === source.source_id).map(item => [item.external_id, item]));
      for (const entry of entries) {
        input.signal?.throwIfAborted();
        const current = feed.getSource(source.board_id, source.source_id);
        if (!current.enabled) throw new Error("来源已暂停");
        const externalId = `${repository}:${researchSource}:${entry.id}`;
        // An unrelated repository commit does not change an immutable research package.
        if (existing.get(externalId)?.materials.some(material => material.provenance.manifest_sha256 === entry.provenance.manifest_sha256)) { deduped++; continue; }
        const ingested = feed.ingestItem({ source: current, externalId,
          title: entry.title, summary: entry.summary, body: entry.body, url: entry.url,
          occurredAt: entry.published_at, tags: entry.tags, attention: false,
          material: { material_id: `research-${hash(`${repository}:${entry.id}`).slice(0, 32)}`,
            canonical_url: entry.url, title: entry.title, source_name: source.name, published_at: entry.published_at,
            preview: entry.body, content_hash: hash(entry.body), content_ref: `research:${entry.id}`,
            content_available: false, content_type: "text/markdown", character_count: entry.body.length,
            captured_at: at, provenance: entry.provenance, selected_for_context: false },
        });
        if (ingested.created) created++; else deduped++;
      }
      await feed.flushPendingJudgments();
      const completed = new Date().toISOString();
      const terminal: FeedSourceRunRecord = { ...run, phase: "terminal", outcome: "completed", empty: entries.length === 0,
        created_count: created, deduped_count: deduped, completed_at: completed, updated_at: completed,
        receipt: { repository, source_id: researchSource, revision: snapshot.revision, verified_packages: true } };
      feed.upsertSourceRun(terminal);
      const latest = feed.getSource(source.board_id, source.source_id);
      const saved = feed.upsertSource({ ...latest, status: latest.enabled ? "active" : "paused", cursor: { revision: snapshot.revision },
        last_sync_at: completed, last_outcome: "completed", last_error_code: null, updated_at: completed });
      return { source: saved, run: terminal, created, deduped, replayed: false };
    } catch (error) {
      const completed = new Date().toISOString();
      feed.upsertSourceRun({ ...run, phase: "interrupted", error_code: "research_library_sync_failed", updated_at: completed });
      const latest = feed.getSource(source.board_id, source.source_id);
      feed.upsertSource({ ...latest, status: latest.enabled ? "error" : "paused", last_error_code: "research_library_sync_failed", updated_at: completed });
      // Git errors can contain credential-bearing URLs from a helper; never return raw stderr.
      const message = error instanceof Error && !('stderr' in error) ? error.message : "无法读取 GitHub 研究库，请检查本机 Git 登录与仓库权限后重试";
      throw new FeedDomainError(message, "feed_source_sync_interrupted");
    }
  }
}
