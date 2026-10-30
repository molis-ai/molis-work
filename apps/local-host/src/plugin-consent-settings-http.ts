import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { PLUGIN_CONSENT_PERMISSIONS, pluginConsentActions } from "./installed-plugin-consent-actions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { PLUGIN_INSTALL_PERMISSIONS, pluginInstallActions } from "./plugin-install-actions.js";
import { withPluginConsentSettingsEntry } from "./plugin-consent-settings-entry.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";

/** The Host settings transport has already passed the shared local control guard. It dispatches only these original actions: the person's agreements, and taking a publisher back. */
export async function handlePluginConsentSettingsHttp({ request, response, url, localHost }: WebRequestContext): Promise<boolean> {
  const definition = url.pathname === "/api/settings/plugin-consents/list" ? pluginConsentActions.list
    : url.pathname === "/api/settings/plugin-consents/revoke" ? pluginConsentActions.revoke
    : url.pathname === "/api/settings/plugin-publishers/revoke" ? pluginInstallActions.revokePublisher : undefined;
  if (request.method !== "POST" || !definition) return false;
  const controller = new AbortController();
  const cancel = () => controller.abort(new ActionError("actions.cancelled", "这次设置操作已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try {
    if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人管理同意");
    const input = await readLocalWebBody(request);
    const caller = await localWebActionContext(localHost, undefined, definition === pluginInstallActions.revokePublisher ? PLUGIN_INSTALL_PERMISSIONS : PLUGIN_CONSENT_PERMISSIONS, controller.signal);
    const result = await withPluginConsentSettingsEntry(caller, entry => localHost.homeActionClient().invoke(entry, definition, input));
    sendLocalWebJson(response, 200, result);
  } catch (error) {
    const failure = actionErrorResponse(error); sendLocalWebJson(response, failure.status, failure.body);
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
  return true;
}
