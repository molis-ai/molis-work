import type { BuildCheckResult } from '@molis-ai/molis-work-contracts/platform/plugin-builder';
import type { AgentBuild } from './agent-model.js';

interface PresentationContinuation {
  read(): AgentBuild;
  current(): void;
  change(mutate: (build: AgentBuild) => void): void;
  check(): Promise<BuildCheckResult>;
  compose(request: string): Promise<void>;
  acceptance(): Promise<NonNullable<AgentBuild['browserResult']>>;
  review(): Promise<void>;
}

/** A portable passing observation is not this device's executable bundle. Only explicit continuation may rebuild it. */
export async function reviseCheckedPresentation(port: PresentationContinuation): Promise<void> {
  const build = port.read();
  if (!build.design || !build.checks.global?.passed) throw new Error('功能验证通过后才能调整界面');
  if (!build.checks.global.bundlePath) {
    const checked = await port.check();
    port.current();
    port.change(value => { value.checks.global = checked; });
    if (!checked.passed) throw new Error('发布前整体门禁失败：' + (checked.gates.find(gate => !gate.passed)?.detail ?? ''));
  }
  await port.compose(port.read().pendingVisual ?? '继续完善当前界面');
  const result = await port.acceptance();
  if (!result.passed) throw new Error('界面调整后的交互验收未通过，可以修改或撤回；后端保持原样');
  await port.review();
  port.change(value => { value.active = null; value.pendingVisual = undefined; value.phase = 'ready'; value.error = null; });
}
