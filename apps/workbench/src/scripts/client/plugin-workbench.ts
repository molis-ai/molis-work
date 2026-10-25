import { PLUGIN_EVENT_RECOVERY_CLIENT } from "./plugin-event-recovery.js";
import { ARTIFACT_GOAL_INPUT_CLIENT_SCRIPT, ARTIFACT_WORKS_CLIENT_SCRIPT, ARTIFACT_HANDOFF_CLIENT_SCRIPT, ARTIFACT_PORT_INPUT_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-artifacts";

/** Workbench composes bundled project entries and exact Artifact contributions. The menus holding the market's update count
 * light their dot from `data-market-updates`: a style rule that looked inside them restyled each whole menu on every change. */
export const PLUGIN_WORKBENCH_FACTORY_SCRIPT = `(host) => {
  const { route, translate: L, projectId, setSurface, saveUiState, setMobileView, openTabItem, openPlugin } = host;
  const market = document.querySelector('[data-work-surface="market"]');
  const selector = market.querySelector("[data-market-project]");
  const eventRecovery = (${PLUGIN_EVENT_RECOVERY_CLIENT})(host, market);
  const trigger = market.querySelector("[data-market-project-trigger]");
  const popover = market.querySelector("[data-market-project-popover]");
  const projectLabel = market.querySelector("[data-market-project-label]");
  const projectOptions = market.querySelector("[data-market-project-options]");
  const projectCheck = market.querySelector("[data-market-project-check]");
  const status = market.querySelector("[data-market-status]");
  const retry = market.querySelector("[data-market-retry]");
  // The market entry lives in the bar's Dock menu (the rail's only on older shells); its count lights the menu's dot too.
  const marketLink = document.querySelector('[data-global-menu] [data-plugin-id="market"], [data-plugin-strip] [data-plugin-id="market"]');
  const updateCount = marketLink?.querySelector("[data-market-update-count]");
  let projects = null, updates = [], marketRequest = null, updatesRequest = null, pending = false, marketDirty = true, marketRevision = 0;
  const paintUpdateCount = () => {
    if (updateCount) {
      updateCount.hidden = updates.length === 0;
      updateCount.textContent = updates.length ? String(updates.length) : "";
      updateCount.closest(".plugin-picker, .account-global-menu")?.toggleAttribute("data-market-updates", updates.length > 0);
    }
    if (marketLink) marketLink.setAttribute("aria-label", updates.length
      ? L("插件市场") + "，" + updates.length + L("个可用更新")
      : L("插件市场"));
  };
  const refreshUpdates = () => {
    if (updatesRequest) return updatesRequest;
    updatesRequest = (async () => {
      try {
        if (!projectId) { updates = []; return; }
        updates=(await molisWorkRequest(route("/api/plugins/runtime/updates"),{fallback:L("无法读取插件更新")})).updates||[];
      } catch { updates = []; }
      finally { paintUpdateCount(); }
    })().finally(() => { updatesRequest = null; });
    return updatesRequest;
  };
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
    eventRecovery.scope(Boolean(projectId) && selector.value === projectId);
    const current = projects?.find(project => project.project_id === selector.value);
    const query = market.querySelector("[data-market-search]").value.trim().toLocaleLowerCase();
    const onlyAdded = market.querySelector('[data-market-scope][aria-pressed="true"]')?.dataset.marketScope === "added";
    const addedIds = current?.plugins ?? [];
    const hiddenIds = current?.hidden ?? [];
    paintUpdateCount();
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
      const added = addedIds.includes(card.dataset.marketPlugin) || (card.hasAttribute("data-market-personal") && !hiddenIds.includes(card.dataset.marketPlugin));
      card.hidden = (onlyAdded && !added) || !((card.querySelector("h2").textContent + " " + card.querySelector("p").textContent).toLocaleLowerCase().includes(query));
      if (!card.hidden) count++;
      const button = card.querySelector("[data-market-add]");
      button.disabled = !current || pending || marketDirty;
      button.dataset.marketMembership = added ? "added" : "available";
      button.textContent = added ? L("移除") : L("添加");
      const currentProject = selector.value === projectId;
      const openButton = card.querySelector('[data-market-open]');
      openButton.hidden = !added || !currentProject;
      openButton.disabled = pending;
      button.classList.toggle('mw-btn--ghost', added);
      button.classList.toggle('mw-btn--secondary', !added);
      button.setAttribute('aria-label', (added ? L('移除') : L('添加')) + ' ' + card.querySelector('h2').textContent);
      const update = added && currentProject ? updates.find(item => item.project_plugin_id === card.dataset.marketPlugin && item.plugin_id === card.dataset.marketRuntimeId) : null;
      const upgradeButton = card.querySelector("[data-market-upgrade]");
      upgradeButton.dataset.marketUpgrade = update?.plugin_id || "";
      upgradeButton.hidden = !update;
      upgradeButton.disabled = !current || pending || marketDirty || !update?.can_upgrade;
      const version = card.querySelector("[data-market-version]");
      if (update) {
        version.hidden = false;
        version.textContent = L("已安装") + " v" + update.installed_version + " · " + L("可升级至") + " v" + update.target_version;
        upgradeButton.textContent = update.can_upgrade ? L("升级") : L("暂不可升级");
        upgradeButton.title = update.can_upgrade ? L("保留现有数据与已授予权限") : L("目标版本尚未声明支持此来源版本");
      } else {
        version.hidden = true;
        version.textContent = "";
      }
    });
    market.querySelector("[data-market-empty]").hidden = count > 0;
    market.querySelector("[data-market-catalog]").hidden = count === 0;
    syncProjectMenu();
  };
  const loadMarket = async () => {
    if (marketRequest || pending) return marketRequest;
    const revision = marketRevision, selectedProject = selector.value;
    marketDirty = true; selector.disabled = true;
    status.textContent = L("正在读取项目…"); retry.hidden = true;
    marketRequest = (async () => {
      try {
        const latest=(await molisWorkRequest("/api/settings/project-plugins",{fallback:L("无法读取项目插件")})).projects;
        await refreshUpdates();
        if (revision !== marketRevision) return;
        projects = latest; marketDirty = false;
        selector.replaceChildren(...projects.map(project => new Option(project.display_name, project.project_id)));
        if (projects.some(project => project.project_id === selectedProject)) selector.value = selectedProject;
        else if (projects.some(project => project.project_id === projectId)) selector.value = projectId;
        selector.disabled = !projects.length;
        status.textContent = projects.length ? "" : L("先创建一个项目，再添加插件。");
        filter();
      } catch (error) { if (revision === marketRevision) { molisWorkRequest.show(status,error); retry.hidden = false; } }
    })().finally(() => {
      marketRequest = null; selector.disabled = pending || !projects?.length; filter();
      if (revision !== marketRevision && !pending) void loadMarket();
    });
    filter();
    return marketRequest;
  };
  document.addEventListener("molis-work:plugins-changed", () => {
    marketRevision++; marketDirty = true; filter(); if (!pending) void loadMarket();
  });
  market.addEventListener("input", filter);
  market.addEventListener("change", filter);
  // The dock bell opens this project's notifications, and the list only shows them for the current project.
  document.addEventListener("molis-work:plugin-events-reveal", () => {
    if (pending || !projectId || selector.value === projectId || !projects?.some(project => project.project_id === projectId)) return;
    selector.value = projectId;
    filter();
  });
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
    const open = event.target.closest('[data-market-open]');
    if (open) { openPlugin?.(open.dataset.marketOpen); if (matchMedia('(max-width: 600px)').matches) setMobileView('document'); return; }
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
    const upgrade = event.target.closest("[data-market-upgrade]");
    if (upgrade?.dataset.marketUpgrade && !upgrade.disabled && !pending) {
      const pluginId = upgrade.dataset.marketUpgrade;
      pending = true; selector.disabled = true; filter();
      status.textContent = L("正在升级插件…");
      try {
        const result=await molisWorkRequest(route("/api/plugins/"+encodeURIComponent(pluginId)+"/upgrade"),{body:{},fallback:L("插件升级失败")});
        updates = updates.filter(item => item.plugin_id !== pluginId);
        status.textContent = L("已升级至") + " v" + result.version;
        filter();
      } catch (error) { molisWorkRequest.show(status,error); }
      finally { pending = false; selector.disabled = !projects?.length; filter(); if (marketDirty) void loadMarket(); }
      return;
    }
    const button = event.target.closest("[data-market-add]");
    if (!button || button.disabled || pending) return;
    const targetProject = selector.value;
    const removing = button.dataset.marketMembership === "added";
    pending = true; selector.disabled = true; filter();
    status.textContent = removing ? L("正在移除…") : L("正在添加…");
    try {
      let result;
      if (targetProject === projectId && host.membership) {
        // This project: the page changes in place (the switcher and the Dock follow); no reload.
        const outcome = await host.membership.change(button.dataset.marketAdd, removing ? "remove" : "add", { quiet: true });
        if(!outcome.ok)throw outcome.error;
        result = outcome.result;
      } else {
        result=await molisWorkRequest("/api/settings/projects/"+encodeURIComponent(targetProject)+"/plugins",{method:removing?"DELETE":"POST",body:{plugin_id:button.dataset.marketAdd},fallback:removing?L("无法移除插件"):L("无法添加插件")});
      }
      const project = projects.find(project => project.project_id === targetProject);
      project.plugins = result.plugins;
      project.hidden = result.hidden || [];
      status.textContent = (removing ? L("已移除自") : L("已添加到")) + " " + project.display_name;
      if (targetProject === projectId && !host.membership) { saveUiState(); location.reload(); }
    } catch (error) { molisWorkRequest.show(status,error); }
    finally { pending = false; selector.disabled = !projects?.length; filter(); if (marketDirty) void loadMarket(); }
  });
  const directory = document.querySelector("[data-artifact-directory]");
  const detail = document.querySelector("[data-artifact-detail]");
  const artifactKey = "molis-work-artifact-selection:" + route("/");
  let artifactPath = null, artifactRequest = null;
  try {
    const storedPath = sessionStorage.getItem(artifactKey);
    if (storedPath === route("/artifacts") || storedPath?.startsWith(route("/artifacts/"))) artifactPath = storedPath;
  } catch {}
  const loadArtifacts = async (path = artifactPath || route("/artifacts"), refresh = false) => {
    if (!refresh && !artifactRequest && artifactPath === path && detail.childElementCount && !detail.querySelector("[data-artifact-retry]")) {
      const selected = Boolean(detail.querySelector('[data-artifact-id]'));
      document.querySelector('[data-artifact-stage-shell]')?.setAttribute('data-expanded', String(selected));
      const workspace = document.querySelector('[data-artifact-stage-workspace]');
      if (workspace) workspace.hidden = !selected;
      void loadArtifactWorks();
      showHandoff();
      return;
    }
    artifactRequest?.abort();
    const controller = new AbortController(); artifactRequest = controller;
    const message = document.createElement("p"); message.textContent = L("正在读取成果…"); message.role = "status";
    detail.replaceChildren(message);
    try {
      const html=await molisWorkRequest(path,{as:"text",accept:[404],headers:{"x-molis-work-fragment":"artifact-workbench"},signal:controller.signal,fallback:L("无法读取成果")});
      const template=document.createElement("template");template.innerHTML=html;
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
      void loadArtifactWorks();
      showHandoff();
    } catch (error) {
      if (controller.signal.aborted) return;
      molisWorkRequest.show(message,error);
      const button = document.createElement("button"); button.type = "button"; button.dataset.artifactRetry = path; button.textContent = L("重试");
      detail.replaceChildren(message, button);
    } finally { if (controller === artifactRequest) artifactRequest = null; }
  };
  ${ARTIFACT_GOAL_INPUT_CLIENT_SCRIPT}${ARTIFACT_WORKS_CLIENT_SCRIPT}${ARTIFACT_HANDOFF_CLIENT_SCRIPT}${ARTIFACT_PORT_INPUT_CLIENT_SCRIPT}
  // 「从这一版继续」 (A4b): the chosen plugin starts a new object from this version and it opens here.
  const continueFrom = async (button) => {
    if (button.disabled) return;
    button.disabled = true;
    let status = button.parentElement.querySelector("[data-artifact-continue-status]");
    if (!status) { status = document.createElement("span"); status.dataset.artifactContinueStatus = ""; status.role = "status"; button.parentElement.append(status); }
    status.textContent = "";
    try {
      const payload=await molisWorkRequest(route("/api/artifacts/continue"),{body:{reference:JSON.parse(button.dataset.artifactReference),plugin_id:button.dataset.artifactContinue},fallback:L("没能从这一版继续")});
      if(!payload?.open?.id)throw new Error(L("没能从这一版继续"));
      openTabItem?.(payload.open.surface, payload.open.id, payload.open.title);
    } catch (error) { molisWorkRequest.show(status,error); }
    finally { button.disabled = false; }
  };
  document.addEventListener("click", event => {
    const continueButton = event.target.closest("[data-artifact-continue]");
    if (continueButton) { void continueFrom(continueButton); return; }
    const retryButton = event.target.closest("[data-artifact-retry]");
    if (retryButton) { void loadArtifacts(retryButton.dataset.artifactRetry); return; }
    const collapse = event.target.closest("[data-artifact-collapse]");
    if (collapse) {
      event.preventDefault();
      openPlugin?.("artifacts");
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
    openTabItem?.("artifacts", url.pathname, link.dataset.tabTitle || link.textContent?.trim());
    void loadArtifacts(url.pathname);
    if (matchMedia("(max-width: 600px)").matches) setMobileView(url.pathname === base ? "tree" : "document");
  });
  document.querySelector('[data-work-surface=artifacts]')?.addEventListener('molis-work:select-item', event => {
    const base = route('/artifacts');
    // A version's own path (/artifacts/ID/versions/N, as search, the side panel and toasts give it) opens in this project.
    const raw = event.detail.itemId || base, path = !raw.startsWith(base) && raw.startsWith('/artifacts') ? route(raw) : raw;
    if (path !== base && !path.startsWith(base + '/')) return;
    void loadArtifacts(path);
  });
  void refreshUpdates();
  return { open: surface => { if (surface === "market") void loadMarket(); if (surface === "artifacts" && !artifactRequest) void loadArtifacts(); } };
}`;
