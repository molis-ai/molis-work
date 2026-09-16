/** Global settings live in the plugin directory; they are not a work surface. */
export const SETTINGS_DIRECTORY_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const panel = document.querySelector("[data-directory-panel=settings]");
  if (!panel) return null;
  const nav = panel.querySelector("[data-settings-directory-nav]");
  const body = panel.querySelector("[data-settings-directory-body]");
  const caches = new Map();
  const appearance = body?.querySelector("[data-settings-panel=appearance]");
  if (appearance) caches.set("appearance", appearance);
  let active = "appearance";
  let loading = null;
  const projectId = (() => {
    try { return JSON.parse(document.querySelector("#molis-work-data")?.textContent || "{}").project?.project_id || ""; }
    catch { return ""; }
  })();
  const sectionPath = (section) => {
    if (section === "planning") return "/settings/planning";
    return "/settings/" + section;
  };
  const markNav = (section) => {
    nav?.querySelectorAll("[data-settings-section]").forEach((button) => {
      if (button.dataset.settingsSection === section) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  };
  const bindEmbed = (root) => {
    globalThis.molisWorkBindPlanningSettings?.(root);
    globalThis.molisWorkBindPlanningAdoption?.(root);
    globalThis.molisWorkBindProjectGuidance?.(root);
    document.dispatchEvent(new CustomEvent("molis-work:settings-embed", { detail: { root } }));
  };
  const showNode = (node) => {
    if (!body || !node) return;
    [...body.children].forEach((child) => { child.hidden = child !== node; });
    if (!node.parentElement) body.append(node);
    node.hidden = false;
  };
  const loadSection = async (section) => {
    if (!body) return;
    if (section === "appearance") {
      const node = caches.get("appearance");
      if (node) showNode(node);
      active = "appearance";
      markNav(section);
      return;
    }
    const cached = caches.get(section);
    if (cached) {
      showNode(cached);
      active = section;
      markNav(section);
      return;
    }
    if (loading === section) return;
    loading = section;
    const status = document.createElement("p");
    status.dataset.settingsLoading = "1";
    status.textContent = L("正在加载设置");
    showNode(status);
    try {
      const url = new URL(sectionPath(section), location.origin);
      if (projectId) url.searchParams.set("project", projectId);
      const response = await fetch(url.pathname + url.search, { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error(L("无法加载设置"));
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const content = doc.querySelector(".settings-content") || doc.querySelector(".settings-document") || doc.body;
      const wrap = document.createElement("div");
      wrap.dataset.settingsPanel = section;
      wrap.replaceChildren(...[...content.childNodes]);
      caches.set(section, wrap);
      if (loading !== section) return;
      showNode(wrap);
      active = section;
      markNav(section);
      bindEmbed(wrap);
    } catch (error) {
      status.textContent = error.message || L("无法加载设置");
    } finally {
      if (loading === section) loading = null;
    }
  };
  nav?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-settings-section]");
    if (!button) return;
    event.preventDefault();
    void loadSection(button.dataset.settingsSection || "appearance");
  });
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-directory-panel=settings] a[href]");
    if (!link) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    if (url.pathname === "/locale" || url.pathname.startsWith("/locale?")) return;
    if (!url.pathname.startsWith("/settings/")) return;
    event.preventDefault();
    const section = url.pathname.startsWith("/settings/planning")
      ? "planning"
      : url.pathname.startsWith("/settings/runtimes")
        ? "runtimes"
        : url.pathname.startsWith("/settings/diagnostics")
          ? "diagnostics"
          : "appearance";
    if (section === "appearance" && url.pathname === "/settings/appearance") {
      void loadSection("appearance");
      return;
    }
    caches.delete(section === "planning" ? "planning" : section);
    void (async () => {
      loading = null;
      const response = await fetch(url.pathname + url.search, { headers: { Accept: "text/html" } });
      if (!response.ok) return;
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const content = doc.querySelector(".settings-content") || doc.querySelector(".settings-document") || doc.body;
      const wrap = document.createElement("div");
      wrap.dataset.settingsPanel = section;
      wrap.replaceChildren(...[...content.childNodes]);
      caches.set(section, wrap);
      showNode(wrap);
      active = section;
      markNav(section);
      bindEmbed(wrap);
    })();
  });
  return { loadSection, getActive: () => active };
}`;
