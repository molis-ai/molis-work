/**
 * 插件 in a project's settings (ac-trust T7, specs/repository-anti-corruption/slices/ac-trust-install.md): what is installed in the project
 * with who signed it, what it asked for and why, what it keeps doing in the background and the agreements the person gave it; installing a
 * signed package (preview, then confirm); taking an agreement back. What it shows and installs goes through
 * `/projects/<id>/api/plugin-trust/*`, which invokes the shared `plugins.*` actions as the person; an agreement is taken back through the
 * Host's one settings door for it, `/api/settings/plugin-consents/revoke` (S-77), never through a route of the plugin page's own; taking a publisher back goes through the same door (`/api/settings/plugin-publishers/revoke`, S-86).
 */
export function renderPluginTrustSettings({ L, projectId, chevron }: { L(text: string): string; projectId: string; chevron: string }): string {
  return `<section class="settings-document plugin-trust-settings" aria-labelledby="plugin-trust-title" data-plugin-trust-settings data-project="${projectId}">
    <header class="settings-page-heading"><h1 id="plugin-trust-title">${L("插件")}</h1>
      <p>${L("这个项目里装着的插件：谁签的名、要了哪些权限、在后台做什么，以及你给过它们的同意。")}</p></header>
    <p class="settings-form-error" data-plugin-trust-error role="alert" hidden></p>
    <section class="settings-section" aria-labelledby="plugin-trust-install-title">
      <h2 id="plugin-trust-install-title">${L("安装插件包")}</h2>
      <p class="settings-muted">${L("选一个签过名的插件包。装之前会先列出它要的权限，由你决定；选好文件本身不会安装任何东西。")}</p>
      <label class="mw-btn mw-btn--secondary mw-btn--sm">${L("选择插件包")}<input type="file" accept=".json,application/json" hidden data-plugin-trust-pick></label>
      <div class="plugin-trust-preview" data-plugin-trust-preview hidden></div>
    </section>
    <section class="settings-section" aria-labelledby="plugin-trust-list-title">
      <h2 id="plugin-trust-list-title">${L("已安装的插件")}</h2>
      <ul class="plugin-trust-list" data-plugin-trust-list><li class="settings-muted">${L("正在读取…")}</li></ul>
    </section>
    <section class="settings-section" aria-labelledby="plugin-trust-publishers-title">
      <h2 id="plugin-trust-publishers-title">${L("你信任的发布者")}</h2>
      <p class="settings-muted">${L("你固定过的发布者。他们之后签的包会按这份信任安装。")}</p>
      <ul class="plugin-trust-list" data-plugin-trust-publishers><li class="settings-muted">${L("正在读取…")}</li></ul>
    </section>
    <template data-plugin-trust-chevron>${chevron}</template>
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
const L = globalThis.L || ((text) => text);
const base = "/projects/" + encodeURIComponent(root.dataset.project || "") + "/api/plugin-trust";
const $ = (selector) => root.querySelector(selector);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
const button = (text, variant) => { const node = el("button", "mw-btn " + variant + " mw-btn--sm", text); node.type = "button"; return node; };
const TRUST = { host: "宿主随带", pinned: "你固定的发布者", unsigned: "没有签名" };
const STATE = { installed: "已安装", running: "运行中", disabled: "已停用" };
const KIND = { always_on: "常开", default_wiring: "默认连线", default_group: "默认输入组", local_directory: "本机目录" };
const EFFECT = { storage: "保存数据", artifacts: "成果库", capabilities: "调用动作", events: "收发事件", networkDomains: "联网", secretRefs: "密钥", resources: "资源" };
const day = (iso) => String(iso || "").slice(0, 10);
const short = (id) => String(id).replace(/^ed25519:sha256:/, "").slice(0, 12);
const error = $("[data-plugin-trust-error]");
const board = () => document.querySelector("[data-settings-toast], [data-toast]");
const fail = (failure) => { molisWorkRequest.show(error, failure); error.hidden = false; if (board()) molisWorkRequest.toast(board(), failure, undefined, { ms: 5000 }); };
const toast = (text) => { const box = board(); if (!box) return; box.textContent = text; box.classList.remove("is-error"); box.classList.add("is-visible"); setTimeout(() => box.classList.remove("is-visible"), 2600); };
const api = (path, payload) => molisWorkRequest(base + path, { body: payload });
const ask = (title, description, yesLabel) => new Promise((resolve) => {
const dialog = el("dialog", "mw-dialog mw-dialog--alert"); dialog.dataset.slot = "alert-dialog";
const form = el("form", "mw-form mw-dialog__shell"); form.method = "dialog";
const header = el("header", "mw-form__header"), heading = el("div"), h2 = el("h2", "", title);
heading.append(h2, el("p", "", description)); header.append(heading);
const footer = el("footer", "mw-form__footer"), cancel = el("button", "mw-btn mw-btn--secondary mw-btn--md", L("取消")), yes = el("button", "mw-btn mw-btn--danger mw-btn--md", yesLabel);
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
if (!rows.length) box.append(el("span", "settings-muted", empty)); else { const list = el("ul", "plugin-trust-rows"); rows.forEach((row) => list.append(row)); box.append(list); }
return box;
};
const row = (head, ...notes) => { const item = el("li"); item.append(el("span", "", head)); notes.filter(Boolean).forEach((note) => item.append(el("span", "settings-muted", note))); return item; };
// What a plugin asked for: its own reason, and what the platform itself says the permission is.
const permissions = (items) => group(L("它要的权限"), L("没有要任何权限"), items.map((item) =>
row(item.permission + (item.required ? "" : " · " + L("可选")), item.reason, item.meaning)));
const jobs = (items) => group(L("它在后台常做的事"), L("没有后台任务"), items.map((item) =>
row(item.job_id, item.reason, item.permissions.length ? L("用到 {permissions}", { permissions: item.permissions.join("、") }) : L("不需要额外权限"))));
const draw = (target, empty, nodes) => { target.replaceChildren(...(nodes.length ? nodes : [el("li", "settings-muted", empty)])); };
const consents = (plugin) => group(L("你给过的同意"), L("没有同意记录"), plugin.consents.map((consent) => {
const item = row(L(KIND[consent.kind] || consent.kind) + " · " + consent.subject,
consent.revoked_at ? L("已于 {date} 撤回", { date: day(consent.revoked_at) }) : L(consent.granted_by === "user" ? "你同意的" : "宿主随这个插件代为同意") + " · " + day(consent.granted_at));
if (!consent.revoked_at) {
const revoke = button(L("撤回同意"), "mw-btn--ghost");
revoke.addEventListener("click", async () => {
if (!await ask(L("撤回这条同意？"), L("{plugin} 的“{kind}”同意（{subject}）。撤回后立即生效；以后需要时可以重新同意。", { plugin: plugin.name, kind: L(KIND[consent.kind] || consent.kind), subject: consent.subject }), L("撤回"))) return;
error.hidden = true;
try { await molisWorkRequest("/api/settings/plugin-consents/revoke", { body: { consent_id: consent.consent_id } }); toast(L("同意已撤回")); await load(); } catch (failure) { fail(failure); }
});
item.append(revoke);
}
return item;
}));
const installed = (plugin) => {
const box = el("details", "settings-advanced plugin-trust-item"), summary = el("summary"), copy = el("span", "setting-copy");
copy.append(el("strong", "", plugin.name + " · " + plugin.version), el("span", "", L(TRUST[plugin.trust] || plugin.trust) + (plugin.publisher_label ? " · " + plugin.publisher_label : "") + " · " + L(STATE[plugin.state] || plugin.state)));
summary.append(copy); const mark = $("[data-plugin-trust-chevron]"); if (mark) summary.append(mark.content.cloneNode(true));
const body = el("div", "plugin-trust-body");
body.append(el("span", "settings-muted", plugin.plugin_id + (plugin.publisher_signature && plugin.trust !== "host" ? " · " + short(plugin.publisher_signature) : "")));
body.append(plugin.manifest_available ? permissions(plugin.permissions) : el("span", "settings-muted", L("读不到这个插件安装时声明的权限")));
if (plugin.manifest_available) body.append(jobs(plugin.jobs));
body.append(consents(plugin)); box.append(summary, body);
const item = el("li"); item.append(box); return item;
};
const publisher = (pin) => {
const item = row(pin.label + " · " + short(pin.key_id), pin.revoked_at ? L("已于 {date} 撤销", { date: day(pin.revoked_at) }) : L("固定于 {date}", { date: day(pin.pinned_at) }));
if (!pin.revoked_at) {
const revoke = button(L("撤销信任"), "mw-btn--ghost");
revoke.addEventListener("click", async () => {
if (!await ask(L("撤销对这个发布者的信任？"), L("{name} 签的包不能再安装；已经装上的它的插件马上不能再做任何事，随后停用，数据保留，只能卸载。撤销不能撤回。", { name: pin.label }), L("撤销信任"))) return;
error.hidden = true;
try { await molisWorkRequest("/api/settings/plugin-publishers/revoke", { body: { key_id: pin.key_id } }); toast(L("已撤销对这个发布者的信任")); await load(); } catch (failure) { fail(failure); }
});
item.append(revoke);
}
return item;
};
const load = async () => {
const data = await api("/overview");
draw($("[data-plugin-trust-list]"), L("这个项目里还没有装插件"), data.plugins.map(installed));
draw($("[data-plugin-trust-publishers]"), L("你还没有固定过发布者"), data.publishers.map(publisher));
};
const preview = $("[data-plugin-trust-preview]");
const close = () => { preview.replaceChildren(); preview.hidden = true; };
const review = (shown) => {
const view = shown.preview, panel = el("div", "plugin-trust-review");
panel.append(el("h3", "", shown.name + " · " + view.version), el("span", "settings-muted", view.plugin_id + " · " + L("签名者 {id}", { id: short(shown.publisher.key_id) })));
panel.append(permissions(view.permissions), jobs(view.jobs));
const effects = Object.keys(shown.effects || {}).filter((key) => shown.effects[key] && shown.effects[key].length);
panel.append(group(L("它的代码能做的事"), L("不读写任何东西"), effects.map((key) => row(L(EFFECT[key] || key), shown.effects[key].join("、")))));
let label = null;
if (shown.publisher.pinned_label) panel.append(el("span", "settings-muted", L("你已把这个发布者固定为 {name}", { name: shown.publisher.pinned_label })));
else {
const field = el("label", "plugin-trust-pin"); label = el("input", "mw-input"); label.type = "text"; label.maxLength = 80; label.autocomplete = "off";
field.append(el("span", "", L("你还没有信任这个发布者。给它起个名字，才会固定它；固定后它之后签的包都会按这份信任安装。")), label); panel.append(field);
}
const footer = el("div", "plugin-trust-actions"), cancel = button(L("取消"), "mw-btn--secondary"), install = button(L("同意这些权限并安装"), "mw-btn--primary");
cancel.addEventListener("click", close);
install.addEventListener("click", async () => {
const name = label ? label.value.trim() : "";
if (label && !name) { label.setAttribute("aria-invalid", "true"); label.focus(); return; }
install.disabled = true; error.hidden = true;
try { await api("/install/confirm", { preview_id: shown.preview_id, consent: true, ...(label ? { pin_label: name } : {}) }); close(); toast(L("已安装")); await load(); }
catch (failure) { fail(failure); install.disabled = false; }
});
footer.append(cancel, install); panel.append(footer);
preview.replaceChildren(panel); preview.hidden = false; panel.scrollIntoView?.({ block: "nearest" });
};
$("[data-plugin-trust-pick]").addEventListener("change", async (event) => {
const file = event.target.files && event.target.files[0];
event.target.value = ""; if (!file) return;
error.hidden = true; close();
try {
let bundle;
try { bundle = JSON.parse(await file.text()); } catch { throw new Error(L("这个文件不是插件包")); }
review(await api("/install/preview", { bundle }));
} catch (failure) { fail(failure); }
});
load().catch(fail);
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
