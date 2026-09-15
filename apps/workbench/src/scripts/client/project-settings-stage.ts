import { projectSettingsPageFromPath, projectSettingsPath } from "../../project-settings-stage.js";

export const PROJECT_SETTINGS_STAGE_FACTORY_SCRIPT = `(host) => {
  const { translate: L, route, localPathname, setDirectory, tabWorkspace, workspace } = host;
  const parse = (${projectSettingsPageFromPath.toString()});
  const pathFor = (${projectSettingsPath.toString()});
  const root = document.querySelector("[data-project-settings-page-root]");
  const dir = document.querySelector("[data-project-settings-dir]");
  let loadToken = 0;
  const withSearch = (pathname) => {
    const url = new URL(route(pathname), location.href);
    url.search = location.search;
    return url.pathname + url.search + url.hash;
  };
  const bindEmbedded = (scope) => {
    globalThis.molisWorkBindProjectIdentity?.(scope);
    globalThis.molisWorkBindProjectGuidance?.(scope);
    globalThis.molisWorkBindProjectRules?.(scope);
    globalThis.molisWorkBindPlanningSettings?.(scope);
    globalThis.molisWorkBindPlanningAdoption?.(scope);
  };
  const syncChrome = (page) => {
    workspace?.classList.toggle("is-project-settings", Boolean(page));
    const gear = document.querySelector(".navigator-project-settings");
    if (page) gear?.setAttribute("aria-current", "page");
    else gear?.removeAttribute("aria-current");
    dir?.querySelectorAll("[data-project-settings-page]").forEach((link) => {
      const current = Boolean(page) && link.dataset.projectSettingsPage === page;
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };
  const load = async (page) => {
    if (!root) return;
    const token = ++loadToken;
    if (root.dataset.loadedPage === page && root.dataset.loaded === "1") return;
    root.dataset.loadedPage = page;
    root.dataset.loaded = "pending";
    root.innerHTML = "<p class=\\"project-settings-embed-pending\\">" + L("正在打开…") + "</p>";
    try {
      const embedUrl = new URL(route(pathFor(page)), location.href);
      embedUrl.search = location.search;
      embedUrl.searchParams.set("embed", "1");
      const response = await fetch(embedUrl.pathname + embedUrl.search, { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error();
      const html = await response.text();
      if (token !== loadToken) return;
      root.innerHTML = html;
      root.dataset.loaded = "1";
      bindEmbedded(root);
    } catch {
      if (token !== loadToken) return;
      delete root.dataset.loaded;
      root.innerHTML = "<p class=\\"settings-form-error\\" role=\\"alert\\">" + L("无法打开这一段设置") + "</p>";
    }
  };
  const open = (page, options = {}) => {
    tabWorkspace()?.setExclusive("project-settings");
    setDirectory("settings", options.persist !== false, options.focus !== false);
    syncChrome(page);
    const next = pathFor(page);
    if (options.history !== false && localPathname() !== next) {
      history.pushState({ projectSettings: page }, "", withSearch(next));
    }
    void load(page);
  };
  const leave = (options = {}) => {
    const page = parse(localPathname());
    if (!page && !workspace?.classList.contains("is-project-settings")) return;
    syncChrome(null);
    if (options.history !== false && page) {
      history.pushState({ workSurface: options.surface || "plugin" }, "", withSearch("/"));
    }
  };
  const pageFromHref = (href) => {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return null;
      const prefix = document.body.dataset.routePrefix || "";
      const path = prefix && url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) || "/" : url.pathname;
      return parse(path);
    } catch {
      return null;
    }
  };
  const handleClick = (event, target) => {
    const pageLink = target.closest("[data-project-settings-page]");
    if (pageLink) {
      event.preventDefault();
      open(pageLink.dataset.projectSettingsPage || "general");
      return true;
    }
    const gear = target.closest(".navigator-project-settings");
    if (gear) {
      event.preventDefault();
      open("general");
      return true;
    }
    const link = target.closest("a[href]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank") return false;
    const page = pageFromHref(link.getAttribute("href"));
    if (!page) return false;
    event.preventDefault();
    open(page);
    return true;
  };
  const syncFromLocation = () => {
    const page = parse(localPathname());
    if (page) open(page, { history: false, persist: false, focus: false });
  };
  addEventListener("popstate", () => {
    const page = parse(localPathname());
    if (page) open(page, { history: false, persist: false, focus: false });
    else syncChrome(null);
  });
  return { open, leave, handleClick, syncFromLocation, parse };
}`;
