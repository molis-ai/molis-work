import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * “本机目录” (PG-049, user 2026-10-25): every local directory the person let a plugin read, by plugin, with what read it lately.
 * The page is the platform's, the same for every plugin; a plugin's own settings may link here (`/settings/directories?plugin=<id>`).
 */
export function renderLocalDirectorySettings({ }: { L(text: string): string }): string {
  return `<section class="settings-document local-directory-settings" aria-labelledby="settings-title" data-local-directory-settings>
    <header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-local-directories.local-folders")}</h1></div>
      <p>${uiText("workbench.settings-local-directories.folders-mac-let-plugins-read-permission-stands-until")}</p>
      <p>${uiText("workbench.settings-local-directories.plugins-agents-scheduled-tasks-workflows-external-clients-may")}</p>
      <p>${uiText("workbench.settings-local-directories.backups-keep-read-history-viewing-page-does-not")}</p></header>
    <div class="settings-section" data-local-directory-list><p class="settings-muted">${uiText("workbench.settings-local-directories.loading")}</p></div>
    <p class="settings-form-error" data-local-directory-error role="alert" hidden></p>
  </section>`;
}

/** Keep the original path, including repeated spaces, readable within this page's available line width. */
export const LOCAL_DIRECTORY_SETTINGS_STYLES = `
  .local-directory-settings .local-directory-root { overflow-wrap: anywhere; white-space: break-spaces; }
`;

export const LOCAL_DIRECTORY_SETTINGS_CLIENT_SCRIPT = String.raw`
globalThis.molisWorkBindLocalDirectorySettings = (container = document, context = null) => {
  const root = container.matches?.("[data-local-directory-settings]") ? container : container.querySelector?.("[data-local-directory-settings]");
  if (!root || root.dataset.localDirectoryBound) return;
  root.dataset.localDirectoryBound = "1";
  const L = globalThis.L || ((text) => text);
  const list = root.querySelector("[data-local-directory-list]"), error = root.querySelector("[data-local-directory-error]");
  const address = context || { search: location.search };
  const focus = new URLSearchParams(address.search || "").get("plugin");
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const when = (value) => value ? new Date(value).toLocaleString() : "";
  const BY = { person: globalThis.t.text("workbench.settings-local-directories.page"), agent: L("Agent"), workflow: globalThis.t.text("workbench.settings-local-directories.workflow"), mcp: globalThis.t.text("workbench.settings-local-directories.external-client-mcp"), background: globalThis.t.text("workbench.settings-local-directories.background-scheduled-task") };
  const failed = (failure) => { error.hidden = false; molisWorkRequest.show(error, failure); };
  const revoke = async (path, label) => {
    if (!confirm(label)) return;
    error.hidden = true;
    try { await molisWorkRequest("/api/host/directory-grants/" + path, { method: "DELETE" }); await load(); }
    catch (failure) { failed(failure); }
  };
  const grantRow = (grant) => {
    const item = el("article", "settings-row local-directory-grant");
    item.dataset.grantId = grant.grant_id;
    item.append(el("code", "local-directory-root", grant.root));
    const changed = grant.directory_status === "changed";
    item.append(el("p", changed ? "settings-form-error" : "settings-muted", changed
      ? globalThis.t.text("workbench.settings-local-directories.no-longer-valid-original-folder-could-not-be") : globalThis.t.text("workbench.settings-local-directories.folder-verified")));
    item.append(el("p", "settings-muted", (grant.project_id ? globalThis.t.text("workbench.settings-local-directories.project") + "：" + grant.project_name : globalThis.t.text("workbench.settings-local-directories.personal-space")) + " · " + globalThis.t.text("workbench.settings-local-directories.allowed") + " " + when(grant.granted_at)));
    item.append(el("p", "settings-muted", grant.read_count ? globalThis.t.text("workbench.settings-local-directories.reads") + " " + grant.read_count + " · " + globalThis.t.text("workbench.settings-local-directories.last") + " " + when(grant.last_read_at) : globalThis.t.text("workbench.settings-local-directories.not-read-yet")));
    if (grant.reads.length) {
      const details = el("details", "local-directory-reads");
      details.append(el("summary", "", globalThis.t.text("workbench.settings-local-directories.recent-reads")));
      const reads = el("ul", "settings-list");
      for (const read of grant.reads) reads.append(el("li", "", when(read.at) + " · " + (BY[read.origin] || read.origin) + " · " + read.outcome));
      details.append(reads); item.append(details);
    }
    const take = el("button", "mw-btn mw-btn--secondary mw-btn--sm", globalThis.t.text("workbench.settings-local-directories.withdraw")); take.type = "button";
    take.setAttribute("aria-label", globalThis.t.text("workbench.settings-local-directories.withdraw") + "：" + grant.root);
    take.addEventListener("click", () => revoke("grant/" + encodeURIComponent(grant.grant_id), globalThis.t.text("workbench.settings-local-directories.after-plugin-can-no-longer-read-folder-would")));
    item.append(take);
    return item;
  };
  const load = async () => {
    let grants;
    try { grants = (await molisWorkRequest("/api/host/directory-grants")).grants; }
    catch (failure) { list.replaceChildren(); failed(failure); return; }
    if (!grants.length) { list.replaceChildren(el("p", "settings-muted", globalThis.t.text("workbench.settings-local-directories.no-plugin-has-been-allowed-read-folder-mac"))); return; }
    const plugins = new Map();
    for (const grant of grants) { if (!plugins.has(grant.plugin_id)) plugins.set(grant.plugin_id, []); plugins.get(grant.plugin_id).push(grant); }
    list.replaceChildren(...[...plugins].map(([pluginId, owned]) => {
      const group = el("section", "settings-section local-directory-plugin");
      group.dataset.pluginId = pluginId;
      const head = el("div", "settings-heading-row");
      head.append(el("h2", "", owned[0].plugin_name));
      const all = el("button", "mw-btn mw-btn--ghost mw-btn--sm", globalThis.t.text("workbench.settings-local-directories.take-back-all-plugin")); all.type = "button";
      all.addEventListener("click", () => revoke("plugin/" + encodeURIComponent(pluginId), globalThis.t.text("workbench.settings-local-directories.take-back-every-folder-permission-plugin-has")));
      head.append(all); group.append(head, ...owned.map(grantRow));
      return group;
    }));
    if (focus) list.querySelector('[data-plugin-id="' + CSS.escape(focus) + '"]')?.scrollIntoView({ block: "start" });
  };
  void load();
};
globalThis.molisWorkBindLocalDirectorySettings(document);
`;

