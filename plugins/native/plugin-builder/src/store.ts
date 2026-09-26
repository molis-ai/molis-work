import { randomUUID } from "node:crypto";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import { BuilderError, type BuildDocument, type Release } from "./model.js";
import { parseBehavior, parseDesign, parseNodes } from "./validation.js";
import { fullyWired } from "./activity.js";

interface BuilderState { builds: BuildDocument[]; releases: Release[] }
interface PersistedBuilderState extends BuilderState {
  /** Legacy selection; installed versions now come from Plugin Runtime records. */
  activeVersions?: Record<string, number>;
}
const KEY = "plugin-builder:state:v1";
const clone = <T>(value: T): T => structuredClone(value);
function conflict(): never { throw new BuilderError("revision_conflict", "内容已被其他操作更新，请刷新后重试"); }

export class BuilderStore {
  constructor(private readonly storage: PluginPrivateStorage) {
    if (!storage.compareAndSet) throw new BuilderError("storage_unavailable", "插件创作需要支持 compareAndSet 的私有存储");
  }
  private read(): { raw: string | null; state: BuilderState } {
    const raw = this.storage.get(KEY);
    if (raw === null) return { raw, state: { builds: [], releases: [] } };
    // Older Builder records used activeVersions as both the latest published
    // release and the version being served. Keep their release history, but
    // let Plugin Runtime remain authoritative for the installed version.
    const { builds, releases } = JSON.parse(raw) as PersistedBuilderState;
    return { raw, state: { builds, releases } };
  }
  private write(raw: string | null, state: BuilderState): void {
    if (!this.storage.compareAndSet!(KEY, raw, JSON.stringify(state))) conflict();
  }
  list(): BuildDocument[] { return this.read().state.builds.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone); }
  get(id: string): BuildDocument | null { return clone(this.read().state.builds.find(item => item.id === id) ?? null); }
  remove(id: string, expectedRevision: number): void {
    const { raw, state } = this.read();
    const index = state.builds.findIndex(item => item.id === id);
    if (index < 0) throw new BuilderError("not_found", "找不到这个创作草稿");
    const doc = state.builds[index]!;
    if (doc.revision !== expectedRevision) conflict();
    if (doc.active) throw new BuilderError("build_active", "请先停止构建，再删除草稿");
    if (state.releases.some(item => item.buildId === id)) throw new BuilderError("published", "已发布插件不能从作品库删除；已安装版本仍在使用");
    state.builds.splice(index, 1);
    this.write(raw, state);
    try { this.storage.delete(`plugin-builder:records:preview:${id}`); }
    catch { /* Draft removal has already committed; orphaned preview data is inaccessible. */ }
  }
  create(brief: string): BuildDocument {
    if (typeof brief !== "string" || !brief.trim()) throw new BuilderError("invalid_input", "先写下你想做的插件");
    const { raw, state } = this.read(), now = new Date().toISOString();
    const doc: BuildDocument = {
      id: randomUUID(), revision: 1, title: brief.trim().slice(0, 80), brief: brief.trim(), phase: "draft",
      messages: [{ role: "user", text: brief.trim() }], questions: [], candidates: [], design: null, nodes: [], pendingNodes: [],
      behavior: null, active: null, error: null, history: [], createdAt: now, updatedAt: now,
    };
    state.builds.push(doc); this.write(raw, state); return clone(doc);
  }
  update(id: string, expectedRevision: number, mutate: (doc: BuildDocument) => void): BuildDocument {
    const { raw, state } = this.read();
    const doc = state.builds.find(item => item.id === id);
    if (!doc) throw new BuilderError("not_found", "找不到这个创作草稿");
    if (doc.revision !== expectedRevision) conflict();
    const createdAt = doc.createdAt;
    mutate(doc);
    doc.id = id; doc.revision = expectedRevision + 1; doc.createdAt = createdAt; doc.updatedAt = new Date().toISOString();
    this.write(raw, state); return clone(doc);
  }
  release(id: string, expectedRevision: number, compatibleWithPrevious?: boolean): Release {
    const { raw, state } = this.read();
    const doc = state.builds.find(item => item.id === id);
    if (!doc) throw new BuilderError("not_found", "找不到这个创作草稿");
    if (doc.revision !== expectedRevision) conflict();
    if (doc.phase !== "ready" || doc.active || !doc.design || !doc.behavior) throw new BuilderError("not_ready", "界面与功能全部完成后才能发布");
    const design = parseDesign(doc.design), nodes = parseNodes(doc.nodes, design), behavior = parseBehavior(doc.behavior, design);
    const versions = state.releases.filter(item => item.buildId === id);
    if (versions.length && typeof compatibleWithPrevious !== "boolean") {
      throw new BuilderError("compatibility_required", "请选择新版本直接兼容上一发布，或在用户升级时校验已有数据");
    }
    const release: Release = {
      buildId: id, pluginId: `io.molis.work.generated.${id}`, version: Math.max(0, ...versions.map(item => item.version)) + 1,
      design, nodes, behavior, ...(versions.length ? { compatibleWithPrevious } : {}), publishedAt: new Date().toISOString(),
    };
    state.releases.push(release);
    doc.revision += 1; doc.updatedAt = release.publishedAt;
    this.write(raw, state); return clone(release);
  }
  releases(): Release[] {
    const { state } = this.read(), latest = new Map<string, Release>();
    for (const release of state.releases) {
      const prior = latest.get(release.buildId);
      if (!prior || release.version > prior.version) latest.set(release.buildId, release);
    }
    return [...latest.values()].map(clone);
  }
  versions(id: string): Release[] { return this.read().state.releases.filter(item => item.buildId === id).sort((a, b) => b.version - a.version).map(clone); }
  undo(id: string, expectedRevision: number): BuildDocument {
    return this.update(id, expectedRevision, doc => {
      const previous = doc.history.pop();
      if (!previous) throw new BuilderError("nothing_to_undo", "没有可以撤销的修改");
      doc.design = clone(previous.design); doc.nodes = clone(previous.nodes); doc.behavior = clone(previous.behavior);
      doc.connected = previous.connected === undefined ? undefined : [...previous.connected];
      doc.pendingNodes = []; doc.active = null; doc.error = null; doc.assembling = false;
      doc.phase = doc.design && doc.nodes.length && fullyWired(doc) ? "ready" : doc.design ? "paused" : "draft";
    });
  }
}
