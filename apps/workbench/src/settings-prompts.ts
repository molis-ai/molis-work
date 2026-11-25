import { renderObjectRow, renderSettingsSection, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AgentDisplayModel } from "./settings-view.js";
import { scriptJson } from "./plugin-directory.js";
/**
 * “Prompt 与 Character”: every prompt and role the Host registers — the system's, and each Plugin's — with the
 * person's edits. Editing changes the words a model reads from its next run on; it never changes what a role may do.
 */
export function renderPromptSettings({ displayModel }: { readText(text: string): string; displayModel?: AgentDisplayModel }): string {
  return `<section class="settings-document prompt-settings" aria-labelledby="settings-title" data-prompt-settings>
    <script type="application/json" data-agent-display-model="prompts">${scriptJson(displayModel ?? {})}</script>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-prompts.prompts")}</h1></div>
      <p>${uiText("workbench.settings-prompts.instructions-system-plugins-give-model-characters-made-some")}</p></header>
    <p class="prompt-settings-notice" role="note">${uiText("workbench.settings-prompts.editing-these-texts-never-changes-any-permission-which")}</p>
    <div class="prompt-settings-tools">
      <div class="mw-toggle-group settings-segmented" role="group" aria-label="${uiText("workbench.settings-prompts.filter")}">
        <button class="mw-toggle" type="button" data-prompt-filter="all" aria-pressed="true">${uiText("workbench.settings-prompts.all")}</button>
        <button class="mw-toggle" type="button" data-prompt-filter="edited" aria-pressed="false">${uiText("workbench.settings-prompts.edited")}</button>
        <button class="mw-toggle" type="button" data-prompt-filter="updated" aria-pressed="false">${uiText("workbench.settings-prompts.default-updated")}</button>
      </div>
      <input class="mw-input prompt-settings-search" type="search" data-prompt-search placeholder="${uiText("workbench.settings-prompts.search-name-purpose-text")}" aria-label="${uiText("workbench.settings-prompts.search-prompts")}">
    </div>
    <div class="prompt-settings-body" data-prompt-body aria-live="polite"><p class="settings-muted mw-loading">${uiText("workbench.settings-prompts.loading")}</p></div>
    ${renderSettingsSection({ body: renderObjectRow({ name: uiText.text("workbench.settings-prompts.developer-diagnostics"), hint: uiText.text("workbench.settings-prompts.what-each-source-registered-what-not-effect-why"),
      attrs: { id: "diagnostics", "data-prompt-diagnostics": true },
      body: `<div data-prompt-diagnostics-body><p class="mw-settings-section__note mw-loading">${uiText("workbench.settings-prompts.loading")}</p></div>` }) })}
  </section>`;
}

