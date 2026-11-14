import { escapeHtml, renderButton, renderInput, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { AUTHORIZATION_OWNERS } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { WebProjectNavigation } from "./settings-navigation.js";

export function renderAuthorizationSettings(projects: readonly WebProjectNavigation[], current: string | null) {
  const text = (key: string) => uiText.text("workbench.authorization." + key);
  const option = (id: string, title: string, selected?: boolean) =>
    `<option value="${escapeHtml(id)}"${selected ? " selected" : ""}>${escapeHtml(title)}</option>`;
  return `<section class="settings-document" data-authorization-settings aria-labelledby="settings-title">
    <header class="settings-heading"><h1 id="settings-title">${text("manage")}</h1></header>
    <div class="authorization-view" role="group" aria-label="${text("manage")}">
      ${renderButton({ variant: "secondary", size: "sm", label: text("manage"), attrs: { "data-authorization-view": "grants", "aria-pressed": "true" } })}
      ${renderButton({ variant: "secondary", size: "sm", label: text("review-history"), attrs: { "data-authorization-view": "reviews", "aria-pressed": "false" } })}
    </div>
    <div class="authorization-tools">
      ${renderInput({ type: "search", placeholder: text("search"), attrs: { "aria-label": text("search"), "data-authorization-search": true } })}
      <select class="mw-input" data-authorization-project aria-label="${escapeHtml(text("project"))}">${option("", text("all-projects"))}${option("home", text("personal"))}${projects.map(project => option(project.project_id, project.display_name, project.project_id === current)).join("")}</select>
      <select class="mw-input" data-authorization-owner aria-label="${escapeHtml(text("owner"))}">${option("", text("all-owners"))}${AUTHORIZATION_OWNERS.map(owner => option(owner, text(owner))).join("")}</select>
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
  const q = selector => root.querySelector(selector);
  const list = q("[data-authorization-list]"), detail = q("[data-authorization-detail]"), banner = q("[data-authorization-error]");
  const project = q("[data-authorization-project]"), owner = q("[data-authorization-owner]"), client = q("[data-authorization-client]"), search = q("[data-authorization-search]");
  const text = (key, args) => globalThis.t.text("workbench.authorization." + key, args);
  const word = value => typeof value === "string" ? value : globalThis.say.text(value);
  const el = (tag, name, copy) => { const node = document.createElement(tag); if (name) node.className = name; if (copy) node.textContent = copy; return node; };
  const button = (label, run, variant = "secondary") => {
    const node = el("button", "mw-btn mw-btn--" + variant, label); node.type = "button"; node.addEventListener("click", run); return node;
  };
  let rows = [], row = null, generation = 0, detailGeneration = 0, saving = false, kept = null;
  let showing = "grants", sources = [], source = null;
  const identity = item => JSON.stringify([item.owner, item.id]);
  const path = "/api/settings/authorizations";
  const query = () => { const params = new URLSearchParams(); if (project.value) params.set("project", project.value === "home" ? "" : project.value); return params; };
  const read = () => { const params = query(); if (owner.value) params.set("owner", owner.value); if (owner.value === "mcp-client" && client.value) params.set("client", client.value); return molisWorkRequest(path + "?" + params); };
  const problem = (node, failure) => { molisWorkRequest.show(node, failure); node.hidden = false; };
  const live = selected => root.isConnected && row && identity(row) === identity(selected);
  function paintList() {
    if (showing === "reviews") return paintSources();
    const needle = search.value.trim().toLocaleLowerCase();
    const active = document.activeElement?.dataset.authorizationRow;
    list.replaceChildren();
    for (const entry of rows.filter(item => !needle || [item.title, item.actor, ...item.scope].some(value => value.toLocaleLowerCase().includes(needle)))) {
      const id = identity(entry);
      const select = button("", () => { void choose(entry, true); }, "ghost");
      select.dataset.authorizationRow = id;
      select.classList.add("authorization-row");
      select.setAttribute("aria-current", String(Boolean(row && id === identity(row))));
      select.append(el("strong", "", entry.title), el("span", "settings-muted", text(entry.status)));
      list.append(select);
      if (active === id) select.focus({ preventScroll: true });
    }
    if (!list.childElementCount) list.append(el("p", "settings-muted", text("empty")));
  }
  function showDetail(current, feedback) {
    detail.replaceChildren();
    const title = el("h2", "", current.title), facts = el("dl", "authorization-facts");
    const fact = (label, value) => { if (value) facts.append(el("dt", "", label), el("dd", "", value)); };
    fact(text("mode"), text(current.mode));
    fact(text("lifetime"), text(current.lifetime));
    fact(text("status"), text(current.status));
    if (current.expires_at) fact(text("expires"), new Date(current.expires_at).toLocaleString());
    fact(text("source"), current.source ? globalThis.t.text("workbench.agent-review.source-" + current.source.kind) : text("unknown"));
    fact(text("actor"), current.actor);
    fact(text("recent"), current.recent_use_at ? new Date(current.recent_use_at).toLocaleString() : text("unknown"));
    detail.append(title, facts);
    if (current.reason) detail.append(el("p", "settings-muted", current.reason));
    const scope = el("div", "authorization-scope"), change = el("div", "authorization-actions");
    const edits = current.changes.includes("narrow");
    const check = (title, selected, update) => {
      const label = el("label", "settings-check"), box = document.createElement("input");
      box.type = "checkbox"; box.checked = selected; box.disabled = !edits;
      box.addEventListener("change", () => update(box.checked)); label.append(box, document.createTextNode(title));
      return label;
    };
    if (current.categories?.length) {
      const category = item => JSON.stringify([item.provider_id, item.group_id ?? null]);
      kept ??= new Set(current.categories.map(category));
      for (const item of current.categories) scope.append(check(item.title, kept.has(category(item)), on => on ? kept.add(category(item)) : kept.delete(category(item))));
      if (edits) change.append(button(text("narrow"), () => void save(current, "narrow", current.categories.filter(item => kept.has(category(item)))
        .map(({ provider_id, group_id }) => ({ provider_id, ...(group_id ? { group_id } : {}) })))));
    } else if (current.candidates?.length) {
      kept ??= new Map();
      const allowed = key => kept.get(key) !== false;
      for (const item of current.candidates) {
        const group = el("section", "authorization-candidate"); group.append(el("h3", "", item.title));
        if (item.exact_parameters) group.append(el("pre", "", item.exact_parameters));
        if (item.reason) group.append(el("p", "settings-muted", item.reason));
        if (item.operations) item.operations.forEach((operation, index) => {
          const key = item.scope_index + ":" + index;
          const field = el("fieldset", "authorization-operation");
          const toggle = check(operation.title_text ? word(operation.title_text) : operation.title, allowed(key), on => { kept.set(key, on); targets.disabled = !on; });
          const targets = el("fieldset", "authorization-targets"); targets.disabled = !allowed(key);
          field.append(toggle, targets);
          operation.targets.forEach(target => {
            const label = target.title_text ? word(target.title_text) : target.title;
            if (target.values.length < 2) targets.append(el("p", "settings-muted", label + " · " + word(target.values[0].label)));
            else {
              const options = el("fieldset", "authorization-targets"); options.append(el("legend", "", label));
              target.values.forEach(value => {
                const id = JSON.stringify([key, target.key, value.id]);
                options.append(check(word(value.label), allowed(id), on => kept.set(id, on)));
              });
              targets.append(options);
            }
          });
          group.append(field);
        });
        else if (edits) group.append(check(text("keep"), allowed(String(item.scope_index)), on => kept.set(String(item.scope_index), on)));
        scope.append(group);
      }
      if (edits) change.append(button(text("narrow"), () => void save(current, "narrow", current.candidates.flatMap(item => {
        if (!item.operations) return allowed(String(item.scope_index)) ? [{ scope_index: item.scope_index }] : [];
        const operations = item.operations.flatMap((operation, index) => {
          const key = item.scope_index + ":" + index;
          if (!allowed(key)) return [];
          const targets = operation.targets.map(target => ({ key: target.key,
            ids: target.values.filter(value => allowed(JSON.stringify([key, target.key, value.id]))).map(value => value.id) }));
          return targets.every(target => target.ids.length) ? [{ row_index: index, targets }] : [];
        });
        return operations.length ? [{ scope_index: item.scope_index, operations }] : [];
      }))));
    } else if (current.scope.length) {
      const facts = el("ul", "authorization-scope");
      for (const item of current.scope) facts.append(el("li", "", item));
      scope.append(facts);
    }
    if (scope.childElementCount) detail.append(scope);
    const message = el("p", "settings-form-error"); message.setAttribute("role", "alert"); message.hidden = true;
    const announce = el("p", "settings-muted", feedback); announce.dataset.authorizationStatus = ""; announce.setAttribute("role", "status");
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
  async function choose(selected, focus = false, priorSelection = null) {
    delete detail.report;
    const next = ++detailGeneration;
    row = selected; kept = priorSelection; paintList();
    detail.replaceChildren(el("p", "settings-muted", text("loading"))); detail.setAttribute("aria-busy", "true");
    const params = query(); params.set("owner", selected.owner); params.set("id", selected.id);
    try {
      const current = await molisWorkRequest(path + "?" + params);
      if (next !== detailGeneration || !live(selected)) return;
      showDetail(current);
      if (focus && matchMedia("(max-width: 720px)").matches) detail.focus();
    } catch (failure) {
      if (next !== detailGeneration || !live(selected)) return;
      const error = el("p", "settings-form-error"); detail.replaceChildren(error); problem(error, failure);
    } finally { if (next === detailGeneration) detail.removeAttribute("aria-busy"); }
  }
  async function save(current, kind, keep) {
    if (saving) return;
    saving = true;
    const next = detailGeneration, actions = [...detail.querySelectorAll("button, input:not(:disabled)")], status = detail.querySelector("[data-authorization-status]");
    actions.forEach(button => { button.disabled = true; }); status.textContent = text("saving");
    try {
      const saved = await molisWorkRequest(path + "?" + query(), { method: "POST", body: { owner: current.owner, id: current.id, expected: current.expected, kind, ...(keep ? { keep } : {}) } });
      window.dispatchEvent(new CustomEvent("molis:authorization-changed"));
      if (next !== detailGeneration || !live(current)) return;
      rows = rows.map(item => identity(item) === identity(saved) ? saved : item); row = saved; kept = null; paintList(); showDetail(saved, text("updated"));
      detail.focus({ preventScroll: true });
    } catch (failure) {
      if (next !== detailGeneration || !live(current)) return;
      const actual = failure.body?.details?.current;
      if (actual?.owner === current.owner && actual?.id === current.id) {
        rows = rows.map(item => identity(item) === identity(actual) ? actual : item); row = actual; paintList();
        await choose(actual, false, kept);
      } else if (failure.status === 409 || kind === "revoke" || kind === "settle") {
        await choose(current, false, kept);
      } else status.textContent = "";
      detail.report?.(failure);
    } finally { saving = false; actions.forEach(button => { button.disabled = false; }); }
  }
  function paintSources() {
    const needle = search.value.trim().toLocaleLowerCase();
    list.replaceChildren();
    for (const item of sources.filter(row => !needle || row.title.toLocaleLowerCase().includes(needle))) {
      const pick = button("", () => { source = item; paintSources(); detail.focus({ preventScroll: true }); }, "ghost");
      pick.classList.add("authorization-row");
      pick.setAttribute("aria-current", String(source?.id === item.id));
      pick.append(el("strong", "", item.title), el("span", "settings-muted", item.phase));
      list.append(pick);
    }
    if (project.value && !list.childElementCount) list.append(el("p", "settings-muted", text("review-empty")));
    detail.replaceChildren();
    if (!source) {
      detail.append(el("p", "settings-muted", text(project.value ? "select-review" : "choose-review-project")));
      return;
    }
    const facts = el("dl", "authorization-facts");
    for (const [label, value] of [["status", source.phase], ["decision", source.decision], ["source", source.source], ["actor", source.person],
      ["review-time", new Date(source.at).toLocaleString()]]) if (value) facts.append(el("dt", "", text(label)), el("dd", "", value));
    detail.append(el("h2", "", source.title), facts);
    if (source.detail) detail.append(el("p", "settings-form-error", source.detail));
  }
  async function load() {
    const next = ++generation; ++detailGeneration; banner.hidden = true;
    list.setAttribute("aria-busy", "true");
    try {
      if (showing === "reviews") {
        sources = []; source = null; paintSources();
        if (!project.value) return;
        const history = await molisWorkRequest(path + "/reviews?" + query());
        if (next !== generation || !root.isConnected) return;
        sources = history.rows; paintSources();
        if (history.omitted) { banner.textContent = text("review-omitted", { count: history.omitted }); banner.hidden = false; }
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
      if (failed.length) {
        banner.textContent = text(failed.length === answer.owners.length ? "failed" : "partial", { owners: failed.map(item => text(item.owner)).join(text("separator")) });
        banner.hidden = false;
      }
      const selected = row && rows.find(item => identity(item) === identity(row));
      row = selected ?? null; paintList();
      if (selected) await choose(selected);
      else { const message = el("p", "settings-muted", text("select")); detail.replaceChildren(message); }
    } catch (failure) { if (next === generation && root.isConnected) problem(banner, failure); }
    finally { if (next === generation) list.removeAttribute("aria-busy"); }
  }
  const modes = root.querySelectorAll("[data-authorization-view]");
  for (const mode of modes) mode.addEventListener("click", () => {
    if (saving || showing === mode.dataset.authorizationView) return;
    showing = mode.dataset.authorizationView;
    for (const option of modes) option.setAttribute("aria-pressed", String(option === mode));
    owner.hidden = showing === "reviews";
    client.hidden = showing === "reviews" || owner.value !== "mcp-client";
    row = null; kept = null; list.replaceChildren(); detail.replaceChildren();
    void load();
  });
  for (const select of [project, owner, client]) select.addEventListener("change", () => { void load(); });
  q("[data-authorization-reload]").addEventListener("click", () => { void load(); });
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
