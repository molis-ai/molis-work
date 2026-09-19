/** Workbench composes bundled project entries and exact Artifact contributions. */
export const PLUGIN_WORKBENCH_FACTORY_SCRIPT = `(host) => {
  const { route, translate: L, projectId, setSurface, saveUiState, setMobileView, openTabItem } = host;
  const market = document.querySelector('[data-work-surface="market"]');
  const selector = market.querySelector("[data-market-project]");
  const trigger = market.querySelector("[data-market-project-trigger]");
  const popover = market.querySelector("[data-market-project-popover]");
  const projectLabel = market.querySelector("[data-market-project-label]");
  const projectOptions = market.querySelector("[data-market-project-options]");
  const projectCheck = market.querySelector("[data-market-project-check]");
  const status = market.querySelector("[data-market-status]");
  const retry = market.querySelector("[data-market-retry]");
  let projects = null, marketRequest = null, adding = false;
  const syncProjectMenu = () => {
    const current = selector.value;
    const currentText = selector.selectedOptions[0] ? selector.selectedOptions[0].text : "";
    projectLabel.textContent = currentText;
    trigger.disabled = selector.disabled;
    if (selector.disabled && popover.matches(":popover-open")) popover.hidePopover();
    const options = [...selector.options];
    const buttons = [...projectOptions.querySelectorAll("[data-market-project-option]")];
    const same = buttons.length === options.length && buttons.every((button, index) => button.dataset.marketProjectOption === options[index].value && button.querySelector("strong").textContent === options[index].text);
    if (!same) {
      projectOptions.replaceChildren(...options.map(option => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "plugin-market-project-option" + (option.value === current ? " is-current" : "");
        button.dataset.marketProjectOption = option.value;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(option.value === current));
        const name = document.createElement("strong");
        name.textContent = option.text;
        button.append(name);
        if (option.value === current) button.append(projectCheck.content.cloneNode(true));
        return button;
      }));
      return;
    }
    buttons.forEach(button => {
      const selected = button.dataset.marketProjectOption === current;
      button.classList.toggle("is-current", selected);
      button.setAttribute("aria-selected", String(selected));
      const mark = button.querySelector("svg");
      if (selected && !mark) button.append(projectCheck.content.cloneNode(true));
      if (!selected && mark) mark.remove();
    });
  };
  const placeProjectMenu = () => {
    const box = trigger.getBoundingClientRect();
    const width = Math.max(box.width, 220);
    popover.style.top = (box.bottom + 6) + "px";
    popover.style.left = Math.max(12, Math.min(box.right - width, innerWidth - width - 12)) + "px";
    popover.style.right = "auto";
    popover.style.bottom = "auto";
    popover.style.width = width + "px";
  };
  const filter = () => {
    const current = projects?.find(project => project.project_id === selector.value);
    const query = market.querySelector("[data-market-search]").value.trim().toLocaleLowerCase();
    const onlyAdded = market.querySelector('[data-market-scope][aria-pressed="true"]')?.dataset.marketScope === "added";
    const addedIds = current?.plugins ?? [];
    const installed = market.querySelector("[data-market-installed-row]");
    installed.replaceChildren(...addedIds.flatMap(id => {
      const card = market.querySelector('[data-market-plugin="' + id + '"]');
      if (!card) return [];
      const item = document.createElement("button");
      const name = card.querySelector("h2").textContent;
      item.type = "button";
      item.className = "plugin-market-installed-item";
      item.dataset.marketFocus = id;
      item.title = name;
      item.setAttribute("aria-label", name);
      item.append(card.querySelector(".plugin-market-icon").cloneNode(true));
      return [item];
    }));
    market.querySelector("[data-market-installed]").hidden = installed.childElementCount === 0 || Boolean(query);
    let count = 0;
    market.querySelectorAll("[data-market-plugin]").forEach(card => {
      const added = addedIds.includes(card.dataset.marketPlugin) || card.dataset.marketPlugin === "shelf";
      card.hidden = (onlyAdded && !added) || !((card.querySelector("h2").textContent + " " + card.querySelector("p").textContent).toLocaleLowerCase().includes(query));
      if (!card.hidden) count++;
      const button = card.querySelector("[data-market-add]");
      button.disabled = !current || added || adding;
      button.textContent = added ? L("已添加") : L("添加");
    });
    market.querySelector("[data-market-empty]").hidden = count > 0;
    market.querySelector("[data-market-catalog]").hidden = count === 0;
    syncProjectMenu();
  };
  const loadMarket = async () => {
    if (marketRequest) return marketRequest;
    if (projects) return;
    status.textContent = L("正在读取项目…"); retry.hidden = true;
    marketRequest = (async () => {
      try {
        const response = await fetch("/api/settings/project-plugins", { cache: "no-store" });
        if (!response.ok) throw new Error(L("无法读取项目插件"));
        projects = (await response.json()).projects;
        selector.replaceChildren(...projects.map(project => new Option(project.display_name, project.project_id)));
        if (projects.some(project => project.project_id === projectId)) selector.value = projectId;
        selector.disabled = !projects.length;
        status.textContent = projects.length ? "" : L("先创建一个项目，再添加插件。");
        filter();
      } catch (error) { status.textContent = error.message; retry.hidden = false; }
      finally { marketRequest = null; }
    })();
    return marketRequest;
  };
  market.addEventListener("input", filter);
  market.addEventListener("change", filter);
  popover.addEventListener("toggle", () => {
    requestAnimationFrame(() => {
      const open = popover.matches(":popover-open");
      trigger.setAttribute("aria-expanded", String(open));
      if (open) placeProjectMenu();
    });
  });
  popover.addEventListener("keydown", event => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...projectOptions.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    const target = buttons[Math.max(0, Math.min(buttons.length - 1, next < 0 ? 0 : next))];
    if (target) { event.preventDefault(); target.focus(); }
  });
  market.querySelector(".plugin-market-body").addEventListener("scroll", placeProjectMenu, { passive: true });
  addEventListener("resize", placeProjectMenu);
  market.addEventListener("click", async event => {
    const chosen = event.target.closest("[data-market-project-option]");
    if (chosen) {
      selector.value = chosen.dataset.marketProjectOption;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
      popover.hidePopover();
      return;
    }
    if (event.target.closest("[data-market-retry]")) { void loadMarket(); return; }
    const scope = event.target.closest("[data-market-scope]");
    if (scope) {
      market.querySelectorAll("[data-market-scope]").forEach(button => {
        button.setAttribute("aria-pressed", String(button === scope));
        button.classList.toggle("is-current", button === scope);
      });
      filter();
      return;
    }
    const installedItem = event.target.closest("[data-market-focus]");
    if (installedItem) {
      const row = market.querySelector('[data-market-plugin="' + installedItem.dataset.marketFocus + '"]');
      row?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    const button = event.target.closest("[data-market-add]");
    if (!button || button.disabled || adding) return;
    const targetProject = selector.value;
    adding = true; selector.disabled = true; filter();
    status.textContent = L("正在添加…");
    try {
      const response = await fetch("/api/settings/projects/" + encodeURIComponent(targetProject) + "/plugins", {
        method: "POST", headers: globalThis.molisWorkControlHeaders(),
        body: JSON.stringify({ plugin_id: button.dataset.marketAdd }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("无法添加插件"));
      const project = projects.find(project => project.project_id === targetProject);
      project.plugins = result.plugins;
      status.textContent = L("已添加到") + " " + project.display_name;
      if (targetProject === projectId) { saveUiState(); location.reload(); }
    } catch (error) { status.textContent = error.message; }
    finally { adding = false; selector.disabled = false; filter(); }
  });
  const directory = document.querySelector("[data-artifact-directory]");
  const detail = document.querySelector("[data-artifact-detail]");
  const artifactKey = "molis-work-artifact-selection:" + route("/");
  let artifactPath = null, artifactRequest = null;
  try {
    const storedPath = sessionStorage.getItem(artifactKey);
    if (storedPath === route("/artifacts") || storedPath?.startsWith(route("/artifacts/"))) artifactPath = storedPath;
  } catch {}
  const loadArtifacts = async (path = artifactPath || route("/artifacts")) => {
    if (!artifactRequest && artifactPath === path && detail.childElementCount && !detail.querySelector("[data-artifact-retry]")) return;
    artifactRequest?.abort();
    const controller = new AbortController(); artifactRequest = controller;
    const message = document.createElement("p"); message.textContent = L("正在读取成果…"); message.role = "status";
    detail.replaceChildren(message);
    try {
      const response = await fetch(path, { cache: "no-store", headers: { "x-molis-work-fragment": "artifact-workbench" }, signal: controller.signal });
      if (!response.ok && response.status !== 404) throw new Error(L("无法读取成果"));
      const template = document.createElement("template"); template.innerHTML = await response.text();
      const nextDirectory = template.content.querySelector("[data-artifact-directory]");
      const nextDetail = template.content.querySelector("[data-artifact-detail]");
      if (!nextDirectory || !nextDetail) throw new Error(L("无法读取成果"));
      if (controller !== artifactRequest) return;
      directory.replaceChildren(...nextDirectory.childNodes); detail.replaceChildren(...nextDetail.childNodes);
      artifactPath = path;
      const shell = document.querySelector("[data-artifact-stage-shell]");
      const workspace = document.querySelector("[data-artifact-stage-workspace]");
      const selected = detail.querySelector("[data-artifact-id]");
      if (shell) shell.dataset.expanded = selected ? "true" : "false";
      if (workspace) workspace.hidden = !selected;
      try { sessionStorage.setItem(artifactKey, path); } catch {}
    } catch (error) {
      if (controller.signal.aborted) return;
      message.textContent = error.message;
      const button = document.createElement("button"); button.type = "button"; button.dataset.artifactRetry = path; button.textContent = L("重试");
      detail.replaceChildren(message, button);
    } finally { if (controller === artifactRequest) artifactRequest = null; }
  };
  document.addEventListener("click", event => {
    const retryButton = event.target.closest("[data-artifact-retry]");
    if (retryButton) { void loadArtifacts(retryButton.dataset.artifactRetry); return; }
    const collapse = event.target.closest("[data-artifact-collapse]");
    if (collapse) {
      event.preventDefault();
      setSurface("artifacts");
      void loadArtifacts(route("/artifacts"));
      return;
    }
    const link = event.target.closest("a[href]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || link.target) return;
    const url = new URL(link.href);
    const base = route("/artifacts");
    if (url.origin !== location.origin || !(url.pathname === base || url.pathname.startsWith(base + "/"))) return;
    event.preventDefault();
    if (link.closest("[data-frame-block]")) { event.preventDefault(); return; }
    if (event.detail > 1) return;
    setSurface("artifacts");
    openTabItem?.("artifacts", url.pathname, link.textContent?.trim());
    void loadArtifacts(url.pathname);
    if (matchMedia("(max-width: 600px)").matches) setMobileView(url.pathname === base ? "tree" : "document");
  });
  return { open: surface => { if (surface === "market") void loadMarket(); if (surface === "artifacts" && !artifactRequest) void loadArtifacts(route("/artifacts")); } };
}`;
