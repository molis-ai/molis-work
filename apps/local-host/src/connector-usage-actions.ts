import { withConnectorConnections } from "./connector-connection-store.js";
import { ActionError, actionReachesAudience, retainActionAuthority, type ActionClient, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONNECTOR_USAGES_INPUT_TYPE, CONNECTOR_USAGES_OUTPUT_TYPE, CONNECTOR_USAGES_INPUT_SCHEMA, type ConnectorUsage, type ConnectorUsagesInput } from "@molis-ai/molis-work-contracts/services/connector-host";

export const connectorUsagesAction: ActionDefinition<ConnectorUsagesInput, object> = { capability_id: "connectors.usages.read", version: 1, operation: "query", action: {
  title: "查看连接的业务用途", description: "从当前可读的业务模块汇总实际使用这条连接的模型、服务配置和项目对象，以及其已有动作和当前调用权限。只读，不创建绑定、不执行业务操作；看不到其他项目。",
  kind: "query", scope: "home", scheduling: "concurrent", audiences: ["user", "agent", "mcp"], permissions: ["connectors:management:read"], subject_kinds: ["connector"],
  input_schema: CONNECTOR_USAGES_INPUT_SCHEMA, output_schema: { type: "object", properties: { usages: { type: "array" }, issues: { type: "array", items: { type: "string" } } }, required: ["usages", "issues"], additionalProperties: false },
} };

export function connectorUsagesHandler(home: string, clientFor?: (caller: ActionCallContext) => ActionClient): ActionHandlerBinding {
  return { ...connectorUsagesAction, handle: async (caller, value) => {
    if (!clientFor) throw new ActionError("actions.connection_required", "当前入口未装配业务目录");
    const client = clientFor(caller), nested = retainActionAuthority(caller, { ...connectorUsagesAction, provider_id: "system.connectors" });
    const directory = await client.discover(nested);
    const reporters = directory.filter(view => view.action.input_type === CONNECTOR_USAGES_INPUT_TYPE && view.action.output_type === CONNECTOR_USAGES_OUTPUT_TYPE);
    const reports: Array<{ usage: ConnectorUsage; source: { capability_id: string; version: number; provider_id: string }; reporter: string }> = [], issues: string[] = [];
    for (const reporter of reporters) {
      if (!reporter.availability.available) { issues.push(`${reporter.provider.title}：${reporter.availability.reason}`); continue; }
      const source = { capability_id: reporter.capability_id, version: reporter.version, provider_id: reporter.provider.provider_id };
      try {
        const { usages } = await client.invoke(nested, source, value) as { usages: ConnectorUsage[] };
        if (new Set(usages.map(usage => usage.usage_id)).size !== usages.length) throw new ActionError("actions.output_invalid", "使用位置重复");
        reports.push(...usages.map(usage => ({ usage, source, reporter: reporter.provider.title })));
      } catch (error) {
        caller.signal?.throwIfAborted();
        issues.push(`${reporter.provider.title}：${error instanceof ActionError ? error.message : "暂时无法读取使用位置"}`);
      }
    }
    await caller.beforeEffect();
    const current = await client.discover(nested);
    const connectionActive = withConnectorConnections(home, store => { const row = store.get((value as ConnectorUsagesInput).connection_id); return !!row && row.enabled && !row.disconnected_at; });
    const valid: typeof reports = [];
    for (const report of reports) {
      try {
        if (!current.some(view => view.capability_id === report.source.capability_id && view.version === report.source.version
          && view.provider.provider_id === report.source.provider_id && view.availability.available)) throw new ActionError("actions.provider_changed", "使用位置的提供方已不可用");
        await nested.validate_authority?.(report.source); valid.push(report);
      } catch (error) { caller.signal?.throwIfAborted(); issues.push(`${report.reporter}：${error instanceof ActionError ? error.message : "使用位置的读取权限已变化"}`); }
    }
    return { usages: valid.map(({ usage, ...report }) => ({ ...report, ...usage,
      actions: usage.actions.map(entry => {
        const view = current.find(view => view.capability_id === entry.action.capability_id && view.version === entry.action.version && view.provider.provider_id === entry.action.provider_id);
        const authorized = view && actionReachesAudience(view.action, view.capability_id, caller.audience) && view.action.permissions.every(permission => caller.permissions.includes(permission))
          && (!caller.allowed_actions || caller.allowed_actions.some(ref => ref.capability_id === view.capability_id && ref.version === view.version && (!ref.provider_id || ref.provider_id === view.provider.provider_id)));
        const reason = !connectionActive ? "连接已停用或移除" : !usage.enabled ? "业务配置或所用连接不可用" : !view ? "当前作用域中没有这项能力" : !authorized ? "当前调用者未获准使用此能力" : !view.availability.available ? view.availability.reason : undefined;
        return { ...entry, available: !reason, ...(reason ? { reason } : {}), ...(view ? { title: view.action.title, input_schema: view.action.input_schema, permissions: view.action.permissions } : {}) };
      }),
    })), issues };
  } };
}
