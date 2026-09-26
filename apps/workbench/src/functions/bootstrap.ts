import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "./client.js";

/** System editor uses global rule storage and the explicitly selected project's consumers. */
export const FUNCTIONS_SYSTEM_CLIENT_SCRIPT = `(() => {
  const params = new URL(location.href).searchParams;
  const project = params.get("project");
  const feedApi = project ? async (path, method, body) => {
    const response = await fetch("/projects/" + encodeURIComponent(project) + path, {
      method, headers: globalThis.molisWorkControlHeaders(), body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || L("请求失败")), { code: payload.code });
    return payload;
  } : null;
  (${FUNCTIONS_CLIENT_FACTORY_SCRIPT})({ translate: L, feedApi });
})();`;
