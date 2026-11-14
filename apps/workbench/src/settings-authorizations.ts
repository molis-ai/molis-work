import { escapeHtml, renderButton, renderInput, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { AUTHORIZATION_OWNERS } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { WebProjectNavigation } from "./settings-navigation.js";

export function renderAuthorizationSettings(projects: readonly WebProjectNavigation[], current: string | null, rules = false) {
  const text = (key: string) => uiText.text("workbench.authorization." + key);
  const option = (id: string, title: string, selected?: boolean) =>
    `<option value="${escapeHtml(id)}"${selected ? " selected" : ""}>${escapeHtml(title)}</option>`;
  return `<section class="settings-document" data-authorization-settings aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${text("manage")}</h1></header>
    <div class="authorization-view" role="group" aria-label="${text("manage")}">
      ${renderButton({ variant: "secondary", size: "sm", label: text("manage"), attrs: { "data-authorization-view": "grants", "aria-pressed": String(!rules) } })}
      ${renderButton({ variant: "secondary", size: "sm", label: text("review-history"), attrs: { "data-authorization-view": "reviews", "aria-pressed": "false" } })}
      ${renderButton({ variant: "secondary", size: "sm", label: text("project-rules"), attrs: { "data-authorization-view": "rules", "aria-pressed": String(rules) } })}
    </div>
    <div class="authorization-tools">
      ${renderInput({ type: "search", placeholder: text("search"), attrs: { "aria-label": text("search"), "data-authorization-search": true } })}
      <select class="mw-input" data-authorization-project aria-label="${escapeHtml(text("project"))}">${option("", text("all-projects"))}${option("home", text("personal"))}${projects.map(project => option(project.project_id, project.display_name, project.project_id === current)).join("")}</select>
      <select class="mw-input" data-authorization-owner aria-label="${escapeHtml(text("owner"))}"${rules ? " hidden" : ""}>${option("", text("all-owners"))}${AUTHORIZATION_OWNERS.map(owner => option(owner, text(owner))).join("")}</select>
      <select class="mw-input" data-authorization-client aria-label="${escapeHtml(text("client"))}" hidden></select>
      ${renderButton({ variant: "ghost", icon: "refresh", iconOnly: true, label: text("refresh"), attrs: { "data-authorization-reload": true } })}
    </div>
    <div class="authorization-settings-body">
      <p data-authorization-error class="settings-form-error" role="alert" hidden></p>
      <div class="authorization-layout" data-authorization-layout>
        <div role="group" aria-label="${text("manage")}" data-authorization-list></div>
        <section class="authorization-detail" data-authorization-detail tabindex="-1" aria-label="${text("details")}">
          <p role="status">${text("loading")}</p>
        </section>
      </div>
    </div>
  </section>`;
}

export const AUTHORIZATION_SETTINGS_CLIENT = String.raw`
globalThis.molisWorkBindAuthorizationSettings = (container = document) => {
  const root = container.matches?.("[data-authorization-settings]") ? container : container.querySelector?.("[data-authorization-settings]");
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "true";
  const attribute = name => "[data-authorization-" + name + "]";
  const part = name => root.querySelector(attribute(name));
  const list = part("list"), detail = part("detail"), banner = part("error");
  const project = part("project"), owner = part("owner"), client = part("client"), search = part("search");
  const text = (key, args) => globalThis.t.text("workbench.authorization." + key, args);
  const word = value => typeof value === "string" ? value : globalThis.say.text(value);
  const title = item => item.title_text ? word(item.title_text) : item.title;
  const el = (tag, name, copy) => { const node = document.createElement(tag); if (name) node.className = name; if (copy) node.textContent = copy; return node; };
  const button = (label, run, variant = "secondary") => {
    const node = el("button", "mw-btn mw-btn--" + variant, label); node.type = "button"; node.addEventListener("click", run); return node;
  };
  const muted = copy => el("p", "settings-muted", copy);
  const errorMessage = (failure) => {
    const node = el("p", "settings-form-error");
    node.setAttribute("role", "alert");
    if (failure) problem(node, failure); else node.hidden = true;
    return node;
  };
  const showFacts = (title, values) => {
    const facts = el("dl", "authorization-facts");
    for (const [label, value] of values) if (value) facts.append(el("dt", "", text(label)), el("dd", "", value));
    detail.replaceChildren(el("h2", "", title), facts);
  };
  const rowButton = (title, status, selected, run) => {
    const pick = button("", run, "ghost");
    pick.classList.add("authorization-row");
    pick.setAttribute("aria-current", String(Boolean(selected)));
    pick.append(el("strong", "", title), el("span", "settings-muted", status));
    list.append(pick);
    return pick;
  };
  const date = at => new Date(at).toLocaleString();
  const focusDetails = () => detail.focus({ preventScroll: true });
  const showBanner = copy => { banner.textContent = copy; banner.hidden = false; };
  let rows = [], row = null, generation = 0, detailGeneration = 0, saving = false, removed;
  let showing = root.querySelector(attribute("view") + '[aria-pressed="true"]').dataset.authorizationView;
  let sources = [], source = null, policy = null, selectedRule = null;
  const identity = item => JSON.stringify([item.owner, item.id]);
  const path = "/api/settings/authorizations";
  const query = () => { const params = new URLSearchParams(); if (project.value) params.set("project", project.value === "home" ? "" : project.value); return params; };
  const request = (params, suffix = "", options) => molisWorkRequest(path + suffix + "?" + params, options);
  const read = () => { const params = query(); if (owner.value) params.set("owner", owner.value); if (owner.value === "mcp-client" && client.value) params.set("client", client.value); return request(params); };
  const problem = (node, failure) => { molisWorkRequest.show(node, failure); node.hidden = false; };
  const live = selected => root.isConnected && row && identity(row) === identity(selected);
  const replaceRow = current => {
    rows = rows.map(item => identity(item) === identity(current) ? current : item);
    row = current; paintList();
  };
  const searchText = () => search.value.trim().toLocaleLowerCase();
  function paintList() {
    if (showing === "reviews") return paintSources();
    if (showing === "rules") return paintRules();
    const needle = searchText();
    const active = document.activeElement?.dataset.authorizationRow;
    list.replaceChildren();
    for (const entry of rows.filter(item => !needle || [item.title, item.actor, ...item.scope].some(value => value.toLocaleLowerCase().includes(needle)))) {
      const id = identity(entry);
      const select = rowButton(entry.title, text(entry.status), row && id === identity(row), () => { void choose(entry, true); });
      select.dataset.authorizationRow = id;
      if (active === id) select.focus({ preventScroll: true });
    }
    if (!list.children.length) list.append(muted(text("empty")));
  }
  function showDetail(current, feedback) {
    showFacts(current.title, [["mode", text(current.mode)], ["lifetime", text(current.lifetime)], ["status", text(current.status)],
      ["expires", current.expires_at && date(current.expires_at)], ["source", current.source ? globalThis.t.text("workbench.agent-review.source-" + current.source.kind) : text("unknown")],
      ["actor", current.actor], ["recent", current.recent_use_at ? date(current.recent_use_at) : text("unknown")]]);
    if (current.reason) detail.append(muted(current.reason));
    const scope = el("div", "authorization-scope"), change = el("div", "authorization-actions");
    const edits = current.changes.includes("narrow");
    const allowed = key => !removed.has(key);
    const setAllowed = (key, on) => on ? removed.delete(key) : removed.add(key);
    let selection;
    const check = (title, selected, update) => {
      const label = el("label", "settings-check"), box = document.createElement("input");
      box.type = "checkbox"; box.checked = selected; box.disabled = !edits;
      box.addEventListener("change", () => update(box.checked)); label.append(box, document.createTextNode(title));
      return label;
    };
    if (current.categories?.length) {
      const category = item => JSON.stringify([item.provider_id, item.group_id]);
      for (const item of current.categories) scope.append(check(item.title, allowed(category(item)), on => setAllowed(category(item), on)));
      selection = () => current.categories.filter(item => allowed(category(item)))
        .map(({ provider_id, group_id }) => ({ provider_id, ...(group_id ? { group_id } : {}) }));
    } else if (current.candidates?.length) {
      const operationKey = (item, index) => item.scope_index + ":" + index;
      const valueKey = (key, target, value) => JSON.stringify([key, target.key, value.id]);
      for (const item of current.candidates) {
        const group = el("section", "authorization-candidate"); group.append(el("h3", "", item.title));
        if (item.exact_parameters) group.append(el("pre", "", item.exact_parameters));
        if (item.reason) group.append(muted(item.reason));
        if (item.operations) item.operations.forEach((operation, index) => {
          const key = operationKey(item, index);
          const field = el("fieldset", "authorization-operation");
          const toggle = check(title(operation), allowed(key), on => { setAllowed(key, on); targets.disabled = !on; });
          const targets = el("fieldset", "authorization-targets"); targets.disabled = !allowed(key);
          field.append(toggle, targets);
          operation.targets.forEach(target => {
            const label = title(target);
            if (target.values.length < 2) targets.append(muted(label + " · " + word(target.values[0].label)));
            else {
              const options = el("fieldset", "authorization-targets"); options.append(el("legend", "", label));
              target.values.forEach(value => {
                const id = valueKey(key, target, value);
                options.append(check(word(value.label), allowed(id), on => setAllowed(id, on)));
              });
              targets.append(options);
            }
          });
          group.append(field);
        });
        else if (edits) group.append(check(text("keep"), allowed(item.scope_index), on => setAllowed(item.scope_index, on)));
        scope.append(group);
      }
      selection = () => current.candidates.flatMap(item => {
        if (!item.operations) return allowed(item.scope_index) ? [{ scope_index: item.scope_index }] : [];
        const operations = item.operations.flatMap((operation, index) => {
          const key = operationKey(item, index);
          if (!allowed(key)) return [];
          const targets = operation.targets.map(target => ({ key: target.key,
            ids: target.values.filter(value => allowed(valueKey(key, target, value))).map(value => value.id) }));
          return targets.every(target => target.ids.length) ? [{ row_index: index, targets }] : [];
        });
        return operations.length ? [{ scope_index: item.scope_index, operations }] : [];
      });
    } else if (current.scope.length) {
      const facts = el("ul", "authorization-scope");
      for (const item of current.scope) facts.append(el("li", "", item));
      scope.append(facts);
    }
    if (scope.childElementCount) detail.append(scope);
    if (edits && selection) change.append(button(text("narrow"), () => void save(current, "narrow", selection())));
    const message = errorMessage();
    const announce = muted(feedback); announce.dataset.authorizationStatus = ""; announce.setAttribute("role", "status");
    for (const kind of current.changes.filter(item => item !== "narrow")) {
      change.append(button(text(kind), event => {
        if (kind !== "revoke") { void save(current, kind); return; }
        const action = event.currentTarget;
        const confirm = el("div", "authorization-confirm"), cancel = button(globalThis.t.text("common.control.cancel"), () => { confirm.remove(); action.hidden = false; action.focus(); }, "ghost");
        confirm.append(el("p", "", text("revoke-note")), cancel, button(text("revoke"), () => void save(current, kind), "danger-outline"));
        action.hidden = true; action.after(confirm); cancel.focus();
      }, kind === "revoke" ? "danger-outline" : "secondary"));
    }
    detail.append(change, announce, message);
    detail.report = failure => problem(message, failure);
  }
  async function choose(selected, focus = false, priorSelection) {
    delete detail.report;
    const next = ++detailGeneration;
    row = selected; paintList();
    detail.replaceChildren(muted(text("loading"))); detail.setAttribute("aria-busy", "true");
    const params = query();
    for (const key of ["owner", "id"]) params.set(key, selected[key]);
    try {
      const current = await request(params);
      if (next !== detailGeneration || !live(selected)) return;
      removed = selected.expected === current.expected ? priorSelection ?? new Set() : new Set();
      showDetail(current);
      if (focus && matchMedia("(max-width: 720px)").matches) focusDetails();
    } catch (failure) {
      if (next !== detailGeneration || !live(selected)) return;
      detail.replaceChildren(errorMessage(failure));
    } finally { if (next === detailGeneration) detail.removeAttribute("aria-busy"); }
  }
  async function save(current, kind, keep) {
    if (saving) return;
    saving = true;
    const next = detailGeneration, actions = detail.querySelectorAll("button, input:not(:disabled)"), status = part("status");
    const disable = disabled => actions.forEach(control => { control.disabled = disabled; });
    disable(true); status.textContent = text("saving");
    try {
      const saved = await request(query(), "", { method: "POST", body: { owner: current.owner, id: current.id, expected: current.expected, kind, ...(keep ? { keep } : {}) } });
      window.dispatchEvent(new CustomEvent("molis:authorization-changed"));
      if (next !== detailGeneration || !live(current)) return;
      removed.clear(); replaceRow(saved); showDetail(saved, text("updated"));
      focusDetails();
    } catch (failure) {
      if (next !== detailGeneration || !live(current)) return;
      const actual = failure.body?.details?.current;
      if (actual?.owner === current.owner && actual?.id === current.id) {
        replaceRow(actual);
        await choose(actual);
      } else if (failure.status === 409 || kind === "revoke" || kind === "settle") {
        await choose(current, false, removed);
      } else status.textContent = "";
      detail.report?.(failure);
    } finally { saving = false; disable(false); }
  }
  function paintSources() {
    const needle = searchText();
    list.replaceChildren();
    for (const item of sources) {
      if (needle && !item.title.toLocaleLowerCase().includes(needle)) continue;
      rowButton(item.title, item.phase, source?.id === item.id, () => { source = item; paintSources(); focusDetails(); });
    }
    if (project.value && !list.children.length) list.append(muted(text("review-empty")));
    if (!source) {
      detail.replaceChildren(muted(text(project.value ? "select-review" : "choose-review-project")));
      return;
    }
    showFacts(source.title, [["status", source.phase], ["decision", source.decision], ["source", source.source], ["actor", source.person],
      ["review-time", date(source.at)]]);
    if (source.detail) detail.append(el("p", "settings-form-error", source.detail));
  }
  const scopeName = kind => text({ project_default: "project-default", ancestor_minimum: "ancestor-minimum", object: "object-rule" }[kind]);
  const ruleName = rule => {
    const { scope } = rule;
    if (scope.kind === "project_default") return scope.owner?.plugin_id || scope.owner?.provider_id || text("project-default");
    return scopeName(scope.kind) + " · " + scope.subject.id;
  };
  function paintRules() {
    list.replaceChildren();
    if (!policy) {
      detail.replaceChildren(muted(text(!project.value || project.value === "home" ? "choose-rule-project" : "loading")));
      return;
    }
    if (text("project-default").toLocaleLowerCase().includes(searchText())) {
      rowButton(text("project-default"), text(policy.project_default_requires_person ? "person-required" : "no-extra-rule"), !selectedRule,
        () => { selectedRule = null; paintRules(); focusDetails(); });
    }
    for (const rule of policy.rules) {
      if (!ruleName(rule).toLocaleLowerCase().includes(searchText())) continue;
      rowButton(ruleName(rule), text(rule.state), selectedRule === rule.id, () => { selectedRule = rule.id; paintRules(); focusDetails(); });
    }
    if (!list.children.length) list.append(muted(text("empty")));
    if (policy.next_cursor) {
      const more = button(globalThis.t.text("workbench.account.load-more"), () => { void loadRules(more); });
      list.append(more);
    }
    const rule = policy.rules.find(rule => rule.id === selectedRule);
    showFacts(rule ? ruleName(rule) : text("project-default"), rule ? [
      ["status", text(rule.state)], ["rule-scope", scopeName(rule.scope.kind)], ["actor", rule.created_by], ["review-time", date(rule.created_at)],
      ["decision", text(rule.requires_person ? "person-required" : rule.requires_person === false ? "no-extra-rule" : "follows-other-rules")],
      ["change-reason", rule.change_reason || rule.reason],
    ] : []);
    if (rule && rule.state !== "active") return;
    const revision = policy.revision;
    const form = el("form", "authorization-scope");
    form.setAttribute("data-authorization-rule-form", "");
    const required = document.createElement("input"); required.type = "checkbox";
    required.name = "requires_person";
    required.checked = policy.project_default_requires_person;
    if (!rule) {
      const choice = el("label", "settings-check");
      choice.append(required, document.createTextNode(text("person-required"))); form.append(choice);
    }
    const reason = document.createElement("input");
    reason.name = "reason";
    reason.className = "mw-input"; reason.maxLength = 2000; reason.required = true;
    reason.placeholder = text("change-reason"); reason.setAttribute("aria-label", reason.placeholder);
    const submit = el("button", "mw-btn mw-btn--secondary", text(rule ? "withdraw-rule" : "save-rule"));
    submit.type = "submit";
    const message = errorMessage();
    form.append(reason, submit, message); detail.append(form);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (saving || !reason.value.trim() || revision !== policy?.revision) return;
      const change = rule ? { kind: "withdraw", id: rule.id } : { kind: "set", scope: { kind: "project_default" }, requires_person: required.checked };
      void saveRule(form, message, { ...change, reason: reason.value.trim(), expected_revision: revision });
    });
  }
  async function loadRules(control) {
    const next = generation, current = policy, cursor = current.next_cursor, params = query();
    control.disabled = true;
    params.set("before_order", cursor.order); params.set("before_id", cursor.id);
    try {
      const page = await request(params, "/project-rules");
      if (next !== generation || !root.isConnected || policy !== current) return;
      if (page.revision !== current.revision) { await load(); return; }
      policy = { ...page, rules: [...current.rules, ...page.rules] };
      paintRules();
    } catch (failure) {
      if (next === generation && root.isConnected) problem(banner, failure);
    } finally { control.disabled = false; }
  }
  async function saveRule(form, message, body) {
    const next = generation, controls = form.querySelectorAll("button,input");
    saving = true; controls.forEach(control => { control.disabled = true; });
    try {
      const current = await request(query(), "/project-rules", { method: "POST", body });
      if (next !== generation || !root.isConnected) return;
      policy = current; paintRules(); focusDetails();
      const receipt = muted(text("updated")); receipt.setAttribute("role", "status"); detail.append(receipt);
    } catch (failure) {
      if (next !== generation || !root.isConnected) return;
      problem(message, failure);
    } finally { saving = false; controls.forEach(control => { control.disabled = false; }); }
  }
  async function load() {
    const next = ++generation; ++detailGeneration; banner.hidden = true;
    list.setAttribute("aria-busy", "true");
    try {
      if (showing === "rules") {
        policy = null; selectedRule = null; paintRules();
        if (!project.value || project.value === "home") return;
        const snapshot = await request(query(), "/project-rules");
        if (next !== generation || !root.isConnected) return;
        policy = snapshot; paintRules();
        return;
      }
      if (showing === "reviews") {
        sources = []; source = null; paintSources();
        if (!project.value) return;
        const history = await request(query(), "/reviews");
        if (next !== generation || !root.isConnected) return;
        sources = history.rows; paintSources();
        if (history.omitted) showBanner(text("review-omitted", { count: history.omitted }));
        return;
      }
      const answer = await read();
      if (next !== generation || !root.isConnected) return;
      const last = client.value; client.replaceChildren(new Option(text("all-clients"), ""));
      for (const item of answer.clients) client.add(new Option(item.title, item.id));
      client.value = answer.clients.some(item => item.id === last) ? last : "";
      client.hidden = owner.value !== "mcp-client";
      rows = answer.entries;
      const failed = answer.owners.filter(item => item.state === "failed");
      if (failed.length) showBanner(text(failed.length === answer.owners.length ? "failed" : "partial", { owners: failed.map(item => text(item.owner)).join(text("separator")) }));
      const selected = row && rows.find(item => identity(item) === identity(row));
      row = selected ?? null; paintList();
      if (selected) await choose(selected);
      else detail.replaceChildren(muted(text("select")));
    } catch (failure) { if (next === generation && root.isConnected) problem(banner, failure); }
    finally { if (next === generation) list.removeAttribute("aria-busy"); }
  }
  const modes = root.querySelectorAll(attribute("view"));
  for (const mode of modes) mode.addEventListener("click", () => {
    if (saving || showing === mode.dataset.authorizationView) return;
    showing = mode.dataset.authorizationView;
    for (const option of modes) option.setAttribute("aria-pressed", String(option === mode));
    owner.hidden = showing !== "grants";
    client.hidden = showing !== "grants" || owner.value !== "mcp-client";
    row = null; list.replaceChildren(); detail.replaceChildren();
    void load();
  });
  for (const select of [project, owner, client]) select.addEventListener("change", () => { void load(); });
  part("reload").addEventListener("click", () => { void load(); });
  window.addEventListener("molis:authorization-changed", () => { if (root.isConnected && !saving) void load(); });
  search.addEventListener("input", paintList);
  void load();
};
globalThis.molisWorkBindAuthorizationSettings(document);
`;

export const AUTHORIZATION_SETTINGS_STYLES = `
.authorization-view { display: flex; flex-wrap: wrap; gap: 8px; }
.authorization-view [aria-pressed=true] { background: var(--nav-active); }
.authorization-tools { display: flex; gap: 8px; flex-wrap: wrap; padding-block: 8px 16px; }
.authorization-tools > input { flex: 1 1 14em; min-width: 0; }
.authorization-tools select { max-width: min(220px, 100%); }
.authorization-settings-body { overflow: auto; padding-bottom: 24px; }
[data-authorization-list] { display: grid; gap: 4px; max-height: 68vh; overflow: auto; }
.authorization-row.mw-btn { justify-content: space-between; width: 100%; min-height: 44px; text-align: start; border: 1px solid var(--line); }
.authorization-row strong { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.authorization-row[aria-current=true] { background: var(--nav-active); }
.authorization-facts { display: grid; grid-template-columns: minmax(0, auto) minmax(0, 1fr); gap: 8px 16px; }
.authorization-facts dd { margin: 0; }
.authorization-facts dt { color: var(--muted); }
.authorization-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.authorization-confirm { border: 1px solid var(--line); border-radius: var(--radius-control); padding: 10px; }
.authorization-operation, .authorization-targets { min-width: 0; border: 0; padding: 0; margin: 4px 0; }
.authorization-targets { padding-inline-start: 12px; }
.authorization-candidate + .authorization-candidate { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
@media (max-width: 720px) { [data-authorization-layout] { grid-template-columns: 1fr; } [data-authorization-list] { max-height: 38vh; } }
`;
