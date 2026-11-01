import type { AgentBuild } from './agent-model.js';
import type { AgentBuilderPorts } from './agent-workflow.js';

/** Reuse the written source and existing gates for a changed target; this path never opens a model session. */
export async function recheckAgentBuild(ports: AgentBuilderPorts, read: () => AgentBuild,
  change: (mutate: (build: AgentBuild) => void) => void, current: () => void, signal: AbortSignal): Promise<void> {
  const initial = read();
  if (!initial.design || !initial.directory || initial.nodes.length !== initial.design.parts.length) throw new Error('请先完成这个草稿的功能与界面');
  await ports.resetPreview(initial.id, current); current();
  const checked = await ports.check(read(), initial.design.contract.operations.map(item => item.id), signal); current();
  change(build => { build.checks.global = checked; build.checksScope = build.runtimeScope; });
  if (!checked.passed) throw new Error('目标范围检查未通过：' + (checked.gates.find(gate => !gate.passed)?.detail ?? ''));
  change(build => { build.connected = build.design!.contract.operations.map(item => item.id); });
  const browser = await ports.browserAcceptance(read(), signal); current();
  change(build => { build.browserResult = browser; });
  if (!browser.passed) throw new Error('目标范围的界面验收未通过：' + (browser.cases.find(item => !item.passed)?.detail ?? ''));
  // Queries also traverse the real target's service identity. Commands keep the existing preview stand-ins.
  for (const operation of initial.design.contract.operations) {
    if (operation.kind !== 'query' || !operation.effects.capabilities?.length) continue;
    await ports.call(read(), operation.id, operation.examples.find(example => example.error === undefined)?.input ?? {},
      { signal, beforeEffect: async () => { signal.throwIfAborted(); current(); } });
    current();
  }
  change(build => { build.active = null; build.phase = 'ready'; build.scopeCheckPending = undefined; build.error = null; });
}
