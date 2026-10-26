/**
 * The Host's proxy for a sandboxed integration (BL-530): what the Home's registry binds a source to when the integration's code runs in the
 * sandbox. The proxy is the platform's code; the plugin's runs only in its sandboxed process, reached as the operations its contract has
 * (`SANDBOX_INTEGRATION_OPERATIONS`). Each source's pull is one call: the source's id, its settings as JSON text and whether it has an
 * account go in; the account itself is the call's own connection (S-94), which ends with the call. What comes back is checked here and
 * read by the SDK's own polling adapter, the one every integration's pull goes through, so the Feed gets the same shape as from a
 * built-in. A pull that does not fit is refused whole: nothing of it reaches the Feed.
 */
import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import type { IntegrationProviderItem, IntegrationProviderPort, IntegrationProviderSyncResult, PluginIntegrationContribution, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginConnectionsClient } from '@molis-ai/molis-work-contracts/platform/plugin-connections';
import type { IntegrationAccountPresentation, IntegrationBinding } from '@molis-ai/molis-work-contracts/platform/plugin-integrations';
import { SANDBOX_INTEGRATION_LIMITS, SANDBOX_INTEGRATION_OPERATIONS, type SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxCallControl } from '@molis-ai/molis-work-plugin-sandbox';
import { pollingIntegrationBinding } from '@molis-ai/molis-work-plugin-sdk';

export const sandboxIntegrationErrors = defineErrorCodes('host', { integration_pull_invalid: 'upstream', integration_source_invalid: 'invalid' });

export interface SandboxIntegrationProxyInput {
  readonly manifest: PluginManifest;
  /** The contract's operation ids: whether the plugin answers `integration.account`. */
  readonly operations: readonly string[];
  /** One operation in the sandboxed process; the proxy gives each call its own signal and connections. */
  call(operationId: string, input: SandboxJson, control: SandboxCallControl): Promise<SandboxJson>;
  /** The call's own connections for a source (S-94), alive while `signal` is. */
  connections(binding: IntegrationBinding, signal: AbortSignal): PluginConnectionsClient;
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
      if (config_json.length > SANDBOX_INTEGRATION_LIMITS.configLength) throw sandboxIntegrationErrors.integration_source_invalid(`来源 ${binding.source_id} 的设置太大，集成插件收不下`);
      const source = { source_id: binding.source_id, config_json, has_connection: binding.connection_id !== null };
      // The connection lives exactly as long as the call: once the operation settles, the plugin's requests through it are refused.
      const call = async (operationId: string, extra: Answer): Promise<Answer> => {
        const ended = new AbortController();
        try {
          const answer = await input.call(operationId, { ...source, ...extra }, { signal: ended.signal, connections: input.connections(binding, ended.signal) });
          return answer as Answer;
        } finally { ended.abort(); }
      };
      const accounts = new Map<string, IntegrationAccountPresentation | null>();
      const provider: IntegrationProviderPort = {
        type: 'sandbox',
        async health() {
          const answer = await call(SANDBOX_INTEGRATION_OPERATIONS.health, {});
          return { ok: answer.ok as boolean, status: answer.status as 'connected' | 'disconnected' | 'error' | 'needs_auth', message: answer.message as string,
            ...(typeof answer.action === 'string' ? { action: answer.action } : {}) };
        },
        async sync({ cursor, mode }) {
          const answer = await call(SANDBOX_INTEGRATION_OPERATIONS.poll, { ...(typeof cursor === 'string' ? { cursor } : {}), rebuild: mode === 'rebuild_cursor' });
          const result = pullResult(answer);
          // Read with the pull, so the Feed's account step after it has the answer without a second call into the sandbox.
          if (result.ok && answersAccount) accounts.set(result.cursor as string, accountOf(await call(SANDBOX_INTEGRATION_OPERATIONS.account, { cursor: result.cursor as string })));
          return result;
        },
      };
      return pollingIntegrationBinding({ manifest: input.manifest, provider, ...(input.now ? { now: input.now } : {}),
        ...(answersAccount ? { presentAccount: (pulled: unknown) => typeof pulled === 'string' ? accounts.get(pulled) ?? null : null } : {}) });
    },
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
