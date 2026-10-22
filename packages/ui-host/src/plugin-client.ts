import { uiHostErrors } from "./ui-errors.js";
import type { PluginManifest, PluginStartContext, PluginUiClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution, UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";

/** The Host's side of `PluginUiClient.invalidate` for one activation (PG-061). */
export interface PluginUiViews {
  /** Bumps the revision the pages of `context.plugin_id` watch; the Host ignores it while that plugin is not running. */
  invalidate(): void;
  /** False from the moment this activation stops, before its `stop` hook runs. */
  active(): boolean;
}

/** Host owns disposal; Plugin code receives only client. */
export function createPluginUiClient(host: UiHostApi, context: PluginStartContext, input: PluginManifest, views: PluginUiViews): {
  client: PluginUiClient;
  dispose(): void;
} {
  const manifest = structuredClone(input);
  const registrations = new Set<string>();
  let disposed = false;
  if (manifest.plugin_id !== context.plugin_id || manifest.version !== context.version) {
    throw uiHostErrors.plugin_denied("Host 的 Plugin Manifest 与安装上下文不匹配");
  }
  const authorize = () => {
    if (disposed || !manifest.permissions.some(item => item.permission === "ui:register")) {
      throw uiHostErrors.plugin_denied("Plugin UI 未声明权限或已停止");
    }
    context.requireGrant("ui:register");
  };
  return {
    client: {
      register<TModel>(contribution: UiContribution<TModel>) {
        authorize();
        const descriptor = structuredClone(contribution.descriptor);
        if (descriptor.plugin_id !== context.plugin_id || !manifest.ui.contributions.includes(descriptor.contribution_id)) {
          throw uiHostErrors.plugin_denied("只能注册 Manifest 声明的自身 UI contribution");
        }
        host.register<TModel>({ descriptor, render(request) { authorize(); return contribution.render(request); } });
        registrations.add(descriptor.contribution_id);
      },
      unregister(contributionId) {
        authorize();
        if (!registrations.has(contributionId)) throw uiHostErrors.plugin_denied("不能移除其他 Plugin 的 UI contribution");
        host.unregister(contributionId);
        registrations.delete(contributionId);
      },
      invalidate() {
        // Its own pages only, so no permission: the plugin id is the activation's, and every page reads again as its reader.
        if (!(manifest.ui.views ?? []).length) throw uiHostErrors.plugin_denied("Manifest 没有声明视图，没有页面可以重新读取");
        if (disposed || !views.active()) throw uiHostErrors.plugin_denied("Plugin 已停止，不能再让页面重新读取");
        views.invalidate();
      },
    },
    dispose() {
      disposed = true;
      for (const id of registrations) host.unregister(id);
      registrations.clear();
    },
  };
}
