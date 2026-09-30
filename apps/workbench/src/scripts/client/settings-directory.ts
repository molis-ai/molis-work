/** Global and project settings: directory holds categories; exclusive work surfaces hold the document. */
export const SETTINGS_DIRECTORY_FACTORY_SCRIPT = `(host) => {
  const { translate: L, setDirectory, setExclusive, hideDirectory } = host;
  const projectId = host.projectId || (() => {
    try { return JSON.parse(document.querySelector("#molis-work-data")?.textContent || "{}").project?.project_id || ""; }
    catch { return ""; }
  })();
  const projectPrefix = projectId ? "/projects/" + encodeURIComponent(projectId) : "";
  const bindEmbed = (root) => {
    // Pages whose script reads where it was opened from (a Character's prompts, the diagnostics anchor) get the
    // address the cover loaded, not the workbench's.
    globalThis.molisWorkBindPromptSettings?.(root, { search: root.dataset.settingsSearch || "", hash: root.dataset.settingsHash || "" });
    globalThis.molisWorkBindAssistantSettings?.(root);
    globalThis.molisWorkBindMemorySettings?.(root);
    globalThis.molisWorkBindProjectIdentity?.(root);
    globalThis.molisWorkBindProjectGuidance?.(root);
    globalThis.molisWorkBindProjectRules?.(root);
    globalThis.molisWorkBindPlanningSettings?.(root);
    globalThis.molisWorkBindPlanningAdoption?.(root);
    globalThis.molisWorkBindShelfSettings?.(root);
    globalThis.molisWorkBindConnectorsSettings?.(root);
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
    const pool = document.querySelector("[data-surface-pool]");
    const showNode = (node) => {
      if (!body || !node) return;
      if (node.ownerDocument !== document) document.adoptNode(node);
      [...body.children].forEach((child) => {
        if (child === node) return;
        // A plugin's own surface shown as a settings page (角色) goes back where it lives, still bound.
        if (child.matches("[data-work-surface]") && pool) { child.hidden = true; pool.append(child); }
        else child.remove();
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
    const loadFromHtml = (section, html, fetchPath) => {
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
      if (fetchPath) {
        const address = new URL(fetchPath, location.origin);
        wrap.dataset.settingsSearch = address.search;
        wrap.dataset.settingsHash = address.hash;
      }
      caches.set(section, wrap);
      showNode(wrap);
      active = section;
      markNav(section);
      bindEmbed(wrap);
    };
    const loadSection = async (section, fetchPath) => {
      if (!body) return;
      host.noteCover?.(options.kind, section + (fetchPath ? " " + fetchPath : ""));
      // A section a plugin already renders in this page (角色) is shown as it is, with its state.
      const local = options.local?.(section);
      if (local) {
        loading = null;
        showNode(local);
        active = section;
        markNav(section);
        return;
      }
      if (!fetchPath && caches.has(section)) {
        loading = null;
        showNode(caches.get(section));
        bindEmbed(caches.get(section));
        active = section;
        markNav(section);
        return;
      }
      const requestKey = fetchPath || section;
      if (loading?.key === requestKey) return;
      const request = { key: requestKey };
      loading = request;
      const status = document.createElement("p");
      status.dataset.settingsLoading = "1";
      status.className = "mw-loading";
      status.setAttribute("role", "status");
      status.textContent = L("正在加载设置");
      showNode(status);
      try {
        const path = fetchPath || options.sectionPath(section);
        const response = await fetch(path, { headers: { Accept: "text/html" } });
        if (!response.ok) throw new Error(L("无法加载设置"));
        const html = await response.text();
        if (loading !== request) return;
        loadFromHtml(section, html, fetchPath);
      } catch (error) {
        // The reason and a way to try again, where the section would be.
        const failed = document.createElement("div");
        failed.className = "mw-empty mw-empty--error";
        failed.dataset.settingsLoading = "1";
        failed.setAttribute("role", "alert");
        failed.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
        failed.querySelector("strong").textContent = L("无法加载设置");
        failed.querySelector("p").textContent = error.message && error.message !== L("无法加载设置") ? error.message : L("请稍后重试");
        const retry = failed.querySelector("button");
        retry.textContent = L("重试");
        retry.addEventListener("click", () => { retry.disabled = true; if (loading === request) loading = null; void loadSection(section, fetchPath); });
        showNode(failed);
      } finally {
        if (loading === request) loading = null;
      }
    };
    nav?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-settings-section]");
      if (!button) return;
      event.preventDefault();
      // 能力 is its own cover, opened from the same list.
      if (button.dataset.settingsCover) { host.openCover?.(button.dataset.settingsCover); return; }
      void loadSection(button.dataset.settingsSection || options.preset);
      if (matchMedia("(max-width: 600px)").matches) hideDirectory?.();
    });
    return { loadSection, loadFromHtml, getActive: () => active, caches };
  };
  const bindGlobal = () => bindPanel(
    document.querySelector("[data-directory-panel=settings]"),
    document.querySelector("[data-work-surface=settings]"),
    {
      kind: "settings",
      preset: "appearance",
      sectionPath: (section) => {
        const path = section === "planning" ? "/settings/planning" : "/settings/" + section;
        return projectId ? path + (path.includes("?") ? "&" : "?") + "project=" + encodeURIComponent(projectId) : path;
      },
      // A plugin that renders its settings page into this workbench marks it; that page is shown in place.
      local: (section) => document.querySelector('[data-settings-page="' + CSS.escape(section) + '"]'),
    },
  );
  const bindProject = () => bindPanel(
    document.querySelector("[data-directory-panel=project-settings]"),
    document.querySelector("[data-work-surface=project-settings]"),
    {
      kind: "project-settings",
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
    if (rest === "/workspaces") return "workspaces";
    if (rest.startsWith("/guidance")) return "guidance";
    if (rest.startsWith("/rules")) return "rules";
    if (rest.startsWith("/planning")) return "planning";
    return "";
  };
  const globalSectionFromPath = (pathname) => {
    if (pathname.startsWith("/settings/planning")) return "planning";
    if (pathname.startsWith("/settings/runtimes")) return "runtimes";
    if (pathname.startsWith("/settings/mcp")) return "mcp";
    if (pathname.startsWith("/settings/connectors")) return "connectors";
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
  // History and the bar reopen a settings cover on the section it last showed.
  // A place is "<section>" or "<section> <address>" (a nested page such as one role's prompts).
  const reopen = (kind, panel, fallback) => (place) => {
    const [section, ...address] = String(place || "").split(" ");
    const fetchPath = address.join(" ");
    if (fetchPath) panel()?.caches.delete(section);
    openShell(kind, section || panel()?.getActive() || fallback, fetchPath || undefined);
  };
  host.registerCover?.("settings", reopen("settings", () => globalSettings, "appearance"));
  host.registerCover?.("project-settings", reopen("project-settings", () => projectSettings, "general"));
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
    if (url.origin !== location.origin) return false;
    // A project page draws root links under its own prefix; a global page named there is still the global page.
    const pathname = projectPrefix && url.pathname.startsWith(projectPrefix + "/settings/") ? url.pathname.slice(projectPrefix.length) : url.pathname;
    if (!pathname.startsWith("/settings/")) return false;
    const section = globalSectionFromPath(pathname);
    if (!section || !globalSettings) {
      globalSettings ||= bindGlobal();
      if (!section || !globalSettings) return false;
    }
    setDirectory?.("settings", true, true);
    setExclusive?.("settings");
    if (section === "appearance" && pathname === "/settings/appearance") {
      void globalSettings.loadSection("appearance");
      return true;
    }
    globalSettings.caches.delete(section);
    void globalSettings.loadSection(section, pathname + url.search + url.hash);
    return true;
  };
  document.addEventListener("molis-work:open-settings-path", (event) => {
    openProjectSettingsFromUrl(event.detail?.href || "");
  });
  const knownGlobalSection = (section) => [...document.querySelectorAll("[data-directory-panel=settings] [data-settings-section]")]
    .some((row) => row.dataset.settingsSection === section && !row.dataset.settingsCover);
  // A plugin whose page lives in settings (角色) is opened there, from search, a link or an old tab.
  document.addEventListener("molis-work:open-settings-section", (event) => {
    const section = event.detail?.section;
    if (typeof section === "string" && knownGlobalSection(section)) openShell("settings", section);
  });
  // “?settings=<section>” on the workbench address opens that settings page once the workbench has landed.
  const requestedSection = new URLSearchParams(location.search).get("settings");
  if (requestedSection) setTimeout(() => {
    const address = new URL(location.href);
    address.searchParams.delete("settings");
    history.replaceState(history.state, "", address);
    if (knownGlobalSection(requestedSection)) openShell("settings", requestedSection);
  }, 0);
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
    if (openGlobalSettingsFromUrl(link.href)) {
      event.preventDefault();
      return;
    }
    const inSettingsShell = link.closest("[data-work-surface=settings], [data-work-surface=project-settings], [data-directory-panel=settings], [data-directory-panel=project-settings]");
    if (!inSettingsShell) return;
    if ((link.hasAttribute("data-settings-return-workbench") || link.matches(".settings-nav-back")) && url.pathname === projectPrefix + "/") {
      event.preventDefault();
      if (!host.closeCover?.()) { setDirectory?.("root", true, false); setExclusive?.(null); }
      return;
    }
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const href = event.data?.type === "molis-work:open-settings" ? event.data.href : "";
    if (typeof href === "string" && href) openGlobalSettingsFromUrl(href);
  });
  return {
    loadSection: (section) => globalSettings?.loadSection(section),
    loadProjectSection: (section, path) => projectSettings?.loadSection(section, path),
    getActive: () => globalSettings?.getActive(),
    getProjectActive: () => projectSettings?.getActive(),
  };
}`;
