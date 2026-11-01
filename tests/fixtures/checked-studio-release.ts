import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import { AgentBuilderStore, type AgentBuild, type AgentRelease } from '@molis-ai/molis-work-plugin-builder';

/** Fixed source/check results for installation and prompt fixtures, never evidence that generation or real checks ran.
 * The production store still checks the current candidate and commits the release through its real read/CAS. */
export function publishCheckedStudioFixture(storage: PluginPrivateStorage, release: AgentRelease): void {
  const builder = new AgentBuilderStore(storage);
  if (!builder.get(release.buildId)) {
    const draft = builder.create('Checked installation fixture');
    // Some installation tests require the same fixed publishing identity in two projects, or a specific sort order.
    // Seed that draft identity only; qualification and release below use the production store contract.
    const key = 'plugin-builder:agent-built:v1';
    const state = JSON.parse(storage.get(key)!) as { builds: AgentBuild[]; releases: AgentRelease[] };
    state.builds.find(build => build.id === draft.id)!.id = release.buildId;
    storage.set(key, JSON.stringify(state));
  }
  const current = builder.require(release.buildId), checked = builder.update(current.id, current.revision, build => {
    build.design = structuredClone(release.design); build.nodes = structuredClone(release.nodes); build.directory = release.directory;
    build.phase = 'ready'; build.active = null; build.scopeCheckPending = undefined;
    build.runtimeScope = release.distribution?.runtime_scope === 'home' ? 'home' : undefined; build.checksScope = build.runtimeScope;
    build.checks = { global: { passed: true, bundlePath: release.bundlePath, gates: [] } };
    build.browserResult = { passed: true, cases: [], at: release.publishedAt };
    build.connected = release.design.contract.operations.map(operation => operation.id);
  });
  builder.release(release, checked.revision);
}
