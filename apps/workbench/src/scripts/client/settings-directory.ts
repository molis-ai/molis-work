/**
 * Global and project settings: directory holds categories; exclusive work surfaces hold the document.
 *
 * Notes on the behaviour below. They are kept here rather than inside the script because the script is served to every
 * page as it stands: a comment inside it is bytes the browser downloads and never runs.
 *
 * - `pageOf`: Where a loaded page was opened from. Pages that keep their state in the address (the open rule, a filter) read and update this; the cover remembers it, so a reload comes back to it.
 * - `ensureCapabilityScripts`: 能力's pages (the rules editor, MCP access, the Functions connection) bring scripts the workbench loads when first needed.
 * - `bindEmbed`: Pages whose script reads where it was opened from (a Character's prompts, the diagnostics anchor) get the address the cover loaded, not the workbench's.
 * - `showNode`: A plugin's own surface shown as a settings page (角色) goes back where it lives, still bound.
 * - `loadSection (local sections)`: A section a plugin already renders in this page (角色) is shown as it is, with its state.
 * - `loadSection (nested pages)`: A page inside the section (one method's detail) is kept only until the section itself is asked for.
 * - `loadSection (failure)`: The reason and a way to try again, where the section would be.
 * - `bindGlobal`: A plugin that renders its settings page into this workbench marks it; that page is shown in place.
 * - `globalSectionFromPath (能力)`: 能力: its four pages, and the rules editor inside the library.
 * - `globalSectionFromPath (projects)`: Every project on this machine: reached from its links (onboarding, a page with no project), not listed as a category.
 * - `reopen`: History and the bar reopen a settings cover on the section it last showed. A place is "<section>" or "<section> <address>" (a nested page such as one role's prompts).
 * - `openGlobalSettingsFromUrl`: A project page draws root links under its own prefix; a global page named there is still the global page.
 * - `openGlobalSettingsFromUrl (moved pages)`: MCP, connectors and Functions moved to 能力; their old settings addresses open the 能力 page.
 * - `molis-work:model-ready` (models): When the model settings page reports the first model that can run, this announces it on the document and into every pane frame, and each page re-reads what it showed about models. When a page of this tab sent the person to the settings (a link or a pane's relay, not the gear, not an address opened on load), the cover also closes over that page and a toast says so; a settings page opened directly (a new tab from onboarding) stays where it is.
 * - `molis-work:open-settings-section`: A plugin whose page lives in settings (角色) is opened there, from search, a link or an old tab.
 * - `?settings=`: “?settings=<section>” on the workbench address opens that settings page once the workbench has landed.
 * - `?settingsPath=`: “?settingsPath=<address>” is a settings page that was opened directly; the server sent it here to open in place.
 * - `link clicks`: A page that holds its own link back (a planning editor while it saves) keeps the person where they are.
 * - `GET forms`: A page's own filters (能力's scope and search) are GET forms: they load the filtered page in place, not a new page.
 * - `leave`: A section whose row went with its plugin (Coding's): its cached page is dropped, and a list that was showing it goes back to its first.
 */
