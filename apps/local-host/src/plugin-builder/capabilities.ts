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
  /**
   * A tool-less model call on the model the person configured, with one of the plugin's declared prompts (by id, as
   * the person left it) or, from plugins generated before prompts were declared, inline instructions.
   */
  generate(pluginId: string, input: ModelGenerateInput, signal: AbortSignal): Promise<{ text: string }>;
  /** The project's goals, reached through the Goals plugin's own actions as this plugin installation. */
  goals?: {
    list(identity: Readonly<SandboxIdentity>): Promise<Array<{ id: string; title: string; status: string }>>;
    note(identity: Readonly<SandboxIdentity>, input: { goalId: string; text: string }): Promise<{ recorded: boolean }>;
  };
  /** Reminders the platform delivers to the person's Inbox; a plugin only sees its own. */
  reminders?: {
    add(identity: Readonly<SandboxIdentity>, input: { at: string; text: string; repeat?: 'none' | 'daily' | 'weekly' }): { reminderId: string } | Promise<{ reminderId: string }>;
    cancel(identity: Readonly<SandboxIdentity>, input: { reminderId: string }): { cancelled: boolean } | Promise<{ cancelled: boolean }>;
  };
  /** Runs of the plugin's own operations at set times; only designs made against the catalog reach them. */
  schedules?: {
    add(identity: Readonly<SandboxIdentity>, input: { operation: string; at: string; repeat?: 'none' | 'daily' | 'weekly'; input?: SandboxJson; inbox?: boolean }): { scheduleId: string } | Promise<{ scheduleId: string }>;
    cancel(identity: Readonly<SandboxIdentity>, input: { scheduleId: string }): { cancelled: boolean } | Promise<{ cancelled: boolean }>;
  };
}
type CapabilityService = NonNullable<SandboxServices['capability']>;
export interface ModelGenerateInput { prompt?: string; instructions?: string; input: string }
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
      // A capability that writes outside the plugin only writes for the installed plugin; a trial gets the stand-in.
      if (!live(context.identity) || capability.writes && context.identity.namespace !== 'installed') return capability.standIn(input);
      let output: SandboxJson;
      if (id === 'model.generate') {
        const key = [context.identity.pluginId, context.identity.namespace, context.identity.installationId].join('|'), now = Date.now();
        const recent = (windows.get(key) ?? []).filter(at => now - at < 60_000);
        if (recent.length >= MODEL_CALLS_PER_MINUTE) throw new SandboxError('RATE_LIMITED', '这个插件一分钟内调用模型的次数太多，请稍后再试');
        recent.push(now); windows.set(key, recent);
        output = await implementations.generate(context.identity.pluginId, input as unknown as ModelGenerateInput, context.signal) as unknown as SandboxJson;
      } else if (id.startsWith('reminders.')) {
        const reminders = implementations.reminders;
        if (!reminders) throw new SandboxError('CAPABILITY_UNAVAILABLE', '这个项目还不能设置提醒');
        try {
          output = (id === 'reminders.add' ? await reminders.add(context.identity, input as { at: string; text: string; repeat?: 'none' | 'daily' | 'weekly' })
            : await reminders.cancel(context.identity, input as { reminderId: string })) as unknown as SandboxJson;
        } catch (error) { throw new SandboxError('CAPABILITY_REFUSED', error instanceof Error ? error.message : String(error)); }
      } else {
        const goals = implementations.goals;
        if (!goals) throw new SandboxError('CAPABILITY_UNAVAILABLE', '这个项目还不能提供目标能力');
        output = (id === 'goals.list' ? await goals.list(context.identity) : await goals.note(context.identity, input as { goalId: string; text: string })) as unknown as SandboxJson;
      }
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
