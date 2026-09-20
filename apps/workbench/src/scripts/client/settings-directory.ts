/** Global and project settings: directory holds categories; exclusive work surfaces hold the document. */
export const SETTINGS_DIRECTORY_FACTORY_SCRIPT = `(host) => {
  const { translate: L, setDirectory, setExclusive } = host;
  const projectId = host.projectId || (() => {
    try { return JSON.parse(document.querySelector("#molis-work-data")?.textContent || "{}").project?.project_id || ""; }
    catch { return ""; }
  })();
  const projectPrefix = projectId ? "/projects/" + encodeURIComponent(projectId) : "";
  const bindEmbed = (root) => {
    globalThis.molisWorkBindProjectIdentity?.(root);
    globalThis.molisWorkBindProjectGuidance?.(root);
    globalThis.molisWorkBindProjectRules?.(root);
    globalThis.molisWorkBindPlanningSettings?.(root);
    globalThis.molisWorkBindPlanningAdoption?.(root);
    globalThis.molisWorkBindShelfSettings?.(root);
    document.dispatchEvent(new CustomEvent("molis-work:settings-embed", { detail: { root } }));
  };
  const extractContent = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.querySelector(".settings-content") || doc.querySelector(".settings-document") || doc.querySelector(".project-settings-page") || doc.querySelector(".guidance-document") || doc.querySelector(".work-planning") || doc.body;
  };
  const modifiedClick = (event) => event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1;
  const bindPanel = (navRoot, bodyRoot, options) => {
    if (!navRoot || !bodyRoot) return null;
    const nav = navRoot.querySelector("[data-settings-directory-nav]");
    const body = bodyRoot.querySelector("[data-settings-stage-body]") || bodyRoot;
    const caches = new Map();
    const preset = body.querySelector("[data-settings-panel='" + options.preset + "']");
    if (preset) caches.set(options.preset, preset);
    let active = options.preset;
    let loading = null;
    const markNav = (section) => {
      nav?.querySelectorAll("[data-settings-section]").forEach((button) => {
        const current = button.dataset.settingsSection === section;
        if (current) {
          button.setAttribute("aria-current", "page");
          button.classList.add("is-selected");
        } else {
          button.removeAttribute("aria-current");
          button.classList.remove("is-selected");
        }
      });
    };
    const showNode = (node) => {
      if (!body || !node) return;
      if (node.ownerDocument !== document) document.adoptNode(node);
      [...body.children].forEach((child) => {
        if (child !== node) child.remove();
      });
      if (node.parentElement !== body) body.append(node);
      node.hidden = false;
      const resetScroll = () => {
        body.scrollTop = 0;
        body.scrollLeft = 0;
      };
      resetScroll();
      requestAnimationFrame(resetScroll);
    };
    const loadFromHtml = (section, html) => {
      const content = extractContent(html);
      if (!content) return;
      let wrap;
      if (content.classList?.contains("settings-content") || content === content.ownerDocument.body) {
        const elements = [...content.children];
        if (elements.length === 1) wrap = elements[0];
        else {
          wrap = document.createElement("div");
          wrap.replaceChildren(...elements);
        }
      } else wrap = content;
      wrap.dataset.settingsPanel = section;
      caches.set(section, wrap);
      showNode(wrap);
      active = section;
      markNav(section);
      bindEmbed(wrap);
    };
    const loadSection = async (section, fetchPath) => {
      if (!body) return;
      if (!fetchPath && caches.has(section)) {
        showNode(caches.get(section));
        active = section;
        markNav(section);
        return;
      }
      const requestKey = fetchPath || section;
      if (loading === requestKey) return;
      loading = requestKey;
      const status = document.createElement("p");
      status.dataset.settingsLoading = "1";
      status.textContent = L("正在加载设置");
      showNode(status);
      try {
        const path = fetchPath || options.sectionPath(section);
        const response = await fetch(path, { headers: { Accept: "text/html" } });
        if (!response.ok) throw new Error(L("无法加载设置"));
        const html = await response.text();
        if (loading !== requestKey) return;
        loadFromHtml(section, html);
      } catch (error) {
        status.textContent = error.message || L("无法加载设置");
      } finally {
        if (loading === requestKey) loading = null;
      }
    };
    nav?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-settings-section]");
      if (!button) return;
      event.preventDefault();
      void loadSection(button.dataset.settingsSection || options.preset);
    });
    return { loadSection, loadFromHtml, getActive: () => active, caches };
  };
  const bindGlobal = () => bindPanel(
    document.querySelector("[data-directory-panel=settings]"),
    document.querySelector("[data-work-surface=settings]"),
    {
      preset: "appearance",
      sectionPath: (section) => {
        const path = section === "planning" ? "/settings/planning" : "/settings/" + section;
        return projectId ? path + (path.includes("?") ? "&" : "?") + "project=" + encodeURIComponent(projectId) : path;
      },
    },
  );
  const bindProject = () => bindPanel(
    document.querySelector("[data-directory-panel=project-settings]"),
    document.querySelector("[data-work-surface=project-settings]"),
    {
      preset: "general",
      sectionPath: (section) => {
        const path = section === "general" ? projectPrefix + "/settings" : projectPrefix + "/settings/" + section;
        return path + "?embed=1";
      },
    },
  );
  let globalSettings = bindGlobal();
  let projectSettings = bindProject();
  const projectSectionFromPath = (pathname) => {
    if (!projectPrefix || !pathname.startsWith(projectPrefix + "/settings")) return "";
    const rest = pathname.slice((projectPrefix + "/settings").length).replace(/\\/+$/, "") || "";
    if (!rest || rest === "/general") return "general";
    if (rest.startsWith("/guidance")) return "guidance";
    if (rest.startsWith("/rules")) return "rules";
    if (rest.startsWith("/planning")) return "planning";
    return "";
  };
  const globalSectionFromPath = (pathname) => {
    if (pathname.startsWith("/settings/planning")) return "planning";
    if (pathname.startsWith("/settings/runtimes")) return "runtimes";
    if (pathname.startsWith("/settings/mcp")) return "mcp";
    if (pathname.startsWith("/settings/diagnostics")) return "diagnostics";
    if (pathname.startsWith("/settings/appearance") || pathname === "/settings") return "appearance";
    const slug = pathname.replace(/^\\/settings\\//, "").split("/")[0];
    if (!slug || slug === pathname) return "";
    const known = [...document.querySelectorAll("[data-directory-panel=settings] [data-settings-section]")]
      .map((row) => row.dataset.settingsSection);
    return known.includes(slug) ? slug : "";
  };
  const openShell = (kind, section, fetchPath) => {
    setDirectory?.(kind, true, true);
    setExclusive?.(kind);
    if (kind === "project-settings") {
      projectSettings ||= bindProject();
      void projectSettings?.loadSection(section || "general", fetchPath);
    } else {
      globalSettings ||= bindGlobal();
      void globalSettings?.loadSection(section || "appearance", fetchPath);
    }
  };
  const openProjectSettings = (section, fetchPath) => openShell("project-settings", section, fetchPath);
  const openProjectSettingsFromUrl = (href) => {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return false;
    const projectSection = projectSectionFromPath(url.pathname);
    if (!projectSection) return false;
    const nested = /\\/settings\\/planning\\/.+/.test(url.pathname);
    projectSettings ||= bindProject();
    if (nested) projectSettings?.caches.delete("planning");
    openProjectSettings(projectSection, nested ? url.pathname + url.search : undefined);
    return true;
  };
  const openGlobalSettingsFromUrl = (href) => {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith("/settings/")) return false;
    const section = globalSectionFromPath(url.pathname);
    if (!section || !globalSettings) {
      globalSettings ||= bindGlobal();
      if (!section || !globalSettings) return false;
    }
    setDirectory?.("settings", true, true);
    setExclusive?.("settings");
    if (section === "appearance" && url.pathname === "/settings/appearance") {
      void globalSettings.loadSection("appearance");
      return true;
    }
    globalSettings.caches.delete(section);
    void (async () => {
      const response = await fetch(url.pathname + url.search, { headers: { Accept: "text/html" } });
      if (!response.ok) return;
      globalSettings.loadFromHtml(section, await response.text());
    })();
    return true;
  };
  document.addEventListener("molis-work:open-settings-path", (event) => {
    openProjectSettingsFromUrl(event.detail?.href || "");
  });
  document.addEventListener("click", (event) => {
    const projectOpener = event.target.closest("[data-directory-open=project-settings]");
    if (projectOpener) {
      if (projectOpener.tagName === "A" && modifiedClick(event)) return;
      if (projectOpener.tagName === "A") event.preventDefault();
      openProjectSettings(projectSettings?.getActive() || "general");
      return;
    }
    const globalOpener = event.target.closest("[data-directory-open=settings]");
    if (globalOpener) {
      openShell("settings", globalSettings?.getActive() || "appearance");
      return;
    }
    const link = event.target.closest("a[href]");
    if (!link || modifiedClick(event)) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    if (url.pathname === "/locale" || url.pathname.startsWith("/locale?")) return;
    if (openProjectSettingsFromUrl(link.href)) {
      event.preventDefault();
      return;
    }
    const inSettingsShell = link.closest("[data-work-surface=settings], [data-work-surface=project-settings], [data-directory-panel=settings], [data-directory-panel=project-settings]");
    if (!inSettingsShell) return;
    if (openGlobalSettingsFromUrl(link.href)) event.preventDefault();
  });
  return {
    loadSection: (section) => globalSettings?.loadSection(section),
    loadProjectSection: (section, path) => projectSettings?.loadSection(section, path),
    getActive: () => globalSettings?.getActive(),
    getProjectActive: () => projectSettings?.getActive(),
  };
}`;