export const SETTINGS_DIRECTORY_FACTORY_SCRIPT = `(host) => {
  const { translate: L, setDirectory, setExclusive, hideDirectory } = host;
  const projectId = host.projectId || (() => {
    try { return JSON.parse(document.querySelector("#molis-work-data")?.textContent || "{}").project?.project_id || ""; }
    catch { return ""; }
  })();
  const projectPrefix = projectId ? "/projects/" + encodeURIComponent(projectId) : "";
  const CAPABILITY_SECTIONS = ["library", "connections", "access", "history"];
  const pageOf = (root) => ({
    address: () => new URL(root.dataset.settingsSource || location.href, location.origin),
    replace: (next) => {
      const path = next.pathname + next.search + next.hash;
      root.dataset.settingsSource = path;
      const kind = root.closest("[data-work-surface]")?.dataset.workSurface;
      if (kind && root.dataset.settingsPanel) host.noteCover?.(kind, root.dataset.settingsPanel + " " + path);
    },
  });
  let capabilityScripts = null;
  const ensureCapabilityScripts = (html) => !/data-functions=|data-mcp-access|data-functions-settings/.test(html) ? Promise.resolve()
    : capabilityScripts ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/assets/molis-work-capabilities.js";
      script.onload = () => resolve();
      script.onerror = () => { capabilityScripts = null; script.remove(); reject(new Error(L("无法加载设置"))); };
      document.head.append(script);
    });
  let sentFromPage = false;
  const modelReady = () => {
    const frames = [...document.querySelectorAll("iframe[data-pane-tab]")].map((frame) => frame.contentDocument);
    [document, ...frames].forEach((doc) => doc?.dispatchEvent(new CustomEvent("molis-work:model-ready")));
    if (!sentFromPage) return;
    sentFromPage = false;
    if (host.closeCover?.()) host.showToast?.(L("模型已连接，可以继续了。"));
  };
  const bindEmbed = (root) => {
    const page = pageOf(root);
    globalThis.molisWorkBindPromptSettings?.(root, { search: root.dataset.settingsSearch || "", hash: root.dataset.settingsHash || "" });
    globalThis.molisWorkBindAssistantSettings?.(root);
    globalThis.molisWorkBindMemorySettings?.(root);
    globalThis.molisWorkBindAgentDiagnostics?.(root);
    globalThis.molisWorkBindProjectIdentity?.(root);
    globalThis.molisWorkBindProjectManager?.(root, { hash: root.dataset.settingsHash || "" });
    globalThis.molisWorkBindProjectGuidance?.(root);
    globalThis.molisWorkBindProjectRules?.(root);
    globalThis.molisWorkBindPlanningSettings?.(root);
    globalThis.molisWorkBindPlanningAdoption?.(root);
    globalThis.molisWorkBindShelfSettings?.(root);
    globalThis.molisWorkBindModelSettings?.(root, { ready: modelReady });
    globalThis.molisWorkBindConnectorsSettings?.(root, page);
    globalThis.molisWorkBindMcpAccess?.(root, page);
    globalThis.molisWorkBindFunctionsRules?.(root, page);
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
      wrap.dataset.settingsSource = fetchPath || options.sectionPath(section);
      if (fetchPath) {
        const address = new URL(fetchPath, location.origin);
        wrap.dataset.settingsAddress = fetchPath;
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
      const local = options.local?.(section);
      if (local) {
        loading = null;
        showNode(local);
        active = section;
        markNav(section);
        return;
      }
      if (!fetchPath && caches.get(section)?.dataset.settingsAddress) caches.delete(section);
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
        await ensureCapabilityScripts(html);
        if (loading !== request) return;
        loadFromHtml(section, html, fetchPath);
      } catch (error) {
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
        const path = (CAPABILITY_SECTIONS.includes(section) ? "/capabilities/" : "/settings/") + section;
        return projectId ? path + "?project=" + encodeURIComponent(projectId) : path;
      },
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
    if (rest.startsWith("/memory")) return "memory";
    if (rest.startsWith("/rules")) return "rules";
    if (rest.startsWith("/planning")) return "planning";
    return "";
  };
  const globalSectionFromPath = (pathname) => {
    if (pathname.startsWith("/settings/planning")) return "planning";
    if (pathname.startsWith("/settings/runtimes")) return "runtimes";
    const capability = /^\\/capabilities(?:\\/([^/?#]+))?/.exec(pathname);
    if (capability) return CAPABILITY_SECTIONS.includes(capability[1]) ? capability[1] : "library";
    if (pathname.startsWith("/settings/diagnostics")) return "diagnostics";
    if (pathname.startsWith("/settings/projects")) return "projects";
    if (pathname.startsWith("/settings/appearance") || pathname === "/settings") return "appearance";
    const slug = pathname.replace(/^\\/settings\\//, "").split("/")[0];
    if (!slug || slug === pathname) return "";
    const known = [...document.querySelectorAll("[data-directory-panel=settings] [data-settings-section]")]
      .map((row) => row.dataset.settingsSection);
    return known.includes(slug) ? slug : "";
  };
  const openShell = (kind, section, fetchPath) => {
    sentFromPage = false;
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
  const openGlobalSettingsFromUrl = (href, fromPage) => {
    const url = new URL(href, location.origin);
    if (url.origin !== location.origin) return false;
    const global = (path) => /^\\/(settings\\/|capabilities(\\/|$))/.test(path);
    const unprefixed = projectPrefix && url.pathname.startsWith(projectPrefix + "/") ? url.pathname.slice(projectPrefix.length) : "";
    let pathname = global(unprefixed) ? unprefixed : url.pathname;
    if (!global(pathname)) return false;
    if (pathname === "/settings/mcp") pathname = "/capabilities/access";
    else if (pathname === "/settings/connectors" || pathname === "/settings/functions") {
      if (pathname === "/settings/functions") url.searchParams.set("connector", "typesafe");
      pathname = "/capabilities/connections";
    }
    if (pathname === "/capabilities") pathname = "/capabilities/library";
    const section = globalSectionFromPath(pathname);
    if (!section || !globalSettings) {
      globalSettings ||= bindGlobal();
      if (!section || !globalSettings) return false;
    }
    if (fromPage !== undefined) sentFromPage = fromPage && section === "models";
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
    const href = event.detail?.href || "";
    if (!openProjectSettingsFromUrl(href)) openGlobalSettingsFromUrl(href, true);
  });
  const knownGlobalSection = (section) => [...document.querySelectorAll("[data-directory-panel=settings] [data-settings-section]")]
    .some((row) => row.dataset.settingsSection === section);
  document.addEventListener("molis-work:open-settings-section", (event) => {
    const section = event.detail?.section;
    if (typeof section === "string" && knownGlobalSection(section)) openShell("settings", section);
  });
  const requestedSection = new URLSearchParams(location.search).get("settings");
  if (requestedSection) setTimeout(() => {
    const address = new URL(location.href);
    address.searchParams.delete("settings");
    history.replaceState(history.state, "", address);
    if (knownGlobalSection(requestedSection)) openShell("settings", requestedSection);
  }, 0);
  const requestedPath = new URLSearchParams(location.search).get("settingsPath");
  if (requestedPath) setTimeout(() => {
    const address = new URL(location.href);
    address.searchParams.delete("settingsPath");
    history.replaceState(history.state, "", address);
    const asked = new URL(requestedPath, location.origin);
    if (openProjectSettingsFromUrl(asked.href) || openGlobalSettingsFromUrl(asked.href, false)) return;
    openShell("settings", "appearance");
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
    if (!link || modifiedClick(event) || event.defaultPrevented) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    if (url.pathname === "/locale" || url.pathname.startsWith("/locale?")) return;
    if (openProjectSettingsFromUrl(link.href)) {
      event.preventDefault();
      return;
    }
    const inSettingsShell = link.closest("[data-work-surface=settings], [data-work-surface=project-settings], [data-directory-panel=settings], [data-directory-panel=project-settings]");
    if (openGlobalSettingsFromUrl(link.href, !inSettingsShell)) {
      event.preventDefault();
      return;
    }
    if (!inSettingsShell) return;
    if ((link.hasAttribute("data-settings-return-workbench") || link.matches(".settings-nav-back")) && url.pathname === projectPrefix + "/") {
      event.preventDefault();
      if (!host.closeCover?.()) { setDirectory?.("root", true, false); setExclusive?.(null); }
      return;
    }
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (event.defaultPrevented || !form.closest?.("[data-work-surface=settings], [data-work-surface=project-settings]")) return;
    if ((form.getAttribute("method") || "get").toLowerCase() !== "get") return;
    const url = new URL(form.getAttribute("action") || form.closest("[data-settings-source]")?.dataset.settingsSource || location.href, location.origin);
    url.search = new URLSearchParams([...new FormData(form, event.submitter)].map(([key, value]) => [key, String(value)])).toString();
    if (openProjectSettingsFromUrl(url.href) || openGlobalSettingsFromUrl(url.href)) event.preventDefault();
  });
  const leave = (section) => {
    for (const [panel, first] of [[globalSettings, "appearance"], [projectSettings, "general"]]) {
      if (!panel) continue;
      panel.caches.delete(section);
      if (panel.getActive() === section) void panel.loadSection(first);
    }
  };
  return {
    loadSection: (section, path) => globalSettings?.loadSection(section, path),
    loadProjectSection: (section, path) => projectSettings?.loadSection(section, path),
    getActive: () => globalSettings?.getActive(),
    getProjectActive: () => projectSettings?.getActive(),
    leave,
  };
}`;
