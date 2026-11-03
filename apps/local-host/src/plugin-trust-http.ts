import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { withPluginPermissionSettingsEntry } from "./plugin-consent-settings-entry.js";
import { PLUGIN_INSTALL_PERMISSIONS, PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions, pluginInstallActions } from "./plugin-install-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";

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
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/plugin-trust", maxBodyBytes: MAX_PACKAGE_BYTES,
    async handle({ method, pathname, body }) {
      const client = ports.localHost.actionClient(ports.projectRef);
      const route = pathname.slice("/api/plugin-trust/".length);
      if (method === "POST" && route === "permissions/set") {
        if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人改插件的授权");
        const caller = await localWebActionContext(ports.localHost, ports.projectRef, PLUGIN_INSTALL_PERMISSIONS);
        const { capability_id, version } = pluginInstallActions.setPermission;
        return { status: 200, body: await withPluginPermissionSettingsEntry(caller, entry =>
          client.invoke(entry, { capability_id, version, provider_id: PLUGIN_INSTALL_PROVIDER_ID }, body)) as object };
      }
      const person: ActionCallContext = { ...await localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS),
        user_action: { source: "web", conversation_ref: `web:${ports.projectRef.project_id}`, message_ref: `web:request:${randomUUID()}` } };
      const call = (provider_id: string, definition: { capability_id: string; version: number }, input: unknown) =>
        client.invoke(person, { capability_id: definition.capability_id, version: definition.version, provider_id }, input);
      if (method === "GET" && route === "overview") {
        const [installed, publishers] = await Promise.all([call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.installed, {}), call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.publishers, {})]);
        return { status: 200, body: { ...(installed as object), ...(publishers as object) } };
      }
      if (method !== "POST") return null;
      if (route === "install/preview") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.preview, body) };
      if (route === "install/confirm") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.confirm, body) };
      if (route === "installed/disable") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions.disable, body) };
      if (route === "installed/enable") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions.enable, body) };
      if (route === "installed/uninstall") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions.uninstall, body) };
      return null;
    },
  });
}
