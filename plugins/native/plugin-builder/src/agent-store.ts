import { randomUUID } from 'node:crypto';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
const deletionErrors=defineErrorCodes('plugin_builder',{draft_deletion_unavailable:'unavailable'});
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { AgentBuild, AgentRelease } from './agent-model.js';
import {nextBuilderRevision,parseBuilderState,type BuilderSavedState} from './agent-state.js';
const KEY = 'plugin-builder:agent-built:v1';
export class AgentBuilderStore {
  constructor(private readonly storage: PluginPrivateStorage) { if (!storage.compareAndSet) throw new Error('Builder requires atomic compareAndSet storage'); }
  private read() { const raw = this.storage.get(KEY); return { raw, state:parseBuilderState(raw) }; }
  private write(raw: string | null, state: BuilderSavedState) { const value=JSON.stringify(state);parseBuilderState(value);if (!this.storage.compareAndSet!(KEY, raw, value)) throw Object.assign(new Error('草稿已更新，请重试'), { code: 'revision_conflict' }); }
  list() { return structuredClone(this.read().state.builds).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  get(id: string) { return structuredClone(this.read().state.builds.find(item => item.id === id) ?? null); }
  require(id: string) { const value = this.get(id); if (!value) throw new Error('找不到这个创作草稿'); return value; }
  create(brief: string) {
    if (typeof brief !== 'string' || !brief.trim() || brief.length > 48_000) throw new Error('请填写不超过 48000 字的需求');
    const { raw, state } = this.read(), now = new Date().toISOString();
    const build: AgentBuild = { id: randomUUID(), revision: 1, brief: brief.trim(), title: brief.trim().slice(0, 60), phase: 'draft',
      messages: [{ role: 'user', text: brief.trim() }], candidates: [], questions: [], clarificationAnswered: false,
      design: null, nodes: [], connected: [], active: null, steps: [], checks: {}, runs: [], history: [], error: null, createdAt: now, updatedAt: now };
    build.revision=nextBuilderRevision(state.revisions[build.id]??0);state.revisions[build.id]=build.revision;
    state.builds.push(build); this.write(raw, state); return structuredClone(build);
  }
  update(id: string, revision: number, mutate: (build: AgentBuild) => void) {
    const { raw, state } = this.read(), build = state.builds.find(item => item.id === id);
    if (!build || build.revision !== revision) throw Object.assign(new Error('草稿已更新，请重试'), { code: 'revision_conflict' });
    const next=nextBuilderRevision(revision);mutate(build); build.id = id; build.revision = next;state.revisions[id]=next; build.updatedAt = new Date().toISOString(); this.write(raw, state); return structuredClone(build);
  }
  release(release: AgentRelease) { const { raw, state } = this.read(); if (state.releases.some(item => item.buildId === release.buildId && item.version === release.version)) throw new Error('发布版本已存在'); state.releases.push(structuredClone(release)); this.write(raw, state); }
  versions(id: string) { return structuredClone(this.read().state.releases.filter(item => item.buildId === id).sort((a, b) => b.version - a.version)); }
  releases() { const found = new Map<string, AgentRelease>(); for (const item of this.read().state.releases) if ((found.get(item.pluginId)?.version ?? 0) < item.version) found.set(item.pluginId, item); return structuredClone([...found.values()]); }
  remove(_id: string, _revision: number): never { throw deletionErrors.draft_deletion_unavailable('草稿删除暂未开放，完整创作及文件已保留'); }
}
