import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { MEMORY_CLASS_SETTINGS_CLIENT_SCRIPT, renderMemoryClassSettings } from "./settings-memory-classes.js";
import { MEMORY_EDITORS_CLIENT_SCRIPT } from "./settings-memory-editors.js";
const attributeJson = (value: unknown): string => JSON.stringify(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/**
 * The memory settings page (specs/archive/memory-system §10): 个人 → 记忆 in the global settings, and 项目记忆 in a project's
 * settings. Both are the same page in a different scope; everything it shows and changes goes through `/api/memory/*`,
 * which invokes the shared directory's `memory.*` actions as the person.
 */
export function renderMemorySettings({ readText, scope, projectId, projects = [] }: { readText(text: string): string; scope: "personal" | "project"; projectId: string | null;
  /** On the personal page: the projects a memory can be moved into (the move itself goes through that project's own route). */
  projects?: readonly { project_id: string; display_name: string }[] }): string {
  const personal = scope === "personal";
  const title = personal ? uiText.text("workbench.settings-memory.memory") : uiText.text("workbench.settings-memory.project-memory");
  const lead = personal
    ? uiText.text("workbench.settings-memory.preferences-habits-used-assistant-agent-work-plugins-interface")
    : uiText.text("workbench.settings-memory.project-s-conventions-background-lessons-used-only-project");
  return `<section class="settings-document memory-settings" aria-labelledby="memory-title" data-memory-settings data-memory-scope="${scope}" data-project="${projectId ?? ""}"${personal && projects.length ? ` data-memory-projects="${attributeJson(projects.map(({ project_id, display_name }) => ({ project_id, display_name })))}"` : ""}>
    <header class="settings-page-heading memory-heading"><h1 id="memory-title" data-memory-title>${title}</h1><p data-memory-intro>${lead}</p>
      <p class="memory-summary" data-memory-summary aria-live="polite">${uiText("workbench.settings-memory.loading")}</p></header>
    <p class="settings-form-error" data-memory-error role="alert" hidden></p>
    <section class="settings-section" data-memory-retries hidden aria-labelledby="memory-retries-title">
      <h2 id="memory-retries-title">${uiText("workbench.settings-memory.operations-waiting-retry")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-memory.page-keeps-original-requests-accepted-forgetting-confirmed-batches")}</p>
      <ul class="memory-list" data-memory-retry-list></ul>
    </section>
    <section class="settings-section memory-changes" aria-labelledby="memory-changes-title" data-memory-changes-section hidden>
      <h2 id="memory-changes-title">${uiText("workbench.settings-memory.recent-changes")}</h2>
      <ul class="memory-change-list" data-memory-changes></ul>
    </section>
    <section class="settings-section memory-pairs" aria-labelledby="memory-pairs-title" data-memory-pairs-section>
      <h2 id="memory-pairs-title">${uiText("workbench.settings-memory.possible-duplicates-conflicts")}</h2>
      <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-pairs-read>${uiText("workbench.settings-memory.review-possible-duplicates-conflicts")}</button>
      <p class="settings-muted">${uiText("workbench.settings-memory.pairs-found-while-tidying-keep-one-other-switched")}</p>
      <ul class="memory-list" data-memory-pairs></ul>
    </section>
    <section class="settings-section memory-candidates" aria-labelledby="memory-candidates-title" data-memory-candidates-section hidden>
      <h2 id="memory-candidates-title">${uiText("workbench.settings-memory.waiting")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-memory.suggested-work-how-use-interface-held-back-write")}</p>
      <ul class="memory-list" data-memory-candidates></ul>
    </section>
    <section class="settings-section memory-items" aria-labelledby="memory-items-title">
      <div class="memory-items-head"><h2 id="memory-items-title">${personal ? uiText.text("workbench.settings-memory.my-memories") : uiText.text("workbench.settings-memory.project-s-memories")}</h2>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-add>${uiText("workbench.settings-memory.add")}</button></div>
      <div class="memory-toolbar" role="group" aria-label="${uiText("workbench.settings-memory.filter-memories")}">
        <select class="mw-select" data-memory-filter="scene" aria-label="${uiText("workbench.settings-memory.scene")}"><option value="">${uiText("workbench.settings-memory.all-scenes")}</option><option value="coding">${uiText("workbench.settings-memory.coding")}</option><option value="assistant">${uiText("workbench.settings-memory.assistant")}</option><option value="common">${uiText("workbench.settings-memory.common")}</option><option value="unclassified">${uiText("workbench.settings-memory.unclassified")}</option></select>
        <select class="mw-select" data-memory-filter="kind" aria-label="${uiText("workbench.settings-memory.kind")}"><option value="">${uiText("workbench.settings-memory.all-kinds")}</option><option value="preference">${uiText("workbench.settings-memory.preference")}</option><option value="convention">${uiText("workbench.settings-memory.convention")}</option><option value="fact">${uiText("workbench.settings-memory.background-fact")}</option><option value="experience">${uiText("workbench.settings-memory.lesson")}</option><option value="habit">${uiText("workbench.settings-memory.habit")}</option><option value="project-decision">${uiText("workbench.settings-memory.project-decision")}</option></select>
        <select class="mw-select" data-memory-filter="lifecycle" aria-label="${uiText("workbench.settings-memory.retention")}"><option value="">${uiText("workbench.settings-memory.all-retention-types")}</option><option value="long-term">${uiText("workbench.settings-memory.long-term")}</option><option value="short-term">${uiText("workbench.settings-memory.short-term")}</option><option value="session">${uiText("workbench.settings-memory.within-session")}</option></select>
        <select class="mw-select" data-memory-filter="source" aria-label="${uiText("workbench.settings-memory.source")}"><option value="">${uiText("workbench.settings-memory.all-sources")}</option><option value="said">${uiText("workbench.settings-memory.said")}</option><option value="accepted">${uiText("workbench.settings-memory.accepted")}</option><option value="auto">${uiText("workbench.settings-memory.kept-automatically")}</option><option value="manual">${uiText("workbench.settings-memory.added")}</option><option value="imported">${uiText("workbench.settings-memory.imported")}</option><option value="plugin">${uiText("workbench.settings-memory.kept-plugin")}</option></select>
        <select class="mw-select" data-memory-filter="state" aria-label="${uiText("workbench.settings-memory.state")}"><option value="">${uiText("workbench.settings-memory.all-states")}</option><option value="active">${uiText("workbench.settings-memory.active")}</option><option value="disabled">${uiText("workbench.settings-memory.switch-off")}</option><option value="paused">${uiText("workbench.settings-memory.paused")}</option></select>
        <select class="mw-select" data-memory-filter="expired" aria-label="${uiText("workbench.settings-memory.expiry-state")}"><option value="">${uiText("workbench.settings-memory.all-expiry-states")}</option><option value="true">${uiText("workbench.settings-memory.expired-2")}</option><option value="false">${uiText("workbench.settings-memory.not-expired")}</option></select>
        <input class="mw-input memory-search" type="search" maxlength="400" data-memory-filter="query" placeholder="${uiText("workbench.settings-memory.search-memories")}" aria-label="${uiText("workbench.settings-memory.search-memories")}">
      </div>
      <div class="memory-toolbar" data-memory-batch>
        <span class="settings-muted" data-memory-selected aria-live="polite"></span>
        <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-memory-batch-action="disable" disabled>${uiText("workbench.settings-memory.disable-selected")}</button>
        <button type="button" class="mw-btn mw-btn--danger-outline mw-btn--sm" data-memory-batch-action="remove" disabled>${uiText("workbench.settings-memory.forget-selected")}</button>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-memory-selection-reset>${uiText("workbench.settings-memory.clear-selection")}</button>
      </div>
      <ul class="memory-list" data-memory-batch-results aria-live="polite" hidden></ul>
      <div class="memory-editor-slot" data-memory-new hidden></div>
      <ul class="memory-list" data-memory-list><li class="settings-muted">${uiText("workbench.settings-memory.loading")}</li></ul>
      <nav class="memory-toolbar" aria-label="${uiText("workbench.settings-memory.pages")}">
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-previous disabled>${uiText("workbench.settings-memory.previous-page")}</button>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-next disabled>${uiText("workbench.settings-memory.next-page")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-reload>${uiText("workbench.settings-memory.reload")}</button>
        <span class="settings-muted" data-memory-page-status aria-live="polite"></span>
      </nav>
    </section>
    ${renderMemoryClassSettings()}
    <section class="settings-section memory-prefs" aria-labelledby="memory-form-title">
      <h2 id="memory-form-title">${uiText("workbench.settings-memory.how-memories-form")}</h2>
      ${prefRow(readText, "form", uiText.text("workbench.settings-memory.allow-remembering"), personal ? uiText.text("workbench.settings-memory.main-switch-off-no-new-memories-no-suggestions") : uiText.text("workbench.settings-memory.off-no-new-memories-suggestions-project"))}
      <div class="settings-setting-row memory-pref-static" data-memory-pref-ask><span class="setting-copy"><strong>${uiText("workbench.settings-memory.remember-when-ask")}</strong><span data-memory-pref-ask-copy>${uiText("workbench.settings-memory.when-say-now-remember-kept-once-told-where")}</span></span><span class="setting-value settings-muted" data-memory-pref-ask-value>${uiText("workbench.settings-memory.always")}</span></div>
      ${prefRow(readText, "auto", uiText.text("workbench.settings-memory.keep-low-risk-preferences-lessons-automatically"), uiText.text("workbench.settings-memory.kept-automatically-when-ask-same-thing-two-different"))}
      ${prefRow(readText, "learn_from_work", uiText.text("workbench.settings-memory.suggest-work"), uiText.text("workbench.settings-memory.when-work-ends-suggest-what-worth-keeping-accept"))}
      ${prefRow(readText, "learn_from_ui", uiText.text("workbench.settings-memory.learn-interface"), uiText.text("workbench.settings-memory.only-counts-how-often-accept-ignore-rewrite-undo"))}
    </section>
    <section class="settings-section memory-prefs" aria-labelledby="memory-use-title">
      <h2 id="memory-use-title">${uiText("workbench.settings-memory.who-can-use-them")}</h2>
      ${prefRow(readText, "consumers.assistant", uiText.text("workbench.settings-memory.assistant"), uiText.text("workbench.settings-memory.work-give-assistant-bottom-bar"))}
      ${prefRow(readText, "consumers.agent", uiText.text("workbench.settings-memory.agent-work"), uiText.text("workbench.settings-memory.coding-plugin-agents-workflows"))}
      ${prefRow(readText, "consumers.ui", uiText.text("workbench.settings-memory.interface-suggestions"), uiText.text("workbench.settings-memory.suggestions-based-what-looking"))}
      ${prefRow(readText, "consumers.plugin", uiText.text("workbench.settings-memory.plugins"), uiText.text("workbench.settings-memory.plugins-read-preferences-conventions-project-facts"))}
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
      <div class="settings-setting-row"><span class="setting-copy"><strong data-memory-clear-title>${personal ? uiText.text("workbench.settings-memory.clear-personal-memories") : uiText.text("workbench.settings-memory.clear-project-s-memories")}</strong><span>${uiText("workbench.settings-memory.see-how-many-first-once-confirmed-they-deleted")}</span></span>
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
  const bind = (root, context = null) => {
    if (!root || root.dataset.memoryBound === "1") return;
    root.dataset.memoryBound = "1";
    const L = globalThis.t.text;
    let scope = root.dataset.memoryScope === "project" ? "project" : "personal";
    const project = root.dataset.project || "";
    const params = new URLSearchParams(context ? context.search : location.search);
    const kind = params.get("memory_session_kind"), sessionId = params.get("memory_session_id");
    const sessionMode = params.has("memory_session_kind") || params.has("memory_session_id");
    const validTarget = !sessionMode || ["coding", "assistant"].includes(kind) && sessionId && sessionId.trim() && sessionId.length <= 200
      && params.getAll("memory_session_kind").length === 1 && params.getAll("memory_session_id").length === 1 && (kind !== "coding" || project);
    const targetBase = target => (target.project_id ? "/projects/" + encodeURIComponent(target.project_id) : "")
      + "/api/memory/sessions/" + target.kind + "/" + encodeURIComponent(target.id);
    const base = sessionMode && validTarget ? targetBase({ kind, id: sessionId, project_id: project || null })
      : (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/memory";
    const $ = (selector) => root.querySelector(selector);
    const part = name => $("[data-memory-" + name + "]");
    const unread = globalThis.t.text("workbench.settings-memory.reading-did-not-finish-reload-try-again");
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
      const footer = el("footer", "mw-form__footer"), cancel = el("button", "mw-btn mw-btn--secondary mw-btn--md", globalThis.t.text("workbench.settings-memory.cancel")), yes = el("button", "mw-btn mw-btn--danger mw-btn--md", yesLabel);
      cancel.type = "button"; yes.type = "button"; yes.dataset.memoryConfirmYes = "";
      footer.append(cancel, yes); form.append(header, footer); dialog.append(form);
      let answer = false;
      cancel.addEventListener("click", () => dialog.close());
      yes.addEventListener("click", () => { answer = true; dialog.close(); });
      dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener("close", () => { dialog.remove(); focusBack(trigger); resolve(answer); });
      root.append(dialog); dialog.showModal(); cancel.focus();
    });
    // From the personal page a memory moves into a project the person picks; that project's own route decides and checks it.
    const projectChoices = (() => { try { return JSON.parse(root.dataset.memoryProjects || "[]"); } catch { return []; } })();
    const moveIntoProject = (item, trigger) => {
      if (!projectChoices.length) { fail(new Error(globalThis.t.text("workbench.settings-memory.no-project-to-move-into"))); return; }
      const dialog = el("dialog", "mw-dialog memory-confirm memory-project-picker"); dialog.dataset.slot = "dialog";
      const titleId = "memory-project-" + Date.now().toString(36); dialog.setAttribute("aria-labelledby", titleId);
      const form = el("form", "mw-form mw-dialog__shell"); form.method = "dialog";
      const header = el("header", "mw-form__header"), heading = el("div"), h2 = el("h2", "", globalThis.t.text("workbench.settings-memory.move-into-which-project")); h2.id = titleId;
      heading.append(h2, el("p", "", globalThis.t.text("workbench.settings-memory.after-moving-used-only-in-that-project"))); header.append(heading);
      const list = el("div", "memory-project-choices");
      let chosen = null;
      projectChoices.forEach((choice) => {
        const option = el("button", "mw-btn mw-btn--secondary mw-btn--md", choice.display_name); option.type = "button";
        option.addEventListener("click", () => { chosen = choice; dialog.close(); });
        list.append(option);
      });
      const footer = el("footer", "mw-form__footer"), cancel = el("button", "mw-btn mw-btn--ghost mw-btn--md", globalThis.t.text("workbench.settings-memory.cancel"));
      cancel.type = "button"; cancel.addEventListener("click", () => dialog.close());
      footer.append(cancel); form.append(header, list, footer); dialog.append(form);
      dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener("close", () => {
        dialog.remove(); focusBack(trigger);
        if (!chosen) return;
        const id = crypto.randomUUID(), payload = { action: "move", to: "project", memory_id: item.memory_id, expected_version: item.version };
        run(() => dispatch(Object.freeze({ id, path: "/change", base: "/projects/" + encodeURIComponent(chosen.project_id) + "/api/memory",
          body: JSON.stringify({ ...payload, operation_id: id }), title: commandTitle("/change", payload) })), "workbench.settings-memory.moved-2");
      });
      root.append(dialog); dialog.showModal(); list.querySelector("button")?.focus();
    };
    const KIND = { preference: "workbench.settings-memory.preference", convention: "workbench.settings-memory.convention", fact: "workbench.settings-memory.background-fact", experience: "workbench.settings-memory.lesson" };
    const FORMAL_KIND = { ...KIND, habit: "workbench.settings-memory.habit", "project-decision": "workbench.settings-memory.project-decision" };
    const CLASS = { coding: "workbench.settings-memory.coding", assistant: "workbench.settings-memory.assistant", common: "workbench.settings-memory.common", "long-term": "workbench.settings-memory.long-term", "short-term": "workbench.settings-memory.short-term", session: "workbench.settings-memory.within-session" };
    const SOURCE = { said: "workbench.settings-memory.said", accepted: "workbench.settings-memory.accepted", auto: "workbench.settings-memory.kept-automatically", manual: "workbench.settings-memory.added", imported: "workbench.settings-memory.imported", plugin: "workbench.settings-memory.kept-plugin" };
    const STATE = { active: "workbench.settings-memory.active", disabled: "workbench.settings-memory.switch-off", paused: "workbench.settings-memory.paused" };
    const CHANGE = { kept: "workbench.settings-memory.keep", auto_kept: "workbench.settings-memory.kept-automatically", replaced: "workbench.settings-memory.replaced", auto_replaced: "workbench.settings-memory.replaced-automatically", merged: "workbench.settings-memory.merged", edited: "workbench.settings-memory.edit", restored: "workbench.settings-memory.went-back-earlier-version", moved: "workbench.settings-memory.moved",
      disabled: "workbench.settings-memory.switch-off", auto_disabled: "workbench.settings-memory.switched-off-automatically", enabled: "workbench.settings-memory.switch", paused: "workbench.settings-memory.paused", resumed: "workbench.settings-memory.resumed", removed: "workbench.settings-memory.delete", accepted: "workbench.settings-memory.accepted-2", imported: "workbench.settings-memory.imported", cleared: "workbench.settings-memory.cleared" };
    const day = (iso) => { const date = new Date(iso); return !iso || isNaN(date) ? "" : (date.getMonth() + 1) + "/" + date.getDate(); };
    const appliesText = (applies, itemScope, classification) => {
      const parts = classification?.lifecycle === "session" ? [globalThis.t.text("workbench.settings-memory.within-session")] : [];
      if (applies && applies.plugin_ids && applies.plugin_ids.length) parts.push(globalThis.t.text("workbench.settings-memory.plugins") + " " + applies.plugin_ids.join("、"));
      if (applies && applies.object_kinds && applies.object_kinds.length) parts.push(globalThis.t.text("workbench.settings-memory.object") + " " + applies.object_kinds.join("、"));
      // Goals by name when their plugin can still read them; one it cannot is said so rather than shown as an id.
      if (applies && applies.goal_ids && applies.goal_ids.length) parts.push("Goal " + applies.goal_ids.map((id) => {
        const title = data && data.labels && data.labels.goals ? data.labels.goals[id] : null; return title ? "「" + title + "」" : globalThis.t.text("workbench.settings-memory.goal-that-can-no-longer-be-read"); }).join("、"));
      if (applies && applies.task) parts.push(applies.task);
      if (applies && applies.until) parts.push(globalThis.t.text("workbench.settings-memory.until") + " " + applies.until.slice(0, 10));
      return parts.length ? parts.join(" · ") : globalThis.t.text(itemScope === "character" ? "workbench.settings-memory.work-character-does-project" : scope === "project" ? "workbench.settings-memory.all-work-project" : "workbench.settings-memory.all-work");
    };
    let data = null, busy = false, removing = false, reading = false, readFailed = false, reader, currentCursor, previous = [], pairsOpened = false;
    const filters = { scene: "", kind: "", lifecycle: "", source: "", state: "", expired: "", query: "" };
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
    if (!validTarget) {
      error.textContent = globalThis.t.text("workbench.settings-memory.session-selection-incomplete-invalid-open-memory-original-session"); error.hidden = false;
      part("list").textContent = error.textContent; root.querySelectorAll("button, input, select").forEach(node => { node.disabled = true; }); return;
    }
    if (sessionMode) {
      part("title").textContent = globalThis.t.text("workbench.settings-memory.session-memory");
      part("intro").textContent = globalThis.t.text("workbench.settings-memory.manage-memories-candidates-belonging-session-clearing-keeps-conversati");
      part("clear-title").textContent = globalThis.t.text("workbench.settings-memory.clear-all-memories-candidates-session"); part("clear").textContent = globalThis.t.text("workbench.settings-memory.clear-3");
      root.querySelectorAll(".memory-prefs, [data-memory-classes], [data-memory-pairs-section], [data-memory-changes-section], .memory-rules-note").forEach(node => { node.hidden = true; });
      for (const name of ["upkeep-run", "export", "import"]) part(name).closest(".settings-setting-row").hidden = true;
      if (project) {
        const label = el("label", "memory-toolbar", globalThis.t.text("workbench.settings-memory.memory-scope")), choices = el("select", "mw-select"); choices.dataset.memoryScopeChoice = ""; choices.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.memory-scope"));
        for (const [value, title] of [["personal", "workbench.settings-memory.personal"], ["project", "workbench.settings-memory.project"]]) { const option = el("option", "", globalThis.t.text(title)); option.value = value; choices.append(option); }
        choices.value = scope; choices.addEventListener("change", () => { scope = choices.value; selected.clear(); invalidateRead(); void load(); }); label.append(choices); root.querySelector(".memory-heading").append(label);
      }
    }
    const api = (path, payload, address = base) => molisWorkRequest(address + path, { body: payload });
    const pendingCommands = new Map(), discovered = new Set(), selected = new Map(), batchPositions = new Map();
    let operationsCursor;
    const pendingRemoval = () => [...pendingCommands.values()].some(command => JSON.parse(command.body).action === "remove" || command.removal || command.path === "/clear");
    const commandTitle = (path, payload, bodyless = false) => {
      const actions = { renew: "workbench.settings-memory.renew-expiry", reclassify: "workbench.settings-memory.correct-classification", update: "workbench.settings-memory.edit", disable: "workbench.settings-memory.switch-off", enable: "workbench.settings-memory.switch", remove: "workbench.settings-memory.delete", move: "workbench.settings-memory.moved", restore: "workbench.settings-memory.went-back-earlier-version", items: "workbench.settings-memory.add", import: "workbench.settings-memory.imported", undo: "workbench.settings-memory.undo", accept: "workbench.settings-memory.accepted-2", discard: "workbench.settings-memory.no" };
      const title = globalThis.t.text(actions[payload.action || path.split("/").at(-1)]);
      if (bodyless || payload.action === "remove") return title;
      const subject = payload.text || data?.items?.find(item => item.memory_id === payload.memory_id)?.text
        || data?.candidates?.find(item => path.startsWith("/candidates/" + encodeURIComponent(item.candidate_id) + "/"))?.text;
      return title + (subject ? "：「" + subject + "」" : "");
    };
    const invalidateRead = () => {
      reader?.abort(); reader = undefined; reading = false; readFailed = true;
      for (const [id, command] of pendingCommands) pendingCommands.set(id, Object.freeze({ ...command, title: command.path === "/clear" || command.path === "/clear/apply" || command.path === "/batch/apply" ? command.title : commandTitle(command.path, JSON.parse(command.body), true) }));
      paintRetries();
      if (data) {
        data = { ...data, items: [], candidates: [], changes: [], pairs: [], cursor: undefined, exhausted: false, total: { kind: "unknown" } };
        paint();
      }
      part("list").replaceChildren(el("li", "memory-empty settings-muted", unread)); paintNavigation();
    };
    const dispatch = async (command) => {
      command = pendingCommands.get(command.id) || command;
      const removal = JSON.parse(command.body).action === "remove" || command.path === "/clear" || command.path === "/clear/apply" || command.path === "/batch/apply" && command.removal;
      if (removal) { removing = true; pendingCommands.set(command.id, command); invalidateRead(); }
      try {
        const result = await api(command.path, JSON.parse(command.body), command.base || base);
        if (command.path === "/import") toast(globalThis.t.text("workbench.settings-memory.imported-count", { count: result.written }) + (result.skipped ? " · " + globalThis.t.text("workbench.settings-memory.skipped") + " " + result.skipped : "") + (result.refused ? " · " + globalThis.t.text("workbench.settings-memory.not-imported") + " " + result.refused : ""));
        if (command.path === "/batch/apply") paintBatchResults(result.items);
        if (command.path === "/clear/apply") { if (result.complete && clearPreview?.preview_id === JSON.parse(command.body).preview_id) clearPreview = null; paintSessionResults(result.items); showClear(result.complete ? globalThis.t.text("workbench.settings-memory.session-memory-cleanup-complete") : globalThis.t.text("workbench.settings-memory.cleanup-incomplete-retrying-uses-original-preview")); }
        if (command.path === "/clear") showClearResult(result, JSON.parse(command.body).fingerprint);
        if (result.complete === false) {
          pendingCommands.set(command.id, command); paintRetries();
          if (command.path === "/batch/apply") throw new Error(globalThis.t.text("workbench.settings-memory.operation-unfinished-continue-original-operation"));
          return result;
        }
        pendingCommands.delete(command.id); discovered.delete(command.id); paintRetries(); return result;
      } catch (failure) { pendingCommands.set(command.id, command); paintRetries(); if (command.path === "/clear/apply") showClear(globalThis.t.text("workbench.settings-memory.cleanup-unconfirmed-keep-original-preview-retry-reconcile-operation")); throw failure; }
      finally { if (removal) { removing = false; invalidateRead(); } }
    };
    function paintRetries() {
      $("[data-memory-retries]").hidden = !pendingCommands.size && !operationsCursor;
      $("[data-memory-retries] h2").textContent = globalThis.t.text(pendingCommands.size ? "workbench.settings-memory.operations-waiting-retry" : "workbench.settings-memory.check-original-operations");
      const list = $("[data-memory-retry-list]");
      const existing = new Map([...list.querySelectorAll("[data-memory-command]")].map(row => [row.dataset.memoryCommand, row]));
      for (const command of pendingCommands.values()) {
        const retained = existing.get(command.id);
        if (retained) { retained.querySelector("strong").textContent = command.title; retained.querySelector("button").setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.retry-operation") + "：" + command.title); existing.delete(command.id); continue; }
        const row = el("li", "memory-row"), copy = el("strong", "memory-row-copy", command.title);
        const retry = button(globalThis.t.text("workbench.settings-memory.retry-operation"), "mw-btn--secondary", globalThis.t.text("workbench.settings-memory.retry-operation") + "：" + command.title);
        retry.dataset.memoryRetry = "";
        retry.addEventListener("click", () => run(() => dispatch(command), command.path === "/import" || command.path === "/clear" || command.path === "/clear/apply" ? undefined : "workbench.settings-memory.operation-completed"));
        row.dataset.memoryCommand = command.id; row.append(copy, retry); list.append(row);
      }
      for (const row of existing.values()) row.remove();
      list.querySelector("[data-memory-more-operations]")?.remove();
      if (operationsCursor) {
        const more = button(globalThis.t.text("workbench.settings-memory.find-more-original-operations"), "mw-btn--secondary");
        more.dataset.memoryMoreOperations = "";
        more.addEventListener("click", async () => {
          more.disabled = true;
          try {
            const result = await api("/operations?" + (sessionMode ? "" : "scope=" + scope + "&") + "cursor=" + encodeURIComponent(operationsCursor));
            if (root.isConnected) restoreCommands(result, false);
          } catch (failure) { if (root.isConnected) fail(failure); }
          finally { more.disabled = false; }
        });
        list.append(more);
      }
    }
    const restoreCommands = (page, replace) => {
      if (replace) { for (const id of discovered) pendingCommands.delete(id); discovered.clear(); }
      for (const item of page.items) {
        const path = item.kind === "session-clear" ? "/clear/apply" : item.kind === "remove" ? "/change" : item.kind === "scope-clear" ? "/clear" : "/batch/apply";
        const payload = item.request ? { ...item.request, operation_id: item.operation_id }
          : item.fingerprint ? { scope: item.scope, fingerprint: item.fingerprint }
          : item.preview_id ? { preview_id: item.preview_id } : undefined;
        if (item.cleanup === "needs-reconcile" || !payload) { fail(new Error(globalThis.t.text("workbench.settings-memory.original-operation-needs-reconciliation-cleanup-unfinished"))); continue; }
        const held = item.kind === "session-clear" && [...pendingCommands.values()].find(command => command.path === path && command.body === JSON.stringify(payload) && (command.base || base) === targetBase(item.target));
        const id = held ? held.id : item.operation_id;
        if (!pendingCommands.has(id)) pendingCommands.set(id, Object.freeze({ id, path, ...(item.kind === "session-clear" ? { base: targetBase(item.target) } : {}), body: JSON.stringify(payload),
          title: globalThis.t.text(item.forgetting === "accepted" ? "workbench.settings-memory.forgetting-accepted-continue-cleanup" : "workbench.settings-memory.continue-original-memory-operation"), removal: item.kind !== "batch" || item.action === "remove" }));
        discovered.add(id);
      }
      operationsCursor = page.cursor; paintRetries();
    };
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
      catch (failure) { if (pendingRemoval()) await load().catch(fail); fail(failure); }
      finally { busy = false; paintSelection(); }
    };
    const pageInput = (cursor) => {
      const filter = {};
      for (const [key, plural] of [["kind", "kinds"], ["source", "sources"], ["state", "states"], ["lifecycle", "lifecycles"]]) {
        if (filters[key]) filter[plural] = [filters[key]];
      }
      if (filters.scene === "unclassified") filter.unclassified = true;
      else if (filters.scene) filter.scenes = [filters.scene];
      if (filters.expired) filter.expired = filters.expired === "true";
      return { scope, filter, ...(filters.query.trim() ? { query: filters.query.trim() } : {}), ...(cursor ? { cursor } : {}) };
    };
    const readPage = async (cursor, trail, overview = false) => {
      reader?.abort();
      const active = reader = new AbortController(), input = pageInput(cursor);
      reading = true; readFailed = false; error.hidden = true; paintNavigation();
      const request = path => molisWorkRequest(base + path, { signal: active.signal });
      try {
        const first = overview ? await request("/overview?scope=" + scope) : null;
        const page = first && !Object.keys(input.filter).length && !input.query && !cursor ? first
          : await request("/page?input=" + encodeURIComponent(JSON.stringify(input)));
        const operations = await request(sessionMode ? "/operations" : "/operations?scope=" + scope);
        if (reader !== active || !root.isConnected) return;
        restoreCommands(operations, true);
        if (removing) { invalidateRead(); return; }
        data = { ...data, ...first, ...page }; currentCursor = cursor; previous = trail;
        paint();
      } catch (failure) {
        if (reader === active && root.isConnected) {
          readFailed = true; fail(failure);
          part("list").replaceChildren(el("li", "memory-empty settings-muted", unread));
        }
      } finally {
        if (reader === active) { reading = false; paintNavigation(); }
      }
    };
    const readPairs = async () => {
      if (sessionMode) return;
      const active = reader;
      const result = await api("/pairs?scope=" + scope);
      if (reader !== active || !root.isConnected || removing) return; data = { ...data, ...result }; pairsOpened = true; paintPairs();
    };
    const load = async () => { await readPage(undefined, [], true); if (pairsOpened) await readPairs(); };
    // Changes made elsewhere (the Assistant, another tab) show without pressing reload; never under an open editor or question.
    let staleElsewhere = false;
    const listening = new AbortController();
    const reloadIfIdle = () => {
      if (!root.isConnected) { listening.abort(); return; }
      if (busy || reading || root.querySelector("dialog[open], textarea, .memory-editor-slot:not([hidden]):not(:empty)")) { staleElsewhere = true; return; }
      staleElsewhere = false; load().catch(fail);
    };
    document.addEventListener("molis-work:memory-changed", reloadIfIdle, { signal: listening.signal });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reloadIfIdle(); }, { signal: listening.signal });
    root.addEventListener("focusin", () => { if (staleElsewhere) reloadIfIdle(); });

    function paintNavigation() {
      paintSelection();
      part("list").setAttribute("aria-busy", String(reading));
      part("list").inert = reading || readFailed;
      part("previous").disabled = reading || readFailed || !previous.length;
      const next = part("next"); next.disabled = reading || readFailed || !data?.cursor || data.exhausted;
      next.textContent = globalThis.t.text(data && !data.items.length && !data.exhausted ? "workbench.settings-memory.continue-searching" : "workbench.settings-memory.next-page");
      part("reload").disabled = reading;
      part("page-status").textContent = reading ? globalThis.t.text("workbench.settings-memory.loading") : readFailed ? unread : !data ? ""
        : globalThis.t.text("workbench.settings-memory.shown-page") + " " + data.items.length + " · " + globalThis.t.text(data.exhausted ? "workbench.settings-memory.search-complete" : "workbench.settings-memory.search-not-finished-continue-check-more-memories");
    }

    function paintSummary() {
      const parts = [data.total.kind === "exact"
        ? globalThis.t.text(scope === "project" ? "workbench.settings-memory.project-count" : "workbench.settings-memory.personal-count", { count: data.total.value })
        : globalThis.t.text(scope === "project" ? "workbench.settings-memory.project-memory" : "workbench.settings-memory.personal-memories") + " · " + globalThis.t.text("workbench.settings-memory.total-unknown")];
      if (data.candidates?.length) parts.push(data.candidates.length + " " + globalThis.t.text("workbench.settings-memory.waiting-2"));
      part("summary").textContent = parts.join(" · ");
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
          : globalThis.t.text(CHANGE[change.kind] || change.kind) + (change.text ? "「" + change.text + "」" : change.moved_to ? " · " + globalThis.t.text(change.moved_to === "personal" ? "workbench.settings-memory.moved-to-personal" : "workbench.settings-memory.moved-to-project")
            : change.memory_id && change.kind !== "removed" ? " · " + globalThis.t.text("workbench.settings-memory.since-deleted-its-text-not-kept") : "");
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
      paintSelection();
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

    const { textEditor, classificationText, expiryText, renewalEditor, itemEditor, historyPanel } = (${MEMORY_EDITORS_CLIENT_SCRIPT})({
      L, el, button, paint, run, ask, fail, api, mutation, day, appliesText, CLASS, KIND, FORMAL_KIND, sessionMode, params,
      scope: () => scope, busy: () => busy, reader: () => reader, removing: () => removing });

    function paintSessionResults(items) {
      const list = part("batch-results"); list.replaceChildren(); list.hidden = !items.length;
      const states = { completed: "workbench.settings-memory.done", "already-absent": "workbench.settings-memory.removed", conflict: "workbench.settings-memory.version-conflicts", "not-executed": "workbench.settings-memory.not-run-yet", unknown: "workbench.settings-memory.outcome-unknown" };
      for (const [index, item] of items.entries()) {
        const row = el("li", "settings-muted", globalThis.t.text("workbench.settings-memory.version") + " " + (index + 1) + " " + globalThis.t.text("workbench.settings-memory.items") + " · " + globalThis.t.text(item.kind === "memory-candidate" ? "workbench.settings-memory.pending-candidate" : "workbench.settings-memory.saved-memory")
          + " · " + globalThis.t.text(states[item.outcome]) + " · " + globalThis.t.text(item.forgetting === "accepted" ? "workbench.settings-memory.forgetting-accepted" : "workbench.settings-memory.forgetting-not-accepted") + " · " + globalThis.t.text(item.cleanup === "complete" ? "workbench.settings-memory.cleanup-complete" : item.cleanup === "pending" ? "workbench.settings-memory.cleanup-pending" : "workbench.settings-memory.needs-checking"));
        row.dataset.memorySessionItem = item.kind + ":" + (item.kind === "memory-candidate" ? item.candidate_id : item.memory_id); list.append(row);
      }
    }
    function paintBatchResults(items) {
      batchPositions.clear(); items.forEach((item, index) => batchPositions.set(item.memory_id, index + 1));
      const list = part("batch-results"); list.replaceChildren(); list.hidden = !items.length;
      const states = { completed: "workbench.settings-memory.done", "already-absent": "workbench.settings-memory.removed", conflict: "workbench.settings-memory.version-conflicts", "not-executed": "workbench.settings-memory.not-run-yet", unknown: "workbench.settings-memory.outcome-unknown" };
      for (const [index, item] of items.entries()) list.append(el("li", "settings-muted", globalThis.t.text("workbench.settings-memory.version") + " " + (index + 1) + " " + globalThis.t.text("workbench.settings-memory.items") + " · " + globalThis.t.text(states[item.outcome] || "workbench.settings-memory.needs-checking")
        + (item.cleanup === "needs-reconcile" ? " · " + globalThis.t.text("workbench.settings-memory.needs-checking") : "")));
    }
    function paintSelection() {
      part("batch").hidden = sessionMode || !selected.size && !data?.items?.length;
      part("selection-reset").disabled = !selected.size || busy;
      part("selected").textContent = globalThis.t.text("workbench.settings-memory.selected") + " " + selected.size;
      root.querySelectorAll("[data-memory-selection-index]").forEach(node => {
        const id = node.closest("[data-memory-id]").dataset.memoryId;
        const index = selected.has(id) ? [...selected.keys()].indexOf(id) + 1 : batchPositions.get(id);
        node.hidden = !index; node.textContent = index ? globalThis.t.text("workbench.settings-memory.version") + " " + index + " " + globalThis.t.text("workbench.settings-memory.items") : "";
      });
      root.querySelectorAll("[data-memory-batch-action]").forEach(node => { node.disabled = !selected.size || busy || reading; });
    }
    part("selection-reset").addEventListener("click", () => { selected.clear(); paintItems(); });
    root.querySelectorAll("[data-memory-batch-action]").forEach(node => node.addEventListener("click", () => run(async () => {
      const action = node.dataset.memoryBatchAction;
      const preview = await api("/batch/preview", { scope, action, items: [...selected].map(([memory_id, expected_version]) => ({ memory_id, expected_version })) });
      if (!await ask(globalThis.t.text(action === "remove" ? "workbench.settings-memory.forget-selected-memories" : "workbench.settings-memory.disable-selected-memories"), globalThis.t.text(action === "remove" ? "workbench.settings-memory.forget-count-not-used-again" : "workbench.settings-memory.switch-off-count-until-on-again", { count: preview.count }), globalThis.t.text(action === "remove" ? "workbench.settings-memory.forget" : "workbench.settings-memory.switch-off"))) return;
      const command = Object.freeze({ id: "memory-batch:" + preview.preview_id, path: "/batch/apply", body: JSON.stringify({ preview_id: preview.preview_id }),
        title: globalThis.t.text(action === "remove" ? "workbench.settings-memory.forget-selected-2" : "workbench.settings-memory.disable-selected-2"), removal: action === "remove" });
      batchPositions.clear(); [...selected.keys()].forEach((id, index) => batchPositions.set(id, index + 1));
      selected.clear(); paintSelection(); await dispatch(command);
    })));

    function paintItems() {
      const list = $("[data-memory-list]");
      list.replaceChildren(); paintSelection();
      // A project's page also holds the memories of the Characters working in it: each labelled with its Character.
      const mine = (item) => item.scope === scope || (scope === "project" && item.scope === "character");
      const items = (data.items || []).filter(mine);
      if (!items.length) {
        list.append(el("li", "memory-empty settings-muted", globalThis.t.text(data.exhausted ? "workbench.settings-memory.no-memories-match" : "workbench.settings-memory.search-not-finished-continue-check-more-memories")));
        return;
      }
      items.forEach((item) => {
        const row = el("li", "memory-row" + (item.state !== "active" ? " is-off" : "")), submit = mutation();
        const change = values => submit("/change", { ...values, memory_id: item.memory_id, expected_version: item.version });
        row.dataset.memoryId = item.memory_id;
        const choice = el("input", ""); choice.type = "checkbox"; choice.dataset.memorySelect = ""; choice.hidden = sessionMode;
        choice.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.select-memory") + "：" + item.text); choice.checked = selected.has(item.memory_id);
        choice.addEventListener("change", () => {
          if (choice.checked && selected.size >= 100) { choice.checked = false; fail(new Error(globalThis.t.text("workbench.settings-memory.select-up-100-memories-time"))); return; }
          if (choice.checked) selected.set(item.memory_id, item.version); else selected.delete(item.memory_id);
          paintSelection();
        });
        const copy = el("div", "memory-row-copy"), heading = el("label", "memory-toolbar");
        const position = el("span", "settings-muted"); position.dataset.memorySelectionIndex = ""; position.hidden = true;
        heading.append(choice, position, el("strong", "memory-text", item.text)); copy.append(heading);
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", globalThis.t.text(FORMAL_KIND[item.kind] || item.kind)));
        meta.append(el("span", "memory-tag", classificationText(item.classification)));
        meta.append(el("span", "", globalThis.t.text("workbench.settings-memory.valid-until") + "：" + expiryText(item.expires_at)));
        if (item.expired) meta.append(el("span", "memory-tag memory-tag--state", globalThis.t.text("workbench.settings-memory.expired-2")));
        if (item.scope === "character") meta.append(el("span", "memory-tag memory-tag--character", globalThis.t.text("workbench.settings-memory.role") + "「" + (item.character_title || item.character_id) + "」"));
        if (item.plugin_id) meta.append(el("span", "memory-tag", globalThis.t.text("workbench.settings-memory.plugins") + " " + item.plugin_id));
        meta.append(el("span", "memory-tag memory-tag--" + item.source, globalThis.t.text(SOURCE[item.source] || item.source) + " " + day(item.created_at)));
        if (item.state !== "active") { const status = el("span", "memory-tag memory-tag--state", globalThis.t.text(STATE[item.state]) + (item.state_reason ? " · " + item.state_reason : "")); status.dataset.mwState = item.state; meta.append(status); }
        meta.append(el("span", "", globalThis.t.text("workbench.settings-memory.applies") + "：" + appliesText(item.applies, item.scope, item.classification)));
        meta.append(el("span", "", item.last_used ? globalThis.t.text("workbench.settings-memory.last-referenced-turn") + "：" + item.last_used.title + " · " + day(item.last_used.at) : globalThis.t.text("workbench.settings-memory.no-confirmed-reference")));
        copy.append(meta);
        const origin = el("details", "memory-origin"); origin.append(el("summary", "", globalThis.t.text("workbench.settings-memory.provenance")), el("p", "", item.origin));
        copy.append(origin);
        const actions = el("div", "memory-actions");
        const edit = button(globalThis.t.text("workbench.settings-memory.edit"), "mw-btn--ghost", globalThis.t.text("workbench.settings-memory.edit") + "：" + item.text);
        edit.addEventListener("click", () => {
          const editor = itemEditor(item, change);
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
          if (item.scope === "personal" && !project) { moveIntoProject(item, summary); return; }
          run(() => change({ action: "move", to: item.scope === "project" ? "personal" : "project" }), "workbench.settings-memory.moved-2");
        });
        if (item.expired && item.expires_at && item.classification?.lifecycle !== "session") menuItem(globalThis.t.text("workbench.settings-memory.renew-expiry"), () => {
          const editor = renewalEditor(item, change); copy.replaceChildren(editor); editor.querySelector("input").focus();
        });
        menuItem(globalThis.t.text("workbench.settings-memory.history"), () => historyPanel(item, copy));
        if (item.scope === "project" && project) menuItem(globalThis.t.text("workbench.settings-memory.promote-project-guidance"), async () => {
          try {
            const prefix = "/projects/" + encodeURIComponent(project);
            const draft = await molisWorkRequest(prefix + "/api/contextual/draft-reference/issue", { body: { purpose: "project-guidance", text: JSON.stringify([item.memory_id, item.version]) } });
            window.location.assign(prefix + "/settings/guidance?draft_ref=" + encodeURIComponent(draft.reference));
          } catch (failure) { fail(failure); }
        });
        menuItem(globalThis.t.text("workbench.settings-memory.delete"), async () => {
          if (await ask(globalThis.t.text("workbench.settings-memory.delete-memory"), globalThis.t.text("workbench.settings-memory.nothing-will-use-text-anywhere-once-deleted-its", { text: item.text }), globalThis.t.text("workbench.settings-memory.delete"), summary)) {
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

    const paintClasses = sessionMode ? () => {} : (${MEMORY_CLASS_SETTINGS_CLIENT_SCRIPT})(L, part, el, button, () => data?.prefs, async rows => {
      // Keep the accepted prefs even when the following list refresh fails.
      data.prefs = (await api("/prefs", { scope, prefs: { class_restrictions: rows } })).prefs;
      await load().catch(fail);
    });

    function paintPrefs() {
      paintClasses();
      const prefs = (data.prefs) || {};
      root.querySelectorAll("[data-memory-pref]").forEach((box) => {
        const path = box.dataset.memoryPref.split(".");
        const value = path.length === 2 ? (prefs[path[0]] || {})[path[1]] : prefs[path[0]];
        box.checked = Boolean(value);
        box.disabled = false;
      });
      // "Remember when I ask" has no switch of its own: it follows "Allow remembering", so say so when that is off.
      const askRow = root.querySelector("[data-memory-pref-ask]");
      if (askRow) {
        askRow.setAttribute("aria-disabled", String(!prefs.form));
        askRow.classList.toggle("is-off", !prefs.form);
        askRow.querySelector("[data-memory-pref-ask-value]").textContent = globalThis.t.text(prefs.form ? "workbench.settings-memory.always" : "workbench.settings-memory.not-in-effect");
        askRow.querySelector("[data-memory-pref-ask-copy]").textContent = globalThis.t.text(prefs.form ? "workbench.settings-memory.when-say-now-remember-kept-once-told-where" : "workbench.settings-memory.allow-remembering-off-ask-keeps-nothing");
      }
    }

    function paintPairs() {
      const list = $("[data-memory-pairs]"), pairs = data.pairs || [];
      $("[data-memory-pairs-section]").hidden = false;
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
      paintSummary(); if (!sessionMode) { paintChanges(); paintPairs(); paintPrefs(); paintUpkeep(); } paintCandidates(); paintItems(); paintNavigation();
      $("[data-memory-new]").hidden = true;
    }

    root.querySelectorAll("[data-memory-filter]").forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => {
      filters[control.dataset.memoryFilter] = control.value; selected.clear(); void readPage(undefined, []);
    }));
    part("pairs-read").addEventListener("click", () => { void readPairs().catch(fail); });
    part("next").addEventListener("click", () => { if (!reading && data?.cursor) void readPage(data.cursor, [...previous, currentCursor]); });
    part("previous").addEventListener("click", () => { if (!reading && previous.length) void readPage(previous.at(-1), previous.slice(0, -1)); });
    part("reload").addEventListener("click", () => { void (sessionMode ? load() : readPage(undefined, [])); });
    window.addEventListener("pagehide", invalidateRead);
    window.addEventListener("pageshow", event => { if (event.persisted && root.isConnected) void load().catch(fail); });
    new MutationObserver((_, observer) => { if (!root.isConnected) { invalidateRead(); observer.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
    $("[data-memory-add]").addEventListener("click", () => {
      const slot = $("[data-memory-new]"), write = mutation();
      const editor = itemEditor(null, (value) => write("/items", { scope, text: value.text, kind: value.kind, applies: value.applies, ...(value.classification ? { classification: value.classification, expires_at: value.expires_at } : {}) }));
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
      clearButton.textContent = globalThis.t.text(sessionMode ? clearPreview ? "workbench.settings-memory.retry-cleanup" : "workbench.settings-memory.clear-3" : clearPreview ? "workbench.settings-memory.retry-clear" : "workbench.settings-memory.clear"); resetClear.hidden = !clearPreview;
    };
    const showClearResult = (done, fingerprint) => {
      clearPreview = done.complete ? null : { fingerprint };
      if (done.complete) {
        showClear(globalThis.t.text("workbench.settings-memory.clear-done-count", { count: done.removed }));
        toast(clearStatus.textContent);
      } else {
        const count = (outcome) => done.items.filter((item) => item.outcome === outcome).length;
        showClear(globalThis.t.text("workbench.settings-memory.clear-incomplete-retrying-only-handles-confirmed-memories") + " · " + globalThis.t.text("workbench.settings-memory.deleted") + " " + done.removed
          + " · " + globalThis.t.text("workbench.settings-memory.version-conflicts") + " " + count("conflict") + " · " + globalThis.t.text("workbench.settings-memory.outcome-unknown") + " " + count("unknown") + " · " + globalThis.t.text("workbench.settings-memory.not-run-yet") + " " + count("not-executed"));
      }
    };
    clearButton.addEventListener("click", () => run(async () => {
      if (sessionMode) {
        if (!clearPreview) {
          const preview = await api("/clear/preview", {});
          if (!preview.preview_id || !(preview.memory_count + preview.candidate_count)) { toast(globalThis.t.text("workbench.settings-memory.session-has-no-memories-yet")); return; }
          // Say how many before anything goes: what this session learned (kept or still waiting), and that nothing else is touched.
          if (!await ask(globalThis.t.text("workbench.settings-memory.clear-session-s-memory"), globalThis.t.text("workbench.settings-memory.will-clear-memories-and-suggestions", { memories: preview.memory_count, candidates: preview.candidate_count }), globalThis.t.text("workbench.settings-memory.confirm-clearing"), clearButton)) return;
          clearPreview = preview;
        }
        await dispatch(Object.freeze({ id: "memory-session-clear:" + clearPreview.preview_id, path: "/clear/apply", body: JSON.stringify({ preview_id: clearPreview.preview_id }), title: globalThis.t.text("workbench.settings-memory.clear-session-memory"), removal: true })); return;
      }
      if (!clearPreview) {
        const preview = await api("/preview", { scope });
        if (!preview.count) { toast(globalThis.t.text("workbench.settings-memory.no-memories-clear")); return; }
        if (!await ask(globalThis.t.text("workbench.settings-memory.clear-these-memories"), globalThis.t.text("workbench.settings-memory.will-delete-count-count-once-deleted-they-never", { count: preview.count }), globalThis.t.text("workbench.settings-memory.clear-2"), clearButton)) return;
        clearPreview = preview;
      }
      showClear(globalThis.t.text("workbench.settings-memory.clear-incomplete-retrying-only-handles-confirmed-memories"));
      await dispatch(Object.freeze({ id: "memory-clear:" + clearPreview.fingerprint, path: "/clear",
        body: JSON.stringify({ scope, fingerprint: clearPreview.fingerprint }), title: globalThis.t.text("workbench.settings-memory.clear-memories"), removal: true }));
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
  globalThis.molisWorkBindMemorySettings = (container = document, context = null) => {
    if (container.matches?.("[data-memory-settings]")) bind(container, context);
    else container.querySelectorAll?.("[data-memory-settings]").forEach(node => bind(node, context));
  };
  const start = () => document.querySelectorAll("[data-memory-settings]").forEach(node => bind(node));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
`;
