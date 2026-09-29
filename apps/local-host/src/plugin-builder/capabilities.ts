/**
 * Host side of the platform capabilities generated plugins may declare (catalog: `STUDIO_CAPABILITIES`).
 * The broker has already checked the id against the installation's grants; this layer checks the input and the
 * output against legacy schemas and translates old Goals shapes. Current capabilities execute through ActionService.
 */
import type { ActionExecutionPolicy } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SandboxEffects, SandboxIdentity, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { assertMatches, SandboxError, type SandboxLimits, type SandboxServices, type SandboxServiceContext } from '@molis-ai/molis-work-plugin-sandbox';
import { studioCapability, type StudioCapability } from '@molis-ai/molis-work-plugin-builder';

export interface CapabilityImplementations {
  /** A tool-less model call with the plugin's own instructions, on the model the person configured. */
  generate(pluginId: string, input: { instructions: string; input: string }, signal: AbortSignal, beforeDispatch?: () => void | Promise<void>): Promise<{ text: string }>;
  /** The project's goals, reached through the Goals plugin's own actions as this plugin installation. */
  goals?: {
    list(identity: Readonly<SandboxIdentity>, control?: SandboxServiceContext): Promise<Array<{ id: string; title: string; status: string }>>;
    note(identity: Readonly<SandboxIdentity>, input: { goalId: string; text: string }, control?: SandboxServiceContext): Promise<{ recorded: boolean }>;
  };
}
type CapabilityService = NonNullable<SandboxServices['capability']>;

function known(id: string): StudioCapability {
  const capability = studioCapability(id);
  if (!capability) throw new SandboxError('CAPABILITY_DENIED', '平台没有这个能力：' + id);
  return capability;
}

/** Stand-ins only: tests, contract examples and sandbox checks. */
export function standInCapabilities(): CapabilityService {
  return { async call(_context, id, input) { const capability = known(id); assertMatches(capability.input, input); return capability.standIn(input); } };
}

/** Older releases keep their Goals input/output shapes; all other calls use the unified provider. */
export function hostCapabilities(options: { goals?: CapabilityImplementations['goals']; current: CapabilityService }, live: (identity: Readonly<SandboxIdentity>) => boolean): CapabilityService {
  return {
    async call(context, id, input) {
      const capability = known(id); assertMatches(capability.input, input);
      if (!live(context.identity) || capability.writes && context.identity.namespace !== 'installed') return capability.standIn(input);
      let output: SandboxJson;
      if (id === 'goals.list' || id === 'goals.note') {
        const goals = options.goals;
        if (!goals) throw new SandboxError('CAPABILITY_UNAVAILABLE', '这个项目还不能提供目标能力');
        output = (id === 'goals.list' ? await goals.list(context.identity, context) : await goals.note(context.identity, input as { goalId: string; text: string }, context)) as unknown as SandboxJson;
      } else output = await options.current.call(context, id, input);
      assertMatches(capability.output, output);
      return output;
    },
  };
}

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
