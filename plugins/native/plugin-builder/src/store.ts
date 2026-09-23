import { randomUUID } from "node:crypto";
import type { PluginPrivateStorage } from "@molis-ai/molis-work-contracts/platform/plugin";
import { BuilderError, type BuildDocument, type Design, type Release } from "./model.js";
import { parseBehavior, parseDesign, parseNodes } from "./validation.js";

interface BuilderState { builds: BuildDocument[]; releases: Release[]; activeVersions: Record<string, number> }
const KEY = "plugin-builder:state:v1";
const clone = <T>(value: T): T => structuredClone(value);
function conflict(): never { throw new BuilderError("revision_conflict", "内容已被其他操作更新，请刷新后重试"); }

/** Conservatively protect stored records even when their installation is not mounted. */
function compatible(previous: Design, next: Design): void {
  const fields = new Map(next.fields.map(field => [field.id, field]));
  for (const old of previous.fields) {
    const replacement = fields.get(old.id);
    if (!replacement) throw new BuilderError("incompatible_release", `无法删除已发布字段「${old.label}」；正式数据可能仍在使用`);
    if (replacement.type !== old.type) throw new BuilderError("incompatible_release", `无法更改已发布字段「${old.label}」的类型`);
    if (!old.required && replacement.required) throw new BuilderError("incompatible_release", `无法将已发布的可选字段「${old.label}」改为必填`);
  }
  const previousIds = new Set(previous.fields.map(field => field.id));
  for (const field of next.fields) {
    if (!previousIds.has(field.id) && field.required) throw new BuilderError("incompatible_release", `新增字段「${field.label}」必须为可选，才能保留既有记录`);
  }
}

export class BuilderStore {
  constructor(private readonly storage: PluginPrivateStorage) {
    if (!storage.compareAndSet) throw new BuilderError("storage_unavailable", "插件创作需要支持 compareAndSet 的私有存储");
  }
  private read(): { raw: string | null; state: BuilderState } {
    const raw = this.storage.get(KEY);
    return { raw, state: raw === null ? { builds: [], releases: [], activeVersions: {} } : JSON.parse(raw) as BuilderState };
  }
  private write(raw: string | null, state: BuilderState): void {
    if (!this.storage.compareAndSet!(KEY, raw, JSON.stringify(state))) conflict();
  }
  list(): BuildDocument[] { return this.read().state.builds.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone); }
  get(id: string): BuildDocument | null { return clone(this.read().state.builds.find(item => item.id === id) ?? null); }
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
  release(id: string, expectedRevision: number): Release {
    const { raw, state } = this.read();
    const doc = state.builds.find(item => item.id === id);
    if (!doc) throw new BuilderError("not_found", "找不到这个创作草稿");
    if (doc.revision !== expectedRevision) conflict();
    if (doc.phase !== "ready" || doc.active || !doc.design || !doc.behavior) throw new BuilderError("not_ready", "界面与功能全部完成后才能发布");
    const design = parseDesign(doc.design), nodes = parseNodes(doc.nodes, design), behavior = parseBehavior(doc.behavior, design);
    const versions = state.releases.filter(item => item.buildId === id);
    // All prior versions may have written records, including versions no longer active.
    for (const previous of versions) compatible(previous.design, design);
    const release: Release = {
      buildId: id, pluginId: `io.molis.work.generated.${id}`, version: Math.max(0, ...versions.map(item => item.version)) + 1,
      design, nodes, behavior, publishedAt: new Date().toISOString(),
    };
    state.releases.push(release); state.activeVersions[id] = release.version;
    doc.revision += 1; doc.updatedAt = release.publishedAt;
    this.write(raw, state); return clone(release);
  }
  releases(): Release[] {
    const { state } = this.read();
    return state.releases.filter(item => state.activeVersions[item.buildId] === item.version).map(clone);
  }
  versions(id: string): Release[] { return this.read().state.releases.filter(item => item.buildId === id).sort((a, b) => b.version - a.version).map(clone); }
  activate(id: string, version: number, expectedRevision?: number): Release {
    const { raw, state } = this.read();
    const doc = state.builds.find(item => item.id === id);
    if (expectedRevision !== undefined && doc?.revision !== expectedRevision) conflict();
    const release = state.releases.find(item => item.buildId === id && item.version === version);
    if (!release) throw new BuilderError("not_found", "找不到这个发布版本");
    for (const previous of state.releases.filter(item => item.buildId === id)) compatible(previous.design, release.design);
    state.activeVersions[id] = version;
    if (doc) { doc.revision += 1; doc.updatedAt = new Date().toISOString(); }
    this.write(raw, state); return clone(release);
  }
  undo(id: string, expectedRevision: number): BuildDocument {
    return this.update(id, expectedRevision, doc => {
      const previous = doc.history.pop();
      if (!previous) throw new BuilderError("nothing_to_undo", "没有可以撤销的修改");
      doc.design = clone(previous.design); doc.nodes = clone(previous.nodes); doc.behavior = clone(previous.behavior);
      doc.phase = doc.design && doc.nodes.length && doc.behavior ? "ready" : "draft";
      doc.pendingNodes = []; doc.active = null; doc.error = null;
    });
  }
}
