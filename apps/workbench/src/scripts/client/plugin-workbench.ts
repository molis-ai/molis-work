import { PLUGIN_EVENT_RECOVERY_CLIENT } from "./plugin-event-recovery.js";
import { ARTIFACT_GOAL_INPUT_CLIENT_SCRIPT } from "../../artifacts/goal-input-client.js";
import { ARTIFACT_WORKS_CLIENT_SCRIPT } from "../../artifacts/works-client.js";
import { ARTIFACT_HANDOFF_CLIENT_SCRIPT } from "../../artifacts/handoff-client.js";
import { ARTIFACT_PORT_INPUT_CLIENT_SCRIPT } from "../../artifacts/port-input-ui.js";

/** Workbench composes bundled project entries and exact Artifact contributions. The switcher holding the market's update count
 * lights its dot from `data-market-updates`: a style rule that looked inside it restyled the whole switcher on every change. */
export const PLUGIN_WORKBENCH_FACTORY_SCRIPT = `(host) => {
  const { route, translate: readText, projectId, setSurface, saveUiState, setMobileView, openTabItem, openPlugin } = host;
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
  // The market entry is the button at the head of the switcher, in the bar's Dock menu; its count lights the switcher's dot too.
  const marketLink = document.querySelector('[data-global-menu] [data-plugin-id="market"]');
  const updateCount = marketLink?.querySelector("[data-market-update-count]");
  let projects = null, updates = [], marketRequest = null, updatesRequest = null, pending = false, marketDirty = true, marketRevision = 0;
  let conflictIntent = "";
  // What a market card brings or takes, from the Host's own marks on the cards (W5-02 B1): the same data the Projects service applies.
  const listOf = (value) => (value || "").split(" ").filter(Boolean);
  const marketName = (id) => {
    const card = market.querySelector('[data-market-plugin="' + id + '"]');
    const heading = card && card.querySelector("h2");
    return heading ? heading.textContent : id;
  };
  // One sentence with the names filled in; no sentence when the list is empty (so a button has no empty title).
  const relation = (ids, template) => ids.length ? globalThis.t.text(template).replace("{list}", ids.map(marketName).join(globalThis.t.text("common.list.separator"))) : "";
  const paintUpdateCount = () => {
    if (updateCount) {
      updateCount.hidden = updates.length === 0;
      updateCount.textContent = updates.length ? String(updates.length) : "";
      updateCount.closest(".plugin-picker")?.toggleAttribute("data-market-updates", updates.length > 0);
    }
    if (marketLink) marketLink.setAttribute("aria-label", updates.length
      ? globalThis.t.text("workbench.plugin-workbench.plugin-market") + "，" + updates.length + globalThis.t.text("workbench.plugin-workbench.available-updates")
      : globalThis.t.text("workbench.plugin-workbench.plugin-market"));
  };
  const refreshUpdates = () => {
    if (updatesRequest) return updatesRequest;
    updatesRequest = (async () => {
      try {
        if (!projectId) { updates = []; return; }
        updates=(await molisWorkRequest(route("/api/plugins/runtime/updates"),{fallback:globalThis.t.text("workbench.plugin-workbench.could-not-check-plugin-updates")})).updates||[];
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
      button.disabled = !current?.revision || pending || marketDirty;
      button.dataset.marketMembership = added ? "added" : "available";
      const action = added ? globalThis.t.text("workbench.plugin-workbench.remove") : globalThis.t.text("workbench.plugin-workbench.add");
      button.textContent = action;
      const currentProject = selector.value === projectId;
      const openButton = card.querySelector('[data-market-open]');
      openButton.hidden = !added || !currentProject;
      openButton.disabled = pending;
      button.classList.toggle('mw-btn--ghost', added);
      button.classList.toggle('mw-btn--secondary', !added);
      button.setAttribute('aria-label', action + ' ' + card.querySelector('h2').textContent);
      // What the operation brings or takes: said on the button before it is pressed, and only when there is something to say.
      const needs = listOf(card.dataset.marketNeeds), neededBy = listOf(card.dataset.marketNeededBy);
      const title = added
        ? relation(neededBy.filter(id => addedIds.includes(id)), "workbench.plugin-workbench.removing-also-removes-list")
        : [relation(needs.filter(id => !addedIds.includes(id)), "workbench.plugin-workbench.also-adds-list"),
          relation(neededBy.filter(id => !addedIds.includes(id)), "workbench.plugin-workbench.plugins-that-depend-not-added-list")].filter(Boolean).join("；");
      if (title) button.title = title; else button.removeAttribute("title");
      const update = added && currentProject ? updates.find(item => item.project_plugin_id === card.dataset.marketPlugin && item.plugin_id === card.dataset.marketRuntimeId) : null;
      const upgradeButton = card.querySelector("[data-market-upgrade]");
      upgradeButton.dataset.marketUpgrade = update?.plugin_id || "";
      upgradeButton.hidden = !update;
      upgradeButton.disabled = !current || pending || marketDirty || !update?.can_upgrade;
      const version = card.querySelector("[data-market-version]");
      if (update) {
        version.hidden = false;
        version.textContent = globalThis.t.text("workbench.plugin-workbench.installed") + " v" + update.installed_version + " · " + globalThis.t.text("workbench.plugin-workbench.upgrade-available") + " v" + update.target_version;
        upgradeButton.textContent = update.can_upgrade ? globalThis.t.text("workbench.plugin-workbench.upgrade") : globalThis.t.text("workbench.plugin-workbench.cannot-upgrade-yet");
        upgradeButton.title = update.can_upgrade ? globalThis.t.text("workbench.plugin-workbench.existing-data-granted-permissions-will-be-preserved") : globalThis.t.text("workbench.plugin-workbench.target-release-does-not-yet-declare-support-installed");
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
    status.textContent = globalThis.t.text("workbench.plugin-workbench.loading-projects"); retry.hidden = true;
    marketRequest = (async () => {
      try {
        const latest=(await molisWorkRequest("/api/settings/project-plugins",{fallback:globalThis.t.text("workbench.plugin-workbench.could-not-load-project-plugins")})).projects;
        await refreshUpdates();
        if (revision !== marketRevision) return;
        projects = latest; marketDirty = false;
        selector.replaceChildren(...projects.map(project => new Option(project.display_name, project.project_id)));
        if (projects.some(project => project.project_id === selectedProject)) selector.value = selectedProject;
        else if (projects.some(project => project.project_id === projectId)) selector.value = projectId;
        selector.disabled = !projects.length;
        status.textContent = conflictIntent ? readText("workbench.plugin-workbench.review-the-current-plugins-before-trying-again-intent", { intent: conflictIntent })
          : projects.length ? "" : readText("workbench.plugin-workbench.create-project-before-adding-plugins");
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
      status.textContent = globalThis.t.text("workbench.plugin-workbench.upgrading-plugin");
      try {
        const result=await molisWorkRequest(route("/api/plugins/"+encodeURIComponent(pluginId)+"/upgrade"),{body:{},fallback:globalThis.t.text("workbench.plugin-workbench.plugin-upgrade-failed")});
        updates = updates.filter(item => item.plugin_id !== pluginId);
        status.textContent = globalThis.t.text("workbench.plugin-workbench.upgraded") + " v" + result.version;
        filter();
      } catch (error) { molisWorkRequest.show(status,error); }
      finally { pending = false; selector.disabled = !projects?.length; filter(); if (marketDirty) void loadMarket(); }
      return;
    }
    const button = event.target.closest("[data-market-add]");
    if (!button || button.disabled || pending) return;
    const project = projects.find(row => row.project_id === selector.value);
    const targetProject = project.project_id, expectedRevision = project.revision, pluginId = button.dataset.marketAdd;
    const removing = button.dataset.marketMembership === "added";
    const beforeIds = project.plugins;
    const clickedCard = button.closest("[data-market-plugin]");
    const clickedNeededBy = clickedCard ? listOf(clickedCard.dataset.marketNeededBy) : [];
    conflictIntent = ""; retry.hidden = true;
    pending = true; selector.disabled = true; filter();
    status.textContent = removing ? globalThis.t.text("workbench.plugin-workbench.removing") : globalThis.t.text("workbench.plugin-workbench.adding");
    try {
      const { result, error, readbackRequired } = targetProject === projectId
        ? await host.membership.change(pluginId, removing ? "remove" : "add", { quiet: true, expectedRevision })
        : await host.membership.save(targetProject, pluginId, !removing, expectedRevision);
      if (result) Object.assign(project, { plugins: result.plugins, hidden: result.hidden, revision: result.revision });
      if (error) {
        if (readbackRequired) { project.revision = undefined; marketDirty = true; retry.hidden = false; }
        if (error.code === "actions.conflict") conflictIntent = (removing ? readText("workbench.plugin-workbench.remove") : readText("workbench.plugin-workbench.add")) + " " + marketName(pluginId) + " · " + project.display_name;
        molisWorkRequest.show(status, error);
        if (conflictIntent) status.prepend(conflictIntent + " · ");
        if (readbackRequired || result) status.parentElement.scrollIntoView({ block: "nearest" });
        return;
      }
      // What went or came with it, from the plugin list before and after (not from the directory: the service decides); a plugin
      // that depends on it is not added with it, and the line says so when it happened.
      const also = (removing ? beforeIds.filter(id => !result.plugins.includes(id)) : result.plugins.filter(id => !beforeIds.includes(id)))
        .filter(id => id !== pluginId);
      const came = targetProject === projectId ? "" : relation(also, removing ? "workbench.plugin-workbench.also-removed-list" : "workbench.plugin-workbench.also-added-list");
      const missing = removing ? "" : relation(clickedNeededBy.filter(id => !result.plugins.includes(id)), "workbench.plugin-workbench.plugins-that-depend-not-added-list");
      const note = [came, missing].filter(Boolean).map(part => readText("workbench.plugin-workbench.relation-note", { note: part })).join("");
      status.textContent = (removing ? globalThis.t.text("workbench.plugin-workbench.removed") : globalThis.t.text("workbench.plugin-workbench.added")) + " " + project.display_name + note;
    } catch (error) { molisWorkRequest.show(status,error); }
    finally { pending = false; selector.disabled = !projects?.length; filter(); if (marketDirty && retry.hidden) void loadMarket(); }
  });
  const shell = document.querySelector("[data-artifact-stage-shell]");
  const directory = shell?.querySelector("[data-artifact-directory]");
  const detail = shell?.querySelector("[data-artifact-detail]");
  const workspace = detail?.parentElement, selection = detail?.dataset;
  const artifactBase = route("/artifacts"), artifactKey = "molis-work-artifact-selection:" + route("/");
  const inArtifactStage = path => path === artifactBase || path?.startsWith(artifactBase + "/");
  let artifactPath = null, artifactRequest = null;
  try {
    const storedPath = sessionStorage.getItem(artifactKey);
    if (inArtifactStage(storedPath)) artifactPath = storedPath;
  } catch {}
  const showArtifacts = () => {
    const selected = Boolean(detail.querySelector("[data-artifact-id]"));
    shell?.setAttribute("data-expanded", String(selected));
    if (workspace) workspace.hidden = !selected;
    void loadArtifactWorks();
    showHandoff();
  };
  const loadArtifacts = async (path = artifactPath || artifactBase, refresh = false) => {
    if (!refresh && !artifactRequest && selection.artifactFragmentPath === path) {
      showArtifacts();
      return;
    }
    artifactRequest?.abort();
    const controller = artifactRequest = new AbortController();
    delete selection.artifactFragmentPath;
    const message = document.createElement("p"); message.textContent = readText("workbench.plugin-workbench.loading-artifacts"); message.role = "status";
    detail.replaceChildren(message);
    try {
      const options = {as:"text",accept:[404],headers:{"x-molis-work-fragment":"artifact-workbench"},signal:controller.signal};
      const template = document.createElement("template");
      for (let attempt = 0; attempt < 2; attempt++) {
        const fallback = readText("workbench.plugin-workbench.could-not-load-artifacts");
        template.innerHTML = await molisWorkRequest(path, { ...options, fallback });
        if (controller !== artifactRequest) return;
        const nextDirectory = template.content.querySelector("[data-artifact-directory]");
        const nextDetail = template.content.querySelector("[data-artifact-detail]");
        const language = nextDetail?.dataset.artifactFragmentLanguage;
        if (!nextDirectory || !language) throw new Error(fallback);
        const current = document.documentElement.dataset.uiLanguageTag;
        if ((current || attempt) && language !== current) {
          if (attempt) throw new Error(readText("workbench.language.window-failed"));
          continue;
        }
        directory.replaceChildren(...nextDirectory.childNodes);
        detail.replaceChildren(...nextDetail.childNodes);
        selection.artifactFragmentPath = path;
        selection.artifactFragmentLanguage = language;
        break;
      }
      artifactPath = path;
      try { sessionStorage.setItem(artifactKey, path); } catch {}
      showArtifacts();
    } catch (error) {
      if (controller.signal.aborted) return;
      delete selection.artifactFragmentPath;
      molisWorkRequest.show(message,error);
      const button = document.createElement("button"); button.type = "button"; button.dataset.artifactRetry = path; button.textContent = readText("common.control.retry");
      detail.replaceChildren(message, button);
    } finally { if (controller === artifactRequest) artifactRequest = null; }
  };
  ${ARTIFACT_GOAL_INPUT_CLIENT_SCRIPT + ARTIFACT_WORKS_CLIENT_SCRIPT + ARTIFACT_HANDOFF_CLIENT_SCRIPT + ARTIFACT_PORT_INPUT_CLIENT_SCRIPT}
  // 「从这一版继续」 (A4b): the chosen plugin starts a new object from this version and it opens here.
  const continueFrom = async (button) => {
    if (button.disabled) return;
    button.disabled = true;
    let status = button.parentElement.querySelector("[data-artifact-continue-status]");
    if (!status) { status = document.createElement("span"); status.dataset.artifactContinueStatus = ""; status.role = "status"; button.parentElement.append(status); }
    status.textContent = "";
    try {
      const payload=await molisWorkRequest(route("/api/artifacts/continue"),{body:{reference:JSON.parse(button.dataset.artifactReference),plugin_id:button.dataset.artifactContinue},fallback:globalThis.t.text("workbench.plugin-workbench.could-not-continue-version")});
      if(!payload?.open?.id)throw new Error(globalThis.t.text("workbench.plugin-workbench.could-not-continue-version"));
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
      void loadArtifacts(artifactBase);
      return;
    }
    const link = event.target.closest("a[href]");
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.download || link.target) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !inArtifactStage(url.pathname)) return;
    event.preventDefault();
    if (link.closest("[data-frame-block]")) return;
    if (event.detail > 1) return;
    setSurface("artifacts");
    openTabItem?.("artifacts", url.pathname, link.dataset.tabTitle || link.textContent?.trim());
    void loadArtifacts(url.pathname);
    if (matchMedia("(max-width: 600px)").matches) setMobileView(url.pathname === artifactBase ? "tree" : "document");
  });
  shell?.addEventListener('molis-work:select-item', event => {
    if (event.detail?.invalidate && event.detail.itemId === undefined) return;
    // A version's own path (/artifacts/ID/versions/N, as search, the side panel and toasts give it) opens in this project.
    const raw = event.detail.itemId || artifactBase, path = !inArtifactStage(raw) && raw.startsWith('/artifacts') ? route(raw) : raw;
    if (!inArtifactStage(path)) return;
    void loadArtifacts(path);
  });
  void refreshUpdates();
  return { open: surface => { if (surface === "market") void loadMarket(); if (surface === "artifacts" && !artifactRequest) void loadArtifacts(); } };
}`;
