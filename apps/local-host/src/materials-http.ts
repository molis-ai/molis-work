import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { materialsActions } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS, MATERIALS_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/**
 * The workbench's door to the platform's materials service (Files retirement, materials-ui-contract §4, §5): the side panel's reader
 * opens a file of the project's folders, reads a long one on in windows, fixes what the person saw as a snapshot or a quoted
 * selection, and asks where they last read. Every route invokes the `materials.*` action as the person, in this project only, with
 * the folder read the service asks; what each may do is the action's to decide, and its refusal is passed on as it is.
 */
const posted: Readonly<Record<string, ActionDefinition<unknown, unknown>>> = { open: materialsActions.open, read: materialsActions.read, capture: materialsActions.capture };

export async function handleMaterialsHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: { localHost: MolisWorkLocalHost; projectRef: LocalHostProjectReference }): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/materials", maxBodyBytes: 64_000,
    async handle({ method, pathname, body }) {
      const route = pathname.slice("/api/materials/".length);
      const definition: ActionDefinition<unknown, unknown> | undefined = method === "GET" ? (route === "position" ? materialsActions.position : undefined)
        : Object.hasOwn(posted, route) ? posted[route] : undefined;
      if (!definition) return null;
      const actions = bindLocalWebActions(ports.localHost, ports.projectRef, [...LOCAL_OWNER_PERMISSIONS, ...MATERIALS_OWNER_PERMISSIONS]);
      return { status: 200, body: await actions.invoke(definition, method === "GET" ? {} : body) };
    },
  });
}
