import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * “助理”: what the Assistant may use (its own grants, separate from Coding's and external agents'), and what each
 * plugin contributes for it — with the exact gaps a plugin's developer can close.
 */
export function renderAssistantSettings({ projectId }: { readText(text: string): string; projectId: string | null }): string {
  return `<section class="settings-document assistant-settings" aria-labelledby="settings-title" data-assistant-settings data-project="${projectId ? projectId.replace(/[^a-zA-Z0-9_.:-]/g, "") : ""}">
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-assistant.assistant")}</h1></div>
      <p>${uiText("workbench.settings-assistant.what-assistant-may-use-what-each-plugin-provides")}</p></header>
    <section class="settings-section assistant-rules" aria-labelledby="assistant-rules-title" data-assistant-rules>
      <h2 id="assistant-rules-title">${uiText("workbench.settings-assistant.attention-rules")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-assistant.when-assistant-may-draw-attention-rules-apply-exactly")}</p>
      <div data-assistant-rules-list><p class="settings-muted">${uiText("workbench.settings-assistant.loading")}</p></div>
      <form class="assistant-rule-form" data-assistant-rule-quiet>
        <strong>${uiText("workbench.settings-assistant.stay-quiet-these-places")}</strong>
        <div class="assistant-rule-surfaces" data-assistant-rule-surfaces></div>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="failed" checked> ${uiText("workbench.settings-assistant.still-tell-me-when-turn-fails")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="needs-decision"> ${uiText("workbench.settings-assistant.still-tell-me-when-i-need-decide")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="reminder" checked> ${uiText("workbench.settings-assistant.still-tell-me-when-reminder-i-set-comes")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="connection" checked> ${uiText("workbench.settings-assistant.still-tell-me-when-service-connection-needs-me")}</label>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="submit">${uiText("workbench.settings-assistant.add-rule")}</button>
      </form>
      <form class="assistant-rule-form" data-assistant-rule-pause>
        <strong>${uiText("workbench.settings-assistant.pause-notices")}</strong>
        <select class="mw-input" data-assistant-rule-duration aria-label="${uiText("workbench.settings-assistant.how-long")}">
          <option value="30">${uiText("workbench.settings-assistant.value-30-minutes")}</option><option value="60" selected>${uiText("workbench.settings-assistant.value-1-hour")}</option><option value="day">${uiText("workbench.settings-assistant.until-end-today")}</option>
        </select>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="failed" checked> ${uiText("workbench.settings-assistant.still-tell-me-when-turn-fails")}</label>
        <label class="settings-check"><input type="checkbox" data-assistant-rule-except="connection" checked> ${uiText("workbench.settings-assistant.still-tell-me-when-service-connection-needs-me")}</label>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="submit">${uiText("workbench.settings-assistant.pause")}</button>
      </form>
      <p class="settings-form-error" data-assistant-rules-error role="alert" hidden></p>
    </section>
    <section class="settings-section assistant-usage" aria-labelledby="assistant-usage-title" data-assistant-usage>
      <h2 id="assistant-usage-title">${uiText("workbench.settings-assistant.usage-cap")}</h2>
      <p class="settings-muted" data-assistant-usage-today>${uiText("workbench.settings-assistant.loading")}</p>
      <form class="assistant-rule-form" data-assistant-budget>
        <label class="settings-field"><span>${uiText("workbench.settings-assistant.assistant-tokens-per-day-input-plus-output-empty")}</span>
          <input class="mw-input" type="number" min="1000" step="1000" inputmode="numeric" data-assistant-budget-input aria-label="${uiText("workbench.settings-assistant.daily-cap")}"></label>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="submit">${uiText("common.control.save")}</button>
      </form>
      <p class="settings-muted">${uiText("workbench.settings-assistant.cap-no-new-turn-starts-what-ran-stays")}</p>
      <p class="settings-form-error" data-assistant-budget-error role="alert" hidden></p>
    </section>
    <section class="settings-section assistant-memory" aria-labelledby="assistant-memory-title" data-assistant-memory>
      <h2 id="assistant-memory-title">${uiText("workbench.settings-assistant.memory")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-assistant.assistant-uses-platform-memory-preferences-habits-under-personal")}</p>
      <p class="settings-muted" data-assistant-memory-summary>${uiText("workbench.settings-assistant.loading")}</p>
      <div class="settings-actions">
        <a class="mw-btn mw-btn--secondary mw-btn--sm" href="/settings/memory">${uiText("workbench.settings-assistant.open-personal-memories")}</a>
        ${projectId ? `<a class="mw-btn mw-btn--ghost mw-btn--sm" href="/projects/${encodeURIComponent(projectId)}/settings/memory">${uiText("workbench.settings-assistant.open-project-memories")}</a>` : ""}
      </div>
    </section>
    <section class="settings-section assistant-computer" aria-labelledby="assistant-computer-title" data-assistant-computer>
      <h2 id="assistant-computer-title">${uiText("workbench.settings-assistant.using-computer")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-assistant.when-assistant-can-see-macs-screen-operate-other")}</p>
      <label class="settings-check"><input type="checkbox" data-computer-enable> ${uiText("workbench.settings-assistant.let-assistant-use-computer")}</label>
      <p class="settings-muted" data-computer-perms></p>
      <h3 class="settings-subhead">${uiText("workbench.settings-assistant.off-limits-apps")}</h3>
      <p class="settings-muted">${uiText("workbench.settings-assistant.apps-assistant-never-even-looks-system-settings-keychain")}</p>
      <div data-computer-forbidden><p class="settings-muted">${uiText("workbench.settings-assistant.loading")}</p></div>
      <form class="assistant-rule-form" data-computer-forbid-form>
        <input class="mw-input" type="text" data-computer-forbid-id placeholder="${uiText("workbench.settings-assistant.app-identifier-e-g-com-example-app")}" aria-label="${uiText("workbench.settings-assistant.app-identifier")}">
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="submit">${uiText("workbench.settings-assistant.add-off-limits")}</button>
      </form>
      <p class="settings-form-error" data-computer-error role="alert" hidden></p>
    </section>
    <p class="prompt-settings-notice" role="note">${uiText("workbench.settings-assistant.reads-used-directly-each-change-asks-confirm-its")}</p>
    <div class="prompt-settings-tools">
      <div class="mw-toggle-group settings-segmented" role="group" aria-label="${uiText("workbench.settings-assistant.scope")}" data-assistant-scope-group>
        <button class="mw-toggle" type="button" data-assistant-scope="project" aria-pressed="true">${uiText("workbench.settings-assistant.current-project")}</button>
        <button class="mw-toggle" type="button" data-assistant-scope="personal" aria-pressed="false">${uiText("workbench.settings-assistant.personal")}</button>
      </div>
      <input class="mw-input prompt-settings-search" type="search" data-assistant-capability-search placeholder="${uiText("workbench.settings-assistant.search-capabilities-plugins")}" aria-label="${uiText("workbench.settings-assistant.search-capabilities")}">
    </div>
    <div class="prompt-settings-body" data-assistant-capabilities aria-live="polite"><p class="settings-muted mw-loading">${uiText("workbench.settings-assistant.loading")}</p></div>
    <details class="settings-section prompt-diagnostics" id="contributions" data-assistant-contributions>
      <summary><strong>${uiText("workbench.settings-assistant.plugin-integration-diagnostics")}</strong><span class="settings-muted">${uiText("workbench.settings-assistant.what-each-plugin-provides-assistant-whether-its-objects")}</span></summary>
      <div data-assistant-contributions-body><p class="settings-muted mw-loading">${uiText("workbench.settings-assistant.loading")}</p></div>
    </details>
  </section>`;
}

