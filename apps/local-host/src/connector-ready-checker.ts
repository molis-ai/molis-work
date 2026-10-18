import { ActionError, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCheckObservation } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ManagedConnectorView } from "./connector-management-actions.js";
import type { ConnectorSetupCheckScope } from "./connector-setup-checker.js";
import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";

type Checker = NonNullable<NonNullable<PrologueNodeAdapterOptions["checks"]>["owned"]>[number];
type ReadyParams = { connection_id: string; expected_account: ConnectorCheckObservation["account"] | null; required_actions: ExactActionReference[] };
type ReadConnections = (scope: ConnectorSetupCheckScope, signal?: AbortSignal) => Promise<{ connections: ManagedConnectorView[]; paused: boolean }>;
const string = { type: "string", minLength: 1, maxLength: 300 };
const params = { type: "object", properties: {
  connection_id: { type: "string", minLength: 1, maxLength: 100 },
  expected_account: { anyOf: [{ type: "null" }, { type: "object", properties: { login: string, account_id: string }, required: ["login"], additionalProperties: false }] },
  required_actions: { type: "array", minItems: 1, maxItems: 32, items: { type: "object", properties: {
    capability_id: string, provider_id: string, version: { type: "integer", minimum: 1 },
  }, required: ["capability_id", "provider_id", "version"], additionalProperties: false } },
}, required: ["connection_id", "expected_account", "required_actions"], additionalProperties: false };

/** Watches existing owner facts; it never repairs, enables, checks a remote account or calls a business action. */
export function connectorReadyChecker(read: ReadConnections): Checker {
  const connection = (scope: ConnectorSetupCheckScope, rows: ManagedConnectorView[], input: ReadyParams) => {
    const row = rows.find(entry => entry.connection_id === input.connection_id);
    if (row && "project_id" in row && row.project_id !== scope.project_id) throw new ActionError("actions.forbidden", "连接不属于当前工作项目");
    return row;
  };
  return { id: "molis.connection-ready", version: "1", params,
    checkParams: input => validParams(input) ? undefined : "需要所选连接、真实账号或空值，以及任务所需的精确能力引用",
    authorize: async (scope, input) => { connection(scope, (await read(scope)).connections, input as ReadyParams); },
    read: async (scope, input, signal) => {
      const expected = input as ReadyParams, result = await read(scope, signal);
      signal.throwIfAborted();
      const row = connection(scope, result.connections, expected), source = { ref: `connector:${expected.connection_id}` };
      const pending = (note: string) => ({ status: "pending" as const, source, note });
      if (!row) return { status: "failed", source, note: "所选连接已移除，请明确选择连接后重新等待" };
      if (result.paused) return pending("工作已暂停，连接修复不会自动启动它");
      const status = row.status;
      if (!row.enabled || status.configuration.state !== "complete" || status.connectivity.state !== "connected") return pending("所选连接仍需启用、修复或检查");
      const check = status.connectivity.last_check;
      if (!status.connectivity.current || check?.outcome !== "connected") return pending("当前配置尚未通过连接检查");
      if (expected.expected_account) {
        const account = check.account, wanted = expected.expected_account;
        if (!account || (wanted.account_id ? account.account_id !== wanted.account_id : account.login !== wanted.login)) return pending("当前检查尚未确认所选账号，请核对账号后重试");
      }
      if (!expected.required_actions.every(ref => status.capabilities.entries.some(entry => entry.capability_id === ref.capability_id
        && entry.version === ref.version && entry.provider_id === ref.provider_id && entry.available))) return pending("原任务需要的能力或当前助理权限尚未全部满足");
      return { status: "satisfied", source, note: "所选连接、账号要求和必要能力已通过当前检查；按最新任务继续，派出时仍复核授权" };
    } };
}

function validParams(input: unknown): input is ReadyParams {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>, text = (entry: unknown): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 300;
  if (Object.keys(value).length !== 3 || typeof value.connection_id !== "string" || !/^[a-z0-9-]{1,100}$/.test(value.connection_id)) return false;
  const account = value.expected_account;
  if (account !== null) {
    if (!account || typeof account !== "object" || Array.isArray(account)) return false;
    const fields = account as Record<string, unknown>;
    if (!text(fields.login) || Object.keys(fields).some(key => !["login", "account_id"].includes(key)) || fields.account_id !== undefined && !text(fields.account_id)) return false;
  }
  return Array.isArray(value.required_actions) && value.required_actions.length > 0 && value.required_actions.length <= 32 && value.required_actions.every(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const ref = entry as Record<string, unknown>;
    return Object.keys(ref).length === 3 && text(ref.capability_id) && text(ref.provider_id) && Number.isInteger(ref.version) && Number(ref.version) >= 1;
  });
}
