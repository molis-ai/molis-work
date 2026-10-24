import { PAGES_CLIENT_ACTIONS } from "./client-actions.js";
import { PAGES_CLIENT_DOCUMENT } from "./client-document.js";
import { PAGES_CLIENT_LIST } from "./client-list.js";
import { PAGES_CLIENT_MENUS } from "./client-menus.js";
import { PAGES_CLIENT_SETUP } from "./client-setup.js";

/** Pages workbench client: library, autosave, ProseMirror host. */
export const PAGES_CLIENT_FACTORY_SCRIPT = `(host) => {
${PAGES_CLIENT_SETUP}
  const request = async (method, path, body) => {
    const payloadBody = body === undefined ? undefined : { ...body, project_id: projectId() };
    const response = await fetch(route(withProject(path)), {
      method, headers: headers(),
      body: payloadBody === undefined || method === "GET" ? undefined : JSON.stringify(payloadBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error((method === "GET" && host.readRefusal?.(response.status, payload.code)) || payload.error || L("文档请求失败")), { status: response.status });
    return payload;
  };
${PAGES_CLIENT_MENUS}
${PAGES_CLIENT_LIST}
${PAGES_CLIENT_DOCUMENT}
${PAGES_CLIENT_ACTIONS}
}`;
