import { escapeHtml, renderButton, renderInput, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { AUTHORIZATION_OWNERS } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { WebProjectNavigation } from "./settings-navigation.js";

export function renderAuthorizationSettings(projects: readonly WebProjectNavigation[], current: string | null, rules = false) {
  const userProjects = projects.filter(project => project.project_id !== PERSONAL_SPACE_PROJECT_ID);
  const text = (key: string) => uiText.text("workbench.authorization." + key);
  const currentProject = current && current !== PERSONAL_SPACE_PROJECT_ID ? current : null;
  const activeProject = currentProject || (rules ? userProjects[0]?.project_id ?? null : null);
  const option = (id: string, title: string, selected?: boolean, hidden?: boolean) =>
    `<option value="${escapeHtml(id)}"${selected ? " selected" : ""}${hidden ? " hidden" : ""}>${escapeHtml(title)}</option>`;
  return `<section class="settings-document" data-authorization-settings data-view="${rules ? "rules" : "grants"}" aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${text("manage")}</h1></header>
    <div class="authorization-view" role="group" aria-label="${text("manage")}">
      ${renderButton({ variant: "secondary", size: "sm", label: text("manage"), attrs: { "data-authorization-view": "grants", "aria-pressed": String(!rules) } })}
      ${renderButton({ variant: "secondary", size: "sm", label: text("review-history"), attrs: { "data-authorization-view": "reviews", "aria-pressed": "false" } })}
      ${renderButton({ variant: "secondary", size: "sm", label: text("project-rules"), attrs: { "data-authorization-view": "rules", "aria-pressed": String(rules) } })}
    </div>
    <div class="authorization-tools">
      ${renderInput({ type: "search", placeholder: text("search"), attrs: { "aria-label": text("search"), "data-authorization-search": true } })}
      <select class="mw-select" data-authorization-project aria-label="${escapeHtml(text("project"))}">${option("", text("all-projects"), false, rules)}${option("home", text("personal"), !rules && current === PERSONAL_SPACE_PROJECT_ID, rules)}${userProjects.map(project => option(project.project_id, project.display_name, project.project_id === activeProject)).join("")}</select>
      <select class="mw-select authorization-owner-select" data-authorization-owner aria-label="${escapeHtml(text("owner"))}">${option("", text("all-owners"))}${AUTHORIZATION_OWNERS.map(owner => option(owner, text(owner))).join("")}</select>
      <select class="mw-select authorization-client" data-authorization-client aria-label="${escapeHtml(text("client"))}">${option("", text("all-clients"))}</select>
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
  const attr = name => "[data-authorization-" + name + "]", sel = attr("settings");
  const root = container.matches?.(sel) ? container : container.querySelector?.(sel);
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "true";
  const part = name => root.querySelector(attr(name));
  const list = part("list"), detail = part("detail"), banner = part("error");
  const project = part("project"), owner = part("owner"), client = part("client"), search = part("search");
  const ui = globalThis.t.text, text = (key, args) => ui("workbench.authorization." + key, args);
  const who = value => value === "local:person" ? ui("workbench.common.label") : value;
  const word = value => typeof value === "string" ? value : globalThis.say.text(value);
  const title = item => item.title_text ? word(item.title_text) : item.title, lower = value => value.toLocaleLowerCase();
  const el = (tag, cls, copy, props) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, copy ? { textContent: copy } : {}, props);
  const button = (label, onclick, variant = "secondary") => el("button", "mw-btn mw-btn--" + variant, label, { type: "button", onclick });
  const muted = copy => el("p", "settings-muted", copy), set = (node, ...children) => node.replaceChildren(...children);
  const statusMsg = copy => { const node = muted(copy); node.setAttribute("role", "status"); return node; };
  const setDisabled = (nodes, disabled) => nodes.forEach(control => { control.disabled = disabled; });
  const errorMessage = failure => {
    const node = el("p", "settings-form-error", "", { role: "alert" });
    if (failure) problem(node, failure); else node.hidden = true;
    return node;
  };
  const showFacts = (heading, values) => {
    const facts = el("dl", "authorization-facts");
    for (const [label, value] of values) if (value) facts.append(el("dt", "", text(label)), el("dd", "", value));
    set(detail, el("h2", "", heading), facts);
  };
  const rowButton = (heading, status, selected, run) => {
    const pick = button("", run, "ghost authorization-row");
    pick.setAttribute("aria-current", String(!!selected));
    pick.append(el("strong", "", heading), el("span", "settings-muted", status));
    list.append(pick); return pick;
  };
  const date = at => format.date(at, "datetime"), focus = node => node.focus({ preventScroll: true }), focusDetails = () => focus(detail);
  const busy = (node, on) => on ? node.setAttribute("aria-busy", "true") : node.removeAttribute("aria-busy");
  const nonProject = value => !value || value === "home", showBanner = copy => { banner.textContent = copy; banner.hidden = false; };
  let rows = [], row = null, generation = 0, detailGeneration = 0, saving = false, removed;
  let showing = root.querySelector(attr("view") + '[aria-pressed="true"]').dataset.authorizationView;
  let sources = [], source = null, policy = null, selectedRule = null;
  const sameGen = next => next === generation && root.isConnected, identity = item => JSON.stringify([item.owner, item.id]);
  const path = "/api/settings/authorizations";
  const query = () => { const params = new URLSearchParams(); if (project.value) params.set("project", project.value === "home" ? "" : project.value); return params; };
  const request = (params, suffix = "", options) => molisWorkRequest(path + suffix + "?" + params, options);
  const read = () => { const params = query(); if (owner.value) params.set("owner", owner.value); if (owner.value === "mcp-client" && client.value) params.set("client", client.value); return request(params); };
  const problem = (node, failure) => { molisWorkRequest.show(node, failure); node.hidden = false; };
  const live = selected => root.isConnected && row && identity(row) === identity(selected), searchText = () => lower(search.value.trim());
  const replaceRow = current => { rows = rows.map(item => identity(item) === identity(current) ? current : item); row = current; paintList(); };
  function paintList() {
    if (showing === "reviews") return paintSources();
    if (showing === "rules") return paintRules();
    const needle = searchText(), active = document.activeElement?.dataset.authorizationRow;
    set(list);
    for (const entry of rows.filter(item => !needle || [item.title, item.actor, ...item.scope].some(value => lower(value).includes(needle)))) {
      const id = identity(entry), select = rowButton(entry.title, text(entry.status), row && id === identity(row), () => { void choose(entry, true); });
      select.dataset.authorizationRow = id;
      if (active === id) focus(select);
    }
    if (!list.children.length) list.append(muted(text("empty")));
  }
  function showDetail(current, feedback) {
    showFacts(current.title, [["mode", text(current.mode)], ["lifetime", text(current.lifetime)], ["status", text(current.status)],
      ["expires", current.expires_at && date(current.expires_at)], ["source", current.source ? ui("workbench.agent-review.source-" + current.source.kind) : text("unknown")],
      ["actor", who(current.actor)], ["recent", current.recent_use_at ? date(current.recent_use_at) : text("unknown")]]);
    if (current.reason) detail.append(muted(current.reason));
    const scope = el("div", "authorization-scope"), change = el("div", "authorization-actions");
    const edits = current.changes.includes("narrow");
    const allowed = key => !removed.has(key);
    let selection, narrow;
    const setAllowed = (key, on) => { on ? removed.delete(key) : removed.add(key); if (narrow) narrow.disabled = !removed.size; };
    const check = (title, checked, update) => {
      const label = el("label", "settings-check"), box = el("input", "", "", { type: "checkbox", checked, disabled: !edits, onchange: () => update(box.checked) });
      label.append(box, title);
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
    if (edits && selection) { narrow = button(text("narrow"), () => void save(current, "narrow", selection())); narrow.disabled = !removed.size; change.append(narrow); }
    const message = errorMessage(), announce = statusMsg(feedback); announce.dataset.authorizationStatus = "";
    for (const kind of current.changes.filter(item => item !== "narrow")) {
      change.append(button(text(kind), event => {
        if (kind !== "revoke") { void save(current, kind); return; }
        const action = event.currentTarget;
        const confirm = el("div", "authorization-confirm"), cancel = button(ui("common.control.cancel"), () => { confirm.remove(); action.hidden = false; action.focus(); }, "ghost");
        confirm.append(el("p", "", text("revoke-note")), cancel, button(text("revoke"), () => void save(current, kind), "danger-outline"));
        action.hidden = true; action.after(confirm); cancel.focus();
      }, kind === "revoke" ? "danger-outline" : "secondary"));
    }
    detail.append(change, announce, message);
    detail.report = failure => problem(message, failure);
  }
  const sameDetail = (next, item) => next === detailGeneration && live(item);
  async function choose(selected, mobile = false, prior) {
    delete detail.report;
    const next = ++detailGeneration, params = query();
    row = selected; paintList();
    set(detail, muted(text("loading"))); busy(detail, true);
    params.set("owner", selected.owner); params.set("id", selected.id);
    try {
      const current = await request(params);
      if (!sameDetail(next, selected)) return;
      removed = selected.expected === current.expected ? prior ?? new Set() : new Set();
      showDetail(current);
      if (mobile && matchMedia("(max-width: 720px)").matches) focusDetails();
    } catch (failure) {
      if (sameDetail(next, selected)) set(detail, errorMessage(failure));
    } finally { if (next === detailGeneration) busy(detail, false); }
  }
  async function save(current, kind, keep) {
    if (saving) return;
    saving = true;
    const next = detailGeneration, actions = detail.querySelectorAll("button,input:not(:disabled)"), status = part("status");
    setDisabled(actions, true); status.textContent = text("saving");
    try {
      const saved = await request(query(), "", { method: "POST", body: { owner: current.owner, id: current.id, expected: current.expected, kind, ...(keep ? { keep } : {}) } });
      window.dispatchEvent(new CustomEvent("molis:authorization-changed"));
      if (!sameDetail(next, current)) return;
      removed.clear(); replaceRow(saved); showDetail(saved, text("updated")); focusDetails();
    } catch (failure) {
      if (!sameDetail(next, current)) return;
      const actual = failure.body?.details?.current;
      if (actual?.owner === current.owner && actual?.id === current.id) { replaceRow(actual); await choose(actual); }
      else if (failure.status === 409 || kind === "revoke" || kind === "settle") await choose(current, false, removed);
      else status.textContent = "";
      detail.report?.(failure);
    } finally { saving = false; setDisabled(actions, false); }
  }
  function paintSources() {
    const needle = searchText(), filtered = sources.filter(item => !needle || lower(item.title).includes(needle));
    set(list);
    if (!filtered.some(item => item.id === source?.id)) source = filtered[0] ?? null;
    for (const item of filtered) rowButton(item.title, item.phase, source?.id === item.id, () => { source = item; paintSources(); focusDetails(); });
    if (!list.children.length) list.append(muted(text("review-empty")));
    if (!source) { set(detail, muted(text("review-empty"))); return; }
    showFacts(source.title, [["status", source.phase], ["decision", source.decision], ["source", source.source], ["actor", who(source.person)], ["review-time", date(source.at)]]);
    if (source.detail) detail.append(el("p", "settings-form-error", source.detail));
  }
  const scopeName = kind => text({ project_default: "project-default", ancestor_minimum: "ancestor-minimum", object: "object-rule" }[kind]);
  const ruleName = r => r.scope.kind === "project_default" ? r.owner_title || text("project-default")
    : [scopeName(r.scope.kind), r.owner_title, r.scope.subject.id].filter(Boolean).join(" · ");
  const ruleLabel = rule => rule.reason ? ruleName(rule) + " · " + rule.reason : ruleName(rule);
  function paintRules() {
    set(list);
    const defaultLabel = text("project-default");
    if (!policy) { set(detail, muted(text(nonProject(project.value) ? "choose-rule-project" : "loading"))); return; }
    const needle = searchText();
    if (lower(defaultLabel).includes(needle)) {
      rowButton(defaultLabel, text(policy.project_default_requires_person ? "person-required" : "no-extra-rule"), !selectedRule, () => { selectedRule = null; paintRules(); focusDetails(); });
    }
    for (const rule of policy.rules) if (lower(ruleLabel(rule)).includes(needle)) {
      rowButton(ruleLabel(rule), text(rule.state), selectedRule === rule.id, () => { selectedRule = rule.id; paintRules(); focusDetails(); });
    }
    if (!list.children.length) list.append(muted(text("empty")));
    if (policy.next_cursor) { const more = button(ui("workbench.account.load-more"), () => { void loadRules(more); }); list.append(more); }
    const rule = policy.rules.find(item => item.id === selectedRule);
    showFacts(rule ? ruleName(rule) : defaultLabel, rule ? [
      ["status", text(rule.state)], ["rule-scope", scopeName(rule.scope.kind)], ["actor", who(rule.created_by)], ["review-time", date(rule.created_at)],
      ["decision", text(rule.requires_person ? "person-required" : rule.requires_person === false ? "no-extra-rule" : "follows-other-rules")],
      ["change-reason", rule.change_reason || rule.reason],
    ] : []);
    if (rule && rule.state !== "active") return;
    const revision = policy.revision, why = text("change-reason"), form = el("form", "authorization-scope"); form.dataset.authorizationRuleForm = "";
    const required = el("input", "", "", { type: "checkbox", name: "requires_person", checked: policy.project_default_requires_person });
    if (!rule) { const choice = el("label", "settings-check"); choice.append(required, text("person-required")); form.append(choice); }
    const reason = el("input", "mw-input", "", { name: "reason", maxLength: 2000, required: true, placeholder: why, ariaLabel: why });
    const submit = el("button", "mw-btn mw-btn--secondary", text(rule ? "withdraw-rule" : "save-rule"), { type: "submit" });
    const message = errorMessage(); form.append(reason, submit, message); detail.append(form);
    form.onsubmit = event => {
      event.preventDefault();
      if (saving || !reason.value.trim() || revision !== policy?.revision) return;
      const change = rule ? { kind: "withdraw", id: rule.id } : { kind: "set", scope: { kind: "project_default" }, requires_person: required.checked };
      void saveRule(form, message, { ...change, reason: reason.value.trim(), expected_revision: revision });
    };
  }
  async function loadRules(control) {
    const next = generation, current = policy, cursor = current.next_cursor, params = query();
    control.disabled = true; params.set("before_order", cursor.order); params.set("before_id", cursor.id);
    try {
      const page = await request(params, "/project-rules");
      if (!sameGen(next) || policy !== current) return;
      if (page.revision !== current.revision) { await load(); return; }
      policy = { ...page, rules: [...current.rules, ...page.rules] }; paintRules();
    } catch (failure) { if (sameGen(next)) problem(banner, failure); }
    finally { control.disabled = false; }
  }
  async function saveRule(form, message, body) {
    const next = generation, controls = form.querySelectorAll("button,input");
    saving = true; setDisabled(controls, true);
    try {
      const current = await request(query(), "/project-rules", { method: "POST", body });
      if (!sameGen(next)) return;
      policy = current; paintRules(); focusDetails();
      detail.append(statusMsg(text("updated")));
    } catch (failure) { if (sameGen(next)) problem(message, failure); }
    finally { saving = false; setDisabled(controls, false); }
  }
  const syncControls = pick => {
    root.dataset.view = showing; root.dataset.owner = owner.value;
    const opts = [...project.options];
    for (const opt of opts) if (nonProject(opt.value)) opt.hidden = showing === "rules";
    if (pick && showing === "rules" && nonProject(project.value)) {
      project.value = (opts.find(opt => opt.value === document.body.dataset.projectId) || opts.find(opt => !nonProject(opt.value)))?.value || "";
    }
  };
  async function load() {
    syncControls();
    const next = ++generation; ++detailGeneration; banner.hidden = true; busy(list, true);
    try {
      if (showing === "rules") {
        policy = null; selectedRule = null; paintRules();
        if (nonProject(project.value)) return;
        const snapshot = await request(query(), "/project-rules");
        if (!sameGen(next)) return;
        policy = snapshot; paintRules(); return;
      }
      if (showing === "reviews") {
        sources = []; source = null; set(detail, muted(text("loading")));
        const history = await request(query(), "/reviews");
        if (!sameGen(next)) return;
        sources = history.rows; paintSources();
        if (history.omitted) showBanner(text("review-omitted", { count: history.omitted }));
        return;
      }
      const answer = await read();
      if (!sameGen(next)) return;
      const last = client.value; set(client, new Option(text("all-clients"), ""));
      for (const item of answer.clients) client.add(new Option(item.title, item.id));
      client.value = answer.clients.some(item => item.id === last) ? last : "";
      syncControls(); rows = answer.entries;
      const failed = answer.owners.filter(item => item.state === "failed");
      if (failed.length) showBanner(text(failed.length === answer.owners.length ? "failed" : "partial", { owners: failed.map(item => text(item.owner)).join(text("separator")) }));
      const selected = (row && rows.find(item => identity(item) === identity(row))) ?? rows[0] ?? null;
      row = selected; paintList();
      if (selected) await choose(selected);
      else set(detail, muted(text("select")));
    } catch (failure) { if (sameGen(next)) problem(banner, failure); }
    finally { if (next === generation) busy(list, false); }
  }
  const modes = root.querySelectorAll(attr("view"));
  for (const mode of modes) mode.addEventListener("click", () => {
    if (saving || showing === mode.dataset.authorizationView) return;
    showing = mode.dataset.authorizationView;
    for (const option of modes) option.setAttribute("aria-pressed", String(option === mode));
    syncControls(true); row = null; set(list); set(detail); void load();
  });
  for (const select of [project, owner, client]) select.addEventListener("change", () => { syncControls(); void load(); });
  part("reload").addEventListener("click", () => { void load(); });
  window.addEventListener("molis:authorization-changed", () => { if (root.isConnected && !saving) void load(); });
  search.addEventListener("input", paintList); syncControls(true); void load();
};
globalThis.molisWorkBindAuthorizationSettings(document);
`;

export const AUTHORIZATION_SETTINGS_STYLES = [
  ".authorization-view,.authorization-tools,.authorization-actions{display:flex;flex-wrap:wrap;gap:8px}",
  ".authorization-view [aria-pressed=true],.authorization-row[aria-current=true]{background:var(--nav-active)}",
  ".authorization-tools{align-items:center;padding:8px 0 16px}",
  ".authorization-tools>input{flex:1 1 180px;min-width:0}",
  ".authorization-tools>:is(select,.mw-select-picker){flex:0 1 auto;width:auto;max-width:min(220px,100%)}",
  ".authorization-tools .mw-select-picker__trigger{width:auto;min-width:112px;max-width:100%}",
  "[data-authorization-settings]:not([data-view=grants]) :is(.authorization-owner-select,.authorization-client),[data-authorization-settings]:not([data-owner=mcp-client]) .authorization-client{display:none}",
  ".authorization-settings-body{overflow:auto;padding-bottom:24px}",
  "[data-authorization-list]{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;max-height:68vh;overflow:hidden auto}",
  ".authorization-row.mw-btn{justify-content:space-between;width:100%;min-width:0;min-height:44px;text-align:start;border:1px solid var(--line)}",
  ".authorization-row strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}",
  ".authorization-row span{flex:none}",
  ".authorization-facts{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:8px 16px}",
  ".authorization-facts dd{margin:0}",
  ".authorization-facts dt{color:var(--muted)}",
  ".authorization-actions{margin-top:16px}",
  ".authorization-confirm{border:1px solid var(--line);border-radius:var(--radius-control);padding:10px}",
  ".authorization-operation,.authorization-targets{min-width:0;border:0;padding:0;margin:4px 0}",
  ".authorization-targets{padding-inline-start:12px}",
  ".authorization-candidate+.authorization-candidate{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}",
  "@media(max-width:720px){[data-authorization-layout]{grid-template-columns:1fr}[data-authorization-list]{max-height:38vh}}",
].join("");
