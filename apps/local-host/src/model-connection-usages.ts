import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineConnectorUsagesAction, type ConnectorUsagesInput } from "@molis-ai/molis-work-contracts/services/connector-host";
import { modelCredentialMetadata, openConfiguredModels } from "./configured-models.js";
import { withConnectorConnections } from "./connector-connection-store.js";

export const modelConnectionUsages = defineConnectorUsagesAction("models.connection.usages", "模型配置使用的连接", ["connectors:management:read"], "home");
export function modelConnectionUsagesHandler(home: string): ActionHandlerBinding {
  return { ...modelConnectionUsages, handle: (_caller, value) => {
    const id = (value as ConnectorUsagesInput).connection_id;
    const connection = withConnectorConnections(home, store => store.get(id));
    if (!connection || connection.service_id !== "model-api") return { usages: [] };
    const catalog = openConfiguredModels(home);
    try {
      return { usages: (catalog?.store.list() ?? []).filter(provider => provider.credential_ref === connection.credential_ref).map(provider => ({
        usage_id: provider.provider_id, title: provider.display_name,
        detail: `模型：${provider.models.filter(model => model.enabled).map(model => model.display_name ?? model.model_id).join("、") || "尚未启用模型"}。由任务明确选择或当前模型设置决定是否使用，执行统一经过 Agent Host。`,
        enabled: provider.enabled && provider.models.some(model => model.enabled) && modelCredentialMetadata(home, provider).available, actions: [],
      })) };
    } finally { catalog?.storage.close(); }
  } };
}
