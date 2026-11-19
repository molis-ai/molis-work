import { t as uiText, renderButton, renderListToolbar, renderObjectRow, renderSettingRow, renderSettingsSection, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";

/** One "still tell me" exception of a rule being written: a switch whose label says which rule it belongs to (B27-AC01). */
const exceptRow = (kind: string, label: string, checked: boolean) => renderSettingRow({
  name: uiText.text(label), label: true, className: "mw-setting-row--sub",
  control: renderSwitch({ checked, attrs: { "data-assistant-rule-except": kind } }),
});

/**
 * “助理”: when the Assistant may draw attention, how much it may use, what it may use (its own grants, separate from Coding's and
 * external agents'), and what each plugin contributes for it — with the exact gaps a plugin's developer can close.
 *
 * Written like every settings page (specs/screen-polish/p5-settings.md): a title, then one card of rows, one control to a row.
 * A row that needs more than one choice opens in place under itself — the places a rule may name (POLISH-31), how long to pause,
 * the capabilities — and closes again; what is stored and how a rule is added are as they were.
 */
export function renderAssistantSettings({ projectId }: { readText(text: string): string; projectId: string | null }): string {
  const text = uiText.text;
  return `<section class="settings-document assistant-settings" aria-labelledby="settings-title" data-assistant-settings data-project="${projectId ? projectId.replace(/[^a-zA-Z0-9_.:-]/g, "") : ""}">
    <header class="settings-heading"><h1 id="settings-title">${uiText("workbench.settings-assistant.assistant")}</h1>
      <p>${uiText("workbench.settings-assistant.what-assistant-may-use-what-each-plugin-provides")}</p></header>
    ${renderSettingsSection({
      title: text("workbench.settings-assistant.attention-rules"), id: "assistant-rules-title", attrs: { "data-assistant-rules": true },
      body: `<div data-assistant-rules-list><p class="mw-settings-section__note">${uiText("workbench.settings-assistant.loading")}</p></div>
      <form data-assistant-rule-quiet>
        ${renderSettingRow({ name: text("workbench.settings-assistant.quiet-places"), hint: text("workbench.settings-assistant.quiet-places-hint"),
          fold: { label: text("workbench.settings-assistant.choose-places"), labelAttrs: { "data-assistant-places-label": true }, body: `<div class="mw-choice-group" role="group" aria-label="${uiText("workbench.settings-assistant.quiet-places")}" data-assistant-rule-surfaces></div>
          ${exceptRow("failed", "workbench.settings-assistant.still-notify-failed-here", true)}
          ${exceptRow("needs-decision", "workbench.settings-assistant.still-tell-me-when-i-need-decide", false)}
          ${exceptRow("reminder", "workbench.settings-assistant.still-tell-me-when-reminder-i-set-comes", true)}
          ${exceptRow("connection", "workbench.settings-assistant.still-tell-me-when-service-connection-needs-me", true)}
          <div class="mw-setting-open__actions">${renderButton({ label: text("workbench.settings-assistant.add-rule"), variant: "secondary", size: "sm", type: "submit" })}</div>` } })}
      </form>
      <form data-assistant-rule-pause>
        ${renderSettingRow({ name: text("workbench.settings-assistant.pause-notices"), hint: text("workbench.settings-assistant.pause-notices-hint"),
          fold: { label: text("workbench.settings-assistant.pause"), body: `${renderSettingRow({ name: text("workbench.settings-assistant.how-long"), className: "mw-setting-row--sub",
            control: `<select class="mw-select" data-assistant-rule-duration aria-label="${uiText("workbench.settings-assistant.how-long")}">
            <option value="30">${uiText("workbench.settings-assistant.value-30-minutes")}</option><option value="60" selected>${uiText("workbench.settings-assistant.value-1-hour")}</option><option value="day">${uiText("workbench.settings-assistant.until-end-today")}</option>
          </select>` })}
          ${exceptRow("failed", "workbench.settings-assistant.still-notify-failed-paused", true)}
          ${exceptRow("connection", "workbench.settings-assistant.still-tell-me-when-service-connection-needs-me", true)}
          <div class="mw-setting-open__actions">${renderButton({ label: text("workbench.settings-assistant.start-pause"), variant: "secondary", size: "sm", type: "submit" })}</div>` } })}
      </form>
      <p class="settings-form-error" data-assistant-rules-error role="alert" hidden></p>`,
    })}
    ${projectId ? renderSettingsSection({
      title: text("workbench.settings-assistant.project-suggestions"), id: "assistant-suggestions-title", attrs: { "data-assistant-suggestions": true },
      body: `${renderSettingRow({ name: text("workbench.settings-assistant.offer-project-suggestions"), hint: text("workbench.settings-assistant.project-suggestions-note"), label: true,
        control: renderSwitch({ disabled: true, attrs: { "data-assistant-offers": true } }) })}
      <p class="settings-form-error" data-assistant-offers-error role="alert" hidden></p>`,
    }) : ""}
    ${renderSettingsSection({
      title: text("workbench.settings-assistant.usage-cap"), id: "assistant-usage-title", attrs: { "data-assistant-usage": true },
      body: `${renderSettingRow({ name: text("workbench.settings-assistant.used-today"), hint: text("workbench.settings-assistant.loading"), hintAttrs: { "data-assistant-usage-today": true } })}
      <form data-assistant-budget>${renderSettingRow({ name: text("workbench.settings-assistant.daily-cap"), hint: text("workbench.settings-assistant.assistant-tokens-per-day-input-plus-output-empty"),
        control: `<input class="mw-input" type="number" min="1000" step="1000" inputmode="numeric" data-assistant-budget-input aria-label="${uiText("workbench.settings-assistant.daily-cap")}">${renderButton({ label: text("common.control.save"), variant: "secondary", size: "sm", type: "submit" })}` })}</form>
      <p class="settings-form-error" data-assistant-budget-error role="alert" hidden></p>`,
    })}
    ${renderSettingsSection({
      title: text("workbench.settings-assistant.capabilities"), id: "assistant-capabilities-title",
      body: renderSettingRow({ name: text("workbench.settings-assistant.capabilities-in-use"), hint: text("workbench.settings-assistant.reads-used-directly-each-change-asks-confirm-its"),
        attrs: { "data-assistant-capabilities-fold": true },
        fold: { label: text("workbench.settings-assistant.manage-capabilities"), body: `${renderListToolbar({ label: text("workbench.settings-assistant.search-capabilities"),
          search: `<input class="mw-input" type="search" data-assistant-capability-search placeholder="${uiText("workbench.settings-assistant.search-capabilities-plugins")}" aria-label="${uiText("workbench.settings-assistant.search-capabilities")}">`,
          end: `<div class="mw-toggle-group settings-segmented" role="group" aria-label="${uiText("workbench.settings-assistant.scope")}" data-assistant-scope-group>
            <button class="mw-toggle" type="button" data-assistant-scope="project" aria-pressed="true">${uiText("workbench.settings-assistant.current-project")}</button>
            <button class="mw-toggle" type="button" data-assistant-scope="personal" aria-pressed="false">${uiText("workbench.settings-assistant.personal")}</button>
          </div>` })}
        <div data-assistant-capabilities aria-live="polite"><p class="mw-settings-section__note mw-loading">${uiText("workbench.settings-assistant.loading")}</p></div>` } }),
    })}
    ${renderSettingsSection({
      title: text("workbench.settings-assistant.memory"), id: "assistant-memory-title", attrs: { "data-assistant-memory": true },
      body: `${renderSettingRow({ name: text("workbench.settings-assistant.memory-in-use"), hint: text("workbench.settings-assistant.loading"), hintAttrs: { "data-assistant-memory-summary": true },
        control: `${renderButton({ label: text("workbench.settings-assistant.open-personal-memories"), variant: "secondary", size: "sm", href: "/settings/memory" })}${
          projectId ? renderButton({ label: text("workbench.settings-assistant.open-project-memories"), variant: "secondary", size: "sm", href: `/projects/${encodeURIComponent(projectId)}/settings/memory` }) : ""}` })}`,
    })}
    ${renderSettingsSection({
      title: text("workbench.settings-assistant.using-computer"), id: "assistant-computer-title", attrs: { "data-assistant-computer": true },
      body: `${renderSettingRow({ name: text("workbench.settings-assistant.let-assistant-use-computer"), hint: text("workbench.settings-assistant.when-assistant-can-see-macs-screen-operate-other"), label: true,
        control: renderSwitch({ attrs: { "data-computer-enable": true } }) })}
      <p class="mw-settings-section__note" data-computer-perms></p>
      <form data-computer-forbid-form>${renderSettingRow({ name: text("workbench.settings-assistant.off-limits-apps"), hint: text("workbench.settings-assistant.apps-assistant-never-even-looks-system-settings-keychain"),
        control: `<input class="mw-input" type="text" data-computer-forbid-id placeholder="${uiText("workbench.settings-assistant.app-identifier-e-g-com-example-app")}" aria-label="${uiText("workbench.settings-assistant.app-identifier")}">${renderButton({ label: text("workbench.settings-assistant.add-off-limits"), variant: "secondary", size: "sm", type: "submit" })}` })}</form>
      <div data-computer-forbidden></div>
      <p class="settings-form-error" data-computer-error role="alert" hidden></p>`,
    })}
    ${renderSettingsSection({ body: renderObjectRow({
      name: text("workbench.settings-assistant.plugin-integration-diagnostics"), hint: text("workbench.settings-assistant.what-each-plugin-provides-assistant-whether-its-objects"),
      attrs: { id: "contributions", "data-assistant-contributions": true },
      body: `<div data-assistant-contributions-body><p class="mw-settings-section__note mw-loading">${uiText("workbench.settings-assistant.loading")}</p></div>`,
    }) })}
    ${(["div", "label"] as const).map(tag => `<template data-assistant-row="${tag}">${renderSettingRow({ name: "—", hint: "—", control: "<i></i>", label: tag === "label" })}</template>`).join("")}
  </section>`;
}

export const ASSISTANT_SETTINGS_CLIENT_SCRIPT = String.raw`
globalThis.molisWorkBindAssistantSettings = (container = document) => {
  const root = container.matches?.("[data-assistant-settings]") ? container : container.querySelector?.("[data-assistant-settings]");
  if (!root || root.dataset.assistantBound) return;
  root.dataset.assistantBound = "1";
  const readText = globalThis.t.text;
  const project = root.dataset.project || "";
  const body = root.querySelector("[data-assistant-capabilities]");
  const search = root.querySelector("[data-assistant-capability-search]");
  let scope = project ? "project" : "personal", rows = [];
  if (!project) { const group = root.querySelector("[data-assistant-scope-group]"); if (group) group.hidden = true; }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  // The Assistant's routes answer for the project whose path they are under; the Home's own, for personal work.
  const base = () => (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/assistant";
  const api = (path, payload) => molisWorkRequest(base() + path, { body: payload });
  const problem = (failure) => { const note = el("p", "settings-form-error"); molisWorkRequest.show(note, failure); return note; };
  const note = (text) => el("p", "mw-settings-section__note", text);
  // A row this page draws from what it read: a copy of the row the page was served with (the SDK's renderSettingRow), filled in.
  const settingRow = (name, hint, controls, tag = "div", className = "") => {
    const row = root.querySelector('template[data-assistant-row="' + tag + '"]').content.firstElementChild.cloneNode(true);
    if (className) row.classList.add(className);
    const [title, sentence] = row.firstElementChild.children;
    title.textContent = name; if (hint) sentence.textContent = hint; else sentence.remove();
    row.lastElementChild.replaceChildren(...controls); return row;
  };
  const switchOf = (checked, label) => {
    const control = el("span", "mw-switch"), toggle = el("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = checked;
    const track = el("span", "mw-switch__track"); track.setAttribute("aria-hidden", "true"); control.append(toggle, track);
    if (label) toggle.setAttribute("aria-label", label);
    return { control, toggle };
  };
  // Whether the Assistant brings up a project's new suggestions by itself (specs/automation-recommender §7): the person's, in every project.
  const offers = root.querySelector("[data-assistant-offers]"), offersError = root.querySelector("[data-assistant-offers-error]");
  if (offers && project) {
    const offersPath = "/projects/" + encodeURIComponent(project) + "/api/automation/recommendations/offers";
    molisWorkRequest(offersPath, { method: "GET" }).then((setting) => { offers.checked = setting.enabled === true; offers.disabled = false; },
      (failure) => { offersError.hidden = false; molisWorkRequest.show(offersError, failure); });
    offers.addEventListener("change", async () => {
      const wanted = offers.checked;
      offers.disabled = true; offersError.hidden = true;
      try { offers.checked = (await molisWorkRequest(offersPath, { method: "POST", body: { enabled: wanted } })).enabled === true; }
      catch (failure) { offers.checked = !wanted; offersError.hidden = false; molisWorkRequest.show(offersError, failure); }
      finally { offers.disabled = false; }
    });
  }
  const EFFECT = { read: "workbench.settings-assistant.read", write: "workbench.settings-assistant.change", irreversible: "workbench.settings-assistant.irreversible" };
  function paint() {
    const query = String(search.value || "").trim().toLowerCase();
    const shown = rows.filter((row) => !query || [row.title, row.provider, row.description, row.capability_id].some((text) => String(text || "").toLowerCase().includes(query)));
    body.replaceChildren();
    if (!shown.length) { body.append(el("p", "mw-settings-section__note", rows.length ? globalThis.t.text("workbench.settings-assistant.no-matching-capabilities") : globalThis.t.text("workbench.settings-assistant.no-capabilities-open-assistant-here"))); return; }
    const groups = new Map();
    shown.forEach((row) => { if (!groups.has(row.provider)) groups.set(row.provider, []); groups.get(row.provider).push(row); });
    groups.forEach((items, provider) => {
      const off = items.filter((row) => !row.enabled).length;
      body.append(el("h3", "mw-settings-subhead", provider + (off ? " · " + globalThis.t.text("workbench.settings-assistant.switched-off") + " " + off : "")));
      const list = el("ul", "mw-setting-list");
      items.forEach((row) => {
        const item = el("li", "assistant-capability");
        const { control, toggle } = switchOf(row.enabled, row.title);
        const save = async (patch) => {
          const saved = await api("/capabilities", { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, expected: row.expected, ...patch });
          window.dispatchEvent(new CustomEvent("molis:authorization-changed"));
          return saved;
        };
        toggle.addEventListener("change", async () => {
          toggle.disabled = true;
          try { Object.assign(row, await save({ enabled: toggle.checked })); if (body.contains(item)) paint(); }
          catch (failure) {
            if (failure.status === 409 && failure.body?.details?.current) Object.assign(row, failure.body.details.current);
            if (body.contains(item)) { paint(); alert(molisWorkRequest.text(failure)); }
          }
        });
        item.append(settingRow(row.title, row.description || "", [el("span", "assistant-capability-effect", EFFECT[row.effect] ? globalThis.t.text(EFFECT[row.effect]) : row.effect), control]));
        // A change that can be undone runs when asked without a confirmation; the person may want it confirmed each time.
        if (row.reversible && row.enabled) {
          const ask = switchOf(Boolean(row.confirm_always)), box = ask.toggle;
          box.addEventListener("change", async () => {
            box.disabled = true;
            try { Object.assign(row, await save({ confirm_always: box.checked })); }
            catch (failure) {
              if (failure.status === 409 && failure.body?.details?.current) Object.assign(row, failure.body.details.current);
              if (body.contains(item)) { paint(); alert(molisWorkRequest.text(failure)); }
            }
            finally { box.disabled = false; }
          });
          item.append(settingRow(globalThis.t.text("workbench.settings-assistant.ask-me-before-each-run-can-be-undone"), "", [ask.control], "label", "mw-setting-row--sub"));
        }
        list.append(item);
      });
      body.append(list);
    });
  }
  const load = async () => {
    body.replaceChildren(note(globalThis.t.text("workbench.settings-assistant.loading")));
    try { rows = (await api("/capabilities")).capabilities; paint(); }
    catch (failure) { body.replaceChildren(problem(failure)); }
  };
  root.querySelectorAll("[data-assistant-scope]").forEach((button) => button.addEventListener("click", () => {
    scope = button.dataset.assistantScope;
    root.querySelectorAll("[data-assistant-scope]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    contributions.dataset.loaded = ""; if (contributionsFold.open) loadContributions();
    load();
  }));
  search.addEventListener("input", paint);
  // The row's own <details>: a toggle does not bubble, so it is listened for where it happens.
  const contributions = root.querySelector("[data-assistant-contributions]"), contributionsFold = contributions.querySelector("details");
  const contributionsBody = root.querySelector("[data-assistant-contributions-body]");
  const AREA = { context: "workbench.settings-assistant.object-context", results: "workbench.settings-assistant.result-links", capabilities: "workbench.settings-assistant.capability-descriptions" };
  const loadContributions = async () => {
    if (contributions.dataset.loaded) return;
    contributions.dataset.loaded = "1";
    try {
      const data = await api("/contributions");
      const list = el("ul", "prompt-diagnostics-list");
      data.contributions.forEach((item) => {
        const row = el("li", "prompt-diagnostics-owner");
        const facts = [globalThis.t.text("workbench.settings-assistant.capabilities") + " " + item.actions + globalThis.t.text("common.punctuation.in-parens", { value: globalThis.t.text("workbench.settings-assistant.read") + " " + item.reads + " · " + globalThis.t.text("workbench.settings-assistant.change") + " " + item.changes }),
          item.readable_kinds.length ? globalThis.t.text("workbench.settings-assistant.readable-objects") + globalThis.t.text("common.punctuation.label-separator") + item.readable_kinds.join(globalThis.t.text("common.list.separator")) : globalThis.t.text("workbench.settings-assistant.objects-cannot-be-read-back"),
          item.changes ? globalThis.t.text("workbench.settings-assistant.linked-changes") + " " + item.linked_changes + "/" + item.changes : "", item.searchable ? globalThis.t.text("workbench.settings-assistant.search") : ""].filter(Boolean).join(" · ");
        row.append(el("strong", "", item.title), el("span", "settings-muted", facts));
        if (item.gaps.length) {
          const gaps = el("ul", "prompt-diagnostics-issues");
          item.gaps.forEach((gap) => gaps.append(el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--warning", globalThis.t.text(AREA[gap.area] || gap.area) + globalThis.t.text("common.punctuation.label-separator") + gap.text)));
          row.append(gaps);
        }
        list.append(row);
      });
      contributionsBody.replaceChildren(data.contributions.length ? list : el("p", "mw-settings-section__note", globalThis.t.text("workbench.settings-assistant.no-plugin-opens-capabilities-assistant-here")));
    } catch (failure) { delete contributions.dataset.loaded; contributionsBody.replaceChildren(problem(failure)); }
  };
  contributionsFold.addEventListener("toggle", () => { if (contributionsFold.open) loadContributions(); });
  // Attention rules belong to the person, not to a project: always the Home's own route.
  const rulesApi = (path, payload) => molisWorkRequest("/api/assistant" + path, { body: payload });
  // The pages a rule may name are the ones installed: the server sends them with the rules, so this page keeps no list of plugins.
  const pageNames = {};
  const surfaceName = (id) => pageNames[id] || id;
  const KIND = { failed: "workbench.settings-assistant.failed", "needs-decision": "workbench.settings-assistant.decision-needed", completed: "workbench.settings-assistant.done", result: "workbench.settings-assistant.result-returned", material: "workbench.settings-assistant.related-new-material", reminder: "workbench.settings-assistant.reminders", connection: "workbench.settings-assistant.service-connections-that-need" };
  const rulesList = root.querySelector("[data-assistant-rules-list]");
  const rulesError = root.querySelector("[data-assistant-rules-error]");
  const surfacesBox = root.querySelector("[data-assistant-rule-surfaces]");
  const quietForm = root.querySelector("[data-assistant-rule-quiet]"), quietLabel = quietForm.querySelector("[data-assistant-places-label]");
  const chosen = () => [...surfacesBox.querySelectorAll('[aria-pressed="true"]')].map((chip) => chip.dataset.assistantRuleSurface);
  const paintChosen = () => { const count = chosen().length; quietLabel.textContent = count ? globalThis.t.text("workbench.settings-assistant.places-count", { count }) : globalThis.t.text("workbench.settings-assistant.choose-places"); };
  const paintPages = (pages) => {
    const kept = new Set(chosen());
    surfacesBox.replaceChildren();
    pages.forEach(({ page_id: id, label: name }) => {
      pageNames[id] = name;
      const chip = el("button", "mw-choice"), label = el("span", "mw-choice__label", name), check = el("span", "mw-choice__check");
      chip.type = "button"; chip.dataset.assistantRuleSurface = id; chip.setAttribute("aria-pressed", String(kept.has(id)));
      check.setAttribute("aria-hidden", "true"); check.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-check"></use></svg>';
      chip.append(label, check);
      chip.addEventListener("click", () => { chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true")); paintChosen(); });
      surfacesBox.append(chip);
    });
    paintChosen();
  };
  const describe = (rule) => (rule.kind === "pause" ? globalThis.t.text("workbench.settings-assistant.pause-notices") : (rule.surfaces.length ? globalThis.t.text("workbench.settings-assistant.label") + " " + rule.surfaces.map((id) => surfaceName(id)).join(globalThis.t.text("common.list.separator")) + " " + globalThis.t.text("workbench.settings-assistant.stay-quiet") : globalThis.t.text("workbench.settings-assistant.stay-quiet-everywhere")))
    + (rule.except.length ? globalThis.t.text("common.punctuation.semicolon") + rule.except.map((kind) => globalThis.t.text(KIND[kind] || kind)).join(globalThis.t.text("common.list.separator")) + globalThis.t.text("workbench.settings-assistant.still-notify") : "")
    + (rule.until ? globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-assistant.until") + " " + globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: rule.until, style: "datetime-with-seconds" } }) : "");
  const paintRules = (rules) => {
    rulesList.replaceChildren();
    if (!rules.length) { rulesList.append(note(globalThis.t.text("workbench.settings-assistant.no-rules-yet-when-something-needs-assistant-shows"))); return; }
    const list = el("ul", "mw-setting-list");
    rules.forEach((rule) => {
      const item = el("li"); item.dataset.ruleId = rule.rule_id;
      const expired = rule.until && new Date(rule.until) <= new Date();
      const { control, toggle } = switchOf(rule.enabled, globalThis.t.text("workbench.settings-assistant.enable-rule", { label: rule.label }));
      toggle.addEventListener("change", () => run(() => rulesApi("/rules", { rule_id: rule.rule_id, rule: Object.assign({}, rule, { enabled: toggle.checked }) })));
      const remove = el("button", "mw-btn mw-btn--ghost mw-btn--sm", globalThis.t.text("common.control.delete")); remove.type = "button";
      remove.addEventListener("click", () => run(() => rulesApi("/rules/remove", { rule_id: rule.rule_id })));
      item.append(settingRow(rule.label, describe(rule) + (expired ? " · " + globalThis.t.text("workbench.settings-assistant.expired") : ""), [control, remove]));
      list.append(item);
    });
    rulesList.append(list);
  };
  const run = async (work) => {
    rulesError.hidden = true;
    try { const data = await work(); if (data.pages) paintPages(data.pages); paintRules(data.rules); return true; } catch (failure) { molisWorkRequest.show(rulesError, failure); rulesError.hidden = false; return false; }
  };
  // Adding a rule: the button waits for the answer, so a second press cannot add it twice; once added, the row closes again
  // and focus goes to the rule that was added (its switch), not to the page's start with the button that is now folded away.
  const add = async (form, rule, added) => {
    const submit = form.querySelector('[type="submit"]');
    const before = new Set([...rulesList.querySelectorAll("[data-rule-id]")].map((item) => item.dataset.ruleId));
    submit.disabled = true;
    const done = await run(() => rulesApi("/rules", { rule }));
    submit.disabled = false;
    if (!done) return;
    added?.(); form.querySelector("details").open = false;
    [...rulesList.querySelectorAll("[data-rule-id]")].find((item) => !before.has(item.dataset.ruleId))?.querySelector("input")?.focus();
  };
  const exceptOf = (form) => [...form.querySelectorAll("[data-assistant-rule-except]")].filter((box) => box.checked).map((box) => box.dataset.assistantRuleExcept);
  root.querySelector("[data-assistant-rule-quiet]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget, surfaces = chosen();
    const except = exceptOf(form);
    const label = (surfaces.length ? globalThis.t.text("workbench.settings-assistant.label") + " " + surfaces.map((id) => surfaceName(id)).join(globalThis.t.text("common.list.separator")) + " " + globalThis.t.text("workbench.settings-assistant.stay-quiet-2") : globalThis.t.text("workbench.settings-assistant.stay-quiet-everywhere")) + (except.length ? globalThis.t.text("common.punctuation.clause-separator") + except.map((kind) => globalThis.t.text(KIND[kind])).join(globalThis.t.text("common.list.separator")) + globalThis.t.text("workbench.settings-assistant.excepted") : "");
    add(form, { kind: "quiet", surfaces, except, label }, () => { surfacesBox.querySelectorAll('[aria-pressed="true"]').forEach((chip) => chip.setAttribute("aria-pressed", "false")); paintChosen(); });
  });
  root.querySelector("[data-assistant-rule-pause]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget, choice = form.querySelector("[data-assistant-rule-duration]").value;
    const until = choice === "day" ? (() => { const end = new Date(); end.setHours(23, 59, 0, 0); return end; })() : new Date(Date.now() + Number(choice) * 60000);
    const except = exceptOf(form);
    add(form, { kind: "pause", surfaces: [], except, until: until.toISOString(), label: globalThis.t.text("workbench.settings-assistant.paused-until") + " " + until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
  });
  run(() => rulesApi("/rules"));
  // Memory is managed on its own pages (个人 → 记忆, 项目记忆): here only how much there is and whether the Assistant may use it.
  const memorySummary = root.querySelector("[data-assistant-memory-summary]");
  (async () => {
    try {
      const personal = await molisWorkRequest("/api/memory/overview?scope=personal");
      const parts = [globalThis.t.text("workbench.settings-memory.personal-count", { count: personal.counts?.personal || 0 })];
      if (project) {
        const own = await molisWorkRequest("/projects/" + encodeURIComponent(project) + "/api/memory/overview?scope=project");
        parts.push(globalThis.t.text("workbench.settings-memory.project-count", { count: own.counts?.project || 0 }));
      }
      const waiting = (personal.candidates || []).length;
      if (waiting) parts.push(globalThis.t.text("workbench.settings-assistant.waiting-count", { count: waiting }));
      const prefs = personal.prefs && personal.prefs.consumers ? personal.prefs : personal.prefs && personal.prefs.prefs;
      if (prefs && prefs.consumers && prefs.consumers.assistant === false) parts.push(globalThis.t.text("workbench.settings-assistant.turned-off-assistant-s-use-personal-memories"));
      memorySummary.textContent = parts.join(" · ");
    } catch { memorySummary.textContent = globalThis.t.text("workbench.settings-assistant.memory-not-ready-yet-look-again-shortly"); }
  })();
  // Usage and the daily cap belong to the person: the Home's own route.
  const usageLine = root.querySelector("[data-assistant-usage-today]");
  const budgetForm = root.querySelector("[data-assistant-budget]");
  const budgetInput = root.querySelector("[data-assistant-budget-input]");
  const budgetError = root.querySelector("[data-assistant-budget-error]");
  const paintUsage = (usage) => {
    const used = usage.today.input + usage.today.output;
    usageLine.textContent = used.toLocaleString() + " tokens" + globalThis.t.text("common.punctuation.in-parens", { value: globalThis.t.text("workbench.settings-assistant.inputs") + " " + usage.today.input.toLocaleString() + globalThis.t.text("common.punctuation.clause-separator") + globalThis.t.text("workbench.settings-assistant.output") + " " + usage.today.output.toLocaleString()
      + (usage.today.cached_input ? globalThis.t.text("common.punctuation.clause-separator") + globalThis.t.text("workbench.settings-assistant.cached-reads") + " " + usage.today.cached_input.toLocaleString() : "") + globalThis.t.text("common.punctuation.clause-separator") + usage.today.rounds + " " + globalThis.t.text("workbench.settings-assistant.turns") })
      + (usage.daily_tokens ? " · " + globalThis.t.text("workbench.settings-assistant.cap") + " " + usage.daily_tokens.toLocaleString() : " · " + globalThis.t.text("workbench.settings-assistant.no-cap"));
    if (document.activeElement !== budgetInput) budgetInput.value = usage.daily_tokens ? String(usage.daily_tokens) : "";
  };
  const usageApi = (payload) => molisWorkRequest("/api/assistant" + (payload ? "/budget" : "/usage"), { body: payload });
  const runUsage = async (work) => { budgetError.hidden = true; try { paintUsage(await work()); } catch (failure) { molisWorkRequest.show(budgetError, failure); budgetError.hidden = false; } };
  budgetForm.addEventListener("submit", (event) => { event.preventDefault(); const raw = String(budgetInput.value || "").trim(); runUsage(() => usageApi({ daily_tokens: raw ? Number(raw) : null })); });
  runUsage(() => usageApi());
  if (location.hash === "#contributions") { contributionsFold.open = true; loadContributions(); }
  load();

  // 使用电脑: the master switch (off by default), the helper's system-permission status, and the forbidden apps the person added.
  const computer = root.querySelector("[data-assistant-computer]");
  if (computer) {
    const enable = computer.querySelector("[data-computer-enable]");
    const permsEl = computer.querySelector("[data-computer-perms]");
    const forbiddenEl = computer.querySelector("[data-computer-forbidden]");
    const forbidForm = computer.querySelector("[data-computer-forbid-form]");
    const forbidId = computer.querySelector("[data-computer-forbid-id]");
    const computerError = computer.querySelector("[data-computer-error]");
    const PERM = { accessibility: globalThis.t.text("workbench.settings-assistant.accessibility"), screen_recording: globalThis.t.text("workbench.settings-assistant.screen-recording"), input_monitoring: globalThis.t.text("workbench.settings-assistant.input-monitoring") };
    const computerApi=(path,payload)=>molisWorkRequest("/api/computer"+path,{body:payload,fallback:globalThis.t.text("workbench.settings-assistant.not-done-please-try-again")});
    const paintForbidden = (forbidden) => {
      forbiddenEl.replaceChildren();
      if (!forbidden || !forbidden.length) return;
      const list = el("ul", "mw-setting-list");
      forbidden.forEach((app) => {
        const item = el("li");
        const remove = el("button", "mw-btn mw-btn--ghost mw-btn--sm", globalThis.t.text("workbench.settings-assistant.remove"));
        remove.type = "button";
        remove.addEventListener("click", () => runComputer(() => computerApi("/forbidden", { remove: app.bundle_id }).then((data) => paintForbidden(data.forbidden))));
        item.append(settingRow(app.name || app.bundle_id, app.name && app.name !== app.bundle_id ? app.bundle_id : "", [remove]));
        list.append(item);
      });
      forbiddenEl.append(list);
    };
    const paintPerms = async () => {
      if (!enable.checked) { permsEl.textContent = ""; return; }
      try {
        const data = await computerApi("/permissions");
        if (!data.permissions) { permsEl.textContent = data.problem ? globalThis.t.text("workbench.settings-assistant.computer-helper") + data.problem : globalThis.t.text("workbench.settings-assistant.computer-helper-not-ready-yet"); return; }
        const missing = Object.keys(data.permissions).filter((key) => !data.permissions[key]).map((key) => PERM[key] || key);
        permsEl.textContent = missing.length ? globalThis.t.text("workbench.settings-assistant.still-missing-system-permissions") + missing.join(globalThis.t.text("common.list.separator")) + globalThis.t.text("workbench.settings-assistant.grant-them-side-panels-computer-tab") : globalThis.t.text("workbench.settings-assistant.all-system-permissions-granted");
      } catch (failure) { molisWorkRequest.show(permsEl,failure); }
    };
    const runComputer = async (work) => { computerError.hidden = true; try { await work(); } catch (failure) { molisWorkRequest.show(computerError,failure); computerError.hidden = false; } };
    enable.addEventListener("change", () => runComputer(async () => { const data = await computerApi("/settings", { enabled: enable.checked }); enable.checked = data.enabled; await paintPerms(); }));
    forbidForm.addEventListener("submit", (event) => { event.preventDefault(); const id = String(forbidId.value || "").trim(); if (!id) return; runComputer(async () => { const data = await computerApi("/forbidden", { bundle_id: id, name: id }); forbidId.value = ""; paintForbidden(data.forbidden); }); });
    runComputer(async () => { const data = await computerApi("/settings"); enable.checked = data.enabled; paintForbidden(data.forbidden); await paintPerms(); });
  }
};
globalThis.molisWorkBindAssistantSettings(document);
`;
