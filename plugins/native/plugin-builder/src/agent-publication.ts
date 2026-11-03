import type { PluginExecutionControl } from '@molis-ai/molis-work-contracts/platform/plugin';
import { effectsFromContract } from '@molis-ai/molis-work-plugin-sdk';
import type { AgentBuild, AgentPublicationControl, AgentRelease } from './agent-model.js';
import type { AgentBuilderStore } from './agent-store.js';
import type { AgentBuilderPorts } from './agent-workflow.js';

export const buildScope = (build: Pick<AgentBuild, 'runtimeScope'>): 'project' | 'home' => build.runtimeScope === 'home' ? 'home' : 'project';
export const releaseScope = (release: AgentRelease): 'project' | 'home' => release.distribution?.runtime_scope ?? 'project';

/** Qualification is checked again inside the store's single read/CAS, not only before publishing awaits. */
export function assertPublicationReady(build: AgentBuild): void {
  if (build.phase !== 'ready' || build.active || build.scopeCheckPending || !build.design || !build.browserResult?.passed || !build.checks.global?.passed
    || !build.checks.global.bundlePath || build.checksScope !== build.runtimeScope) throw new Error('目标范围的功能检查和浏览器验收全部通过后才能发布');
}

export async function publishAgentBuild(store: AgentBuilderStore, ports: AgentBuilderPorts, build: AgentBuild,
  authority: PluginExecutionControl | undefined, assertOpen: () => void): Promise<AgentRelease> {
  if (!authority?.assert_authority_current || !authority.signal) throw new Error('发布需要当前调用的持续授权');
  const signal = authority.signal;
  assertPublicationReady(build);
  const versions = store.versions(build.id), latest = versions[0], scope = buildScope(build);
  if (versions.some(item => releaseScope(item) !== scope)) throw new Error('已发布草稿的范围不能改变，请创建新的草稿');
  if (latest && latest.design.contract.revision === build.design!.contract.revision && JSON.stringify(latest.nodes) === JSON.stringify(build.nodes)
    && JSON.stringify(latest.design.presentation) === JSON.stringify(build.design!.presentation)) throw new Error('v' + latest.version + ' 已经是当前这一版，没有新的改动可以发布');
  const version = (latest?.version ?? 0) + 1;
  const manifest = { version: 1 as const, pluginId: build.design!.contract.pluginId, revision: build.design!.contract.revision, effects: effectsFromContract(build.design!.contract) };
  const assertCurrent = () => {
    assertOpen(); signal.throwIfAborted(); authority.assert_authority_current!();
    const current = store.require(build.id);
    if (current.revision !== build.revision || buildScope(current) !== scope) throw new Error('发布候选已改变，请重新检查');
    if (store.versions(build.id).some(item => item.version >= version)) throw new Error('发布版本已存在');
    assertPublicationReady(current);
  };
  const control: AgentPublicationControl = {
    signal, assertCurrent,
    async beforeEffect() { await authority.beforeEffect(); assertCurrent(); },
    versions: () => store.versions(build.id), referenced: directory => store.referencesDirectory(directory),
    commit(artifact) {
      assertCurrent();
      const release: AgentRelease = { buildId: build.id, pluginId: manifest.pluginId, version, design: build.design!, nodes: build.nodes,
        manifest, permissions: manifest.effects, publishedAt: new Date().toISOString(), ...artifact };
      store.release(release, build.revision); return release;
    },
  };
  await control.beforeEffect();
  return ports.publish(build, manifest, build.checks.global!.bundlePath!, version, control);
}
