import { ActionError, defineErrorCodes, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginModelConfigurationClient, PluginModelConfigurationDeclaration, PluginModelConfigurationInput, PluginModelConfigurationView, PluginModelSelection } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginAction, type PluginActionScope } from "./action-scope.js";
import type { PluginModelGate } from "./model-service.js";

const errors = defineErrorCodes("plugin", { model_configuration_action_required: "forbidden" });

/** Synchronous owner calls: after Runtime checks authority there is no wait before a persistent effect. */
export interface PluginModelConfigurationPort {
  selection(): PluginModelSelection | undefined;
  read(): PluginModelConfigurationView;
  save(input: PluginModelConfigurationInput): PluginModelConfigurationView;
}

export function createPluginModelConfigurationClient(manifest: PluginManifest, declaration: PluginModelConfigurationDeclaration,
  port: PluginModelConfigurationPort, gate: PluginModelGate): PluginModelConfigurationClient {
  const check = (scope: PluginActionScope) => {
    gate.assertActive();
    scope.caller.signal?.throwIfAborted();
    for (const permission of scope.definition.action.permissions) {
      gate.requireGrant(permission);
      if (!scope.caller.permissions.includes(permission)) throw new ActionError("actions.forbidden", "这次调用没有模型设置动作需要的权限");
    }
    requireSynchronous(scope.caller.assert_authority_current?.(), "模型设置最终授权检查必须同步完成");
  };
  const requireAction = (kind: "read" | "save") => {
    const scope = currentPluginAction(), expected = declaration.actions[kind];
    const action = manifest.actions?.find(item => item.capability_id === expected.capability_id && item.version === expected.version);
    if (!scope || scope.install_id !== gate.install_id || scope.definition.capability_id !== expected.capability_id
      || scope.definition.version !== expected.version || !action || action.operation !== (kind === "read" ? "query" : "command")) {
      throw errors.model_configuration_action_required("模型设置只能在本插件由宿主绑定的设置动作里访问");
    }
    check(scope);
    return scope;
  };
  const authorize = async (scope: PluginActionScope) => { await scope.caller.beforeEffect(); check(scope); };
  return Object.freeze({
    selection() {
      gate.assertActive(); gate.requireGrant("storage:private"); gate.requireGrant("model:invoke");
      const scope = currentPluginAction();
      if (scope) {
        if (scope.install_id !== gate.install_id) throw errors.model_configuration_action_required("不能从另一个插件的动作读取模型选择");
        check(scope);
      }
      const selection = port.selection();
      return selection ? { provider_id: selection.provider_id, model_id: selection.model_id } : undefined;
    },
    async read() { const scope = requireAction("read"); await authorize(scope); return port.read(); },
    async save(input: PluginModelConfigurationInput) {
      const scope = requireAction("save"), accepted = structuredClone(input);
      await authorize(scope);
      return port.save(accepted);
    },
  });
}
