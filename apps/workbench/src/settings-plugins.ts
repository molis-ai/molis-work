import type { PluginRetainedKind } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { t as uiText, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * 插件 in a project's settings (ac-trust T7, specs/archive/repository-anti-corruption/slices/ac-trust-install.md): what is installed in the project
 * with who signed it, what it asked for and why, what it keeps doing in the background and the agreements the person gave it; installing a
 * signed package (preview, then confirm; a newer package of an installed plugin is its upgrade) and switching a signed plugin off and on or taking it
 * off (BL-623); taking an agreement back. What it shows and installs goes through
 * `/projects/<id>/api/plugin-trust/*`, which invokes the shared `plugins.*` actions as the person; an agreement is taken back through the
 * Host's one settings door for it, `/api/settings/plugin-consents/revoke` (S-77), never through a route of the plugin page's own; taking a publisher back goes through the same door (`/api/settings/plugin-publishers/revoke`, S-87).
 * Each optional permission an installed plugin asked for is a switch (`permissions/set`, PG-002, S-94); turning on one of the four that reach out or
 * spend (`actions:delegate`, `network:*`, `secret:*`, `model:invoke`) asks first, in the platform's own words for it. The plugins that run as the
 * Home's own instance, shared by every project, are listed below the project's with the same rows; their switch goes through the Host settings
 * door for them, `/api/settings/plugin-permissions/set` (BL-700, S-94), as an agreement is taken back through the Host's, and so do switching a signed one off and on and taking it off (`/api/settings/plugin-permissions/{disable,enable,uninstall}`, BL-715).
 */
/** The mark each kind of thing an uninstall left behind is shown with (BL-915); the page draws them from these templates. */
export const PLUGIN_RETAINED_ICONS = { home_library: "database", owner_files: "folder", network_credential: "key", installation_binding: "link", task_grant: "shield", declared_rule: "tune" } as const satisfies Record<PluginRetainedKind, PluginIconName>;

export function renderPluginTrustSettings({ projectId, chevron, kinds }: { readText(text: string): string; projectId: string; chevron: string; kinds: Readonly<Record<string, string>> }): string {
  return `<section class="settings-document plugin-trust-settings" aria-labelledby="plugin-trust-title" data-plugin-trust-settings data-project="${projectId}">
    <header class="settings-page-heading"><h1 id="plugin-trust-title">${uiText("workbench.settings-plugins.plugin")}</h1>
      <p>${uiText("workbench.settings-plugins.plugins-installed-project-who-signed-them-what-they")}</p></header>
    <p class="settings-form-error" data-plugin-trust-error role="alert" hidden></p>
    <section class="settings-section" aria-labelledby="plugin-trust-install-title">
      <h2 id="plugin-trust-install-title">${uiText("workbench.settings-plugins.install-plugin-package")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-plugins.choose-signed-plugin-package-before-anything-installed-see")}</p>
      <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-plugin-trust-choose>${uiText("workbench.settings-plugins.choose-package")}</button>
      <input type="file" accept=".json,application/json" hidden data-plugin-trust-pick>
      <div data-plugin-trust-bundled hidden></div>
      <div class="plugin-trust-preview" data-plugin-trust-preview hidden></div>
    </section>
    <section class="settings-section" aria-labelledby="plugin-trust-list-title">
      <h2 id="plugin-trust-list-title">${uiText("workbench.settings-plugins.installed-plugins")}</h2>
      <ul class="plugin-trust-list" data-plugin-trust-list><li class="settings-muted">${uiText("workbench.settings-plugins.loading")}</li></ul>
    </section>
    <section class="settings-section" aria-labelledby="plugin-trust-home-title">
      <h2 id="plugin-trust-home-title">${uiText("workbench.settings-plugins.plugins-personal-space")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-plugins.these-plugins-run-personal-space-one-copy-shared")}</p>
      <ul class="plugin-trust-list" data-plugin-trust-home><li class="settings-muted">${uiText("workbench.settings-plugins.loading")}</li></ul>
    </section>
    <section class="settings-section" aria-labelledby="plugin-trust-publishers-title">
      <h2 id="plugin-trust-publishers-title">${uiText("workbench.settings-plugins.publishers-trust")}</h2>
      <p class="settings-muted">${uiText("workbench.settings-plugins.publishers-have-pinned-packages-they-sign-later-installed")}</p>
      <ul class="plugin-trust-list" data-plugin-trust-publishers><li class="settings-muted">${uiText("workbench.settings-plugins.loading")}</li></ul>
    </section>
    <template data-plugin-trust-chevron>${chevron}</template>
    ${Object.entries(kinds).map(([kind, mark]) => `<template data-plugin-trust-kind="${kind}">${mark}</template>`).join("")}
  </section>`;
}

/**
 * The page's program: it draws the overview with textContent only (nothing a Manifest or a package says is ever parsed as markup), reads a
 * chosen package file, and sends the person's steps to the routes. A step that takes something back asks first in the catalog's alert
 * dialog. Bound to every 插件 page, also one the settings cover places later. Its lines are flush left: the page budget counts every byte
 * of the workbench program.
 */
export const PLUGIN_TRUST_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
const bind = (root) => {
if (!root || root.dataset.pluginTrustBound === "1") return;
root.dataset.pluginTrustBound = "1";
const readText = globalThis.t.text;
const base = "/projects/" + encodeURIComponent(root.dataset.project || "") + "/api/plugin-trust";
const $ = (name) => root.querySelector("[data-plugin-trust-" + name + "]");
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
const button = (text, variant) => { const node = el("button", "mw-btn " + variant + " mw-btn--sm", text); node.type = "button"; return node; };
const TRUST = { host: "workbench.settings-plugins.shipped-molis-work", pinned: "workbench.settings-plugins.publisher-pinned", unsigned: "workbench.settings-plugins.not-signed" };
const STATE = { installed: "workbench.settings-plugins.installed", running: "workbench.settings-plugins.running", disabled: "workbench.settings-plugins.switched-off", uninstalled: "workbench.settings-plugins.uninstalled" };
const KIND = { always_on: "workbench.settings-plugins.always", default_wiring: "workbench.settings-plugins.default-wiring", default_group: "workbench.settings-plugins.default-input-group", local_directory: "workbench.settings-plugins.local-folders" };
const SYSTEM_SOURCES = { "system.materials": "workbench.settings-plugins.sys-materials" };
// What an uninstall that deleted data left in place, and why (BL-915): each owner's own kind and reason, never a path, an id or a credential.
const KEPT = { home_library: "workbench.settings-plugins.library", owner_files: "workbench.settings-plugins.files-saved", network_credential: "workbench.settings-plugins.network-credentials-used", installation_binding: "workbench.settings-plugins.account-connections", task_grant: "workbench.settings-plugins.task-permissions-given", declared_rule: "workbench.settings-plugins.judgment-rules-brought" };
const WHY = { ownership_unverified: "workbench.settings-plugins.couldn-t-confirm-plugin-s-so-left", other_holder: "workbench.settings-plugins.same-plugin-elsewhere-another-project-personal-space", inventory_unavailable: "workbench.settings-plugins.some-data-couldn-t-read-check-whether" };
const EFFECT = { storage: "workbench.settings-plugins.saves-data", artifacts: "workbench.settings-plugins.artifact-library", capabilities: "workbench.settings-plugins.calls-actions", events: "workbench.settings-plugins.sends-receives-events", networkDomains: "workbench.settings-plugins.network", secretRefs: "workbench.settings-plugins.secrets", resources: "workbench.settings-plugins.resources" };
const day = (iso) => String(iso || "").slice(0, 10);
const short = (id) => String(id).replace(/^ed25519:sha256:/, "").slice(0, 12);
const error = $("error");
const board = () => document.querySelector("[data-settings-toast], [data-toast]");
const showFailure = (failure, nothingInstalled = false) => { const shown = nothingInstalled && failure?.message ? new Error(readText("workbench.settings-plugins.nothing-was-installed-the-previous-installation-is-unchanged") + " " + failure.message) : failure; molisWorkRequest.show(error, shown); error.hidden = false; return shown; };
const fail = (failure, nothingInstalled) => { const shown = showFailure(failure, nothingInstalled), target = board(); if (target) molisWorkRequest.toast(target, shown, undefined, { ms: 5000 }); };
// A package the Host read and refused: nothing was pinned, kept or installed (SKP-08). Say so next to its problems.
const badPackage = (failure) => failure && (failure.code === "plugin.declaration_invalid" || failure.code === "plugin.package_invalid");
const toast = (text) => { const box = board(); if (!box) return; box.textContent = text; box.classList.remove("is-error"); box.classList.add("is-visible"); setTimeout(() => box.classList.remove("is-visible"), 2600); };
const api = (path, payload) => molisWorkRequest(base + path, { body: payload });
const homeApi = (name, payload = {}) => molisWorkRequest("/api/settings/plugin-permissions/" + name, { body: payload });
const reachApi = (name, payload = {}) => molisWorkRequest("/projects/" + encodeURIComponent(root.dataset.project) + "/api/settings/plugin-project-reach/" + name, { body: payload });
let reachViews = new Map(), reachCapabilities = new Map(), projectName = "";
const ask = (title, description, yesLabel) => new Promise((resolve) => {
const dialog = el("dialog", "mw-dialog mw-dialog--alert"); dialog.dataset.slot = "alert-dialog";
const form = el("form", "mw-form mw-dialog__shell"); form.method = "dialog";
const header = el("header", "mw-form__header"), heading = el("div"), h2 = el("h2", "", title);
heading.append(h2, el("p", "", description)); header.append(heading);
const footer = el("footer", "mw-form__footer"), cancel = el("button", "mw-btn mw-btn--secondary mw-btn--md", readText("common.control.cancel")), yes = el("button", "mw-btn mw-btn--danger mw-btn--md", yesLabel);
cancel.type = "button"; yes.type = "button";
footer.append(cancel, yes); form.append(header, footer); dialog.append(form);
let answer = false;
cancel.addEventListener("click", () => dialog.close());
yes.addEventListener("click", () => { answer = true; dialog.close(); });
dialog.addEventListener("close", () => { dialog.remove(); resolve(answer); });
root.append(dialog); dialog.showModal(); cancel.focus();
});
const group = (title, empty, rows) => {
const box = el("div", "plugin-trust-group"); box.append(el("strong", "", title));
if (!rows.length) box.append(el("span", "settings-muted", empty)); else { const list = el("ul", "plugin-trust-rows"); list.append(...rows); box.append(list); }
return box;
};
const row = (head, ...notes) => { const item = el("li"); item.append(el("span", "", head)); notes.filter(Boolean).forEach((note) => item.append(el("span", "settings-muted", note))); return item; };
// What a plugin asked for: its own reason, and what the platform itself says the permission is.
const permissions = (items) => group(readText("workbench.settings-plugins.what-asks"), readText("workbench.settings-plugins.asks-no-permissions"), items.map((item) =>
row(item.permission + (item.requested ? (item.required ? "" : " · " + readText("workbench.settings-plugins.optional")) : " · " + readText("workbench.settings-plugins.not-requested-time")), item.reason, item.meaning)));
// A job whose permission the person switched off is paused: its activation needs the grant at every step.
const jobs = (items, held) => group(readText("workbench.settings-plugins.what-keeps-doing-background"), readText("workbench.settings-plugins.no-background-jobs"), items.map((item) => {
const off = (held || []).filter((view) => !view.granted && item.permissions.includes(view.permission)).map((view) => view.permission);
return row(item.job_id, item.reason, item.permissions.length ? globalThis.t.text("workbench.settings-plugins.uses-permissions", { permissions: item.permissions.join(globalThis.t.text("common.list.separator")) }) : globalThis.t.text("workbench.settings-plugins.needs-no-extra-permission"), off.length ? globalThis.t.text("workbench.settings-plugins.paused-permissions-switched-off", { permissions: off.join(globalThis.t.text("common.list.separator")) }) : "");
}));
// The four that reach out of the project or spend money are confirmed before they are switched on; the rest take one click.
const WIDE = (permission) => permission === "actions:delegate" || permission === "model:invoke" || /^(network|secret):/.test(permission);
const grants = (plugin, repaint, send, managed) => group(readText("workbench.settings-plugins.what-asks"), readText("workbench.settings-plugins.asks-no-permissions"), plugin.permissions.map((item) => {
const line = row(item.permission + " · " + (!item.requested ? readText("workbench.settings-plugins.not-requested-time") : item.required ? readText("workbench.settings-plugins.required") : readText("workbench.settings-plugins.optional")), item.reason, item.meaning);
if (item.required || !item.requested) return line;
if (managed) { line.append(el("span", "settings-muted", readText(managed))); return line; }
const control = el("span", "mw-switch"), toggle = el("input"), track = el("span", "mw-switch__track");
toggle.type = "checkbox"; toggle.setAttribute("role", "switch"); toggle.checked = item.granted; toggle.setAttribute("aria-label", item.permission);
track.setAttribute("aria-hidden", "true"); control.append(toggle, track); line.append(control);
toggle.addEventListener("change", async () => {
const on = toggle.checked;
if (on && WIDE(item.permission) && !await ask(readText("workbench.settings-plugins.turn-permission"), readText("workbench.settings-plugins.plugin-would-use-permission-meaning", { plugin: plugin.name, permission: item.permission, meaning: item.meaning || item.reason }), readText("workbench.settings-plugins.turn"))) { toggle.checked = false; return; }
error.hidden = true; toggle.disabled = true;
try {
plugin.permissions = (await send({ install_id: plugin.install_id, permission: item.permission, granted: on })).permissions;
toast(on ? readText("workbench.settings-plugins.permission-turned", { permission: item.permission }) : readText("workbench.settings-plugins.permission-turned-off", { permission: item.permission }));
} catch (failure) { toggle.checked = !on; fail(failure); }
toggle.disabled = false; repaint();
});
return line;
}));
const draw = (target, empty, nodes) => { target.replaceChildren(...(nodes.length ? nodes : [el("li", "settings-muted", empty)])); };
// A bundled plugin's default that now reads the platform's materials is the person's to agree to; the Host never does it on an upgrade (BSH-06).
const pending = (plugin, wait) => {
const what = { plugin: plugin.name, port: wait.port, source: SYSTEM_SOURCES[wait.source_plugin_id] ? readText(SYSTEM_SOURCES[wait.source_plugin_id]) : wait.source_name, source_port: wait.source_port };
const item = row(readText("workbench.settings-plugins.pending-wiring", what), readText("workbench.settings-plugins.not-agreed"));
const agree = button(readText("workbench.settings-plugins.agree-source"), "mw-btn--secondary"); agree.dataset.pendingDefault = wait.port;
agree.addEventListener("click", async () => {
if (!await ask(readText("workbench.settings-plugins.agree-q", what), readText("workbench.settings-plugins.agree-detail"), readText("workbench.settings-plugins.agree"))) return;
error.hidden = true; agree.disabled = true;
try { await molisWorkRequest("/api/settings/plugin-consents/grant-default-source", { body: { plugin_id: plugin.plugin_id, port: wait.port } }); toast(readText("workbench.settings-plugins.source-agreed")); await load(); }
catch (failure) { fail(failure); } finally { agree.disabled = false; }
});
item.append(agree); return item;
};
const consents = (plugin, agreements) => group(readText("workbench.settings-plugins.agreements-gave"), readText("workbench.settings-plugins.no-agreements"), (plugin.pending_defaults || []).map((wait) => pending(plugin, wait)).concat(agreements.map((consent) => {
const item = row(readText(KIND[consent.kind] || consent.kind) + " · " + consent.subject,
consent.revoked_at ? readText("workbench.settings-plugins.revoked-date", { date: day(consent.revoked_at) }) : readText(consent.granted_by === "user" ? "workbench.settings-plugins.agreed" : "workbench.settings-plugins.agreed-molis-work-plugin-ships") + " · " + day(consent.granted_at));
if (!consent.revoked_at) {
const revoke = button(readText("workbench.settings-plugins.revoke-agreement"), "mw-btn--ghost");
revoke.addEventListener("click", async () => {
if (!await ask(readText("workbench.settings-plugins.revoke-agreement-2"), readText("workbench.settings-plugins.kind-agreement-plugin-subject-revoking-takes-effect-once", { plugin: plugin.name, kind: readText(KIND[consent.kind] || consent.kind), subject: consent.subject }), readText("workbench.settings-plugins.withdraw"))) return;
error.hidden = true;
try { await molisWorkRequest("/api/settings/plugin-consents/revoke", { body: { consent_id: consent.consent_id } }); toast(readText("workbench.settings-plugins.agreement-revoked")); await load(); } catch (failure) { fail(failure); }
});
item.append(revoke);
}
return item;
})));
const projectReach = (plugin, view) => {
const box = el("div", "plugin-trust-group"); box.dataset.projectReach = plugin.plugin_id; box.style.overflowWrap = "anywhere";
box.append(el("strong", "", readText("workbench.settings-plugins.read-write-project")), el("span", "settings-muted", projectName));
const status = { unapproved: "workbench.settings-plugins.not-approved", approved: "workbench.settings-plugins.approved", expanded: "workbench.settings-plugins.declared-actions-have-increased", unavailable: "workbench.settings-plugins.signed-package-approval-record-could-not-be-read" };
box.append(el("p", "", readText(status[view.state])), el("p", "settings-muted", readText("workbench.settings-plugins.approval-applies-only-project-installation-can-withdraw-any")));
if (view.error) box.append(el("p", "settings-form-error", view.error));
const describe = (id) => {
const item = reachCapabilities.get(id);
return row(item ? item.title : id, item ? item.description : "", item?.available ? "" : readText("workbench.settings-plugins.unavailable-now"));
};
if (view.capability_ids.length) box.append(group(readText("workbench.settings-plugins.declared-actions"), "", view.capability_ids.map(describe)));
if (view.added_capability_ids.length) box.append(group(readText("workbench.settings-plugins.newly-declared-actions"), "", view.added_capability_ids.map(describe)));
const actions = el("div", "plugin-trust-actions"); actions.style.flexWrap = "wrap";
const add = (name, label, title, detail) => {
const node = button(readText(label), name === "grant" ? "mw-btn--primary" : "mw-btn--ghost"); node.dataset.projectReachAction = name;
node.style.whiteSpace = "normal"; node.style.maxWidth = "100%";
node.addEventListener("click", async () => {
const controls = Array.from(actions.querySelectorAll("button")); controls.forEach((item) => { item.disabled = true; });
try {
if (!await ask(readText(title), readText(detail, { plugin: plugin.name, project: projectName }), readText(label))) return;
error.hidden = true;
await reachApi(name, { plugin_id: plugin.plugin_id, snapshot: view.snapshot });
await load(); toast(readText(name === "grant" ? "workbench.settings-plugins.access-project-approved" : "workbench.settings-plugins.approval-project-withdrawn"));
} catch (failure) { fail(failure); try { await load(); } catch (refresh) { fail(refresh); } }
finally { controls.forEach((item) => { item.disabled = false; }); }
}); actions.append(node);
};
if (view.state === "unapproved" || view.state === "expanded") add("grant", "workbench.settings-plugins.allow-access-project", "workbench.settings-plugins.allow-access-project-2", "workbench.settings-plugins.allow-plugin-read-write-project-through-its-declared");
if (view.state !== "unapproved") add("revoke", "workbench.settings-plugins.withdraw-approval-project", "workbench.settings-plugins.withdraw-approval-project-2", "workbench.settings-plugins.plugin-will-no-longer-be-able-read-write");
box.append(actions); return box;
};
// A signed plugin is switched off and on and taken off here (BL-623), one of the Home's through the Host settings door (BL-715); a publisher taken back leaves only taking it off.
const controls = (plugin, revoked, act = (name, payload) => api("/installed/" + name, payload)) => {
const box = el("div", "plugin-trust-actions");
const step = (text, variant, name, payload, done, title, detail, into = box) => {
const node = button(text, variant);
node.addEventListener("click", async () => {
if (title && !await ask(title, detail, text)) return;
error.hidden = true; node.disabled = true; node.setAttribute("aria-busy", "true");
const row = node.closest(".plugin-trust-list > li"), list = act === homeApi ? "home" : "list";
try {
const answer = await act(name, { plugin_id: plugin.plugin_id, ...payload });
broken = null;
// What an uninstall left stays where its row was until 「知道了」 (BL-915, option A); nothing left is the usual toast.
if (answer && answer.retained && answer.retained.length) outcome = { list, index: row ? [...row.parentNode.children].indexOf(row) : 0, name: plugin.name, retained: answer.retained, fresh: true };
else toast(done);
await load();
} catch (failure) {
if (name !== "uninstall") { node.disabled = false; node.removeAttribute("aria-busy"); fail(failure); return; }
// An uninstall that stopped part way is said and retried in its own row; anything else is the page's error.
broken = { install_id: plugin.install_id, message: failure && failure.message, fresh: true }; await load().catch(() => {});
if (![...current, ...personal].some((item) => item.install_id === plugin.install_id && item.pending_keep_data !== undefined)) { broken = null; fail(failure); }
}
});
into.append(node);
};
const name = plugin.name, target = plugin.uninstall_target;
// An uninstall whose clean-up did not finish (BL-915) is said in place and only retried, with the choice it was made with.
if (plugin.pending_keep_data !== undefined) {
const said = broken && broken.install_id === plugin.install_id ? broken.message : "", alert = notice("danger", readText("workbench.settings-plugins.uninstall-didn-t-finish"), "alert"), actions = el("div", "mw-alert__actions");
alert.append(el("p", "", said ? said : readText(plugin.pending_keep_data ? "workbench.settings-plugins.last-uninstall-keeping-data-did-not-finish" : "workbench.settings-plugins.last-uninstall-deleting-data-did-not-finish")), actions);
step(readText("workbench.settings-plugins.retry-uninstall"), "mw-btn--primary", "uninstall", { keep_data: plugin.pending_keep_data, target }, readText("workbench.settings-plugins.uninstalled"), undefined, undefined, actions);
// Just failed here: bring it into view and put the retry under the person's hand, once.
if (said && broken.fresh) { broken.fresh = false; requestAnimationFrame(() => { alert.scrollIntoView({ block: "nearest" }); actions.firstChild?.focus({ preventScroll: true }); }); }
return alert;
}
if (plugin.state === "running") step(readText("workbench.settings-plugins.deactivate"), "mw-btn--secondary", "disable", {}, readText("workbench.settings-plugins.switched-off"), readText("workbench.settings-plugins.switch-plugin-off"), readText("workbench.settings-plugins.plugin-stops-running-offers-no-actions-its-data", { plugin: name }));
else if (plugin.state === "disabled" && !revoked.has(plugin.publisher_signature)) {
const { install_id, installation_generation, version, manifest_digest } = plugin;
step(readText("workbench.settings-plugins.enable"), "mw-btn--secondary", "enable", act === homeApi ? {} : { expected_installation: { scope: "project", install_id, installation_generation, version, manifest_digest } }, readText("workbench.settings-plugins.enabled"));
}
step(readText("workbench.settings-plugins.uninstall-keep-data"), "mw-btn--ghost", "uninstall", { keep_data: true, target }, readText("workbench.settings-plugins.uninstalled"), readText("workbench.settings-plugins.uninstall-plugin"), readText("workbench.settings-plugins.plugin-uninstalled-its-data-kept-installing-same-plugin", { plugin: name }));
step(readText("workbench.settings-plugins.uninstall-delete-data"), "mw-btn--ghost", "uninstall", { keep_data: false, target }, readText("workbench.settings-plugins.uninstalled"), readText("workbench.settings-plugins.uninstall-plugin"), readText("workbench.settings-plugins.plugin-uninstalled-its-data-deleted-cannot-be-undone", { plugin: name }));
return box;
};
const installed = (plugin, send = (payload) => api("/permissions/set", payload), revoked = null, act, managed) => {
const box = el("details", "settings-advanced plugin-trust-item"), summary = el("summary"), copy = el("span", "setting-copy");
copy.append(el("strong", "", plugin.name + " · " + plugin.version), el("span", "", readText(TRUST[plugin.trust] || plugin.trust) + (plugin.publisher_label ? " · " + plugin.publisher_label : "") + " · " + readText(STATE[plugin.state] || plugin.state)));
summary.append(copy); const mark = $("chevron"); if (mark) summary.append(mark.content.cloneNode(true));
const body = el("div", "plugin-trust-body");
body.append(el("span", "settings-muted", plugin.plugin_id + (plugin.publisher_signature && plugin.trust !== "host" ? " · " + short(plugin.publisher_signature) : "")));
const pending = plugin.pending_keep_data !== undefined;
if (pending) box.open = Boolean(broken && broken.install_id === plugin.install_id);
else if (revoked && revoked.has(plugin.publisher_signature)) body.append(el("span", "settings-muted", readText("workbench.settings-plugins.trust-its-publisher-was-revoked-no-longer-runs")));
else if (plugin.recovery_error) body.append(el("span", "settings-form-error", readText("workbench.settings-plugins.could-not-start-error", { error: readText(plugin.recovery_error === "plugin.publisher_revoked" ? "workbench.settings-plugins.publisher-revoked" : plugin.recovery_error === "plugin.manifest_version_invalid" ? "workbench.settings-plugins.platform-version-mismatch" : plugin.recovery_error === "plugin.package_missing" ? "workbench.settings-plugins.package-plugin-installed-missing-only-uninstalled" : "workbench.settings-plugins.retry-start") })));
const work = el("div"), repaint = () => work.replaceChildren(jobs(plugin.jobs, plugin.permissions));
if (plugin.manifest_available) { body.append(grants(plugin, repaint, send, managed)); repaint(); body.append(work); } else if (!pending) body.append(el("span", "settings-muted", readText("workbench.settings-plugins.permissions-plugin-was-installed-cannot-be-read")));
const reach = act === homeApi ? reachViews.get(plugin.plugin_id) : null;
const agreements = plugin.consents.filter((consent) => consent.kind !== "project_reach");
if (agreements.length || plugin.pending_defaults?.length || !reach) body.append(consents(plugin, agreements));
if (reach) body.append(projectReach(plugin, reach));
if (plugin.trust === "pinned" && revoked) body.append(controls(plugin, revoked, act)); box.append(summary, body);
const item = el("li"); item.append(box); return item;
};
const publisher = (pin) => {
const item = row(pin.label + " · " + short(pin.key_id), pin.revoked_at ? readText("workbench.settings-plugins.revoked-date-2", { date: day(pin.revoked_at) }) : readText("workbench.settings-plugins.pinned-date", { date: day(pin.pinned_at) }));
if (!pin.revoked_at) {
const revoke = button(readText("workbench.settings-plugins.revoke-trust"), "mw-btn--ghost");
revoke.addEventListener("click", async () => {
if (!await ask(readText("workbench.settings-plugins.revoke-trust-publisher"), readText("workbench.settings-plugins.packages-name-signed-can-no-longer-be-installed", { name: pin.label }), readText("workbench.settings-plugins.revoke-trust"))) return;
error.hidden = true;
try { await molisWorkRequest("/api/settings/plugin-publishers/revoke", { body: { key_id: pin.key_id } }); toast(readText("workbench.settings-plugins.trust-publisher-revoked")); await load(); } catch (failure) { fail(failure); }
});
item.append(revoke);
}
return item;
};
const notice = (tone, title, role) => { const box = el("div", "mw-alert mw-alert--" + tone + " mw-alert--rise"); box.dataset.slot = "alert"; box.setAttribute("role", role); box.append(el("strong", "", title)); return box; };
let outcome = null, broken = null;
// The result of an uninstall in place of its row: what was left, each with why, and that the rest is gone; 「知道了」 puts it away.
const result = () => {
const item = el("li", "plugin-trust-result"), list = el("ul", "plugin-trust-kept"), actions = el("div", "mw-alert__actions"), done = button(readText("workbench.assistant-notice.dismiss"), "mw-btn--secondary");
const alert = notice(outcome.retained.some((kept) => kept.reason !== "other_holder") ? "warning" : "info", readText("workbench.settings-plugins.plugin-uninstalled-count-left-place", { plugin: outcome.name, count: outcome.retained.length }), "status");
for (const kept of outcome.retained) {
const row = el("li"), mark = root.querySelector('[data-plugin-trust-kind="' + kept.kind + '"]');
if (mark) row.append(mark.content.cloneNode(true));
row.append(el("strong", "", readText(KEPT[kept.kind]) + (kept.label ? " · " + kept.label : "")), el("span", "", readText(WHY[kept.reason]))); list.append(row);
}
// Put away, the focus goes to the row now in its place (or the one before it, or the list), not to the page: a keyboard user carries on from there.
done.addEventListener("click", () => { const was = outcome; outcome = null; load().then(() => {
const target = $(was.list), rows = [...target.children], next = (rows[was.index] ?? rows[was.index - 1])?.querySelector("summary");
if (next) next.focus(); else { target.tabIndex = -1; target.focus(); }
}).catch(fail); });
actions.append(done); alert.append(list, el("p", "settings-muted", readText("workbench.settings-plugins.everything-else-deleted")), actions); item.tabIndex = -1; item.append(alert);
const target = $(outcome.list), empty = target.children.length === 1 && !target.firstElementChild.querySelector("details");
if (empty) target.replaceChildren(item); else target.insertBefore(item, target.children[outcome.index] || null);
if (outcome.fresh) { outcome.fresh = false; item.focus(); }
};
let current = [], personal = [], loading = 0;
const load = async () => {
const revision = ++loading;
const data = await api("/overview");
const revoked = new Set(data.publishers.filter((pin) => pin.revoked_at).map((pin) => pin.key_id));
const homeData = (await homeApi("list")).plugins;
const reachData = await reachApi("list");
if (revision !== loading) return;
current = data.plugins; personal = homeData; projectName = reachData.project_name;
reachViews = new Map(reachData.plugins.map((item) => [item.plugin_id, item])); reachCapabilities = new Map(reachData.capabilities.map((item) => [item.capability_id, item]));
const managed = new Set(data.home_managed_install_ids || []);
draw($("list"), readText("workbench.settings-plugins.no-plugins-installed-project"), data.plugins.map((plugin) => {
const paired = personal.some((home) => home.install_id === plugin.install_id && home.plugin_id === plugin.plugin_id && home.publisher_signature === plugin.publisher_signature && home.trust === plugin.trust);
const item = installed(plugin, undefined, revoked, undefined, managed.has(plugin.install_id) ? paired ? "workbench.settings-plugins.manage-plugin-s-optional-permissions-personal-space" : "workbench.settings-plugins.plugin-s-permissions-currently-unavailable-personal-space" : undefined);
// A plugin that also runs in the personal space is listed in both groups (F-20): say why on the project's row.
if (personal.some((home) => home.plugin_id === plugin.plugin_id)) item.querySelector(".setting-copy")?.append(el("span", "settings-muted", readText("workbench.settings-plugins.also-personal-space-project-s-content-here")));
return item;
}));
const homeSend = (payload) => homeApi("set", payload);
draw($("home"), readText("workbench.settings-plugins.no-plugins-personal-space"), personal.map((plugin) => installed(plugin, homeSend, revoked, homeApi)));
draw($("publishers"), readText("workbench.settings-plugins.have-not-pinned-publisher"), data.publishers.map(publisher));
if (outcome) result();
};
const preview = $("preview");
const close = () => { preview.replaceChildren(); preview.hidden = true; };
const review = (shown) => {
const view = shown.preview, panel = el("div", "plugin-trust-review"); panel.style.overflowWrap = "anywhere";
panel.append(el("h3", "", shown.name + " · " + view.version), el("span", "settings-muted", view.plugin_id + " · " + readText("workbench.settings-plugins.signed-id", { id: shown.publisher.key_id })));
panel.append(el("p", "settings-muted", readText(shown.runtime_scope === "home" ? "workbench.settings-plugins.install-personal-space" : "workbench.settings-plugins.install-project")));
const was = (shown.runtime_scope === "home" ? personal : current).find((plugin) => plugin.plugin_id === view.plugin_id);
if (was) panel.append(el("span", "", readText("workbench.settings-plugins.installed-installing-upgrades-its-data-kept", { from: was.version, to: view.version })));
panel.append(permissions(view.permissions), jobs(view.jobs));
globalThis.molisSkillUI?.preview(panel, shown.skills);
if (shown.requires?.length) panel.append(group(readText("workbench.settings-plugins.required-capabilities"), "", shown.requires.map(item => row(item.capability_id, item.reason, readText(item.satisfied ? "workbench.settings-agent-diagnostics.present" : "workbench.settings-plugins.not-available")))));
if (shown.origins?.length) panel.append(group(readText("workbench.settings-plugins.service-addresses-may-access"), "", shown.origins.map((service) => row(service.title, service.service_id, ...service.origins))));
if (shown.agent_bodies && shown.agent_bodies.length) {
const bodies = el("div", "plugin-trust-agent-bodies"); bodies.append(el("h4", "", readText("workbench.settings-plugins.role-material")));
shown.agent_bodies.forEach((item) => {
const body = el("div", "plugin-trust-agent-body");
body.append(el("strong", "", readText("workbench.assistant-composer.role-material-title", { name: item.name })));
if (item.change) body.append(el("p", "settings-muted", readText({ added: "workbench.settings-plugins.body-added", changed: "workbench.settings-plugins.body-changed", removed: "workbench.settings-plugins.body-removed" }[item.change])));
const excerpt = el("pre", "", item.excerpt); excerpt.style.whiteSpace = "pre-wrap"; excerpt.style.overflowWrap = "anywhere";
body.append(excerpt);
if (item.truncated) {
body.append(el("p", "settings-muted", readText("workbench.settings-plugins.truncated-expand")));
const details = el("details", ""); details.append(el("summary", "", readText("workbench.settings-plugins.read-complete")));
const full = el("pre", "", item.body); full.style.whiteSpace = "pre-wrap"; full.style.overflowWrap = "anywhere";
details.append(full); body.append(details);
}
bodies.append(body);
}); panel.append(bodies);
}
const effects = Object.keys(shown.effects || {}).filter((key) => shown.effects[key] && shown.effects[key].length);
panel.append(group(globalThis.t.text("workbench.settings-plugins.what-its-code-may-do"), globalThis.t.text("workbench.settings-plugins.reads-writes-nothing"), effects.map((key) => row(globalThis.t.text(EFFECT[key] || key), shown.effects[key].join(globalThis.t.text("common.list.separator"))))));
let label = null;
if (shown.publisher.pinned_label) panel.append(el("span", "settings-muted", readText("workbench.settings-plugins.pinned-publisher-name", { name: shown.publisher.pinned_label })));
else {
const field = el("label", "plugin-trust-pin"); label = el("input", "mw-input"); label.type = "text"; label.maxLength = 80; label.autocomplete = "off";
field.append(el("span", "", readText("workbench.settings-plugins.have-not-trusted-publisher-yet-give-name-pin")), label); panel.append(field);
}
const footer = el("div", "plugin-trust-actions"), cancel = button(readText("common.control.cancel"), "mw-btn--secondary"), install = button(readText("workbench.settings-plugins.agree-install"), "mw-btn--primary");
footer.style.flexWrap = "wrap"; install.style.maxWidth = "100%"; install.style.whiteSpace = "normal";
cancel.addEventListener("click", close);
install.addEventListener("click", async () => {
const name = label ? label.value.trim() : "";
if (label && !name) { label.setAttribute("aria-invalid", "true"); label.focus(); return; }
install.disabled = true; error.hidden = true;
try { await api("/install/confirm", { preview_id: shown.preview_id, consent: true, ...(label ? { pin_label: name } : {}) }); toast(readText("workbench.settings-plugins.installed")); await load(); await globalThis.molisSkillUI.enable(preview, root.dataset.project, view.plugin_id, close); }
catch (failure) { fail(failure, badPackage(failure)); install.disabled = false; }
});
footer.append(cancel, install); panel.append(footer);
preview.replaceChildren(panel); preview.hidden = false; panel.scrollIntoView?.({ block: "nearest" });
};
$("choose").addEventListener("click", () => $("pick").click());
$("pick").addEventListener("change", async (event) => {
const file = event.target.files && event.target.files[0];
event.target.value = ""; if (!file) return;
error.hidden = true; close();
try {
let bundle;
try { bundle = JSON.parse(await file.text()); } catch { throw new Error(readText("workbench.settings-plugins.file-not-plugin-package")); }
review(await api("/install/preview", { bundle }));
} catch (failure) { showFailure(failure, badPackage(failure)); }
});
api("/bundled/list", {}).then(data => {
const box = $("bundled"); if (!data.plugins.length && !data.refused.length) return; box.hidden = false;
box.append(el("h3", "", readText("workbench.settings-plugins.included-with-this-release")));
for (const item of data.plugins) { const pick = button(item.name + " · " + item.version, "mw-btn--secondary"); pick.disabled = item.publisher.revoked;
pick.addEventListener("click", async () => { pick.disabled = true; try { review(await api("/install/preview", { bundled: { plugin_id: item.plugin_id, version: item.version } })); } catch (cause) { fail(cause, badPackage(cause)); } finally { pick.disabled = item.publisher.revoked; } }); box.append(pick); }
for (const item of data.refused) box.append(el("p", "settings-form-error", item.file + " · " + item.message));
}).catch(fail);
load().catch(fail);
// A content package 「能力包」's import handed over (browser/kit/files.ts): it goes through this same install review, read once.
let handed = null; try { handed = sessionStorage.getItem("molis-work:kit-package"); sessionStorage.removeItem("molis-work:kit-package"); } catch { /* no storage here: nothing was handed */ }
if (handed) (async () => { try { review(await api("/install/preview", { bundle: JSON.parse(handed) })); } catch (failure) { fail(failure, badPackage(failure)); } })();
};
globalThis.molisWorkBindPluginTrustSettings = (container = document) => {
if (container.matches?.("[data-plugin-trust-settings]")) bind(container);
else container.querySelectorAll?.("[data-plugin-trust-settings]").forEach(bind);
};
document.addEventListener("molis-work:settings-embed", (event) => globalThis.molisWorkBindPluginTrustSettings(event.detail && event.detail.root));
const start = () => globalThis.molisWorkBindPluginTrustSettings(document);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
`;
