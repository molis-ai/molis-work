/**
 * 08's Skill parts (docs/design/skill-packs): the three states, the facts, a package's Skills in an install review, choosing their states
 * after installing, importing from a local Agent, and one Skill's detail. The 「能力包」 page (settings-kit.ts) draws a Skill with
 * `detail`; the plugin install review with `preview` and `enable`.
 */
export const SKILL_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
const L = globalThis.L || ((text) => text), el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ""; if (text != null) n.textContent = text; return n; };
const button = (text, fn, variant = "secondary") => { const n = el("button", "mw-btn mw-btn--" + variant + " mw-btn--sm", L(text)); n.type = "button"; n.addEventListener("click", fn); return n; };
const api = (project, path, body = {}) => molisWorkRequest((project ? "/projects/" + encodeURIComponent(project) : "") + "/api/skills/" + path, { body });
const installApi = (project, path, body = {}) => molisWorkRequest("/projects/" + encodeURIComponent(project || "personal") + "/api/plugin-trust/" + path, { body });
const STATES = { off: "关", auto: "自动", manual: "仅手动" }, FOR = { assistant: "助理", coding: "Coding", agent: "Agent", both: "助理与 Coding" };
const WHY = { plugin_disabled: "插件已停用，恢复后沿用当前设置。", publisher_revoked: "已撤销", resource_invalid: "正文或附带文件缺失，请重新安装。", requires_unmet: "缺少所需的能力。", connection_missing: "还没有连接所需服务。", native_only: "只有本地 Agent 能使用这个技能。", not_applicable: "不适用于当前执行方式。" };
const LOCKED = new Set(["plugin_disabled", "publisher_revoked", "resource_invalid"]);
const key = s => s.ref.install_id + "/" + s.ref.skill_id;
const error = (box, failure, retry) => { box.hidden = false; box.className = "mw-alert"; box.setAttribute("role", "alert"); box.replaceChildren(el("p", "", failure?.message || String(failure))); if (retry) { const actions = el("div", "mw-alert__actions"); actions.append(button("重试", retry)); box.append(actions); } };
const stateControls = (skill, project, changed, failure, compact = false) => {
const group = el("fieldset", compact ? "skill-segments" : "mw-radio-group"); const legend = el("legend", "skill-sr", skill.name + " · " + L("使用方式")); group.append(legend);
group.disabled = !skill.availability.available && LOCKED.has(skill.availability.reason);
for (const state of ["off", "auto", "manual"]) {
const label = el("label", "mw-check-row"), radio = el("input"); radio.type = "radio"; radio.name = "skill-state-" + key(skill); radio.value = state; radio.checked = skill.state === state;
label.append(radio, el("span", "", L(STATES[state]))); if (!compact) label.append(el("small", "settings-muted", L(state === "off" ? "不使用这个技能" : state === "auto" ? "适用时由 AI 选择" : "只在你点名时使用")));
radio.addEventListener("change", async () => { const was = skill.state; group.disabled = true;
try { const next = await api(project, "set", { scope: project ? "project" : "home", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state, expected_revision: skill.settings_revision }); Object.assign(skill, next); changed(next, was, true); }
catch (cause) { radio.checked = false; group.querySelector('input[value="' + was + '"]').checked = true; failure(new Error(L("什么都没改。") + (cause && cause.message ? " " + cause.message : "")), async () => { if (cause.code === "skills.settings_conflict") { try { const current = (await api(project, "list")).skills.find(value => key(value) === key(skill)); if (!current) throw new Error(L("这个技能已移除，请刷新列表。")); Object.assign(skill, current); changed(current, was); } catch (refreshError) { failure(refreshError); } } else radio.click(); }); }
finally { group.disabled = !skill.availability.available && LOCKED.has(skill.availability.reason); }
}); group.append(label);
} return group;
};
const facts = skill => {
const dl = el("dl", "mw-facts"), fact = (label, text) => { if (text) dl.append(el("dt", "", L(label)), el("dd", "", text)); };
fact("给谁用", L(FOR[skill.applies_to])); fact("只限本地 Agent", skill.native_only_reason); fact("什么时候用", skill.when_to_use); fact("什么时候不用", skill.when_not_to_use); fact("工具（声明，不是授权）", skill.tools.join("、") || L("没有声明工具"));
fact("连接器类别", (skill.connector_categories || []).join("、"));
fact("附带文件", skill.resources.map(r => r.path + " · " + r.bytes + " B" + (r.role === "script" ? " · " + L("会运行") : "")).join("\n") || L("没有附带文件"));
fact("正文开头", skill.excerpt); return dl;
};
const preview = (panel, skills) => { if (!skills?.length) return;
panel.append(el("h3", "", L("这个包带的技能"))); const list = el("ul", "mw-items");
for (const s of skills) { const row = el("li", "mw-item mw-item--stack"), text = el("span"); row.append(el("span", "mw-mark", "✦"), text); const name = el(s.change === "removed" ? "del" : "strong", "", s.name); text.append(name, el("small", "", s.description), el("small", "", L(FOR[s.applies_to])));
const CHANGE = { added: "新增", body_changed: "正文变了", resources_changed: "附带文件变了", removed: "会移除" };
if (s.runs_scripts) text.append(el("small", "", L("会运行"))); if (s.connector_categories?.length) text.append(el("small", "", s.connector_categories.join("、"))); if (s.change) text.append(el("small", "", L(CHANGE[s.change]))); if (s.state === "manual" && s.change !== "removed") text.append(el("small", "", L("仅手动会保留")));
const detail = el("details", "mw-item__more"), summary = el("summary", "", L("看详情")); detail.append(summary, facts(s)); row.append(detail); list.append(row); } panel.append(list);
};
const enable = async (panel, project, pluginId, done) => {
const skills = (await api(project, "list")).skills.filter(s => s.pack.plugin_id === pluginId); if (!skills.length) { done(); return; }
panel.hidden = false; panel.replaceChildren(el("h3", "", L(project ? "在这个项目里用哪些" : "在个人空间里用哪些")), el("p", "settings-muted", L("关：不使用。自动：适用时由 AI 选择。仅手动：只在你点名时使用。")));
for (const s of skills) { const row = el("div", "skill-enable-row"), fail = el("div"); fail.hidden = true; row.append(el("strong", "", s.name), el("p", "settings-muted", s.description), stateControls(s, project, () => { fail.hidden = true; }, (cause, retry) => error(fail, cause, retry), true), fail); panel.append(row); }
const footer = el("div", "skill-toolbar"); footer.append(button("以后再说", done, "ghost"), button("完成", done, "primary")); panel.append(footer);
};
const importPanel = (panel, project, reload) => {
panel.hidden = false; panel.replaceChildren(el("h2", "", L("从本机导入")));
const source = el("select", "mw-select"); source.setAttribute("aria-label", L("来源")); source.append(panel.closest("[data-kit-settings]").querySelector("[data-sk-import-sources]").content.cloneNode(true));
const stage = el("div"), fail = el("div"); fail.hidden = true;
const close = () => { panel.hidden = true; panel.replaceChildren(); };
const scan = button("读取技能", async () => { scan.disabled = true; fail.hidden = true;
try { const found = await installApi(project, "skills/import/preview", { source: { kind: "runtime", runtime_id: source.value } }); stage.replaceChildren();
if (!found.candidates.length) { stage.append(el("p", "", L("这个来源没有找到技能。"))); return; }
stage.append(el("p", "settings-muted", L("导入这一刻的拷贝，原目录之后的修改不会影响已装版本。第一次导入会信任“这台电脑”，以后可在插件设置中撤销。")));
const allFor = el("select", "mw-select"); allFor.setAttribute("aria-label", L("给谁用")); const addOptions = (select, selected) => { for (const value of ["assistant", "coding", "both"]) { const option = el("option", "", L(FOR[value])); option.value = value; option.selected = value === selected; select.append(option); } }; addOptions(allFor, found.applies_to); stage.append(allFor);
const choices = []; for (const c of found.candidates) { const row = el("div", "skill-import-row"), label = el("label", "mw-check-row"), check = el("input"); check.type = "checkbox"; check.checked = c.importable; check.disabled = !c.importable; label.append(check, el("strong", "", c.name)); row.append(label, el("p", "settings-muted", c.description)); const who = el("select", "mw-select"); who.setAttribute("aria-label", c.name + " · " + L("给谁用")); addOptions(who, c.applies_to || found.applies_to); who.disabled = c.applies_to_from === "file" || !c.importable; row.append(who); if (c.reason) row.append(el("p", "settings-muted", c.reason)); if (c.runs_scripts) row.append(el("small", "", L("会运行"))); stage.append(row); choices.push({ c, check, who }); }
allFor.addEventListener("change", () => choices.forEach(({ who }) => { if (!who.disabled) who.value = allFor.value; }));
const confirm = button("同意并导入", async () => { confirm.disabled = true; fail.hidden = true;
try { const chosen = choices.filter(x => x.check.checked); const result = await installApi(project, "skills/import/confirm", { preview_id: found.preview_id, skill_ids: chosen.map(x => x.c.skill_id), scope: project ? "project" : "home", applies_to: chosen.filter(x => x.c.applies_to_from !== "file").map(x => ({ skill_id: x.c.skill_id, applies_to: x.who.value })) }); await reload(); await enable(panel, project, result.plugin_id, close); }
catch (cause) { error(fail, cause, () => scan.click()); }
}, "primary"); stage.append(confirm);
} catch (cause) { error(fail, cause); } finally { scan.disabled = false; }
}); panel.append(source, scan, button("取消", close, "ghost"), stage, fail);
};
// The page's own notice under the toolbar: 已保存, with 撤销 putting back the state it had.
const saved = (notice, skill, project, was, redraw) => {
notice.hidden = false; notice.className = "mw-alert"; notice.replaceChildren(el("p", "", L("已保存")));
const revision = skill.settings_revision, undo = button("撤销", async () => { undo.disabled = true; try { const next = await api(project, "set", { scope: project ? "project" : "home", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state: was, expected_revision: revision }); Object.assign(skill, next); notice.hidden = true; redraw(); } catch (cause) { error(notice, cause, redraw); } });
const actions = el("div", "mw-alert__actions"); actions.append(undo); notice.append(actions);
};
// One Skill as 08 drew it, into box; redraw after its state changed, the notice saying so with undo.
const detail = (box, skill, project, { notice, redraw }) => {
const header = el("header"), title = el("h3", "", skill.name); title.tabIndex = -1; header.append(title, el("p", "", skill.description), el("p", "settings-muted", skill.pack.title + " · " + skill.pack.version + " · " + skill.pack.publisher_label), el("p", "settings-muted", L(skill.pack.scope === "home" ? "个人空间" : "当前项目") + " · " + L({ host: "随应用提供", pinned: "已信任发布者", home_local: "这台电脑" }[skill.pack.trust])));
const failure = el("div"); failure.hidden = true;
box.append(header, stateControls(skill, project, (_, was, committed) => { failure.hidden = true; redraw(); if (committed) saved(notice, skill, project, was, redraw); }, (cause, retry) => error(failure, cause, retry)), failure);
if (!skill.availability.available) { const reason = el("div", "mw-alert"); reason.setAttribute("role", "status"); reason.append(el("p", "", skill.availability.reason === "publisher_revoked" ? box.closest("[data-sk-retracted]").dataset.skRetracted : L(WHY[skill.availability.reason])), ...(skill.availability.detail ? [el("p", "settings-muted", skill.availability.detail)] : [])); if (skill.availability.reason === "connection_missing") { const connect = el("a", "mw-btn mw-btn--link", L("管理连接")); connect.href = "/capabilities/connections" + (project ? "?project=" + encodeURIComponent(project) : ""); reason.append(connect); } box.append(reason); }
box.append(facts(skill));
if (skill.state !== "off" && skill.availability.available) {
const full = el("div"), open = button("打开全文", async () => { open.disabled = true; try { const result = (await api(project, "body", { refs: [skill.ref] })).results[0]; if (!result.ok) throw new Error(L("技能版本或设置已变化，请刷新。")); full.replaceChildren(el("pre", "skill-full-text", result.body)); } catch (cause) { error(full, cause, redraw); open.disabled = false; } }, "link"); open.dataset.skBody = ""; box.append(open, full);
}
if (skill.enabled) box.append(el("p", "settings-muted", L("启用记录") + " · " + skill.enabled.at.slice(0,10) + " · " + skill.enabled.by + " · " + L(skill.enabled.scope === "home" ? "个人空间" : "当前项目")));
if (skill.last_used) box.append(el("p", "mw-list-detail__used", L("最近使用") + " · " + skill.last_used.at.slice(0,16).replace("T"," ") + " · " + L(FOR[skill.last_used.caller])));
const nextStep = { plugin_disabled: "启用插件", publisher_revoked: "卸载这个包", resource_invalid: "重新安装" };
const link = el("a", "mw-btn mw-btn--link", L(nextStep[skill.availability.reason] || "管理这个包")); link.href = "/projects/" + encodeURIComponent(project || "personal") + "/settings/plugins"; box.append(link);
return title;
};
globalThis.molisSkillUI = { preview, enable, importPanel, detail };
})();
`;
