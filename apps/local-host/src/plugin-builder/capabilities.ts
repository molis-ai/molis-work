/**
 * Host side of the platform capabilities generated plugins may declare (catalog: `STUDIO_CAPABILITIES`).
 * The broker has already checked the id against the installation's grants; this layer checks the input and the
 * output against the catalog schemas, answers with the fixed stand-in where the real capability must not run, and
 * bounds how often one plugin may use a costly capability.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SandboxEffects, SandboxIdentity, SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { assertMatches, SandboxError, type SandboxLimits, type SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import { studioCapability, type StudioCapability } from '@molis-ai/molis-work-plugin-builder';

export interface CapabilityImplementations {
  /** A tool-less model call with the plugin's own instructions, on the model the person configured. */
  generate(pluginId: string, input: { instructions: string; input: string }, signal: AbortSignal): Promise<{ text: string }>;
}
type CapabilityService = NonNullable<SandboxServices['capability']>;
/** Real model calls one plugin identity may make per minute. */
export const MODEL_CALLS_PER_MINUTE = 20;

function known(id: string): StudioCapability {
  const capability = studioCapability(id);
  if (!capability) throw new SandboxError('CAPABILITY_DENIED', '平台没有这个能力：' + id);
  return capability;
}

/** Stand-ins only: tests, contract examples and sandbox checks. */
export function standInCapabilities(): CapabilityService {
  return { async call(_context, id, input) { const capability = known(id); assertMatches(capability.input, input); return capability.standIn(input); } };
}

/** The real capability for identities `live` accepts, the stand-in for every other identity. */
export function hostCapabilities(implementations: CapabilityImplementations, live: (identity: Readonly<SandboxIdentity>) => boolean): CapabilityService {
  const windows = new Map<string, number[]>();
  return {
    async call(context, id, input) {
      const capability = known(id); assertMatches(capability.input, input);
      if (!live(context.identity)) return capability.standIn(input);
      const key = [context.identity.pluginId, context.identity.namespace, context.identity.installationId].join('|'), now = Date.now();
      const recent = (windows.get(key) ?? []).filter(at => now - at < 60_000);
      if (recent.length >= MODEL_CALLS_PER_MINUTE) throw new SandboxError('RATE_LIMITED', '这个插件一分钟内调用模型的次数太多，请稍后再试');
      recent.push(now); windows.set(key, recent);
      const request = input as { instructions: string; input: string };
      const output = await implementations.generate(context.identity.pluginId, { instructions: request.instructions, input: request.input }, context.signal) as unknown as SandboxJson;
      assertMatches(capability.output, output);
      return output;
    },
  };
}

/** Operations that may wait on a slow capability; they get a sandbox process (lane) of their own. */
export function slowOperations(contract: { operations: ReadonlyArray<{ id: string; effects: SandboxEffects }> }): Set<string> {
  return new Set(contract.operations.filter(operation => (operation.effects.capabilities ?? []).some(id => (studioCapability(id)?.timeoutMs ?? 0) > 30_000)).map(operation => operation.id));
}
export type Lane = 'quick' | 'slow';

/** Model-call records a plugin keeps; each holds what the person sent and what the model answered. */
export const MODEL_RECORDS_KEPT = 50;
/** Keeps the newest `keep` record files in a directory; older ones are removed. A missing directory is fine. */
export async function keepNewestRecords(directory: string, keep = MODEL_RECORDS_KEPT): Promise<number> {
  const names = await readdir(directory).catch(() => [] as string[]);
  const files = await Promise.all(names.filter(name => name.endsWith('.json')).map(async name => ({ name, at: (await stat(join(directory, name)).catch(() => null))?.mtimeMs ?? 0 })));
  const old = files.sort((a, b) => b.at - a.at).slice(keep);
  await Promise.all(old.map(file => rm(join(directory, file.name), { force: true })));
  return old.length;
}

/** A plugin that may wait on a slow capability gets operation and service limits that fit one such call. */
export function capabilityLimits(effects: SandboxEffects): Partial<SandboxLimits> {
  const longest = Math.max(0, ...(effects.capabilities ?? []).map(id => studioCapability(id)?.timeoutMs ?? 0));
  return longest ? { serviceTimeoutMs: longest + 5_000, operationTimeoutMs: longest + 30_000 } : {};
}
