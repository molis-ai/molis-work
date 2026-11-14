import { skillImportActions } from "@molis-ai/molis-work-contracts/services/skills";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp, matchesNativePluginPrefix } from "./native-plugin-http.js";
import { withPluginPermissionSettingsEntry } from "./plugin-consent-settings-entry.js";
import { PLUGIN_INSTALL_PERMISSIONS, PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions, pluginInstallActions } from "./plugin-install-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { runningProjectPlatform } from "./project-plugins.js";

/** A package carries the plugin's code and files, base64 inside the signed bundle; the command line's route takes the same. */
const MAX_PACKAGE_BYTES = 24 * 1024 * 1024;

/**
 * The workbench's door to a project's plugins (ac-trust T7): what is installed here with its permissions and agreements, installing a
 * signed package (preview, then confirm; a newer package of an installed plugin is its upgrade), switching it off and on, taking it off. Each route invokes the shared actions as the person, and says so itself: the entry stamps the
 * person's own page request (`user_action`, S-58) and nothing in the request body is read for it. Taking an agreement back is not here:
 * `plugins.consents.revoke@1` takes only the Host's settings door (`/api/settings/plugin-consents/revoke`, S-77), so the page calls that.
 * Switching one optional permission of an install in this project (`permissions/set`, PG-002, S-94) is the person's own act in this project's
 * settings: the project is the route's, the credential is the entry's own (a different one from the consent door's), and a plugin's page is refused.
 */
export async function handlePluginTrustHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: { localHost: MolisWorkLocalHost; projectRef: LocalHostProjectReference }): Promise<boolean> {
  const prefix = "/api/plugin-trust";
  if (!matchesNativePluginPrefix(url.pathname, prefix)) return false;
  const controller = new AbortController();
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "插件管理请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel);
  response.once("close", disconnected);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix, maxBodyBytes: MAX_PACKAGE_BYTES,
    async handle({ method, pathname, body }) {
      const client = ports.localHost.actionClient(ports.projectRef);
      const installCaller = () => localWebActionContext(ports.localHost, ports.projectRef, PLUGIN_INSTALL_PERMISSIONS, controller.signal);
      const route = pathname.slice("/api/plugin-trust/".length);
      if (method === "POST" && route === "permissions/set") {
        if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人改插件的授权");
        const caller = await installCaller();
        const { capability_id, version } = pluginInstallActions.setPermission;
        return { status: 200, body: await withPluginPermissionSettingsEntry(caller, entry =>
          client.invoke(entry, { capability_id, version, provider_id: PLUGIN_INSTALL_PROVIDER_ID }, body)) as object };
      }
      // N42: build the person's context only once a route is known to call an action. An unknown route, or a body the route refuses,
      // answers without taking the project directory and permissions apart.
      let person: Promise<ActionCallContext> | undefined;
      const personContext = () => person ??= localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS, controller.signal)
        .then(context => ({ ...context, user_action: { source: "web", conversation_ref: `web:${ports.projectRef.project_id}`, message_ref: `web:request:${randomUUID()}` } }));
      const call = async (provider_id: string, definition: { capability_id: string; version: number }, input: unknown) =>
        client.invoke(await personContext(), { capability_id: definition.capability_id, version: definition.version, provider_id }, input);
      if (method === "GET" && route === "overview") {
        const [installed, publishers] = await Promise.all([call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.installed, {}), call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.publishers, {})]);
        const managed = await ports.localHost.withProject(ports.projectRef, async runtime => {
          const platform = await runningProjectPlatform(runtime.store, runtime.project_id);
          return platform?.runtime.list().filter(row => row.state !== "uninstalled" && platform.dualInstance(row.plugin_id)).map(row => row.install_id) ?? [];
        });
        return { status: 200, body: { ...(installed as object), ...(publishers as object), home_managed_install_ids: managed } };
      }
      if (method !== "POST") return null;
      if (route === "skills/import/preview" || route === "skills/import/confirm") {
        if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人导入技能");
        return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, route.endsWith("/preview") ? skillImportActions.preview : skillImportActions.confirm, body) };
      }
      if (route === "bundled/list") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.bundled, {}) };
      if (route === "install/preview") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.preview, body) };
      if (route === "install/confirm") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.confirm, body) };
      if (route === "installed/disable") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions.disable, body) };
      if (route === "installed/enable") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions.enable, body) };
      if (route === "installed/uninstall") {
        // Taking a plugin off is the project settings door's, as switching its permissions is (S-94, BL-915): a plugin's own page cannot.
        if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人卸载插件");
        const caller = await installCaller();
        const { capability_id, version } = pluginControlActions.uninstall;
        return { status: 200, body: await withPluginPermissionSettingsEntry(caller, entry =>
          client.invoke(entry, { capability_id, version, provider_id: PLUGIN_INSTALL_PROVIDER_ID }, body)) as object };
      }
      return null;
    },
  }); } finally {
    request.off("aborted", cancel);
    response.off("close", disconnected);
  }
}