/** Runs on the settings page only when the section is on show. No template interpolation inside. */
export const PROMPT_SETTINGS_CLIENT_SCRIPT = String.raw`
globalThis.molisWorkBindPromptSettings = (container = document, context = null) => {
  const root = container.matches?.("[data-prompt-settings]") ? container : container.querySelector?.("[data-prompt-settings]");
  if (!root || root.dataset.promptBound) return;
  root.dataset.promptBound = "1";
  // The settings cover passes the address it loaded; the page itself reads its own.
  const address = context || { search: location.search, hash: location.hash };
  const readText = globalThis.t.text;
  const body = root.querySelector("[data-prompt-body]");
  const search = root.querySelector("[data-prompt-search]");
  let prompts = [], roles = [], filter = "all", open = null;
  // A role is made of its prompts: “?role=” (from Settings › 角色) shows just the ones that make it up.
  let focusRole = new URLSearchParams(address.search || "").get("role");
  const focusedRole = () => focusRole ? roles.find((role) => role.key === focusRole) : undefined;
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  let displayJson = "", displayModel = {};
  const display = (kind, record, field) => {
    const json = root.querySelector("script[data-agent-display-model]")?.textContent || "{}";
    if (json !== displayJson) { displayJson = json; displayModel = JSON.parse(json); }
    const owner = displayModel[record.owner_id], row = owner?.[kind][kind === "roles" ? record.role_id : record.prompt_id];
    return owner && row && row.version === (kind === "roles" ? record.version : record.default_version) && JSON.stringify(owner.source) === JSON.stringify(record.source) ? row[field] : record[field];
  };
  const bindDisplay = (node, kind, record) => {
    Object.assign(node.dataset, { agentDisplayOwner: record.owner_id, agentDisplayKind: kind, agentDisplayId: kind === "roles" ? record.role_id : record.prompt_id,
      agentDisplayVersion: String(kind === "roles" ? record.version : record.default_version), agentDisplaySource: JSON.stringify(record.source) });
    return node;
  };
  const displayField = (tag, className, kind, record, field) => {
    const node = el(tag, className, display(kind, record, field)); node.translate = false; node.dataset.agentDisplayField = field; return node;
  };
  const api = (path, payload) => molisWorkRequest("/api/agent-definitions" + path, { body: payload });
  const problem = (failure) => { const note = el("p", "settings-form-error"); molisWorkRequest.show(note, failure); return note; };
  const toast = (text) => { const node = document.querySelector("[data-settings-toast]") || document.querySelector(".toast"); if (!node) return; node.textContent = text; node.classList.add("is-visible"); setTimeout(() => node.classList.remove("is-visible"), 2400); };
  const KIND = { agent: "workbench.settings-prompts.role-part", instruction: "workbench.settings-prompts.model-call-instructions" };
  const LAYER = { base: "workbench.settings-prompts.product-rules", role: "workbench.settings-prompts.role", project: "workbench.settings-prompts.project", task: "workbench.settings-prompts.task" };
  const EXECUTION = { "read-only": "workbench.settings-prompts.read-only", "text-edit": "workbench.settings-prompts.can-edit-text", "workspace-write": "workbench.settings-prompts.can-edit-files-run-commands", operate: "workbench.settings-prompts.can-use-business-capabilities" };
  const short = (signature) => String(signature).replace(/^ed25519:sha256:/, "").slice(0, 12);
  const signedVersion = (ref) => ref ? ref.source.plugin_id + " · " + ref.source.plugin_version + (ref.source.publisher_signature ? " · " + short(ref.source.publisher_signature) : "") : "";
  const sourceTitle = (source) => source.kind === "system" ? globalThis.t.text("workbench.settings-prompts.system") + " · " + source.title : globalThis.t.text("workbench.settings-prompts.plugin") + " · " + source.title + (source.plugin_version ? " " + source.plugin_version : "")
    + (source.publisher_signature ? " · " + short(source.publisher_signature) : "")
    + (source.state === "disabled" ? " · " + globalThis.t.text("workbench.settings-prompts.disabled-not-called-now") : "");
  const matches = (prompt) => {
    const role = focusedRole();
    if (role && !role.prompt_keys.includes(prompt.key)) return false;
    if (filter === "edited" && prompt.effective !== "user") return false;
    if (filter === "updated" && !prompt.default_updated) return false;
    const query = String(search.value || "").trim().toLowerCase();
    return !query || [display("prompts", prompt, "title"), display("prompts", prompt, "purpose"), prompt.prompt_id, prompt.body, prompt.used_by.join(" ")].some((text) => String(text).toLowerCase().includes(query));
  };
  const isProtected = (prompt) => prompt?.override_policy === "protected";
  const stateBadge = (prompt) => {
    const protectedPrompt = isProtected(prompt);
    const badge = el("span", "prompt-state prompt-state--" + (protectedPrompt ? "protected" : prompt.default_updated ? "updated" : prompt.effective));
    badge.textContent = protectedPrompt ? globalThis.t.text("workbench.settings-prompts.protected") : prompt.default_updated ? globalThis.t.text("workbench.settings-prompts.version-default-updated") : prompt.effective === "user" ? globalThis.t.text("workbench.settings-prompts.version") : globalThis.t.text("workbench.settings-prompts.default");
    return badge;
  };
  const editor = (prompt, onProtected) => {
    const box = el("div", "prompt-editor");
    let locked = isProtected(prompt);
    const label = el("label", "mw-field");
    label.append(el("span", "mw-field__label", globalThis.t.text("workbench.settings-prompts.guidance-label")));
    const area = el("textarea", "mw-textarea prompt-editor-text");
    area.value = prompt.body;
    area.rows = Math.min(20, Math.max(6, prompt.body.split("\n").length + 1));
    area.setAttribute("aria-label", globalThis.t.text(locked ? "workbench.settings-prompts.view-prompt-title" : "workbench.settings-prompts.edit-prompt-title", { title: display("prompts", prompt, "title") }));
    area.maxLength = 20000;
    area.dataset.agentDisplayField = "title";
    area.dataset.agentDisplayAttribute = locked ? "view-label" : "edit-label";
    area.dataset.promptSimplified = "true";
    area.readOnly = true;
    area.setAttribute("aria-busy", "true");
    label.append(area);
    const protectedNote = el("p", "settings-muted prompt-editor-protected-note", globalThis.t.text("workbench.settings-prompts.protected-note"));
    protectedNote.dataset.promptProtected = "true";
    protectedNote.hidden = !locked;
    const lockSlot = el("div", "prompt-editor-lock-slot");
    const count = el("span", "settings-muted prompt-editor-count");
    const syncCount = () => { count.textContent = area.value.length + " / 20000"; };
    let dirty = false;
    area.addEventListener("input", () => { dirty = true; syncCount(); });
    syncCount();
    let editorInfo = null;
    let simplifiedActive = false;
    let cachedDetail = null;
    const actions = el("div", "prompt-editor-actions");
    const save = el("button", "mw-btn mw-btn--primary mw-btn--sm", globalThis.t.text("workbench.settings-prompts.save-my-version"));
    save.type = "button";
    save.disabled = true;
    const cancel = el("button", "mw-btn mw-btn--secondary mw-btn--sm", globalThis.t.text("common.control.cancel"));
    cancel.type = "button";
    const reset = el("button", "mw-btn mw-btn--ghost mw-btn--sm", globalThis.t.text("workbench.settings-prompts.restore-default"));
    reset.type = "button";
    reset.hidden = locked || prompt.effective !== "user";
    const error = el("p", "settings-form-error");
    error.setAttribute("role", "alert");
    error.hidden = true;
    const run = async (button, work) => {
      button.disabled = true;
      error.hidden = true;
      try {
        const result = await work();
        const index = prompts.findIndex((row) => row.key === result.prompt.key);
        if (index >= 0) prompts[index] = result.prompt;
        open = result.prompt.key;
        paint();
        toast(globalThis.t.text("workbench.settings-prompts.saved-takes-effect-next-turn"));
      } catch (failure) {
        molisWorkRequest.show(error, failure);
        error.hidden = false;
      } finally {
        button.disabled = false;
      }
    };
    save.addEventListener("click", () => {
      if (locked) return;
      if (!area.value.trim()) {
        error.textContent = globalThis.t.text("workbench.settings-prompts.prompt-cannot-be-empty-use-restore-default-go");
        error.hidden = false;
        return;
      }
      const payload = simplifiedActive && editorInfo && editorInfo.locked_format
        ? { mode: "simplified", guidance: area.value, expected_revision: prompt.user ? prompt.user.revision : null }
        : { body: area.value, expected_revision: prompt.user ? prompt.user.revision : null };
      run(save, () => api("/prompt?key=" + encodeURIComponent(prompt.key), payload));
    });
    reset.addEventListener("click", () => { if (!locked) run(reset, () => api("/prompt/reset?key=" + encodeURIComponent(prompt.key), { expected_revision: prompt.user ? prompt.user.revision : null })); });
    cancel.addEventListener("click", () => { open = null; paint(); });
    actions.append(save, cancel, reset, count);
    const advSlot = el("div", "prompt-editor-advanced-slot");
    const applyProtected = () => {
      locked = true;
      area.readOnly = true;
      area.removeAttribute("aria-busy");
      area.dataset.agentDisplayAttribute = "view-label";
      area.setAttribute("aria-label", globalThis.t.text("workbench.settings-prompts.view-prompt-title", { title: display("prompts", prompt, "title") }));
      protectedNote.hidden = false;
      save.hidden = true;
      save.disabled = true;
      reset.hidden = true;
      advSlot.replaceChildren();
      if (prompt.override_policy !== "protected") {
        prompt.override_policy = "protected";
        onProtected?.();
      }
    };
    if (locked) applyProtected();
    box.append(label, protectedNote, lockSlot, actions, error, advSlot);
    void api("/prompt?key=" + encodeURIComponent(prompt.key)).then((detail) => {
      if (!box.isConnected) return;
      cachedDetail = detail;
      if (isProtected(detail?.prompt) || locked) {
        if (detail?.prompt?.body !== undefined) {
          area.value = detail.prompt.body;
          syncCount();
        }
        applyProtected();
        return;
      }
      area.readOnly = false;
      area.removeAttribute("aria-busy");
      save.disabled = false;
      if (!detail?.editor) return;
      editorInfo = detail.editor;
      if (!editorInfo.locked_format) return;
      if (!dirty) {
        area.value = editorInfo.editable;
        area.rows = Math.min(14, Math.max(4, editorInfo.editable.split("\n").length + 1));
        syncCount();
        simplifiedActive = true;
      }
      const lock = el("div", "mw-facts");
      lock.dataset.promptLockedFormat = "true";
      lock.append(el("h4", "mw-facts__heading", globalThis.t.text("workbench.settings-prompts.locked-format-title")));
      const row = el("div", "mw-fact-row " + (editorInfo.format_intact ? "mw-fact-row--ok" : "mw-fact-row--warn"));
      const bodySpan = el("span", "mw-fact-row__body", globalThis.t.text(editorInfo.format_intact ? "workbench.settings-prompts.locked-format-intact" : "workbench.settings-prompts.locked-format-broken"));
      if (editorInfo.required_keys?.length) {
        bodySpan.append(el("small", "mw-fact-row__detail", globalThis.t.text("workbench.settings-prompts.locked-format-keys", { keys: editorInfo.required_keys.join(globalThis.t.text("common.list.separator")) })));
      }
      row.append(bodySpan);
      lock.append(row);
      lockSlot.replaceChildren(lock);
      const adv = el("details", "mw-collapsible");
      adv.dataset.slot = "collapsible";
      adv.dataset.promptAdvanced = "true";
      if (!editorInfo.format_intact) adv.open = true;
      adv.append(el("summary", "", globalThis.t.text("workbench.settings-prompts.advanced-full-edit")));
      const advBody = el("div", "mw-collapsible__body");
      const fullArea = el("textarea", "mw-textarea");
      fullArea.rows = Math.min(20, Math.max(6, prompt.body.split("\n").length + 1));
      fullArea.maxLength = 20000;
      fullArea.value = prompt.body;
      fullArea.dataset.promptFullText = "true";
      fullArea.setAttribute("aria-label", globalThis.t.text("workbench.settings-prompts.advanced-full-edit"));
      const saveFull = el("button", "mw-btn mw-btn--secondary mw-btn--sm", globalThis.t.text("workbench.settings-prompts.save-full-text"));
      saveFull.type = "button";
      saveFull.addEventListener("click", () => {
        if (!fullArea.value.trim()) {
          error.textContent = globalThis.t.text("workbench.settings-prompts.prompt-cannot-be-empty-use-restore-default-go");
          error.hidden = false;
          return;
        }
        run(saveFull, () => api("/prompt?key=" + encodeURIComponent(prompt.key), { mode: "full", body: fullArea.value, validate_format: true, expected_revision: prompt.user ? prompt.user.revision : null }));
      });
      advBody.append(fullArea, saveFull);
      adv.append(advBody);
      advSlot.replaceChildren(adv);
    }).catch((failure) => {
      if (!box.isConnected) return;
      area.removeAttribute("aria-busy");
      if (!locked) {
        area.readOnly = false;
        save.disabled = false;
      }
      molisWorkRequest.show(error, failure);
      error.hidden = false;
    });
    if (prompt.effective === "user") {
      // The shipped text stays readable beside the person's, so a newer default can be compared and taken over by hand.
      const shipped = el("details", "prompt-default");
      shipped.open = prompt.default_updated;
      shipped.append(el("summary", "", prompt.default_updated ? globalThis.t.text("workbench.settings-prompts.default-updated-version", { version: prompt.default_ref ? signedVersion(prompt.default_ref) : prompt.default_version }) + " · " + globalThis.t.text("workbench.settings-prompts.view-new-default") : globalThis.t.text("workbench.settings-prompts.view-default-text")));
      shipped.append(el("pre", "prompt-default-text", prompt.default_body));
      box.append(shipped);
    }
    const history = el("details", "prompt-history");
    history.append(el("summary", "", globalThis.t.text("workbench.settings-prompts.history")));
    history.addEventListener("toggle", async () => {
      if (!history.open || history.dataset.loaded) return;
      history.dataset.loaded = "1";
      try {
        const data = cachedDetail ?? await api("/prompt?key=" + encodeURIComponent(prompt.key));
        const list = el("ul", "prompt-history-list");
        if (!data.history.length) list.append(el("li", "settings-muted", globalThis.t.text("workbench.settings-prompts.not-edited-yet")));
        data.history.forEach((row) => list.append(el("li", "", "#" + row.revision + " · " + (row.action === "reset" ? globalThis.t.text("workbench.settings-prompts.restore-default") : globalThis.t.text("common.control.save")) + " · " + globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: row.at, style: "datetime-with-seconds" } }) + (row.default_ref ? " · " + signedVersion(row.default_ref) : ""))));
        if (data.uses.length) list.append(el("li", "settings-muted", globalThis.t.text("workbench.settings-prompts.last-used", { at: globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: data.uses[0].at, style: "datetime-with-seconds" } }) }) + " · " + (data.uses[0].user_revision ? globalThis.t.text("workbench.settings-prompts.version-revision", { revision: data.uses[0].user_revision }) : globalThis.t.text("workbench.settings-prompts.default")) + (data.uses[0].source_ref ? " · " + signedVersion(data.uses[0].source_ref) : "")));
        history.append(list);
      } catch (failure) { history.append(problem(failure)); }
    });
    box.append(history);
    return box;
  };
  const promptRow = (prompt) => {
    const row = bindDisplay(el("li", "prompt-row"), "prompts", prompt);
    row.dataset.key = prompt.key;
    const head = el("div", "prompt-row-head");
    const copy = el("div", "prompt-row-copy");
    copy.append(displayField("strong", "", "prompts", prompt, "title"), displayField("span", "settings-muted", "prompts", prompt, "purpose"));
    const meta = el("div", "prompt-row-meta");
    let badge = stateBadge(prompt);
    meta.append(el("span", "prompt-tag", globalThis.t.text(prompt.kind === "agent" && prompt.layer ? LAYER[prompt.layer] || prompt.layer : KIND[prompt.kind] || prompt.kind)),
      el("span", "prompt-tag", globalThis.t.text("workbench.settings-prompts.version-2", { version: prompt.default_ref ? signedVersion(prompt.default_ref) : prompt.default_version })), badge);
    const edit = el("button", "mw-btn mw-btn--secondary mw-btn--sm", open === prompt.key ? globalThis.t.text("workbench.settings-prompts.collapse") : globalThis.t.text(isProtected(prompt) ? "workbench.settings-prompts.view" : "workbench.settings-prompts.view-edit")); edit.type = "button";
    edit.setAttribute("aria-expanded", String(open === prompt.key));
    edit.addEventListener("click", () => { open = open === prompt.key ? null : prompt.key; paint(); });
    head.append(copy, meta, edit);
    row.append(head);
    const syncRowProtected = () => {
      const nextBadge = stateBadge(prompt);
      badge.replaceWith(nextBadge);
      badge = nextBadge;
      if (open !== prompt.key) edit.textContent = globalThis.t.text("workbench.settings-prompts.view");
    };
    if (open === prompt.key) row.append(editor(prompt, syncRowProtected));
    return row;
  };
  function paint() {
    const owners = new Map();
    prompts.filter(matches).forEach((prompt) => { if (!owners.has(prompt.owner_id)) owners.set(prompt.owner_id, { source: prompt.source, prompts: [] }); owners.get(prompt.owner_id).prompts.push(prompt); });
    const focused = document.activeElement && root.contains(document.activeElement) ? document.activeElement.closest("[data-key]")?.dataset.key : null;
    body.replaceChildren();
    const role = focusedRole();
    if (role) {
      const banner = el("div", "prompt-role-focus");
      const copy = bindDisplay(el("div", "prompt-role-focus-copy"), "roles", role);
      copy.append(displayField("strong", "", "roles", role, "name"), el("p", "", globalThis.t.text("workbench.settings-prompts.character-made-prompts-below-given-model-order-changes")));
      banner.append(copy);
      // The way back to where the role was chosen: Settings › 角色.
      const back = el("a", "mw-btn mw-btn--secondary mw-btn--sm", globalThis.t.text("workbench.settings-prompts.back-characters"));
      const project = new URLSearchParams(address.search || "").get("project");
      back.href = "/settings/characters" + (project ? "?project=" + encodeURIComponent(project) : "");
      banner.append(back);
      const all = el("button", "mw-btn mw-btn--ghost mw-btn--sm", globalThis.t.text("workbench.settings-prompts.show-all-prompts")); all.type = "button";
      all.addEventListener("click", () => { focusRole = null; if (!context) { const next = new URL(location.href); next.searchParams.delete("role"); history.replaceState(history.state, "", next); } paint(); });
      banner.append(all);
      body.append(banner);
    }
    if (!owners.size) { body.append(el("p", "settings-muted", filter === "all" ? globalThis.t.text("workbench.settings-prompts.no-matching-prompts") : globalThis.t.text("workbench.settings-prompts.no-prompts-match-filter"))); return; }
    owners.forEach((group, ownerId) => {
      const section = el("section", "settings-section prompt-group");
      section.append(el("h2", "prompt-group-title", sourceTitle(group.source)));
      // The main line carries the short fingerprint (no publisher display name exists in the contract); the full signature is one expand away, copyable.
      const signature = group.source.kind === "plugin" ? group.source.publisher_signature : undefined;
      if (signature) {
        const identity = el("details", "settings-data-disclosure prompt-source-identity");
        const head = el("span", "setting-copy");
        head.append(el("strong", "", globalThis.t.text("workbench.settings-prompts.publisher-identity")), el("span", "", globalThis.t.text("workbench.settings-prompts.see-copy-full-signature")));
        const summary = el("summary", "");
        summary.append(head);
        summary.insertAdjacentHTML("beforeend", '<svg aria-hidden="true"><use href="#icon-chevron-down"></use></svg>');
        identity.append(summary);
        const facts = el("dl", "settings-data-list");
        const line = el("div");
        const value = el("dd", "", signature);
        const copy = el("button", "mw-btn mw-btn--secondary mw-btn--sm", globalThis.t.text("common.control.copy"));
        copy.type = "button";
        copy.addEventListener("click", () => void window.molisCopy?.(copy, signature, { done: globalThis.t.text("workbench.settings-prompts.copied"), failed: globalThis.t.text("workbench.settings-prompts.could-not-copy") }));
        value.append(copy);
        line.append(el("dt", "", globalThis.t.text("workbench.settings-prompts.publisher-signature")), value);
        facts.append(line);
        identity.append(facts);
        section.append(identity);
      }
      const ownRoles = roles.filter((role) => role.owner_id === ownerId);
      if (ownRoles.length) {
        const list = el("ul", "prompt-roles");
        ownRoles.forEach((role) => {
          const item = el("li");
          const button = bindDisplay(el("button", "prompt-role"), "roles", role); button.type = "button";
          button.setAttribute("aria-pressed", String(focusRole === role.key));
          button.title = globalThis.t.text("workbench.settings-prompts.show-only-prompts-character-made");
          const name = el("strong", ""); name.append(displayField("span", "", "roles", role, "name"));
          if (role.subagent) name.append(" · ", el("span", "", globalThis.t.text("workbench.settings-prompts.sub-task")));
          button.append(name, el("span", "settings-muted", globalThis.t.text(EXECUTION[role.execution] || role.execution) + (role.edited ? " · " + globalThis.t.text("workbench.settings-prompts.includes-edits") : "")));
          button.addEventListener("click", () => { focusRole = focusRole === role.key ? null : role.key; paint(); });
          item.append(button);
          list.append(item);
        });
        section.append(el("p", "prompt-roles-label", globalThis.t.text("workbench.settings-prompts.role")), list);
      }
      const list = el("ul", "prompt-list");
      group.prompts.forEach((prompt) => list.append(promptRow(prompt)));
      section.append(list);
      body.append(section);
    });
    if (focused) root.querySelector('[data-key="' + CSS.escape(focused) + '"] button')?.focus();
  }
  // Developer diagnostics: read when opened, so the page itself stays one request per list.
  const diagnostics = root.querySelector("[data-prompt-diagnostics]");
  const diagnosticsBody = root.querySelector("[data-prompt-diagnostics-body]");
  const loadDiagnostics = async () => {
    if (diagnostics.dataset.loaded) return;
    diagnostics.dataset.loaded = "1";
    try {
      const data = await api("/diagnostics");
      const list = el("ul", "prompt-diagnostics-list");
      data.owners.forEach((owner) => {
        const item = el("li", "prompt-diagnostics-owner");
        const counts = [owner.prompts ? globalThis.t.text("workbench.settings-prompts.role-part", { n: owner.prompts }) : "", owner.instructions ? globalThis.t.text("workbench.settings-prompts.model-call-instructions", { n: owner.instructions }) : "",
          owner.roles ? globalThis.t.text("workbench.settings-prompts.character-part", { n: owner.roles }) : "", owner.edited ? globalThis.t.text("workbench.settings-prompts.edited-2", { n: owner.edited }) : ""].filter(Boolean).join(" · ");
        item.append(el("strong", "", sourceTitle(owner.source)), el("span", "settings-muted", counts || globalThis.t.text("workbench.settings-prompts.no-prompts-registered")));
        if (owner.issues.length) {
          const issues = el("ul", "prompt-diagnostics-issues");
          owner.issues.forEach((issue) => issues.append(el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--" + issue.level, issue.text)));
          item.append(issues);
        }
        list.append(item);
      });
      diagnosticsBody.replaceChildren(list);
    } catch (failure) { delete diagnostics.dataset.loaded; diagnosticsBody.replaceChildren(problem(failure)); }
  };
  // The row's own <details>: a toggle does not bubble, so it is listened for where it happens.
  const diagnosticsFold = diagnostics.querySelector("details");
  diagnosticsFold.addEventListener("toggle", () => { if (diagnosticsFold.open) loadDiagnostics(); });
  if (address.hash === "#diagnostics") { diagnosticsFold.open = true; loadDiagnostics(); requestAnimationFrame(() => diagnostics.scrollIntoView({ block: "start" })); }
  root.querySelectorAll("[data-prompt-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.promptFilter;
    root.querySelectorAll("[data-prompt-filter]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    paint();
  }));
  search.addEventListener("input", paint);
  Promise.all([api("/prompts"), api("/roles")]).then(([p, r]) => {
    prompts = p.prompts; roles = r.roles;
    // Arriving for one Character opens the prompt that is its own (the role layer), the one people mean to change.
    const role = focusedRole();
    if (role) open = prompts.find((prompt) => role.prompt_keys.includes(prompt.key) && prompt.layer === "role")?.key ?? role.prompt_keys[0] ?? null;
    paint();
  })
    .catch((failure) => { body.replaceChildren(problem(failure)); });
};
globalThis.molisWorkBindPromptSettings(document);
`;
