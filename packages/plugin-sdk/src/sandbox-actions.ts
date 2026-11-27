import { createHash } from 'node:crypto';
import type { ActionDefinition } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors, type PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxOperationContract, SandboxPluginContract, SandboxSchema, SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { TRUSTED_REVIEW_OWNER_INPUT_SCHEMA } from '@molis-ai/molis-work-contracts/services/project-approvals';
import { canonicalJsonText, isRecord } from './json-value.js';
import { sandboxOperationPermissions } from './sandbox-manifest.js';
import { sandboxActionProtocolAction, sandboxReadProtocolAction } from './sandbox-read-protocol.js';
import { validTrustedReviewRow } from './action-declarations.js';

/** The package identity already used for installed signed releases. It never depends on the running directory. */
export const sandboxPackageBuildId = (pluginId: string, signature: string) => createHash('sha256').update(JSON.stringify([pluginId, signature])).digest('hex').slice(0, 32);
export const sandboxActionId = (buildId: string, operationId: string) => 'generated.' + buildId.slice(0, 8) + '.' + operationId;

function reviewDeclarationProblems(contract: SandboxPluginContract, scope: 'home' | 'project', dualInstance = false): string[] {
  return contract.operations.flatMap(operation => {
    const review: unknown = operation.trusted_review;
    if (review === undefined) return [];
    const problem = (message: string) => ['Trusted review of ' + operation.id + ': ' + message];
    if (scope !== 'project' && !dualInstance || operation.kind !== 'command' || operation.external !== undefined || operation.background_job !== undefined
      || !operation.effects.projectDatabase?.includes('write') || Object.keys(operation.effects).some(key => key !== 'projectDatabase')) {
      return problem('the command must apply its change in its project database transaction');
    }
    if (!isRecord(review) || Object.keys(review).length !== 3 || !validTrustedReviewRow(review.row) || typeof review.reader !== 'string' || !Array.isArray(review.subject_kinds)
      || !review.subject_kinds.length || review.subject_kinds.length > 30 || new Set(review.subject_kinds).size !== review.subject_kinds.length
      || !review.subject_kinds.every(kind => typeof kind === 'string' && /^[a-z][a-z0-9_.:-]{0,127}$/.test(kind))) return problem('declare a reader, bounded subject kinds, and the reviewed row');
    const reader = contract.operations.find(item => item.id === review.reader);
    if (reader?.kind !== 'query' || reader.read_protocol !== undefined || reader.action_protocol !== undefined || reader.external !== undefined
      || Object.keys(reader.effects).some(key => key !== 'projectDatabase') || reader.effects.projectDatabase?.includes('write')
      || canonicalJsonText(reader.input) !== canonicalJsonText(TRUSTED_REVIEW_OWNER_INPUT_SCHEMA)) return problem('the original package must supply a local query by request_id');
    return [];
  });
}

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
    if (!status || status.kind !== 'query' || status.read_protocol !== undefined || status.action_protocol !== undefined) { fail('status must name a query of this contract'); continue; }
    if (operation.read_protocol !== undefined || operation.action_protocol !== undefined) continue;
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

/**
 * A starting point is a command's (contract-design §2.4): its operation id becomes the intake's id, so it is written the way an intake id is.
 * Its words are checked again where the Manifest is (`inspectContextDeclarations`).
 */
export function sandboxStartProblems(contract: SandboxPluginContract): string[] {
  return contract.operations.flatMap(operation => {
    const start: unknown = operation.start;
    if (start === undefined) return [];
    const problem = 'The start of ' + operation.id + ': ';
    if (operation.kind !== 'command' || operation.read_protocol !== undefined || operation.action_protocol !== undefined) return [problem + 'only a command makes one from nothing'];
    if (!/^[a-z0-9][a-z0-9_.-]{0,49}$/.test(operation.id)) return [problem + 'the operation id becomes the intake id: lowercase letters, digits, _ . - and at most 50'];
    if (!isRecord(start) || typeof start.item_kind !== 'string' || typeof start.title !== 'string' || typeof start.hint !== 'string'
      || Object.keys(start).some(key => !['item_kind', 'title', 'title_text', 'hint', 'hint_text', 'icon', 'open'].includes(key))) {
      return [problem + 'declare item_kind, title and hint, and optionally title_text, hint_text, icon and open'];
    }
    return [];
  });
}

