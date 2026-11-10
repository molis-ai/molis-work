import { CHARACTER_IMPORT_RUNTIMES } from "@molis-ai/molis-work-contracts/modules/characters";
import { externalTool } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { escapeHtml, t } from "@molis-ai/molis-work-plugin-sdk/ui";
/** Skills occupy the existing settings shell; the catalog owns every displayed state. */
export function renderSkillSettings(projectId: string | null): string {
  return `<section class="settings-document skill-settings" data-skill-settings data-project="${escapeHtml(projectId ?? "")}" aria-labelledby="skills-heading">
  <template data-sk-import-sources>${CHARACTER_IMPORT_RUNTIMES.map(id => `<option value="${id}">${externalTool(id).display_name}</option>`).join("")}</template>
  <header class="settings-page-heading"><h1 id="skills-heading">${t("workbench.settings-skills.skills")}</h1><p>${t(projectId ? "workbench.settings-skills.choose-the-skills-available-in-this-project" : "workbench.settings-skills.choose-the-skills-available-in-your-personal-space")}</p></header>
  <div class="skill-toolbar"><input class="mw-input" type="search" data-sk-search placeholder="${t("workbench.settings-skills.search-skills")}" aria-label="${t("workbench.settings-skills.search-skills")}"><select class="mw-select" data-sk-filter aria-label="${t("workbench.settings-skills.filter-skills")}"><option value="all">${t("common.generated.all")}</option><option value="on">${t("workbench.appearance-picker.use")}</option><option value="off">${t("workbench.settings-skills.off")}</option><option value="unavailable">${t("workbench.settings-skills.unavailable")}</option></select><button class="mw-btn mw-btn--secondary" data-sk-import>${t("workbench.characters.import-local")}</button><button class="mw-btn mw-btn--ghost" data-sk-refresh>${t("workbench.project-settings.refresh")}</button></div>
  <p class="settings-muted" data-sk-count role="status"></p><div data-sk-notice role="status" hidden></div><div data-sk-error role="alert" hidden></div><div data-sk-import-panel hidden></div>
  <div class="mw-list-detail" data-sk-catalog><div class="mw-list-detail__body"><section class="mw-list-detail__list" aria-label="${t("workbench.catalog-skill-packs.all-skills")}"><ul class="mw-items" data-sk-list></ul></section><section class="mw-list-detail__detail" data-sk-detail aria-label="${t("workbench.settings-skills.skill-details")}"></section></div></div></section>`;
}

