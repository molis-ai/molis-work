import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
/**
 * The Host's proxy for a sandboxed integration (BL-530): what the Home's registry binds a source to when the integration's code runs in the
 * sandbox. The proxy is the platform's code; the plugin's runs only in its sandboxed process, reached as the operations its contract has
 * (`SANDBOX_INTEGRATION_OPERATIONS`). Each source's pull is one call: the source's id, its settings as JSON text and whether it has an
 * account go in; the account itself is the call's own connection (S-95), which ends with the call. What comes back is checked here and
 * read by the SDK's own polling adapter, the one every integration's pull goes through, so the Feed gets the same shape as from a
 * built-in. A pull that does not fit is refused whole: nothing of it reaches the Feed.
 */
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import type { IntegrationProviderItem, IntegrationProviderPort, IntegrationProviderSyncResult, PluginDefinition, PluginIntegrationContribution, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginConnectionsClient } from '@molis-ai/molis-work-contracts/platform/plugin-connections';
import type { IntegrationAccountPresentation, IntegrationBinding } from '@molis-ai/molis-work-contracts/platform/plugin-integrations';
import { SANDBOX_INTEGRATION_LIMITS, SANDBOX_INTEGRATION_OPERATIONS, SANDBOX_INTEGRATION_SOURCE_SLOT, type SandboxEffects, type SandboxIdentity, type SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { createCallConnectionsClient, type CallConnectionsPort } from '@molis-ai/molis-work-plugin-runtime';
import { createSandboxRunner, sandboxServicesFor, type SandboxCallControl, type SandboxRunner } from '@molis-ai/molis-work-plugin-sandbox';
import { pollingIntegrationBinding } from '@molis-ai/molis-work-plugin-sdk';
import type { InstalledRelease } from './installed-release.js';
import { GONE } from './plugin-builder/installed.js';

export const sandboxIntegrationErrors = defineErrorCodes('host', { integration_pull_invalid: 'upstream', integration_source_invalid: 'invalid' });

export interface SandboxIntegrationProxyInput {
  readonly manifest: PluginManifest;
  /** The contract's operation ids: whether the plugin answers `integration.account`. */
  readonly operations: readonly string[];
  /** One operation in the sandboxed process; the proxy gives each call its own signal and connections. */
  call(operationId: string, input: SandboxJson, control: SandboxCallControl): Promise<SandboxJson>;
  /** The call's own connections for a source (S-95), alive while `signal` is. */
  connections(binding: IntegrationBinding, control: ConnectorCallControl): PluginConnectionsClient;
  now?: () => Date;
}

type Answer = { [key: string]: SandboxJson };
const invalid = (detail: string): never => { throw sandboxIntegrationErrors.integration_pull_invalid('集成插件的拉取结果不合格式：' + detail); };

export function sandboxIntegrationContribution(input: SandboxIntegrationProxyInput): PluginIntegrationContribution {
  const answersAccount = input.operations.includes(SANDBOX_INTEGRATION_OPERATIONS.account);
  return {
    kind: 'integration',
    bind(binding) {
      const config_json = JSON.stringify(binding.config ?? {});
      if (Buffer.byteLength(config_json, 'utf8') > SANDBOX_INTEGRATION_LIMITS.configLength) throw sandboxIntegrationErrors.integration_source_invalid(`来源 ${binding.source_id} 的设置太大，集成插件收不下`);
      const source = { source_id: binding.source_id, config_json, has_connection: binding.connection_id !== null };
      // The connection lives exactly as long as the call: once the operation settles, the plugin's requests through it are refused.
      const call = async (operationId: string, extra: Answer, parent: ConnectorCallControl): Promise<Answer> => {
        const ended = new AbortController(), signal = AbortSignal.any([parent.signal, ended.signal]);
        const current = () => { signal.throwIfAborted(); parent.current(); signal.throwIfAborted(); };
        const control = { signal, current, beforeEffect: async () => { current(); await parent.beforeEffect(); current(); } };
        try {
          await control.beforeEffect(); current();
          const answer = await input.call(operationId, { ...source, ...extra }, { signal, beforeEffect: control.beforeEffect, connections: input.connections(binding, control) });
          await control.beforeEffect(); current();
          return answer as Answer;
        } finally { ended.abort(); }
      };
      const accounts = new Map<string, IntegrationAccountPresentation | null>();
      const provider: IntegrationProviderPort = {
        type: 'sandbox',
        async health(control) {
          const answer = await call(SANDBOX_INTEGRATION_OPERATIONS.health, {}, control);
          return { ok: answer.ok as boolean, status: answer.status as 'connected' | 'disconnected' | 'error' | 'needs_auth', message: answer.message as string,
            ...(typeof answer.action === 'string' ? { action: answer.action } : {}) };
        },
        async sync({ cursor, mode }, control) {
          const answer = await call(SANDBOX_INTEGRATION_OPERATIONS.poll, { ...(typeof cursor === 'string' ? { cursor } : {}), rebuild: mode === 'rebuild_cursor' }, control);
          const result = pullResult(answer);
          // Read with the pull, so the Feed's account step after it has the answer without a second call into the sandbox.
          if (result.ok && answersAccount) accounts.set(result.cursor as string, accountOf(await call(SANDBOX_INTEGRATION_OPERATIONS.account, { cursor: result.cursor as string }, control)));
          return result;
        },
      };
      return pollingIntegrationBinding({ manifest: input.manifest, provider, ...(input.now ? { now: input.now } : {}),
        ...(answersAccount ? { presentAccount: (pulled: unknown) => typeof pulled === 'string' ? accounts.get(pulled) ?? null : null } : {}) });
    },
  };
}

/**
 * The definition the Home's sandbox instance starts for an installed integration package: its code in a sandboxed process (started
 * again after the process is gone), the proxy above as what it contributes, and each call's connection through the Host's port (S-95).
 * Every call and every request first checks that the installation is still the running one.
 */
export function sandboxedIntegrationDefinition(release: InstalledRelease, approved: SandboxEffects,
  host: { connections: CallConnectionsPort; assertLive(identity: Readonly<SandboxIdentity>): void }): PluginDefinition {
  const manifest = release.packaged!.manifest, contract = release.design.contract;
  const integration = manifest.integrations![0]!, service = manifest.connection_services!.find(item => item.service_id === integration.service_id)!;
  let runner: Promise<SandboxRunner> | undefined;
  return {
    manifest,
    execution: 'sandbox',
    async start(context) {
      context.requireGrant('storage:private');
      const services = sandboxServicesFor(context.services, {});
      const identity: SandboxIdentity = { projectId: context.project_id ?? null, installationId: context.install_id, pluginId: release.pluginId, namespace: 'installed' };
      const live = () => host.assertLive(identity);
      const open = () => {
        if (runner) return runner;
        const created = runner = createSandboxRunner({ bundlePath: release.bundlePath, contract, grants: approved, services, identity });
        created.catch(() => { if (runner === created) runner = undefined; });
        return created;
      };
      // Code that cannot start fails the installation, not the first pull.
      await open();
      return sandboxIntegrationContribution({ manifest, operations: contract.operations.map(item => item.id),
        async call(operationId, input, control) {
          live();
          const pending = open();
          const beforeEffect = async () => { await control.beforeEffect?.(); control.signal?.throwIfAborted(); live(); };
          try { const active = await pending; await beforeEffect(); return await active.call(operationId, input, { ...control, beforeEffect }); }
          catch (error) {
            // A dead process starts again at the next call; this one is not replayed.
            if (GONE.has((error as { code?: string }).code ?? '') && runner === pending) runner = undefined;
            throw error;
          }
        },
        connections: (binding, control) => createCallConnectionsClient(host.connections,
          { plugin_id: release.pluginId, service_id: service.service_id, connection_id: binding.connection_id, ...(service.origins ? { origins: service.origins } : {}) },
          SANDBOX_INTEGRATION_SOURCE_SLOT, { signal: control.signal,
            current: () => { control.current(); live(); }, beforeEffect: async () => { await control.beforeEffect(); control.current(); live(); } }) });
    },
    async stop() { const current = runner; runner = undefined; await current?.then(item => item.stop(), () => undefined); },
  };
}

/** `ok: true` with its items and cursor and nothing of a failure, or `ok: false` with its failure and message and no items. */
function pullResult(answer: Answer): IntegrationProviderSyncResult {
  if (answer.ok === true) {
    if (!Array.isArray(answer.items) || typeof answer.cursor !== 'string') return invalid('成功的拉取要有 items 和 cursor');
    if (['failure', 'message', 'action', 'http_status', 'retry_after_at'].some(field => Object.hasOwn(answer, field))) return invalid('成功的拉取不带失败的字段');
    const items = answer.items.map(itemOf);
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.externalId)) invalid('同一次拉取里 externalId 重复：' + item.externalId);
      seen.add(item.externalId);
      // Shown as a link in the Feed: only a web address.
      if (item.url !== undefined && !webAddress(item.url)) invalid('条目的 url 只能是 http 或 https 地址');
    }
    return { ok: true, mode: 'live', items, cursor: answer.cursor };
  }
  if (typeof answer.failure !== 'string' || typeof answer.message !== 'string') return invalid('失败的拉取要有 failure 和 message');
  if (Object.hasOwn(answer, 'items') || Object.hasOwn(answer, 'cursor')) return invalid('失败的拉取不带条目和游标');
  return { ok: false, mode: 'live', failure: answer.failure as Extract<IntegrationProviderSyncResult, { ok: false }>['failure'], message: answer.message,
    ...(typeof answer.action === 'string' ? { action: answer.action } : {}),
    ...(typeof answer.http_status === 'number' ? { httpStatus: httpStatus(answer.http_status) } : {}),
    ...(typeof answer.retry_after_at === 'string' ? { retryAfterAt: answer.retry_after_at } : {}) };
}

/** An item as the runner already checked it against the platform's schema, rebuilt field by field. */
function itemOf(value: SandboxJson): IntegrationProviderItem {
  const item = value as Answer, text = (field: string) => typeof item[field] === 'string' ? { [field]: item[field] as string } : {};
  return {
    externalId: item.externalId as string, title: item.title as string, summary: item.summary as string,
    ...text('body'), ...text('url'), ...text('occurredAt'), ...text('author'),
    ...(typeof item.kind === 'string' ? { kind: item.kind as NonNullable<IntegrationProviderItem['kind']> } : {}),
    ...(typeof item.priority === 'string' ? { priority: item.priority as NonNullable<IntegrationProviderItem['priority']> } : {}),
    ...(Array.isArray(item.tags) ? { tags: item.tags.filter((tag): tag is string => typeof tag === 'string') } : {}),
  };
}

function httpStatus(value: number): number {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : invalid('http_status 要是 100 到 599 之间的整数');
}

function webAddress(value: string): boolean {
  try { return /^https?:$/u.test(new URL(value).protocol); } catch { return false; }
}

function accountOf(answer: Answer): IntegrationAccountPresentation | null {
  return typeof answer.account_label === 'string' ? { account_label: answer.account_label } : null;
}
