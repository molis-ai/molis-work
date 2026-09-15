import type { PluginManifest, PluginStartContext, PluginUiClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution, UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";

export class PluginUiAccessError extends Error {
  readonly code = "plugin_ui_denied";
  constructor(message: string) { super(message); this.name = "PluginUiAccessError"; }
}

/** Host owns disposal; Plugin code receives only client. */
export function createPluginUiClient(host: UiHostApi, context: PluginStartContext, input: PluginManifest): {
  client: PluginUiClient;
  dispose(): void;
} {
  const manifest = structuredClone(input);
  const registrations = new Set<string>();
  let disposed = false;
  if (manifest.plugin_id !== context.plugin_id || manifest.version !== context.version) {
    throw new PluginUiAccessError("Host 的 Plugin Manifest 与安装上下文不匹配");
  }
  const authorize = () => {
    if (disposed || !manifest.permissions.some(item => item.permission === "ui:register")) {
      throw new PluginUiAccessError("Plugin UI 未声明权限或已停止");
    }
    context.requireGrant("ui:register");
  };
  return {
    client: {
      register<TModel>(contribution: UiContribution<TModel>) {
        authorize();
        const descriptor = structuredClone(contribution.descriptor);
        if (descriptor.plugin_id !== context.plugin_id || !manifest.ui.contributions.includes(descriptor.contribution_id)) {
          throw new PluginUiAccessError("只能注册 Manifest 声明的自身 UI contribution");
        }
        host.register<TModel>({ descriptor, render(request) { authorize(); return contribution.render(request); } });
        registrations.add(descriptor.contribution_id);
      },
      unregister(contributionId) {
        authorize();
        if (!registrations.has(contributionId)) throw new PluginUiAccessError("不能移除其他 Plugin 的 UI contribution");
        host.unregister(contributionId);
        registrations.delete(contributionId);
      },
    },
    dispose() {
      disposed = true;
      for (const id of registrations) host.unregister(id);
      registrations.clear();
    },
  };
}
