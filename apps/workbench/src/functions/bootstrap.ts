import { FUNCTIONS_CLIENT_FACTORY_SCRIPT } from "./client.js";

/** System editor uses global rule storage and the explicitly selected project's consumers. It binds to its own page or
 * to the settings section the workbench loaded it into; `page` is the address it was opened at, which holds the open rule. */
export const FUNCTIONS_SYSTEM_CLIENT_SCRIPT = `(() => {
  const bind = (root, page) => {
    const project = page.address().searchParams.get("project");
    const api = project ? (path, method, body) => molisWorkRequest("/projects/" + encodeURIComponent(project) + path, {method, body, fallback: L("请求失败")}) : null;
    (${FUNCTIONS_CLIENT_FACTORY_SCRIPT})({ translate: L, api, root, page });
  };
  globalThis.molisWorkBindFunctionsRules = bind;
  bind(document, { address: () => new URL(location.href), replace: (next) => history.replaceState(null, "", next) });
})();`;