export const SKILL_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
const readText = globalThis.t.text, el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ""; if (text != null) n.textContent = text; return n; };
const button = (text, fn, variant = "secondary") => { const n = el("button", "mw-btn mw-btn--" + variant + " mw-btn--sm", readText(text)); n.type = "button"; n.addEventListener("click", fn); return n; };
const api = (project, path, body = {}) => molisWorkRequest((project ? "/projects/" + encodeURIComponent(project) : "") + "/api/skills/" + path, { body });
const installApi = (project, path, body = {}) => molisWorkRequest("/projects/" + encodeURIComponent(project || "personal") + "/api/plugin-trust/" + path, { body });
const STATES = { off: "workbench.catalog-skill-packs.off", auto: "workbench.catalog-skill-packs.automatic", manual: "workbench.catalog-skill-packs.manual-only" }, FOR = { assistant: "workbench.common.assistant", coding: "workbench.settings-skills.coding", agent: "workbench.settings-skills.agent", both: "workbench.settings-skills.assistant-and-coding" };
const WHY = { plugin_disabled: "workbench.settings-skills.the-plugin-is-disabled-your-settings-will-apply", publisher_revoked: "workbench.catalog-skill-packs.retracted", resource_invalid: "workbench.settings-skills.the-skill-or-its-files-are-missing-reinstall", requires_unmet: "workbench.settings-skills.a-required-capability-is-unavailable", connection_missing: "workbench.settings-skills.connect-the-required-service-first", native_only: "workbench.settings-skills.this-skill-requires-a-local-agent", not_applicable: "workbench.settings-skills.not-applicable-to-the-current-execution-mode" };
const LOCKED = new Set(["plugin_disabled", "publisher_revoked", "resource_invalid"]);
const key = s => s.ref.install_id + "/" + s.ref.skill_id;
const error = (box, failure, retry) => { box.hidden = false; box.className = "mw-alert"; box.setAttribute("role", "alert"); box.replaceChildren(el("p", "", failure?.message || String(failure))); if (retry) { const actions = el("div", "mw-alert__actions"); actions.append(button("common.control.retry", retry)); box.append(actions); } };
const stateControls = (skill, project, changed, failure, compact = false) => {
const group = el("fieldset", compact ? "skill-segments" : "mw-radio-group"); const legend = el("legend", "skill-sr", skill.name + " · " + readText("workbench.settings-skills.usage")); group.append(legend);
group.disabled = !skill.availability.available && LOCKED.has(skill.availability.reason);
for (const state of ["off", "auto", "manual"]) {
const label = el("label", "mw-check-row"), radio = el("input"); radio.type = "radio"; radio.name = "skill-state-" + key(skill); radio.value = state; radio.checked = skill.state === state;
label.append(radio, el("span", "", readText(STATES[state]))); if (!compact) label.append(el("small", "settings-muted", readText(state === "off" ? "workbench.settings-skills.never-use-this-skill" : state === "auto" ? "workbench.settings-skills.let-ai-choose-when-it-applies" : "workbench.settings-skills.use-only-when-you-name-it")));
radio.addEventListener("change", async () => { const was = skill.state; group.disabled = true;
try { const next = await api(project, "set", { scope: project ? "project" : "home", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state, expected_revision: skill.settings_revision }); Object.assign(skill, next); changed(next, was, true); }
catch (cause) { radio.checked = false; group.querySelector('input[value="' + was + '"]').checked = true; failure(new Error(readText("workbench.settings-skills.nothing-changed") + (cause && cause.message ? " " + cause.message : "")), async () => { if (cause.code === "skills.settings_conflict") { try { const current = (await api(project, "list")).skills.find(value => key(value) === key(skill)); if (!current) throw new Error(readText("workbench.settings-skills.this-skill-was-removed-refresh-the-list")); Object.assign(skill, current); changed(current, was); } catch (refreshError) { failure(refreshError); } } else radio.click(); }); }
finally { group.disabled = !skill.availability.available && LOCKED.has(skill.availability.reason); }
}); group.append(label);
} return group;
};
const facts = skill => {
const dl = el("dl", "mw-facts"), fact = (label, text) => { if (text) dl.append(el("dt", "", readText(label)), el("dd", "", text)); };
fact("workbench.settings-skills.for", readText(FOR[skill.applies_to])); fact("workbench.catalog-skill-packs.local-agents-only", skill.native_only_reason); fact("workbench.catalog-skill-packs.when-to-use", skill.when_to_use); fact("workbench.settings-skills.when-not-to-use", skill.when_not_to_use); fact("workbench.settings-skills.tools-declared-not-granted", skill.tools.join("、") || readText("workbench.settings-skills.no-declared-tools"));
fact("workbench.settings-skills.connector-categories", (skill.connector_categories || []).join("、"));
fact("workbench.settings-skills.included-files", skill.resources.map(r => r.path + " · " + r.bytes + " B" + (r.role === "script" ? " · " + readText("workbench.settings-skills.runs-code") : "")).join("\n") || readText("workbench.catalog-skill-packs.no-included-files"));
fact("workbench.catalog-skill-packs.start-of-the-text", skill.excerpt); return dl;
};
const preview = (panel, skills) => { if (!skills?.length) return;
panel.append(el("h3", "", readText("workbench.settings-skills.skills-in-this-package"))); const list = el("ul", "mw-items");
for (const s of skills) { const row = el("li", "mw-item mw-item--stack"), text = el("span"); row.append(el("span", "mw-mark", "✦"), text); const name = el(s.change === "removed" ? "del" : "strong", "", s.name); text.append(name, el("small", "", s.description), el("small", "", readText(FOR[s.applies_to])));
const CHANGE = { added: "workbench.settings.add", body_changed: "workbench.settings-skills.body-changed", resources_changed: "workbench.settings-skills.files-changed", removed: "workbench.settings-skills.will-be-removed" };
if (s.runs_scripts) text.append(el("small", "", readText("workbench.settings-skills.runs-code"))); if (s.connector_categories?.length) text.append(el("small", "", s.connector_categories.join("、"))); if (s.change) text.append(el("small", "", readText(CHANGE[s.change]))); if (s.state === "manual" && s.change !== "removed") text.append(el("small", "", readText("workbench.settings-skills.manual-setting-is-kept")));
const detail = el("details", "mw-item__more"), summary = el("summary", "", readText("workbench.catalog-skill-packs.details")); detail.append(summary, facts(s)); row.append(detail); list.append(row); } panel.append(list);
};
const enable = async (panel, project, pluginId, done) => {
const skills = (await api(project, "list")).skills.filter(s => s.pack.plugin_id === pluginId); if (!skills.length) { done(); return; }
panel.hidden = false; panel.replaceChildren(el("h3", "", readText(project ? "workbench.settings-skills.choose-skills-for-this-project" : "workbench.settings-skills.choose-skills-for-your-personal-space")), el("p", "settings-muted", readText("workbench.settings-skills.off-never-use-auto-let-ai-choose-manual")));
for (const s of skills) { const row = el("div", "skill-enable-row"), fail = el("div"); fail.hidden = true; row.append(el("strong", "", s.name), el("p", "settings-muted", s.description), stateControls(s, project, () => { fail.hidden = true; }, (cause, retry) => error(fail, cause, retry), true), fail); panel.append(row); }
const footer = el("div", "skill-toolbar"); footer.append(button("workbench.settings-skills.later", done, "ghost"), button("workbench.computer-record.completed", done, "primary")); panel.append(footer);
};
const importPanel = (panel, project, reload) => {
panel.hidden = false; panel.replaceChildren(el("h2", "", readText("workbench.characters.import-local")));
const source = el("select", "mw-select"); source.setAttribute("aria-label", readText("workbench.picker.source")); source.append(panel.closest("[data-skill-settings]").querySelector("[data-sk-import-sources]").content.cloneNode(true));
const stage = el("div"), fail = el("div"); fail.hidden = true;
const close = () => { panel.hidden = true; panel.replaceChildren(); };
const scan = button("workbench.settings-skills.find-skills", async () => { scan.disabled = true; fail.hidden = true;
try { const found = await installApi(project, "skills/import/preview", { source: { kind: "runtime", runtime_id: source.value } }); stage.replaceChildren();
if (!found.candidates.length) { stage.append(el("p", "", readText("workbench.settings-skills.no-skills-found-in-this-source"))); return; }
stage.append(el("p", "settings-muted", readText("workbench.settings-skills.import-a-snapshot-later-changes-to-the-source")));
const allFor = el("select", "mw-select"); allFor.setAttribute("aria-label", readText("workbench.settings-skills.for")); const addOptions = (select, selected) => { for (const value of ["assistant", "coding", "both"]) { const option = el("option", "", readText(FOR[value])); option.value = value; option.selected = value === selected; select.append(option); } }; addOptions(allFor, found.applies_to); stage.append(allFor);
const choices = []; for (const c of found.candidates) { const row = el("div", "skill-import-row"), label = el("label", "mw-check-row"), check = el("input"); check.type = "checkbox"; check.checked = c.importable; check.disabled = !c.importable; label.append(check, el("strong", "", c.name)); row.append(label, el("p", "settings-muted", c.description)); const who = el("select", "mw-select"); who.setAttribute("aria-label", c.name + " · " + readText("workbench.settings-skills.for")); addOptions(who, c.applies_to || found.applies_to); who.disabled = c.applies_to_from === "file" || !c.importable; row.append(who); if (c.reason) row.append(el("p", "settings-muted", c.reason)); if (c.runs_scripts) row.append(el("small", "", readText("workbench.settings-skills.runs-code"))); stage.append(row); choices.push({ c, check, who }); }
allFor.addEventListener("change", () => choices.forEach(({ who }) => { if (!who.disabled) who.value = allFor.value; }));
const confirm = button("workbench.settings-skills.agree-and-import", async () => { confirm.disabled = true; fail.hidden = true;
try { const chosen = choices.filter(x => x.check.checked); const result = await installApi(project, "skills/import/confirm", { preview_id: found.preview_id, skill_ids: chosen.map(x => x.c.skill_id), scope: project ? "project" : "home", applies_to: chosen.filter(x => x.c.applies_to_from !== "file").map(x => ({ skill_id: x.c.skill_id, applies_to: x.who.value })) }); await reload(); await enable(panel, project, result.plugin_id, close); }
catch (cause) { error(fail, cause, () => scan.click()); }
}, "primary"); stage.append(confirm);
} catch (cause) { error(fail, cause); } finally { scan.disabled = false; }
}); panel.append(source, scan, button("common.control.cancel", close, "ghost"), stage, fail);
};
const bind = root => {
if (root.dataset.skillsBound) return; root.dataset.skillsBound = "1"; const project = root.dataset.project, $ = name => root.querySelector("[data-sk-" + name + "]"); let skills = [], selected = null, generation = 0;
const saved = (skill, was) => {
const notice = $("notice"); notice.hidden = false; notice.className = "mw-alert"; notice.replaceChildren(el("p", "", readText("workbench.placement.saved")));
const revision = skill.settings_revision, undo = button("workbench.context-bus.undo", async () => { undo.disabled = true; try { const next = await api(project, "set", { scope: project ? "project" : "home", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state: was, expected_revision: revision }); Object.assign(skill, next); notice.hidden = true; draw(); } catch (cause) { error(notice, cause, load); } });
const actions = el("div", "mw-alert__actions"); actions.append(undo); notice.append(actions);
};
const show = (skill, focus = false) => {
selected = key(skill); const detail = $("detail"); detail.replaceChildren();
const back = button("workbench.catalog-skill-packs.all-skills", () => { $("catalog").removeAttribute("data-detail"); $("list").querySelector('[aria-current="true"]')?.focus(); }, "ghost"); back.classList.add("mw-list-detail__back");
const header = el("header"), title = el("h3", "", skill.name); title.tabIndex = -1; header.append(title, el("p", "", skill.description), el("p", "settings-muted", skill.pack.title + " · " + skill.pack.version + " · " + skill.pack.publisher_label), el("p", "settings-muted", readText(skill.pack.scope === "home" ? "workbench.index.personal-space" : "workbench.settings-skills.current-project") + " · " + readText({ host: "workbench.settings-skills.included-with-the-app", pinned: "workbench.settings-skills.trusted-publisher", home_local: "workbench.settings-skills.this-computer" }[skill.pack.trust])));
const failure = el("div"); failure.hidden = true;
detail.append(back, header, stateControls(skill, project, (_, was, committed) => { failure.hidden = true; draw(); show(skill); if (committed) saved(skill, was); }, (cause, retry) => error(failure, cause, retry)), failure);
if (!skill.availability.available) { const reason = el("div", "mw-alert"); reason.setAttribute("role", "status"); reason.append(el("p", "", readText(WHY[skill.availability.reason])), ...(skill.availability.detail ? [el("p", "settings-muted", skill.availability.detail)] : [])); if (skill.availability.reason === "connection_missing") { const connect = el("a", "mw-btn mw-btn--link", readText("workbench.settings-skills.manage-connections")); connect.href = "/capabilities/connections" + (project ? "?project=" + encodeURIComponent(project) : ""); reason.append(connect); } detail.append(reason); }
detail.append(facts(skill));
if (skill.state !== "off" && skill.availability.available) {
const full = el("div"), open = button("workbench.settings-skills.read-full-text", async () => { open.disabled = true; try { const result = (await api(project, "body", { refs: [skill.ref] })).results[0]; if (!result.ok) throw new Error(readText("workbench.settings-skills.the-skill-version-or-setting-changed-refresh-the")); full.replaceChildren(el("pre", "skill-full-text", result.body)); } catch (cause) { error(full, cause, load); open.disabled = false; } }, "link"); open.dataset.skBody = ""; detail.append(open, full);
}
if (skill.enabled) detail.append(el("p", "settings-muted", readText("workbench.settings-skills.enabled") + " · " + skill.enabled.at.slice(0,10) + " · " + skill.enabled.by + " · " + readText(skill.enabled.scope === "home" ? "workbench.index.personal-space" : "workbench.settings-skills.current-project")));
if (skill.last_used) detail.append(el("p", "mw-list-detail__used", readText("workbench.settings-skills.last-used") + " · " + skill.last_used.at.slice(0,16).replace("T"," ") + " · " + readText(FOR[skill.last_used.caller])));
const nextStep = { plugin_disabled: "workbench.home-plugin-page.enable-plugin", publisher_revoked: "workbench.settings-skills.uninstall-package", resource_invalid: "workbench.catalog-skill-packs.reinstall" };
const link = el("a", "mw-btn mw-btn--link", readText(nextStep[skill.availability.reason] || "workbench.settings-skills.manage-package")); link.href = "/projects/" + encodeURIComponent(project || "personal") + "/settings/plugins"; detail.append(link);
if (focus) { $("catalog").dataset.detail = ""; title.focus(); }
};
const draw = () => {
const query = $("search").value.toLocaleLowerCase(), filter = $("filter").value;
const rows = skills.filter(s => (s.name + s.description + s.pack.title).toLocaleLowerCase().includes(query) && (filter === "all" || filter === "on" && s.state !== "off" || filter === "off" && s.state === "off" || filter === "unavailable" && !s.availability.available));
$("count").textContent = readText("workbench.settings-skills.count-count-skill-skills-enabled-enabled", { count: skills.length, enabled: skills.filter(s => s.state !== "off").length }); $("list").replaceChildren();
if (!rows.length) { $("list").append(el("li", "settings-muted", readText(skills.length ? "workbench.settings-skills.no-matching-skills" : "workbench.catalog-skill-packs.no-skills-yet"))); $("detail").replaceChildren(); $("catalog").removeAttribute("data-detail"); return; }
if (!rows.some(s => key(s) === selected)) selected = key(rows[0]);
for (const s of rows) { const li = el("li", "mw-item mw-item--pick"), pick = el("button", "mw-item__pick"), words = el("span"); pick.type = "button"; pick.setAttribute("aria-current", String(key(s) === selected)); words.append(el("strong", "", s.name), el("small", "", s.pack.title)); words.title = s.pack.title; pick.append(el("span", "mw-mark", "✦"), words, el("span", "mw-item__end", readText(s.availability.available ? STATES[s.state] : s.availability.reason === "publisher_revoked" ? WHY.publisher_revoked : "workbench.settings-skills.unavailable"))); pick.addEventListener("click", () => { selected = key(s); draw(); show(s, true); }); li.append(pick); $("list").append(li); }
show(rows.find(s => key(s) === selected));
};
const load = async () => { const turn = ++generation; $("error").hidden = true; try { const result = await api(project, "list"); if (turn !== generation) return; skills = result.skills; draw(); } catch (cause) { if (turn === generation) error($("error"), cause, load); } };
$("search").addEventListener("input", draw); $("filter").addEventListener("change", draw); $("refresh").addEventListener("click", load); $("import").addEventListener("click", () => importPanel($("import-panel"), project, load)); load();
};
globalThis.molisSkillUI = { preview, enable, importPanel };
const start = (container = document) => { if (container.matches?.("[data-skill-settings]")) bind(container); else container.querySelectorAll?.("[data-skill-settings]").forEach(bind); };
document.addEventListener("molis-work:settings-embed", event => start(event.detail?.root || document));
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => start()); else start();
})();
`;
