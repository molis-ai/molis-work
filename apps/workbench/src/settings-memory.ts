import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * The memory settings page (specs/archive/memory-system §10): 个人 → 记忆 in the global settings, and 项目记忆 in a project's
 * settings. Both are the same page in a different scope; everything it shows and changes goes through `/api/memory/*`,
 * which invokes the shared directory's `memory.*` actions as the person.
 */
export function renderMemorySettings({ readText, scope, projectId }: { readText(text: string): string; scope: "personal" | "project"; projectId: string | null }): string {
  const personal = scope === "personal";
  const title = personal ? uiText.text("workbench.settings-memory.memory") : uiText.text("workbench.settings-memory.project-memory");
  const lead = personal
    ? uiText.text("workbench.settings-memory.preferences-habits-used-assistant-agent-work-plugins-interface")
    : uiText.text("workbench.settings-memory.project-s-conventions-background-lessons-used-only-project");
  return `<section class="settings-document memory-settings" aria-labelledby="memory-title" data-memory-settings data-memory-scope="${scope}" data-project="${projectId ?? ""}">
    <header class="settings-page-heading memory-heading"><h1 id="memory-title">${title}</h1><p>${lead}</p>
      <p class="memory-summary" data-memory-summary aria-live="polite">${uiText("workbench.settings-memory.loading")}</p></header>
    <p class="settings-form-error" data-memory-error role="alert" hidden></p>
    <section class="settings-section" data-memory-retries hidden aria-labelledby="memory-retries-title">
      <h2 id="memory-retries-title">${uiText("workbench.settings-memory.operations-waiting-retry")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-memory.retry-uses-original-content-version-filtering-reloading-list")}</p>
      <ul class="memory-list" data-memory-retry-list></ul>
    </section>
    <section class="settings-section memory-changes" aria-labelledby="memory-changes-title" data-memory-changes-section hidden>
      <h2 id="memory-changes-title">${uiText("workbench.settings-memory.recent-changes")}</h2>
      <ul class="memory-change-list" data-memory-changes></ul>
    </section>
    <section class="settings-section memory-pairs" aria-labelledby="memory-pairs-title" data-memory-pairs-section hidden>
      <h2 id="memory-pairs-title">${uiText("workbench.settings-memory.possible-duplicates-conflicts")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-memory.pairs-found-while-tidying-keep-one-other-switched")}</p>
      <ul class="memory-list" data-memory-pairs></ul>
    </section>
    <section class="settings-section memory-candidates" aria-labelledby="memory-candidates-title" data-memory-candidates-section hidden>
      <h2 id="memory-candidates-title">${uiText("workbench.settings-memory.waiting")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-memory.suggested-work-how-use-interface-held-back-write")}</p>
      <ul class="memory-list" data-memory-candidates></ul>
    </section>
    <section class="settings-section memory-items" aria-labelledby="memory-items-title">
      <div class="memory-items-head"><h2 id="memory-items-title">${personal ? uiText("workbench.settings-memory.my-memories") : uiText("workbench.settings-memory.project-s-memories")}</h2>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-add>${uiText("workbench.settings-memory.add")}</button></div>
      <div class="memory-toolbar" role="group" aria-label="${uiText("workbench.settings-memory.filter-memories")}">
        <select class="mw-select" data-memory-filter="kind" aria-label="${uiText("workbench.settings-memory.kind")}"><option value="">${uiText("workbench.settings-memory.all-kinds")}</option><option value="preference">${uiText("workbench.settings-memory.preference")}</option><option value="convention">${uiText("workbench.settings-memory.convention")}</option><option value="fact">${uiText("workbench.settings-memory.background-fact")}</option><option value="experience">${uiText("workbench.settings-memory.lesson")}</option></select>
        <select class="mw-select" data-memory-filter="source" aria-label="${uiText("workbench.settings-memory.source")}"><option value="">${uiText("workbench.settings-memory.all-sources")}</option><option value="said">${uiText("workbench.settings-memory.said")}</option><option value="accepted">${uiText("workbench.settings-memory.accepted")}</option><option value="auto">${uiText("workbench.settings-memory.kept-automatically")}</option><option value="manual">${uiText("workbench.settings-memory.added")}</option><option value="imported">${uiText("workbench.settings-memory.imported")}</option><option value="plugin">${uiText("workbench.settings-memory.kept-plugin")}</option></select>
        <select class="mw-select" data-memory-filter="state" aria-label="${uiText("workbench.settings-memory.state")}"><option value="">${uiText("workbench.settings-memory.all-states")}</option><option value="active">${uiText("workbench.settings-memory.active")}</option><option value="disabled">${uiText("workbench.settings-memory.switch-off")}</option><option value="paused">${uiText("workbench.settings-memory.paused")}</option></select>
        <input class="mw-input memory-search" type="search" data-memory-filter="query" placeholder="${uiText("workbench.settings-memory.search-memories")}" aria-label="${uiText("workbench.settings-memory.search-memories")}">
      </div>
      <div class="memory-editor-slot" data-memory-new hidden></div>
      <ul class="memory-list" data-memory-list><li class="settings-muted">${uiText("workbench.settings-memory.loading")}</li></ul>
    </section>
    <section class="settings-section memory-prefs" aria-labelledby="memory-form-title">
      <h2 id="memory-form-title">${uiText("workbench.settings-memory.how-memories-form")}</h2>
      ${prefRow(readText, "form", uiText.text("workbench.settings-memory.allow-remembering"), personal ? uiText.text("workbench.settings-memory.main-switch-off-no-new-memories-no-suggestions") : uiText.text("workbench.settings-memory.off-no-new-memories-suggestions-project"))}
      <div class="settings-setting-row memory-pref-static"><span class="setting-copy"><strong>${uiText("workbench.settings-memory.remember-when-ask")}</strong><span>${uiText("workbench.settings-memory.when-say-now-remember-kept-once-told-where")}</span></span><span class="setting-value settings-muted">${uiText("workbench.settings-memory.always")}</span></div>
      ${prefRow(readText, "auto", uiText.text("workbench.settings-memory.keep-low-risk-preferences-lessons-automatically"), uiText.text("workbench.settings-memory.kept-automatically-when-ask-same-thing-two-different"))}
      ${prefRow(readText, "learn_from_work", uiText.text("workbench.settings-memory.suggest-work"), uiText.text("workbench.settings-memory.when-work-ends-suggest-what-worth-keeping-accept"))}
      ${prefRow(readText, "learn_from_ui", uiText.text("workbench.settings-memory.learn-interface"), uiText.text("workbench.settings-memory.only-counts-how-often-accept-ignore-rewrite-undo"))}
    </section>
    <section class="settings-section memory-prefs" aria-labelledby="memory-use-title">
      <h2 id="memory-use-title">${uiText("workbench.settings-memory.who-can-use-them")}</h2>
      ${prefRow(readText, "consumers.assistant", uiText.text("workbench.settings-memory.assistant"), uiText.text("workbench.settings-memory.work-give-assistant-bottom-bar"))}
      ${prefRow(readText, "consumers.agent", uiText.text("workbench.settings-memory.agent-work"), uiText.text("workbench.settings-memory.coding-plugin-agents-workflows"))}
      ${prefRow(readText, "consumers.ui", uiText.text("workbench.settings-memory.interface-suggestions"), uiText.text("workbench.settings-memory.suggestions-based-what-looking"))}
      ${prefRow(readText, "consumers.plugin", uiText.text("workbench.settings-memory.plugins"), uiText.text("workbench.settings-memory.plugins-read-only-preferences-conventions-never-background-facts"))}
      ${prefRow(readText, "consumers.mcp", uiText.text("workbench.settings-memory.external-ai-clients"), personal ? uiText.text("workbench.settings-memory.clients-connected-over-mcp-personal-memories-closed-them") : uiText.text("workbench.settings-memory.clients-connected-over-mcp-read-only"))}
    </section>
    <section class="settings-section memory-data" aria-labelledby="memory-data-title">
      <h2 id="memory-data-title">${uiText("workbench.settings-memory.tidying-data")}</h2>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${uiText("workbench.settings-memory.tidying")}</strong><span data-memory-upkeep>${uiText("workbench.settings-memory.once-day-expired-long-unused-ones-switched-off")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-upkeep-run>${uiText("workbench.settings-memory.tidy-now")}</button></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${uiText("workbench.settings-memory.export")}</strong><span>${uiText("workbench.settings-memory.download-memory-package-keys-local-paths-taken-out")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-export>${uiText("workbench.settings-memory.export")}</button></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${uiText("workbench.settings-memory.imported")}</strong><span>${uiText("workbench.settings-memory.choose-memory-package-what-already-kept-skipped-damaged")}</span></span>
        <span class="setting-value"><label class="mw-btn mw-btn--secondary mw-btn--sm memory-import">${uiText("workbench.settings-memory.imported")}<input type="file" accept="application/json,.json" data-memory-import hidden></label></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${personal ? uiText("workbench.settings-memory.clear-personal-memories") : uiText("workbench.settings-memory.clear-project-s-memories")}</strong><span>${uiText("workbench.settings-memory.see-how-many-first-once-confirmed-they-deleted")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--danger-outline mw-btn--sm" type="button" data-memory-clear>${uiText("workbench.settings-memory.clear")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-clear-reset hidden>${uiText("workbench.settings-memory.preview-again")}</button></span></div>
      <p class="settings-muted" data-memory-clear-status aria-live="polite" hidden></p>
    </section>
    ${personal ? `<p class="settings-muted memory-rules-note">${uiText("workbench.settings-memory.interaction-rules-such-dont-interrupt-while-i-write")} <a href="/settings/assistant">${uiText("workbench.settings-memory.assistant-settings")}</a></p>` : ""}
  </section>`;
}

