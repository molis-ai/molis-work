import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "./client.js";

/** System editor uses global rule storage and the explicitly selected project's consumers. It binds to its own page or
 * to the settings section the workbench loaded it into; `page` is the address it was opened at, which holds the open rule. */
export const FUNCTIONS_SYSTEM_CLIENT_SCRIPT = `(() => {
  const bind = (root, page) => {
    const project = page.address().searchParams.get("project");
    const feedApi = project ? async (path, method, body) => {
      const response = await fetch("/projects/" + encodeURIComponent(project) + path, {
        method, headers: globalThis.molisWorkControlHeaders(), body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || L("请求失败")), { code: payload.code });
      return payload;
    } : null;
    (${FUNCTIONS_CLIENT_FACTORY_SCRIPT})({ translate: L, feedApi, root, page });
  };
  globalThis.molisWorkBindFunctionsRules = bind;
  bind(document, { address: () => new URL(location.href), replace: (next) => history.replaceState(null, "", next) });
})();`;
