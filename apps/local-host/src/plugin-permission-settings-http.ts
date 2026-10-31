import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { localWebActionContext } from "./local-web-actions.js";
import { withHomePluginPermissionSettingsEntry } from "./plugin-consent-settings-entry.js";
import { PLUGIN_INSTALL_PERMISSIONS, PLUGIN_INSTALL_PROVIDER_ID, pluginControlActions, pluginInstallActions } from "./plugin-install-actions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";

const DOOR: Readonly<Record<string, { capability_id: string; version: number }>> = {
  "/api/settings/plugin-permissions/list": pluginInstallActions.homeInstalled,
  "/api/settings/plugin-permissions/set": pluginInstallActions.setHomePermission,
  // Switching a signed package installed in the Home off or on, or taking it off (BL-715): the same door, the same credential.
  "/api/settings/plugin-permissions/disable": pluginControlActions.homeDisable,
  "/api/settings/plugin-permissions/enable": pluginControlActions.homeEnable,
  "/api/settings/plugin-permissions/uninstall": pluginControlActions.homeUninstall,
};

/**
 * The Host settings door for the plugins that run as the Home's own instance (BL-700, S-94), shared by every project: what they hold, and
 * switching one optional permission, and switching a signed package off or on or taking it off (BL-715). The Host settings transport has already passed the shared local control guard. The person's act has no
 * project; the credential is this door's own and is issued here, so a plugin's page, a call made for the person and the project settings
 * route's credential are none of them good for it.
 */
export async function handlePluginPermissionSettingsHttp({ request, response, url, localHost }: WebRequestContext): Promise<boolean> {
  const definition = Object.hasOwn(DOOR, url.pathname) ? DOOR[url.pathname] : undefined;
  if (request.method !== "POST" || !definition) return false;
  const controller = new AbortController();
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "这次设置操作已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try {
    if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人改插件的授权");
    const input = await readLocalWebBody(request);
    const caller = await localWebActionContext(localHost, undefined, PLUGIN_INSTALL_PERMISSIONS, controller.signal);
    const target = { capability_id: definition.capability_id, version: definition.version, provider_id: PLUGIN_INSTALL_PROVIDER_ID };
    const result = await withHomePluginPermissionSettingsEntry(caller, entry => localHost.homeActionClient().invoke(entry, target, input));
    sendLocalWebJson(response, 200, result);
  } catch (error) {
    const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body);
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
  return true;
}
