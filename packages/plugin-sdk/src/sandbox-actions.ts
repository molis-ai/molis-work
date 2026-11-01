import { createHash } from 'node:crypto';
import type { ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxOperationContract, SandboxPluginContract, SandboxSchema, SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { sandboxOperationPermissions } from './sandbox-manifest.js';

/** The package identity already used for installed signed releases. It never depends on the running directory. */
export const sandboxPackageBuildId = (pluginId: string, signature: string) => createHash('sha256').update(JSON.stringify([pluginId, signature])).digest('hex').slice(0, 32);
export const sandboxActionId = (buildId: string, operationId: string) => 'generated.' + buildId.slice(0, 8) + '.' + operationId;

function requiredPath(schema: SandboxSchema, path: unknown): SandboxSchema | undefined {
  if (typeof path !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(path) || path.length > 256) return;
  let current = schema;
  for (const part of path.split('.')) {
    if (current.type !== 'object' || !current.required?.includes(part) || !current.properties?.[part]) return;
    current = current.properties[part]!;
  }
  return current;
}

/** Shared by contract admission and static reconstruction; no provider names or runtime authority come from the package. */
export function sandboxBackgroundProblems(contract: SandboxPluginContract): string[] {
  const problems: string[] = [];
  for (const operation of contract.operations) {
    for (const target of operation.effects.background ?? []) {
      const started = contract.operations.find(item => item.id === target);
      if (!started || started.kind !== 'command' || started.effects.background?.length) {
        problems.push(`Background effect ${target} of ${operation.id} must name a command of the contract that starts no background work`);
      }
    }
    const raw: unknown = operation.background_job;
    if (!operation.effects.background?.length && raw === undefined) continue;
    const prefix = `Background job of ${operation.id}: `;
    const fail = (message: string) => problems.push(prefix + message);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { fail('a launcher requires background_job'); continue; }
    if (operation.kind !== 'command' || !operation.effects.background?.length) fail('only a command with background effects may declare metadata');
    const job = raw as Record<string, unknown>;
    if (Object.keys(job).some(key => !['status', 'id', 'input', 'state', 'done', 'failed'].includes(key))) fail('unsupported metadata field');
    const status = typeof job.status === 'string' ? contract.operations.find(item => item.id === job.status) : undefined;
    if (!status || status.kind !== 'query') { fail('status must name a query of this contract'); continue; }
    const id = requiredPath(operation.output, job.id), input = requiredPath(status.input, job.input);
    const state = requiredPath(status.output, job.state), returnedState = requiredPath(operation.output, job.state);
    if (id?.type !== 'string' || input?.type !== 'string') fail('job id and status input must resolve to required string fields');
    if (state?.type !== 'string' || returnedState?.type !== 'string') fail('state must resolve to required string fields in launcher and status outputs');
    const states = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= 32
      && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 128) && new Set(value).size === value.length;
    if (!states(job.done) || !states(job.failed)) { fail('done and failed must be bounded, nonempty, unique state lists'); continue; }
    const done = job.done, failed = job.failed;
    if (done.some(value => failed.includes(value))) fail('done and failed must be disjoint');
    if ([state, returnedState].some(schema => !schema?.enum || [...done, ...failed].some(value => !schema.enum!.includes(value)))) {
      fail('terminal states must belong to the declared state enums');
    }
    if (status.effects.networkDomains?.length || status.effects.connections?.length || status.effects.model?.includes('invoke') || status.effects.imageGeneration?.includes('generate')) fail('status must be an unmetered read');
  }
  return problems;
}

/** Local closure only. Runtime capability selection is deliberately absent from a signed declaration. */
export function sandboxOperationEffects(contract: SandboxPluginContract, operation: SandboxOperationContract): SandboxEffects {
  const result: Record<string, string[]> = {};
  for (const item of [operation, ...(operation.effects.background ?? []).map(id => contract.operations.find(target => target.id === id)!)]) {
    if (!item) throw pluginErrors.declaration_invalid('后台目标不在合同里');
    for (const [key, values] of Object.entries(item.effects)) result[key] = [...new Set([...(result[key] ?? []), ...(values ?? [])])].sort();
  }
  return result as SandboxEffects;
}

/** One deterministic action projection for signed packages, generated releases and their running scopes. */
export function sandboxOperationActions(input: { contract: SandboxPluginContract; buildId: string; version: number; title: string; scope: 'home' | 'project' }): ActionDefinition[] {
  const problems = sandboxBackgroundProblems(input.contract);
  if (problems.length) throw pluginErrors.declaration_invalid(problems.join('; '));
  return input.contract.operations.map(operation => ({
    capability_id: sandboxActionId(input.buildId, operation.id), version: input.version, operation: operation.kind,
    action: { local_id: operation.id, title: input.title + ' · ' + (operation.description || operation.id),
      description: '插件「' + input.title + '」的功能：' + (operation.description || operation.id), kind: operation.kind === 'query' ? 'query' : 'operation',
      scope: input.scope, scheduling: 'concurrent', audiences: ['user', 'agent', 'workflow', 'mcp', 'plugin'],
      permissions: sandboxOperationPermissions(sandboxOperationEffects(input.contract, operation)), subject_kinds: [],
      input_schema: { ...operation.input }, output_schema: { ...operation.output },
      ...(operation.background_job ? { background_job: { ...operation.background_job,
        status: { capability_id: sandboxActionId(input.buildId, operation.background_job.status), version: input.version } } } : {}),
    },
  }));
}