/** Runs on the settings page only when the section is on show. No template interpolation inside. */
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
  const EFFECT = { read: "workbench.settings-assistant.read", write: "workbench.settings-assistant.change", irreversible: "workbench.settings-assistant.irreversible" };
  function paint() {
    const query = String(search.value || "").trim().toLowerCase();
    const shown = rows.filter((row) => !query || [row.title, row.provider, row.description, row.capability_id].some((text) => String(text || "").toLowerCase().includes(query)));
    body.replaceChildren();
    if (!shown.length) { body.append(el("p", "settings-muted", rows.length ? globalThis.t.text("workbench.settings-assistant.no-matching-capabilities") : globalThis.t.text("workbench.settings-assistant.no-capabilities-open-assistant-here"))); return; }
    const groups = new Map();
    shown.forEach((row) => { if (!groups.has(row.provider)) groups.set(row.provider, []); groups.get(row.provider).push(row); });
    groups.forEach((items, provider) => {
      const section = el("section", "settings-section prompt-group");
      const off = items.filter((row) => !row.enabled).length;
      section.append(el("h2", "prompt-group-title", provider + (off ? " · " + globalThis.t.text("workbench.settings-assistant.switched-off") + " " + off : "")));
      const list = el("ul", "prompt-list");
      items.forEach((row) => {
        const item = el("li", "prompt-row assistant-capability");
        const head = el("label", "prompt-row-head");
        const copy = el("div", "prompt-row-copy");
        copy.append(el("strong", "", row.title), el("span", "settings-muted", (row.description || "")));
        const meta = el("div", "prompt-row-meta");
        meta.append(el("span", "prompt-tag", globalThis.t.text(EFFECT[row.effect] || row.effect)));
        const control = el("span", "mw-switch"), toggle = el("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = row.enabled;
        const track = el("span", "mw-switch__track"); track.setAttribute("aria-hidden", "true"); control.append(toggle, track);
        toggle.setAttribute("aria-label", (row.enabled ? globalThis.t.text("common.control.close") : globalThis.t.text("common.control.open")) + "：" + row.title);
        toggle.addEventListener("change", async () => {
          toggle.disabled = true;
          try { await api("/capabilities", { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, enabled: toggle.checked }); row.enabled = toggle.checked; paint(); }
          catch (failure) { toggle.checked = row.enabled; toggle.disabled = false; alert(molisWorkRequest.text(failure)); }
        });
        head.append(copy, meta, control);
        item.append(head);
        // A change that can be undone runs when asked without a confirmation; the person may want it confirmed each time.
        if (row.reversible && row.enabled) {
          const mode = el("label", "settings-muted assistant-capability-mode"), box = el("input"); box.type = "checkbox"; box.checked = Boolean(row.confirm_always);
          mode.append(box, document.createTextNode(" " + globalThis.t.text("workbench.settings-assistant.ask-me-before-each-run-can-be-undone")));
          box.addEventListener("change", async () => {
            box.disabled = true;
            try { await api("/capabilities", { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, confirm_always: box.checked }); row.confirm_always = box.checked; }
            catch (failure) { box.checked = Boolean(row.confirm_always); alert(molisWorkRequest.text(failure)); }
            finally { box.disabled = false; }
          });
          item.append(mode);
        }
        list.append(item);
      });
      section.append(list);
      body.append(section);
    });
  }
  const load = async () => {
    body.replaceChildren(el("p", "settings-muted", globalThis.t.text("workbench.settings-assistant.loading")));
    try { rows = (await api("/capabilities")).capabilities; paint(); }
    catch (failure) { body.replaceChildren(problem(failure)); }
  };
  root.querySelectorAll("[data-assistant-scope]").forEach((button) => button.addEventListener("click", () => {
    scope = button.dataset.assistantScope;
    root.querySelectorAll("[data-assistant-scope]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
    contributions.dataset.loaded = ""; if (contributions.open) loadContributions();
    load();
  }));
  search.addEventListener("input", paint);
  const contributions = root.querySelector("[data-assistant-contributions]");
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
        const facts = [globalThis.t.text("workbench.settings-assistant.capabilities") + " " + item.actions + "（" + globalThis.t.text("workbench.settings-assistant.read") + " " + item.reads + " · " + globalThis.t.text("workbench.settings-assistant.change") + " " + item.changes + "）",
          item.readable_kinds.length ? globalThis.t.text("workbench.settings-assistant.readable-objects") + "：" + item.readable_kinds.join("、") : globalThis.t.text("workbench.settings-assistant.objects-cannot-be-read-back"),
          item.changes ? globalThis.t.text("workbench.settings-assistant.linked-changes") + " " + item.linked_changes + "/" + item.changes : "", item.searchable ? globalThis.t.text("workbench.settings-assistant.search") : ""].filter(Boolean).join(" · ");
        row.append(el("strong", "", item.title), el("span", "settings-muted", facts));
        if (item.gaps.length) {
          const gaps = el("ul", "prompt-diagnostics-issues");
          item.gaps.forEach((gap) => gaps.append(el("li", "prompt-diagnostics-issue prompt-diagnostics-issue--warning", globalThis.t.text(AREA[gap.area] || gap.area) + "：" + gap.text)));
          row.append(gaps);
        }
        list.append(row);
      });
      contributionsBody.replaceChildren(data.contributions.length ? list : el("p", "settings-muted", globalThis.t.text("workbench.settings-assistant.no-plugin-opens-capabilities-assistant-here")));
    } catch (failure) { delete contributions.dataset.loaded; contributionsBody.replaceChildren(problem(failure)); }
  };
  contributions.addEventListener("toggle", () => { if (contributions.open) loadContributions(); });
  // Attention rules belong to the person, not to a project: always the Home's own route.
  const rulesApi = (path, payload) => molisWorkRequest("/api/assistant" + path, { body: payload });
  // The pages a rule may name are the ones installed: the server sends them with the rules, so this page keeps no list of plugins.
  const pageNames = {};
  const surfaceName = (id) => pageNames[id] || id;
  const KIND = { failed: "workbench.settings-assistant.failed", "needs-decision": "workbench.settings-assistant.decision-needed", completed: "workbench.settings-assistant.done", result: "workbench.settings-assistant.result-returned", material: "workbench.settings-assistant.related-new-material", reminder: "workbench.settings-assistant.reminders", connection: "workbench.settings-assistant.service-connections-that-need" };
  const rulesList = root.querySelector("[data-assistant-rules-list]");
  const rulesError = root.querySelector("[data-assistant-rules-error]");
  const surfacesBox = root.querySelector("[data-assistant-rule-surfaces]");
  const paintPages = (pages) => {
    surfacesBox.replaceChildren();
    pages.forEach(({ page_id: id, label: name }) => { pageNames[id] = name; const label = el("label", "settings-check"); const box = el("input"); box.type = "checkbox"; box.value = id; box.dataset.assistantRuleSurface = ""; label.append(box, document.createTextNode(" " + name)); surfacesBox.append(label); });
  };
  const describe = (rule) => (rule.kind === "pause" ? globalThis.t.text("workbench.settings-assistant.pause-notices") : (rule.surfaces.length ? globalThis.t.text("workbench.settings-assistant.label") + " " + rule.surfaces.map((id) => surfaceName(id)).join("、") + " " + globalThis.t.text("workbench.settings-assistant.stay-quiet") : globalThis.t.text("workbench.settings-assistant.stay-quiet-everywhere")))
    + (rule.except.length ? "；" + rule.except.map((kind) => globalThis.t.text(KIND[kind] || kind)).join("、") + globalThis.t.text("workbench.settings-assistant.still-notify") : "")
    + (rule.until ? "；" + globalThis.t.text("workbench.settings-assistant.until") + " " + globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: rule.until, style: "datetime-with-seconds" } }) : "");
  const paintRules = (rules) => {
    rulesList.replaceChildren();
    if (!rules.length) { rulesList.append(el("p", "settings-muted", globalThis.t.text("workbench.settings-assistant.no-rules-yet-when-something-needs-assistant-shows"))); return; }
    const list = el("ul", "prompt-list");
    rules.forEach((rule) => {
      const item = el("li", "prompt-row");
      const head = el("div", "prompt-row-head");
      const copy = el("div", "prompt-row-copy");
      const expired = rule.until && new Date(rule.until) <= new Date();
      copy.append(el("strong", "", rule.label), el("span", "settings-muted", describe(rule) + (expired ? " · " + globalThis.t.text("workbench.settings-assistant.expired") : "")));
      const control = el("span", "mw-switch"), toggle = el("input"); toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = rule.enabled;
      const track = el("span", "mw-switch__track"); track.setAttribute("aria-hidden", "true"); control.append(toggle, track);
      toggle.setAttribute("aria-label", globalThis.t.text("workbench.settings-assistant.enable") + "：" + rule.label);
      toggle.addEventListener("change", () => run(() => rulesApi("/rules", { rule_id: rule.rule_id, rule: Object.assign({}, rule, { enabled: toggle.checked }) })));
      const remove = el("button", "mw-btn mw-btn--ghost mw-btn--sm", globalThis.t.text("common.control.delete")); remove.type = "button";
      remove.addEventListener("click", () => run(() => rulesApi("/rules/remove", { rule_id: rule.rule_id })));
      head.append(copy, control, remove);
      item.append(head); list.append(item);
    });
    rulesList.append(list);
  };
  const run = async (work) => {
    rulesError.hidden = true;
    try { const data = await work(); if (data.pages) paintPages(data.pages); paintRules(data.rules); } catch (failure) { molisWorkRequest.show(rulesError, failure); rulesError.hidden = false; }
  };
  const exceptOf = (form) => [...form.querySelectorAll("[data-assistant-rule-except]")].filter((box) => box.checked).map((box) => box.dataset.assistantRuleExcept);
  root.querySelector("[data-assistant-rule-quiet]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget, surfaces = [...form.querySelectorAll("[data-assistant-rule-surface]")].filter((box) => box.checked).map((box) => box.value);
    const except = exceptOf(form);
    const label = (surfaces.length ? globalThis.t.text("workbench.settings-assistant.label") + " " + surfaces.map((id) => surfaceName(id)).join("、") + " " + globalThis.t.text("workbench.settings-assistant.stay-quiet-2") : globalThis.t.text("workbench.settings-assistant.stay-quiet-everywhere")) + (except.length ? "，" + except.map((kind) => globalThis.t.text(KIND[kind])).join("、") + globalThis.t.text("workbench.settings-assistant.excepted") : "");
    run(() => rulesApi("/rules", { rule: { kind: "quiet", surfaces, except, label } }));
  });
  root.querySelector("[data-assistant-rule-pause]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget, choice = form.querySelector("[data-assistant-rule-duration]").value;
    const until = choice === "day" ? (() => { const end = new Date(); end.setHours(23, 59, 0, 0); return end; })() : new Date(Date.now() + Number(choice) * 60000);
    const except = exceptOf(form);
    run(() => rulesApi("/rules", { rule: { kind: "pause", surfaces: [], except, until: until.toISOString(), label: globalThis.t.text("workbench.settings-assistant.paused-until") + " " + until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } }));
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
    usageLine.textContent = globalThis.t.text("workbench.settings-assistant.assistant-used-today") + " " + used.toLocaleString() + " tokens（" + globalThis.t.text("workbench.settings-assistant.inputs") + " " + usage.today.input.toLocaleString() + "，" + globalThis.t.text("workbench.settings-assistant.output") + " " + usage.today.output.toLocaleString()
      + (usage.today.cached_input ? "，" + globalThis.t.text("workbench.settings-assistant.cached-reads") + " " + usage.today.cached_input.toLocaleString() : "") + "，" + usage.today.rounds + " " + globalThis.t.text("workbench.settings-assistant.turns") + "）"
      + (usage.daily_tokens ? " · " + globalThis.t.text("workbench.settings-assistant.cap") + " " + usage.daily_tokens.toLocaleString() : " · " + globalThis.t.text("workbench.settings-assistant.no-cap"));
    if (document.activeElement !== budgetInput) budgetInput.value = usage.daily_tokens ? String(usage.daily_tokens) : "";
  };
  const usageApi = (payload) => molisWorkRequest("/api/assistant" + (payload ? "/budget" : "/usage"), { body: payload });
  const runUsage = async (work) => { budgetError.hidden = true; try { paintUsage(await work()); } catch (failure) { molisWorkRequest.show(budgetError, failure); budgetError.hidden = false; } };
  budgetForm.addEventListener("submit", (event) => { event.preventDefault(); const raw = String(budgetInput.value || "").trim(); runUsage(() => usageApi({ daily_tokens: raw ? Number(raw) : null })); });
  runUsage(() => usageApi());
  if (location.hash === "#contributions") { contributions.open = true; loadContributions(); }
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
      if (!forbidden || !forbidden.length) { forbiddenEl.append(el("p", "settings-muted", globalThis.t.text("workbench.settings-assistant.have-not-added-any-off-limits-apps"))); return; }
      const list = el("ul", "prompt-list");
      forbidden.forEach((app) => {
        const item = el("li", "prompt-row");
        item.append(el("span", "", (app.name || app.bundle_id) + "（" + app.bundle_id + "）"));
        const remove = el("button", "mw-btn mw-btn--ghost mw-btn--sm", globalThis.t.text("workbench.settings-assistant.remove"));
        remove.type = "button";
        remove.addEventListener("click", () => runComputer(() => computerApi("/forbidden", { remove: app.bundle_id }).then((data) => paintForbidden(data.forbidden))));
        item.append(remove);
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
        permsEl.textContent = missing.length ? globalThis.t.text("workbench.settings-assistant.still-missing-system-permissions") + missing.join("、") + globalThis.t.text("workbench.settings-assistant.grant-them-side-panels-computer-tab") : globalThis.t.text("workbench.settings-assistant.all-system-permissions-granted");
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
