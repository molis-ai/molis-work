import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { PLUGIN_CONSENT_PROVIDER_ID, pluginConsentActions } from "./installed-plugin-consent-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions } from "./plugin-install-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/** A package carries the plugin's code and files, base64 inside the signed bundle; the command line's route takes the same. */
const MAX_PACKAGE_BYTES = 24 * 1024 * 1024;

/**
 * The workbench's door to a project's plugins (ac-trust T7): what is installed here with its permissions and agreements, installing a
 * signed package (preview, then confirm), and taking an agreement back. Each route invokes the shared actions as the person, and says so
 * itself: the entry stamps the person's own page request (`user_action`, S-58) and nothing in the request body is read for it.
 */
export async function handlePluginTrustHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: { localHost: MolisWorkLocalHost; projectRef: LocalHostProjectReference }): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/plugin-trust", maxBodyBytes: MAX_PACKAGE_BYTES,
    async handle({ method, pathname, body }) {
      const client = ports.localHost.actionClient(ports.projectRef);
      const person: ActionCallContext = { ...await localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS),
        user_action: { source: "web", conversation_ref: `web:${ports.projectRef.project_id}`, message_ref: `web:request:${randomUUID()}` } };
      const call = (provider_id: string, definition: { capability_id: string; version: number }, input: unknown) =>
        client.invoke(person, { capability_id: definition.capability_id, version: definition.version, provider_id }, input);
      const route = pathname.slice("/api/plugin-trust/".length);
      if (method === "GET" && route === "overview") {
        const [installed, publishers] = await Promise.all([call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.installed, {}), call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.publishers, {})]);
        return { status: 200, body: { ...(installed as object), ...(publishers as object) } };
      }
      if (method !== "POST") return null;
      if (route === "install/preview") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.preview, body) };
      if (route === "install/confirm") return { status: 200, body: await call(PLUGIN_INSTALL_PROVIDER_ID, pluginInstallActions.confirm, body) };
      if (route === "consents/revoke") return { status: 200, body: await call(PLUGIN_CONSENT_PROVIDER_ID, pluginConsentActions.revoke, body) };
      return null;
    },
  });
}