/** English for “本机目录”. */
export const LOCAL_DIRECTORY_EN: Record<string, string> = {
  "本机目录": "Local folders",
  "你允许插件读取的本机目录。授权一直有效，直到你在这里撤回；插件升级后照样有效，卸载插件或删除项目时自动撤回。": "The folders on this Mac you let plugins read. A permission stands until you take it back here; it still holds after the plugin is updated, and goes when the plugin is uninstalled or the project is deleted.",
  "插件、Agent、定时任务、工作流和外部客户端都可以用这份授权读取。每一次读取都记在这里，并会通知你。": "Plugins, agents, scheduled tasks, workflows and external clients may all read with it. Every read is recorded here, and you are notified.",
  "备份恢复会保留读取历史；查看此页不会触发插件读取。": "Backups keep read history. Viewing this page does not trigger a plugin read.",
  "已失效：无法确认这是原授权的目录。请回到插件重新选择。": "No longer valid: the original folder could not be verified. Choose it again in the plugin.",
  "目录有效": "Folder verified",
  "撤回": "Withdraw",
  "工作流": "Workflow",
  "你在页面上": "You, on a page",
  "外部客户端（MCP）": "External client (MCP)",
  "后台任务或定时": "Background or scheduled task",
  "授权于": "Allowed on",
  "读取次数": "Reads",
  "最近一次": "last on",
  "还没有读取过": "Not read yet",
  "最近的读取记录": "Recent reads",
  "撤回后插件不能再读取这个目录，要用时需要你重新选择。确定撤回？": "After this, the plugin can no longer read the folder; you would choose it again to allow it. Take it back?",
  "还没有插件被允许读取本机目录。": "No plugin has been allowed to read a folder on this Mac yet.",
  "撤回这个插件的全部": "Take back all for this plugin",
  "撤回这个插件的全部目录授权？": "Take back every folder permission this plugin has?",
};
