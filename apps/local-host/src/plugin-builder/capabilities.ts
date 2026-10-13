/**
 * Host side of the capabilities generated plugins call: execution limits and policy bindings for entries of the
 * project's action catalog. The platform's own `model.generate` is implemented by `generate`.
 */
import type { ActionCallContext, ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxLimits } from '@molis-ai/molis-work-plugin-sandbox';

export interface CapabilityImplementations {
  /** A tool-less model call on the model the person configured, with one of the plugin's declared prompts (by id, as the person left it). */
  generate(pluginId: string, input: ModelGenerateInput, signal: AbortSignal, beforeDispatch?: () => void | Promise<void>, caller?: PluginModelCaller): Promise<{ text: string }>;
}
export interface ModelGenerateInput { prompt: string; input: string }
export type PluginModelCaller = Pick<ActionCallContext, 'project_id' | 'plugin_install_id'>;

export interface CapabilityExecution {
  id: string; version?: number; provider_id?: string; offered?: boolean; installed?: boolean;
  effect?: 'read' | 'write' | 'irreversible'; execution?: ActionExecutionPolicy;
}

/** Only dependencies of this operation participate; unrelated catalog changes must not revoke its work. */
export function capabilityPolicyBinding(effects: SandboxEffects, capabilities: readonly CapabilityExecution[]): string {
  return JSON.stringify([...(effects.capabilities ?? [])].sort().map(id => {
    const entry = latestCapability(capabilities, id), policy = entry?.execution;
    return [id, entry?.provider_id ?? null, entry?.version ?? null, entry?.offered ?? null, entry?.installed ?? null, entry?.effect ?? null,
      policy?.timeout_ms ?? null, policy?.cost ?? 'unknown', policy?.max_calls_per_minute ?? null];
  }));
}
/** Keep metadata and dispatch on the same offered version; private entries cannot set a public call's limits. */
export function latestCapability<T extends CapabilityExecution>(capabilities: readonly T[], id: string): T | undefined {
  return capabilities.filter(item => item.id === id && item.offered !== false).sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
}
/** Unspecified providers retain the existing catalog entry ceiling, without claiming that the provider declared it. */
const capabilityTimeout = (id: string, capabilities: readonly CapabilityExecution[]) => latestCapability(capabilities, id)?.execution?.timeout_ms ?? 30_000;
/** Operations that may wait on a slow capability; they get a sandbox process (lane) of their own. */
export function slowOperations(contract: { operations: ReadonlyArray<{ id: string; effects: SandboxEffects }> }, capabilities: readonly CapabilityExecution[]): Set<string> {
  return new Set(contract.operations.filter(operation => (operation.effects.capabilities ?? []).some(id => capabilityTimeout(id, capabilities) > 30_000)).map(operation => operation.id));
}
export type Lane = 'quick' | 'slow';

/** A plugin that may wait on a slow capability gets operation and service limits that fit one such call. */
export function capabilityLimits(effects: SandboxEffects, capabilities: readonly CapabilityExecution[]): Partial<SandboxLimits> {
  const longest = Math.max(0, ...(effects.capabilities ?? []).map(id => capabilityTimeout(id, capabilities)));
  return longest ? { serviceTimeoutMs: Math.min(2_147_483_647, longest + 5_000), operationTimeoutMs: Math.min(2_147_483_647, longest + 30_000) } : {};
}