/** The blank intake a start projects to: the intake's words are the start's. */
function startIntake(operation: SandboxOperationContract): Pick<ActionDefinition['action'], 'intake'> {
  const start = operation.start;
  if (!start) return {};
  const { item_kind, ...words } = start;
  return { intake: { intake_id: operation.id, item_kind, title: words.title, ...(words.title_text ? { title_text: words.title_text } : {}),
    verb: words.title, describe: words.hint, accepts: [], examples: [], start: words } };
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

/** Host-only preflight of a signed sandbox release, excluded from its callable actions. */
export const SANDBOX_VALIDATE_UPGRADE = "validateUpgrade";

export function sandboxUpgradeOperation(manifest: Pick<PluginManifest, "upgrade_compatibility"> | undefined): string | undefined {
  return manifest?.upgrade_compatibility?.migratable_from_versions?.length ? SANDBOX_VALIDATE_UPGRADE : undefined;
}

export function assertSandboxUpgradeValidator(manifest: Pick<PluginManifest, "upgrade_compatibility">, contract?: SandboxPluginContract): void {
  const id = sandboxUpgradeOperation(manifest);
  if (!id) return;
  const operation = contract?.operations.find(item => item.id === id);
  if (!operation || operation.kind !== "query" || operation.read_protocol || operation.action_protocol || operation.external || operation.background_job
    || operation.input.type !== "string" || operation.output.type !== "boolean"
    || Object.keys(operation.effects).some(effect => effect !== "storage") || operation.effects.storage?.some(value => value !== "read")
    || contract?.operations.some(item => item.effects.background?.includes(SANDBOX_VALIDATE_UPGRADE))
    || contract?.pages.some(page => page.regions.some(region => region.operationIds.includes(SANDBOX_VALIDATE_UPGRADE)))) {
    throw pluginErrors.declaration_invalid("可迁移的包须声明 validateUpgrade，只读旧版私有 KV，输入旧插件版本，返回布尔值");
  }
}

/** One deterministic action projection for signed packages, generated releases and their running scopes. */
export function sandboxOperationActions(input: { contract: SandboxPluginContract; buildId: string; version: number; title: string; scope: 'home' | 'project'; dualInstance?: boolean; upgradeOperation?: string; hasProjectDatabase?: boolean }): ActionDefinition[] {
  const problems = [...sandboxBackgroundProblems(input.contract), ...sandboxStartProblems(input.contract), ...reviewDeclarationProblems(input.contract, input.scope, input.dualInstance)];
  if (problems.length) throw pluginErrors.declaration_invalid(problems.join('; '));
  const scopeOf = (operation: SandboxOperationContract): 'home' | 'project' => {
    if (operation.read_protocol?.kind === 'work_terminal_prompt' || operation.read_protocol?.kind === 'resume_summary'
      || operation.action_protocol?.kind === 'placement_relation') return 'project';
    return input.dualInstance ? (operation.effects.projectDatabase?.length || operation.trusted_review !== undefined ? 'project' : 'home') : input.scope;
  };
  return input.contract.operations.filter(operation => operation.id !== input.upgradeOperation).map(operation => {
    const actionScope = scopeOf(operation);
    const localized = {
      ...(operation.title_text === undefined ? {} : { title_text: operation.title_text }),
      ...(operation.description_text === undefined ? {} : { description_text: operation.description_text }),
    };
    if (operation.read_protocol !== undefined) {
      const definition = sandboxReadProtocolAction(operation, { pluginId: input.contract.pluginId, capabilityId: sandboxActionId(input.buildId, operation.id), version: input.version,
        title: input.title + ' · ' + (operation.description || operation.id), scope: actionScope,
        permissions: sandboxOperationPermissions(operation.effects, input.hasProjectDatabase) });
      return { ...definition, action: { ...definition.action, ...localized, local_id: operation.id } };
    }
    if (operation.action_protocol !== undefined) {
      const definition = sandboxActionProtocolAction(operation, { capabilityId: sandboxActionId(input.buildId, operation.id), version: input.version,
        title: input.title + ' · ' + (operation.description || operation.id), scope: actionScope,
        permissions: sandboxOperationPermissions(operation.effects, input.hasProjectDatabase) });
      return { ...definition, action: { ...definition.action, ...localized, local_id: operation.id } };
    }
    return {
      capability_id: sandboxActionId(input.buildId, operation.id), version: input.version, operation: operation.kind,
      action: { local_id: operation.id, title: input.title + ' · ' + (operation.description || operation.id),
        description: '插件「' + input.title + '」的功能：' + (operation.description || operation.id), ...localized, kind: operation.kind === 'query' ? 'query' : 'operation',
        scope: actionScope, scheduling: 'concurrent', audiences: ['user', 'agent', 'workflow', 'mcp', 'plugin'],
        permissions: sandboxOperationPermissions(sandboxOperationEffects(input.contract, operation), input.hasProjectDatabase), subject_kinds: operation.trusted_review?.subject_kinds ?? [],
        input_schema: { ...operation.input }, output_schema: { ...operation.output },
        ...(operation.external === undefined ? {} : { external: operation.external }),
        ...(operation.draft === undefined ? {} : { draft: operation.draft }),
        ...startIntake(operation),
        ...(operation.trusted_review ? { requires_trusted_decision: true as const,
          trusted_decision_row: operation.trusted_review.row,
          trusted_decision_request: { capability_id: sandboxActionId(input.buildId, operation.trusted_review.reader), version: input.version } } : {}),
        ...(operation.background_job ? { background_job: { ...operation.background_job,
          status: { capability_id: sandboxActionId(input.buildId, operation.background_job.status), version: input.version } } } : {}),
      },
    };
  });
}
