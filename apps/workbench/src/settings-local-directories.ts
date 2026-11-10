import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * “本机目录” (PG-049, user 2026-10-25): every local directory the person let a plugin read, by plugin, with what read it lately.
 * The page is the platform's, the same for every plugin; a plugin's own settings may link here (`/settings/directories?plugin=<id>`).
 */
export function renderLocalDirectorySettings({ }: { readText(text: string): string }): string {
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
  const readText = globalThis.t.text;
  const list = root.querySelector("[data-local-directory-list]"), error = root.querySelector("[data-local-directory-error]");
  const address = context || { search: location.search };
  const focus = new URLSearchParams(address.search || "").get("plugin");
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const when = (value) => value ? globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: value, style: "datetime" } }) : "";
  const BY = { person: globalThis.t.text("workbench.settings-local-directories.page"), agent: "Agent", workflow: globalThis.t.text("workbench.settings-local-directories.workflow"), mcp: globalThis.t.text("workbench.settings-local-directories.external-client-mcp"), background: globalThis.t.text("workbench.settings-local-directories.background-scheduled-task") };
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