function prefRow(_L: (text: string) => string, key: string, title: string, description: string): string {
  return `<label class="settings-setting-row memory-pref"><span class="setting-copy"><strong>${title}</strong><span>${description}</span></span>
    <span class="setting-value"><span class="mw-switch"><input type="checkbox" role="switch" data-memory-pref="${key}" aria-label="${title}" disabled><span class="mw-switch__track" aria-hidden="true"></span></span></span></label>`;
}

/**
 * Binds one memory page (a standalone settings page, or the same page fetched into the settings cover): safe to call
 * again for a new root. Everything is drawn with textContent; nothing the memories say is ever parsed as markup.
 */
export const MEMORY_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
  const bind = (root) => {
    if (!root || root.dataset.memoryBound === "1") return;
    root.dataset.memoryBound = "1";
    const readText = globalThis.t.text;
    const scope = root.dataset.memoryScope === "project" ? "project" : "personal";
    const project = root.dataset.project || "";
    const base = (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/memory";
    const $ = (selector) => root.querySelector(selector);
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
    const button = (text, variant, label) => { const node = el("button", "mw-btn " + (variant || "mw-btn--ghost") + " mw-btn--sm", text); node.type = "button"; if (label) node.setAttribute("aria-label", label); return node; };
    // Whichever way a dialog closes, focus goes back to the element the person used: focus they have genuinely moved
    // somewhere visible stands, but a stale hidden remnant (the menu item a closed fold hides, the old dialog's own
    // focus) does not block the way back. A trigger that has since been hidden or redrawn away hands focus to a
    // visible fallback — the page's add button, or one the caller names.
    // Shown is more than a box: the focus a closing dialog hands back can still carry geometry from menu content its
    // fold has already closed, so every closed details ancestor decides — only a detail's own first summary line shows.
    const shown = (element) => {
      if (!element || !element.isConnected || !element.getClientRects().length || element.closest("[hidden]")) return null;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName !== "DETAILS" || ancestor.open) continue;
        const summary = Array.prototype.find.call(ancestor.children, (child) => child.tagName === "SUMMARY");
        if (!summary || !summary.contains(element)) return null;
      }
      return element;
    };
    const focusBack = (trigger, fallback) => {
      if (document.querySelector("dialog[open]")) return;
      const current = document.activeElement;
      // Unset focus — none, the body, the root — is not a choice the person made: the way back stays open.
      const chosen = current instanceof Element && current !== document.body && current !== document.documentElement
        && current !== trigger && shown(current);
      if (chosen) return;
      (shown(trigger) || shown(fallback) || $("[data-memory-add]"))?.focus({ preventScroll: true });
    };
    // A step that cannot be undone asks first, in the catalog's alert dialog (never the browser's own prompt).
    const ask = (title, description, yesLabel, trigger) => new Promise((resolve) => {
      const dialog = el("dialog", "mw-dialog mw-dialog--alert memory-confirm"); dialog.dataset.slot = "alert-dialog";
      const titleId = "memory-confirm-" + Date.now().toString(36); dialog.setAttribute("aria-labelledby", titleId);
      const form = el("form", "mw-form mw-dialog__shell"); form.method = "dialog";
      const header = el("header", "mw-form__header"), heading = el("div"), h2 = el("h2", "", title); h2.id = titleId;
      heading.append(h2, el("p", "", description)); header.append(heading);
      const footer = el("footer", "mw-form__footer"), cancel = el("button", "mw-btn mw-btn--secondary mw-btn--md", globalThis.t.text("common.control.cancel")), yes = el("button", "mw-btn mw-btn--danger mw-btn--md", yesLabel);
      cancel.type = "button"; yes.type = "button"; yes.dataset.memoryConfirmYes = "";
      footer.append(cancel, yes); form.append(header, footer); dialog.append(form);
      let answer = false;
      cancel.addEventListener("click", () => dialog.close());
      yes.addEventListener("click", () => { answer = true; dialog.close(); });
      dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener("close", () => { dialog.remove(); focusBack(trigger); resolve(answer); });
      root.append(dialog); dialog.showModal(); cancel.focus();
    });
    const KIND = { preference: "workbench.settings-memory.preference", convention: "workbench.settings-memory.convention", fact: "workbench.settings-memory.background-fact", experience: "workbench.settings-memory.lesson" };
    const SOURCE = { said: "workbench.settings-memory.said", accepted: "workbench.settings-memory.accepted", auto: "workbench.settings-memory.kept-automatically", manual: "workbench.settings-memory.added", imported: "workbench.settings-memory.imported", plugin: "workbench.settings-memory.kept-plugin" };
    const STATE = { active: "workbench.settings-memory.active", disabled: "workbench.settings-memory.switch-off", paused: "workbench.settings-memory.paused" };
    const CHANGE = { kept: "workbench.settings-memory.keep", auto_kept: "workbench.settings-memory.kept-automatically", replaced: "workbench.settings-memory.replaced", auto_replaced: "workbench.settings-memory.replaced-automatically", merged: "workbench.settings-memory.merged", edited: "workbench.settings-memory.edit", restored: "workbench.settings-memory.went-back-earlier-version", moved: "workbench.settings-memory.moved",
      disabled: "workbench.settings-memory.switch-off", auto_disabled: "workbench.settings-memory.switched-off-automatically", enabled: "workbench.settings-memory.switch", paused: "workbench.settings-memory.paused", resumed: "workbench.settings-memory.resumed", removed: "common.control.delete", accepted: "workbench.settings-memory.accepted-2", imported: "workbench.settings-memory.imported", cleared: "workbench.settings-memory.cleared" };
    const day = (iso) => { const date = new Date(iso); return !iso || isNaN(date) ? "" : (date.getMonth() + 1) + "/" + date.getDate(); };
    const appliesText = (applies, itemScope) => {
      const parts = [];
      if (applies && applies.plugin_ids && applies.plugin_ids.length) parts.push(globalThis.t.text("workbench.settings-memory.plugins") + " " + applies.plugin_ids.join("、"));
      if (applies && applies.object_kinds && applies.object_kinds.length) parts.push(globalThis.t.text("workbench.settings-memory.object") + " " + applies.object_kinds.join("、"));
      // Goals by name when their plugin can still read them; one it cannot is said so rather than shown as an id.
      if (applies && applies.goal_ids && applies.goal_ids.length) parts.push("Goal " + applies.goal_ids.map((id) => {
        const title = data && data.labels && data.labels.goals ? data.labels.goals[id] : null; return title ? "「" + title + "」" : globalThis.t.text("workbench.settings-memory.goal-that-can-no-longer-be-read"); }).join("、"));
      if (applies && applies.task) parts.push(applies.task);
      if (applies && applies.until) parts.push(globalThis.t.text("workbench.settings-memory.until") + " " + applies.until.slice(0, 10));
      return parts.length ? parts.join(" · ") : globalThis.t.text(itemScope === "character" ? "workbench.settings-memory.work-character-does-project" : scope === "project" ? "workbench.settings-memory.all-work-project" : "workbench.settings-memory.all-work");
    };
    let data = null, busy = false;
    const filters = { kind: "", source: "", state: "", query: "" };
    const error = $("[data-memory-error]");
    const board = () => document.querySelector("[data-settings-toast], [data-toast]");
    const toast = (text) => {
      const box = board();
      if (!box) return;
      box.textContent = text; box.classList.remove("is-error"); box.classList.add("is-visible");
      setTimeout(() => box.classList.remove("is-visible"), 2600);
    };
    // The reason shows at the top of the page and, since the action may be far below it, in the toast where the person is.
    const fail = (failure) => { molisWorkRequest.show(error, failure); error.hidden = false; if (board()) molisWorkRequest.toast(board(), failure, undefined, { ms: 5000 }); };
    const api = (path, payload) => molisWorkRequest(base + path, { body: payload });
    const pendingCommands = new Map();
    const commandTitle = (path, payload) => {
      const actions = { update: "workbench.settings-memory.edit", disable: "workbench.settings-memory.switch-off", enable: "workbench.settings-memory.switch", remove: "common.control.delete", move: "workbench.settings-memory.moved", restore: "workbench.settings-memory.went-back-earlier-version", items: "workbench.settings-memory.add", import: "workbench.settings-memory.imported", undo: "workbench.settings-memory.undo", accept: "workbench.settings-memory.accepted-2", discard: "workbench.settings-memory.no" };
      const title = globalThis.t.text(actions[payload.action || path.split("/").at(-1)]);
      const subject = payload.text || data?.items?.find(item => item.memory_id === payload.memory_id)?.text
        || data?.candidates?.find(item => path.startsWith("/candidates/" + encodeURIComponent(item.candidate_id) + "/"))?.text;
      return title + (subject ? "：「" + subject + "」" : "");
    };
    const dispatch = async (command) => {
      try {
        const result = await api(command.path, JSON.parse(command.body));
        if (command.path === "/import") toast(globalThis.t.text("workbench.settings-memory.imported-count", { count: result.written }) + (result.skipped ? " · " + globalThis.t.text("workbench.settings-memory.skipped") + " " + result.skipped : "") + (result.refused ? " · " + globalThis.t.text("workbench.settings-memory.not-imported") + " " + result.refused : ""));
        pendingCommands.delete(command.id); paintRetries(); return result;
      } catch (failure) { pendingCommands.set(command.id, command); paintRetries(); throw failure; }
    };
    function paintRetries() {
      $("[data-memory-retries]").hidden = !pendingCommands.size;
      const list = $("[data-memory-retry-list]"); list.replaceChildren();
      for (const command of pendingCommands.values()) {
        const row = el("li", "memory-row"), copy = el("strong", "memory-row-copy", command.title);
        const retry = button(globalThis.t.text("workbench.settings-memory.retry-operation"), "mw-btn--secondary", globalThis.t.text("workbench.settings-memory.retry-operation") + "：" + command.title);
        retry.dataset.memoryRetry = "";
        retry.addEventListener("click", () => run(() => dispatch(command), command.path === "/import" ? undefined : "workbench.settings-memory.operation-completed"));
        row.append(copy, retry); list.append(row);
      }
    }
    // The HTTP one-time key is fresh per delivery; the body's operation identity belongs to this exact decision.
    const mutation = () => {
      let previous;
      return (path, payload) => {
        const input = JSON.stringify([path, payload]);
        if (!previous || previous.input !== input || !pendingCommands.has(previous.id)) {
          const id = crypto.randomUUID();
          previous = Object.freeze({ id, input, path, body: JSON.stringify(Object.assign({}, payload, { operation_id: id })), title: commandTitle(path, payload) });
        }
        return dispatch(previous);
      };
    };
    const run = async (work, message) => {
      if (busy) return;
      busy = true; error.hidden = true;
      try { await work(); await load(); if (message) toast(globalThis.t.text(message)); }
      catch (failure) { fail(failure); }
      finally { busy = false; }
    };
    const load = async () => { data = await api("/overview?scope=" + scope); paint(); };

    function paintSummary() {
      const counts = data.counts || {};
      const total = scope === "project" ? counts.project : counts.personal;
      const parts = [globalThis.t.text(scope === "project" ? "workbench.settings-memory.project-count" : "workbench.settings-memory.personal-count", { count: total || 0 })];
      if (counts.auto_this_week) parts.push(globalThis.t.text("workbench.settings-memory.automatic-count", { count: counts.auto_this_week }));
      if (counts.pending) parts.push(counts.pending + " " + globalThis.t.text("workbench.settings-memory.waiting-2"));
      $("[data-memory-summary]").textContent = parts.join(" · ");
    }

    function paintChanges() {
      // What happened without the person's own hand here: automatic changes, and what works kept or forgot for them.
      const list = $("[data-memory-changes]"), changes = (data.changes || []).filter((change) => change.by !== "person" || change.work).slice(0, 6);
      $("[data-memory-changes-section]").hidden = !changes.length;
      list.replaceChildren();
      changes.forEach((change) => {
        const row = el("li", "memory-change" + (change.state === "undone" ? " is-undone" : ""));
        const copy = el("div", "memory-change-copy");
        const head = change.state === "undone" ? globalThis.t.text("workbench.settings-memory.undone-deleted-memory")
          : globalThis.t.text(CHANGE[change.kind] || change.kind) + (change.text ? "「" + change.text + "」" : change.memory_id && change.kind !== "removed" ? " · " + globalThis.t.text("workbench.settings-memory.since-deleted-its-text-not-kept") : "");
        copy.append(el("strong", "", head));
        const meta = [day(change.at), change.rule, change.reason, change.work ? globalThis.t.text("workbench.settings-memory.work") + "「" + change.work.title + "」" : ""].filter(Boolean).join(" · ");
        if (meta) copy.append(el("span", "settings-muted", meta));
        row.append(copy);
        if (change.undoable && change.state === "active") {
          const undo = button(globalThis.t.text("workbench.settings-memory.undo"), "mw-btn--secondary", globalThis.t.text("workbench.settings-memory.undo") + "：" + (change.text || "")), revert = mutation();
          undo.addEventListener("click", () => run(() => revert("/changes/" + encodeURIComponent(change.change_id) + "/undo", {}), "workbench.settings-memory.undone"));
          row.append(undo);
        }
        list.append(row);
      });
    }

    function paintCandidates() {
      const list = $("[data-memory-candidates]"), candidates = data.candidates || [];
      $("[data-memory-candidates-section]").hidden = !candidates.length;
      list.replaceChildren();
      candidates.forEach((candidate) => {
        const row = el("li", "memory-row memory-row--candidate"), submit = mutation();
        const decide = (action, values = {}) => submit("/candidates/" + encodeURIComponent(candidate.candidate_id) + "/" + action, { ...values, expected_version: candidate.version });
        const copy = el("div", "memory-row-copy");
        copy.append(el("strong", "memory-text", candidate.text));
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", globalThis.t.text(KIND[candidate.kind] || candidate.kind)));
        // Held by the gate, the reason it waits is its whole basis: said once, below, not twice.
        if (candidate.why && candidate.why !== candidate.hold_reason) meta.append(el("span", "", globalThis.t.text("workbench.settings-memory.because") + "：" + candidate.why));
        if (candidate.work) meta.append(el("span", "", globalThis.t.text("workbench.settings-memory.work") + "「" + candidate.work.title + "」"));
        copy.append(meta);
        if (candidate.hold_reason) copy.append(el("span", "memory-hold", candidate.hold_reason));
        const actions = el("div", "memory-actions");
        const keep = button(globalThis.t.text("workbench.settings-memory.keep"), "mw-btn--primary", globalThis.t.text("workbench.settings-memory.keep") + "：" + candidate.text);
        keep.addEventListener("click", () => run(() => decide("accept"), "workbench.settings-memory.kept"));
        const reword = button(globalThis.t.text("workbench.settings-memory.edit-then-keep"), "mw-btn--ghost");
        reword.addEventListener("click", () => {
          const editor = textEditor(candidate.text, async (text) => { await decide("accept", { text }); }, "workbench.settings-memory.kept");
          row.replaceChildren(editor); editor.querySelector("textarea").focus();
        });
        const drop = button(globalThis.t.text("workbench.settings-memory.no"), "mw-btn--ghost", globalThis.t.text("workbench.settings-memory.no") + "：" + candidate.text);
        drop.addEventListener("click", () => run(() => decide("discard"), "workbench.settings-memory.will-not-be-suggested-again"));
        actions.append(keep, reword, drop);
        row.append(copy, actions);
        list.append(row);
      });
    }

    function textEditor(text, save, done) {
      const form = el("form", "memory-editor");
      const area = el("textarea", "mw-input memory-editor-text"); area.value = text; area.maxLength = 400; area.rows = 2; area.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.memory-2"));
      const row = el("div", "memory-editor-actions");
      const ok = button(globalThis.t.text("common.control.save"), "mw-btn--primary"); ok.type = "submit";
      const cancel = button(globalThis.t.text("common.control.cancel"), "mw-btn--ghost");
      cancel.addEventListener("click", () => paint());
      row.append(ok, cancel);
      form.append(area, row);
      form.addEventListener("submit", (event) => { event.preventDefault(); const value = area.value.trim(); if (value) run(() => save(value), done); });
      return form;
    }

    function itemEditor(item, onSave) {
      const form = el("form", "memory-editor");
      const area = el("textarea", "mw-input memory-editor-text"); area.value = item ? item.text : ""; area.maxLength = 400; area.rows = 2; area.required = true;
      area.placeholder = globalThis.t.text("workbench.settings-memory.one-sentence-that-reads-its-own-e-g"); area.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.memory-2"));
      const fields = el("div", "memory-editor-fields");
      const kind = el("select", "mw-select"); kind.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.kind"));
      Object.keys(KIND).forEach((key) => { const option = el("option", "", globalThis.t.text(KIND[key])); option.value = key; kind.append(option); });
      kind.value = item ? item.kind : (scope === "project" ? "convention" : "preference");
      const task = el("input", "mw-input"); task.maxLength = 200; task.placeholder = globalThis.t.text("workbench.settings-memory.applies-when-optional-e-g-writing-weekly-reports"); task.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.applies-when"));
      task.value = item && item.applies && item.applies.task ? item.applies.task : "";
      fields.append(kind, task);
      const row = el("div", "memory-editor-actions");
      const ok = button(globalThis.t.text("common.control.save"), "mw-btn--primary"); ok.type = "submit";
      const cancel = button(globalThis.t.text("common.control.cancel"), "mw-btn--ghost");
      cancel.addEventListener("click", () => paint());
      row.append(ok, cancel);
      form.append(area, fields, row);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = area.value.trim(); if (!text) return;
        const applies = Object.assign({}, item ? item.applies : {}); if (task.value.trim()) applies.task = task.value.trim(); else delete applies.task;
        run(() => onSave({ text, kind: kind.value, applies }), item ? "workbench.settings-memory.saved" : "workbench.settings-memory.kept");
      });
      return form;
    }

    function historyPanel(item, host) {
      const panel = el("div", "memory-history"); panel.append(el("span", "settings-muted", globalThis.t.text("workbench.settings-memory.loading")));
      host.append(panel);
      api("/items/" + encodeURIComponent(item.memory_id) + "/history").then((body) => {
        panel.replaceChildren();
        const list = el("ol", "memory-history-list");
        body.revisions.slice().reverse().forEach((revision) => {
          const entry = el("li", "");
          entry.append(el("span", "memory-history-version", globalThis.t.text("workbench.settings-memory.version-number", { version: revision.version }) + " · " + day(revision.at)), el("span", "", revision.text));
          if (revision.version !== item.version) {
            const back = button(globalThis.t.text("workbench.settings-memory.go-back-version"), "mw-btn--link"), restore = mutation();
            back.addEventListener("click", () => run(() => restore("/change", { memory_id: item.memory_id, expected_version: item.version, action: "restore", version: revision.version }), "workbench.settings-memory.went-back-that-version"));
            entry.append(back);
          } else entry.append(el("span", "memory-tag", globalThis.t.text("workbench.settings-memory.current")));
          list.append(entry);
        });
        panel.append(list);
      }).catch((failure) => { const note = el("span", "settings-form-error"); molisWorkRequest.show(note, failure); panel.replaceChildren(note); });
    }

    function paintItems() {
      const list = $("[data-memory-list]");
      list.replaceChildren();
      const query = filters.query.trim().toLowerCase();
      // A project's page also holds the memories of the Characters working in it: each labelled with its Character.
      const mine = (item) => item.scope === scope || (scope === "project" && item.scope === "character");
      const items = (data.items || []).filter(mine)
        .filter((item) => (!filters.kind || item.kind === filters.kind) && (!filters.source || item.source === filters.source) && (!filters.state || item.state === filters.state)
          && (!query || item.text.toLowerCase().includes(query)));
      if (!items.length) {
        const empty = (data.items || []).some(mine);
        list.append(el("li", "memory-empty settings-muted", empty ? globalThis.t.text("workbench.settings-memory.no-memories-match") : scope === "project"
          ? globalThis.t.text("workbench.settings-memory.no-memories-project-yet-say-remember-project-s") : globalThis.t.text("workbench.settings-memory.nothing-remembered-yet-say-now-remember-conversation-click")));
        return;
      }
      items.forEach((item) => {
        const row = el("li", "memory-row" + (item.state !== "active" ? " is-off" : "")), submit = mutation();
        const change = values => submit("/change", { ...values, memory_id: item.memory_id, expected_version: item.version });
        row.dataset.memoryId = item.memory_id;
        const copy = el("div", "memory-row-copy");
        copy.append(el("strong", "memory-text", item.text));
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", globalThis.t.text(KIND[item.kind] || item.kind)));
        if (item.scope === "character") meta.append(el("span", "memory-tag memory-tag--character", globalThis.t.text("workbench.settings-memory.role") + "「" + (item.character_title || item.character_id) + "」"));
        if (item.plugin_id) meta.append(el("span", "memory-tag", globalThis.t.text("workbench.settings-memory.plugins") + " " + item.plugin_id));
        meta.append(el("span", "memory-tag memory-tag--" + item.source, globalThis.t.text(SOURCE[item.source] || item.source) + " " + day(item.created_at)));
        if (item.state !== "active") { const status = el("span", "memory-tag memory-tag--state", globalThis.t.text(STATE[item.state]) + (item.state_reason ? " · " + item.state_reason : "")); status.dataset.mwState = item.state; meta.append(status); }
        meta.append(el("span", "", globalThis.t.text("workbench.settings-memory.applies") + "：" + appliesText(item.applies, item.scope)));
        meta.append(el("span", "", item.last_used ? globalThis.t.text("workbench.settings-memory.last-referenced-turn") + "：" + item.last_used.title + " · " + day(item.last_used.at) : globalThis.t.text("workbench.settings-memory.no-confirmed-reference")));
        copy.append(meta);
        const origin = el("details", "memory-origin"); origin.append(el("summary", "", globalThis.t.text("workbench.settings-memory.provenance")), el("p", "", item.origin));
        copy.append(origin);
        const actions = el("div", "memory-actions");
        const edit = button(globalThis.t.text("workbench.settings-memory.edit"), "mw-btn--ghost", globalThis.t.text("workbench.settings-memory.edit") + "：" + item.text);
        edit.addEventListener("click", () => {
          const editor = itemEditor(item, (value) => change({ action: "update", text: value.text, kind: value.kind, applies: value.applies }));
          row.replaceChildren(editor); editor.querySelector("textarea").focus();
        });
        const toggleLabel = item.state === "paused" ? globalThis.t.text("workbench.settings-memory.resume-use") : globalThis.t.text(item.state === "disabled" ? "workbench.settings-memory.switch" : "workbench.settings-memory.switch-off");
        const toggle = button(toggleLabel, "mw-btn--ghost", toggleLabel + "：" + item.text);
        toggle.addEventListener("click", () => run(() => change({ action: item.state === "active" ? "disable" : "enable" }), item.state === "active" ? "workbench.settings-memory.switched-off-will-not-be-used" : "workbench.settings-memory.switched"));
        const more = el("details", "memory-more mw-menu-host");
        const summary = el("summary", "mw-btn mw-btn--ghost mw-btn--sm", "⋯"); summary.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.more") + "：" + item.text);
        const menu = el("div", "memory-menu mw-menu");
        const menuItem = (text, handler, danger) => { const node = el("button", "mw-menu__item" + (danger ? " mw-menu__item--danger" : ""), text); node.type = "button"; node.addEventListener("click", () => { more.open = false; handler(); }); menu.append(node); };
        if (item.scope !== "character" && !item.plugin_id) menuItem(globalThis.t.text(item.scope === "project" ? "workbench.settings-memory.make-personal" : "workbench.settings-memory.make-project-memory"), () => {
          if (item.scope === "personal" && !project) { fail(new Error(globalThis.t.text("workbench.settings-memory.open-project-s-settings-make-that-project-s"))); return; }
          run(() => change({ action: "move", to: item.scope === "project" ? "personal" : "project" }), "workbench.settings-memory.moved-2");
        });
        menuItem(globalThis.t.text("workbench.settings-memory.history"), () => historyPanel(item, copy));
        if (item.scope === "project" && project) menuItem(globalThis.t.text("workbench.settings-memory.promote-project-guidance"), () => {
          const target = "/projects/" + encodeURIComponent(project) + "/settings/guidance?draft=" + encodeURIComponent(item.text);
          window.location.assign(target);
        });
        menuItem(globalThis.t.text("common.control.delete"), async () => {
          if (await ask(globalThis.t.text("workbench.settings-memory.delete-memory"), globalThis.t.text("workbench.settings-memory.nothing-will-use-text-anywhere-once-deleted-its", { text: item.text }), globalThis.t.text("common.control.delete"), summary)) {
            await run(() => change({ action: "remove" }), "workbench.settings-memory.deleted");
            // The confirmed delete repaints the list and takes the row's more button away: focus falls to the page's add button.
            focusBack(summary);
          }
        }, true);
        more.append(summary, menu);
        actions.append(edit, toggle, more);
        row.append(copy, actions);
        list.append(row);
      });
    }

    function paintPrefs() {
      const prefs = (data.prefs) || {};
      root.querySelectorAll("[data-memory-pref]").forEach((box) => {
        const path = box.dataset.memoryPref.split(".");
        const value = path.length === 2 ? (prefs[path[0]] || {})[path[1]] : prefs[path[0]];
        box.checked = Boolean(value);
        box.disabled = false;
      });
    }

    function paintPairs() {
      const list = $("[data-memory-pairs]"), pairs = data.pairs || [];
      $("[data-memory-pairs-section]").hidden = !pairs.length;
      list.replaceChildren();
      pairs.forEach((pair) => {
        const row = el("li", "memory-row memory-row--pair");
        const copy = el("div", "memory-row-copy");
        copy.append(el("span", "memory-tag memory-tag--state", globalThis.t.text(pair.kind === "conflict" ? "workbench.settings-memory.may-conflict" : "workbench.settings-memory.may-repeat") + (pair.why ? " · " + pair.why : "")));
        [["a", pair.a], ["b", pair.b]].forEach(([side, item]) => {
          const line = el("div", "memory-pair-line");
          line.append(el("strong", "memory-text", item.text), el("span", "settings-muted", globalThis.t.text(SOURCE[item.source] || item.source)));
          const keep = button(globalThis.t.text("workbench.settings-memory.keep-one"), "mw-btn--secondary", globalThis.t.text("workbench.settings-memory.keep-2") + "：" + item.text);
          keep.addEventListener("click", () => run(() => api("/pairs/" + encodeURIComponent(pair.pair_id) + "/resolve", { keep: side }), "workbench.settings-memory.kept-other-switched-off"));
          line.append(keep);
          copy.append(line);
        });
        const both = button(globalThis.t.text("workbench.settings-memory.keep-both"), "mw-btn--ghost");
        both.addEventListener("click", () => run(() => api("/pairs/" + encodeURIComponent(pair.pair_id) + "/resolve", { keep: "both" }), "workbench.settings-memory.both-kept-pair-will-not-come-up-again"));
        row.append(copy, el("div", "memory-actions"));
        row.lastChild.append(both);
        list.append(row);
      });
    }

    function paintUpkeep() {
      const box = $("[data-memory-upkeep]"), last = data.last_upkeep;
      if (!last) return;
      const done = [last.expired ? globalThis.t.text("workbench.settings-memory.expired") + " " + last.expired : "", last.unused ? globalThis.t.text("workbench.settings-memory.unused") + " " + last.unused : "", last.merged ? globalThis.t.text("workbench.settings-memory.merged") + " " + last.merged : "",
        last.paused ? globalThis.t.text("workbench.settings-memory.paused-basis-gone") + " " + last.paused : "", last.pairs ? globalThis.t.text("workbench.settings-memory.choose") + " " + last.pairs : ""].filter(Boolean).join(" · ");
      box.textContent = globalThis.t.text("workbench.settings-memory.last-tidied") + " " + day(last.at) + " " + new Date(last.at).toTimeString().slice(0, 5) + " · " + (done || globalThis.t.text("workbench.settings-memory.nothing-do"));
    }

    function paint() {
      if (!data) return;
      paintSummary(); paintChanges(); paintPairs(); paintCandidates(); paintItems(); paintPrefs(); paintUpkeep();
      $("[data-memory-new]").hidden = true;
    }

    root.querySelectorAll("[data-memory-filter]").forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => {
      filters[control.dataset.memoryFilter] = control.value; if (data) paintItems();
    }));
    $("[data-memory-add]").addEventListener("click", () => {
      const slot = $("[data-memory-new]"), write = mutation();
      const editor = itemEditor(null, (value) => write("/items", { scope, text: value.text, kind: value.kind, applies: value.applies }));
      slot.replaceChildren(editor); slot.hidden = false; editor.querySelector("textarea").focus();
    });
    $("[data-memory-upkeep-run]").addEventListener("click", () => run(() => api("/upkeep", {}), "workbench.settings-memory.tidied-see-recent-changes"));
    $("[data-memory-export]").addEventListener("click", () => run(async () => {
      const body = await api("/export", { scope });
      const blob = new Blob([JSON.stringify(body.package, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "molis-memory-" + scope + "-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, "workbench.settings-memory.exported"));
    const importPackage = mutation();
    $("[data-memory-import]").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      run(async () => {
        let pack;
        try { pack = JSON.parse(await file.text()); } catch { throw new Error(globalThis.t.text("workbench.settings-memory.file-not-memory-package")); }
        await importPackage("/import", { scope, package: pack });
      });
    });
    let clearPreview = null;
    const clearButton = $("[data-memory-clear]"), resetClear = $("[data-memory-clear-reset]"), clearStatus = $("[data-memory-clear-status]");
    const showClear = (message) => {
      clearStatus.textContent = message; clearStatus.hidden = false;
      clearButton.textContent = globalThis.t.text(clearPreview ? "workbench.settings-memory.retry-clear" : "workbench.settings-memory.clear"); resetClear.hidden = !clearPreview;
    };
    clearButton.addEventListener("click", () => run(async () => {
      if (!clearPreview) {
        const preview = await api("/preview", { scope });
        if (!preview.count) { toast(globalThis.t.text("workbench.settings-memory.no-memories-clear")); return; }
        if (!await ask(globalThis.t.text("workbench.settings-memory.clear-these-memories"), globalThis.t.text("workbench.settings-memory.will-delete-count-count-once-deleted-they-never", { count: preview.count }), globalThis.t.text("workbench.settings-memory.clear-2"), clearButton)) return;
        clearPreview = preview;
      }
      showClear(globalThis.t.text("workbench.settings-memory.clear-incomplete-retrying-only-handles-confirmed-memories"));
      const done = await api("/clear", { scope, fingerprint: clearPreview.fingerprint });
      if (done.complete) {
        clearPreview = null;
        showClear(globalThis.t.text("workbench.settings-memory.clear-completed") + " · " + globalThis.t.text("workbench.settings-memory.deleted-count", { count: done.removed }));
        toast(clearStatus.textContent);
      } else {
        const countOutcome = (outcome) => done.items.filter((item) => item.outcome === outcome).length;
        showClear(globalThis.t.text("workbench.settings-memory.clear-incomplete-retrying-only-handles-confirmed-memories") + " · " + globalThis.t.text("workbench.settings-memory.deleted") + " " + done.removed
          + " · " + globalThis.t.text("workbench.settings-memory.version-conflicts") + " " + countOutcome("conflict") + " · " + globalThis.t.text("workbench.settings-memory.outcome-unknown") + " " + countOutcome("unknown") + " · " + globalThis.t.text("workbench.settings-memory.not-run-yet") + " " + countOutcome("not-executed"));
      }
    }));
    resetClear.addEventListener("click", () => run(async () => {
      // The reset ask's own button hides when it lands, so the clear button — visible before and after — is the fallback.
      if (!await ask(globalThis.t.text("workbench.settings-memory.preview-clear-scope-again"), globalThis.t.text("workbench.settings-memory.stop-retrying-confirmation-deleted-memories-stay-deleted-new"), globalThis.t.text("workbench.settings-memory.preview-again"), resetClear)) return;
      clearPreview = null; showClear(globalThis.t.text("workbench.settings-memory.next-clear-will-preview-current-scope-ask-confirmation"));
      focusBack(resetClear, clearButton);
    }));
    root.querySelectorAll("[data-memory-pref]").forEach((box) => box.addEventListener("change", () => {
      const path = box.dataset.memoryPref.split(".");
      const prefs = path.length === 2 ? { [path[0]]: { [path[1]]: box.checked } } : { [path[0]]: box.checked };
      run(() => api("/prefs", { scope, prefs }), "workbench.settings-memory.saved");
    }));
    document.addEventListener("click", (event) => root.querySelectorAll(".memory-more[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; }));
    load().catch(fail);
  };
  // The settings directory hands every page it embeds to every binder: only a memory page is this one's.
  globalThis.molisWorkBindMemorySettings = (container = document) => {
    if (container.matches?.("[data-memory-settings]")) bind(container);
    else container.querySelectorAll?.("[data-memory-settings]").forEach(bind);
  };
  const start = () => document.querySelectorAll("[data-memory-settings]").forEach(bind);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
`;
