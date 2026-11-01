import type { UiConnectionSlotChoice } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FeedPage } from "./factory.js";

interface SourceAnswer { source: { source_id: string } }
interface SyncAnswer { created?: number; deduped?: number; run?: { error_code?: string; receipt?: { rss_http?: { not_modified?: boolean } } } }

/** Source selection/configuration belongs to this mount; account choice belongs to the trusted Host. */
export function feedSources(page: FeedPage) {
  const { host, q, all } = page, L = host.translate;
  let filter = "all", previous = "all";
  const field = (area: ParentNode, selector: string) => q<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector, area)?.value || "";
  const status = (area: ParentNode | null, message: unknown) => { const node = area && q("[data-source-action-status],[data-feed-source-error],[data-feed-connection-status]", area); if (node) { node.hidden = !message; if (typeof message === "string") node.textContent = message; else molisWorkRequest.show(node, message); } };
  const reflectChoice = (region: HTMLElement, choice: UiConnectionSlotChoice | null) => {
    const select = q<HTMLSelectElement>("[data-plugin-record-slot-account]", region);
    if (select) { select.replaceChildren(new Option(choice?.label || L("请选择账号连接"), choice?.connection_id || "")); select.disabled = Boolean(choice); }
    let button = q<HTMLButtonElement>("[data-feed-account-picker]", region);
    if (!button) { button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary"; button.dataset.feedAccountPicker = "true"; select?.after(button); }
    button.textContent = choice?.label || L("请选择账号连接"); button.disabled = Boolean(choice);
    // The native select is a server-rendered label only. Its directory is never sent to the plugin frame.
    if (select) select.hidden = true;
    status(region, L(choice ? "这个来源已经选好账号。要换账号，先断开来源。" : "为这个来源选一个账号，选好就保存。"));
  };
  const loadChoice = async (region: HTMLElement) => {
    const slot = JSON.parse(region.dataset.pluginRecordSlot!) as { slot_id: string; record_key: string };
    const check = page.guard();
    const choice = await host.connectionSlot({ ...slot, mode: "read" }); check(); if (region.isConnected) reflectChoice(region, choice);
  };
  const show = (view: string, kind = "") => {
    page.panel = view;
    const dialog = q("[data-feed-sources-dialog]"), workbench = q("[data-feed-workbench]") || host.root;
    if (!dialog) return;
    const config = view === "settings" || view === "rules", setup = view === "setup";
    dialog.hidden = view === "messages"; workbench.dataset.feedView = view === "choose" || setup ? "add" : view;
    if (view === "messages") return;
    const titles: Record<string, string> = { research_library: "共享研究库", custom_rss: "RSS / Atom", rss: "目录订阅", web_query: "网页搜索", youtube_channel: "YouTube", github: "GitHub", gmail: "Gmail" };
    const title = q("h2", dialog); if (title) title.textContent = L(config ? view === "rules" ? "捕捉规则" : "来源设置" : setup ? titles[kind] || "添加来源" : "添加来源");
    const description = q("[data-feed-setup-description]", dialog); if (description) description.textContent = L(config ? view === "rules" ? "在这里写规则、预览，再决定哪些消息进入 Inbox。" : "管理来源内容、拉取频率和连接状态。" : setup ? "添加后可设置拉取计划与捕捉规则。" : "选择你想关注的内容来源。");
    for (const [selector, visible] of [["[data-feed-source-choices]", !config && !setup], ["[data-feed-source-setup]", setup], ["[data-feed-task-configs]", config]] as const) { const node = q(selector, dialog); if (node) node.hidden = !visible; }
    all("[data-feed-task-config]", dialog).forEach(node => node.hidden = node.dataset.feedTaskConfig !== page.selection);
    all("[data-feed-config-section]", dialog).forEach(node => node.hidden = node.dataset.feedConfigSection !== view);
    const draft = q<HTMLFormElement>("[data-feed-add-form]", dialog);
    all("[data-feed-setup-kind]", dialog).forEach(panel => { panel.hidden = !setup || panel.dataset.feedSetupKind !== kind; all<HTMLInputElement | HTMLSelectElement>("input,select", panel).forEach(input => input.disabled = panel.hidden || Boolean(draft?.dataset.createdSourceId)); });
    if (draft) draft.hidden = !setup || kind === "github" || kind === "gmail";
    const create = q<HTMLButtonElement>("[data-feed-source-register]", dialog); if (create) { create.hidden = Boolean(draft?.hidden); create.dataset.feedSourceRegister = kind; }
    const save = q<HTMLButtonElement>("[data-feed-config-submit]", dialog); if (save) { save.hidden = !config || view === "rules"; save.dataset.sourceId = page.selection; }
    all("[data-feed-footer-kind]", dialog).forEach(node => node.hidden = !setup || node.dataset.feedFooterKind !== kind);
    all("button[data-feed-view]").forEach(button => { if (button.dataset.feedView === view) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
    if (view === "settings") { const region = q('[data-feed-task-config]:not([hidden]) [data-plugin-record-slot]'); if (region) void loadChoice(region).catch(error => page.error(error, q("[data-feed-connection-status]", region))); }
  };
  const select = (id: string, intent: string) => {
    const changed = previous !== id; previous = id;
    all("[data-feed-task],[data-feed-task-toggle],[data-source-entry-id]").forEach(node => { const active = (node.dataset.feedTask || node.dataset.feedTaskToggle || node.dataset.sourceEntryId) === id; node.classList.toggle("is-selected", active); node.setAttribute("aria-selected", String(active)); if (active) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current"); });
    all("[data-source-detail]").forEach(node => node.hidden = node.dataset.sourceDetail !== id);
    const chosen = all("[data-feed-task]").find(node => node.dataset.feedTask === id);
    const title = q("[data-feed-task-title]"), summary = q("[data-feed-task-summary]");
    if (title) title.textContent = chosen?.querySelector("strong")?.textContent || L("全部消息");
    if (summary) summary.textContent = chosen?.dataset.feedSourceSummary || L("所有来源的最新内容");
    all('button[data-feed-view]:not([data-feed-view="messages"]),.feed-source-tabs').forEach(node => node.hidden = id === "all" || id === "other");
    const sync = q<HTMLButtonElement>("[data-feed-current-sync]"); if (sync) { sync.hidden = id === "all" || id === "other"; sync.dataset.feedSourceSync = id; sync.disabled = chosen?.dataset.feedSourceCanSync !== "true" || chosen.dataset.feedSourceState === "syncing"; }
    const workbench = q("[data-feed-workbench]") || host.root;
    workbench.dataset.selectedSource = id;
    if (intent !== "restore" || changed) { workbench.dataset.railOpen = "false"; const menu = q<HTMLDetailsElement>("[data-feed-source-menu]"); if (menu) menu.open = false; q("[data-feed-rail-toggle]")?.setAttribute("aria-expanded", "false"); }
    if (changed && page.panel === "messages") show("messages");
  };
  page.listen("toggle", event => { const menu = event.target instanceof HTMLDetailsElement && event.target.matches("[data-feed-source-menu]") ? event.target : null; if (!menu) return; (q("[data-feed-workbench]") || host.root).dataset.railOpen = String(menu.open); q("[data-feed-rail-toggle]", menu)?.setAttribute("aria-expanded", String(menu.open)); });
  const filterSources = () => {
    const rows = all("[data-source-entry-id]"); let count = 0;
    rows.forEach(row => { const kind = row.dataset.sourceKind; row.hidden = !(filter === "all" || filter === "account" && ["github", "gmail", "connector"].includes(kind || "") || filter === "public" && kind === "rss" || filter === "attention" && row.dataset.sourceStatus === "attention"); if (!row.hidden) count++; });
    const countNode = q("[data-source-result-count]"); if (countNode) countNode.textContent = L("{count} 个来源", { count });
    const empty = q("[data-source-empty]"); if (empty) empty.hidden = count > 0;
  };
  const run = async (button: HTMLButtonElement, work: () => Promise<void>) => {
    if (button.disabled) return; const check = page.guard(); button.disabled = true;
    try { await work(); check(); }
    catch (error) { try { check(); status(button.closest("[data-source-detail],[data-feed-task-config],[data-feed-sources-dialog]"), error); } catch { /* The source or mount changed. */ } }
    finally { try { check(); button.disabled = false; } catch { /* No old-finally DOM writes. */ } }
  };
  const changed = async () => { host.invalidateView(); await page.refresh(); };
  page.listen("change", event => {
    const mode = event.target instanceof HTMLSelectElement && event.target.matches("[data-source-schedule-mode]") ? event.target : null;
    if (!mode) return; const region = mode.closest("[data-feed-task-config],[data-source-detail]"); if (!region) return;
    all<HTMLInputElement>("[data-source-schedule-interval],[data-source-schedule-enabled]", region).forEach(input => { input.disabled = mode.value !== "interval"; const label = input.closest("label"); if (label) label.hidden = input.disabled; });
  });
  page.listen("submit", event => {
    const form = event.target instanceof HTMLFormElement ? event.target : null; if (!form?.matches("[data-feed-add-account],[data-feed-add-form]")) return;
    event.preventDefault(); const button = form.querySelector<HTMLButtonElement>('button[type="submit"],[data-feed-source-register]') || q<HTMLButtonElement>("[data-feed-source-register]");
    if (!button) return;
    void run(button, async () => {
      if (!form.reportValidity()) return;
      const account = form.dataset.feedAddAccount, kind = button.dataset.feedSourceRegister || "";
      const sourceValue = kind === "rss" ? field(form, "[data-feed-rss-definition]") : field(form, '[data-feed-source-value="' + CSS.escape(kind) + '"]');
      const body = account ? { service: account, name: field(form, "[data-feed-account-name]") } : { kind, name: field(form, "[data-feed-add-name]").trim(), ...(kind === "rss" ? { definition_id: sourceValue } : kind === "research_library" ? { repository: sourceValue, research_source: field(form, "[data-feed-research-source]") } : kind === "web_query" ? { query: sourceValue } : kind === "youtube_channel" ? { channel_id: sourceValue } : { feed_url: sourceValue }) };
      let id = form.dataset.createdSourceId;
      if (!id) { const result = await page.api<SourceAnswer>(account ? "/sources/accounts" : "/sources", "POST", body); id = result.source.source_id; form.dataset.createdSourceId = id; }
      const minutes = Number(field(form, "[data-feed-create-frequency]"));
      if (minutes) await page.api("/sources/" + encodeURIComponent(id) + "/schedule", "PUT", { mode: "interval", enabled: true, interval_minutes: minutes });
      host.invalidateView(); await page.refresh(); page.select(id, "open", account ? "settings" : "messages");
      host.openView({ surface: "workbench", id, panel: account ? "settings" : "messages", intent: "open" });
      form.reset(); delete form.dataset.createdSourceId;
    });
  });
  const click = async (target: Element, event: MouseEvent): Promise<boolean> => {
    const pick = target.closest<HTMLButtonElement>("[data-feed-account-picker]");
    if (pick) { const region = pick.closest<HTMLElement>("[data-plugin-record-slot]"); if (!region) return true; await run(pick, async () => { const check = page.guard(), id = page.selection; const slot = JSON.parse(region.dataset.pluginRecordSlot!) as { slot_id: string; record_key: string }; const choice = await host.connectionSlot({ ...slot, mode: "choose", anchor: pick }); check(); if (id !== page.selection || !choice) return; await changed(); page.select(id, "restore", "settings"); host.showToast(L(region.hasAttribute("data-feed-source-disconnected") ? "账号已保存。这个来源已断开，请点「恢复来源」再拉取。" : "账号已保存。")); }); return true; }
    const task = target.closest<HTMLElement>("[data-feed-task],[data-feed-task-toggle],[data-open-source-record]");
    if (task) { const id = task.dataset.feedTask || task.dataset.feedTaskToggle || task.dataset.openSourceRecord || "all"; page.select(id, "open"); host.openView({ surface: "workbench", id, intent: "open" }); return true; }
    const source = target.closest<HTMLElement>("[data-source-entry-id]"); if (source) { const id = source.dataset.sourceEntryId!; page.select(id, "open"); host.openView({ surface: "source-workbench", id, intent: "select" }); return true; }
    const sourceFilter = target.closest<HTMLElement>("[data-source-filter],[data-source-filter-reset]"); if (sourceFilter) { filter = sourceFilter.dataset.sourceFilter || "all"; filterSources(); return true; }
    const tab = target.closest<HTMLElement>("[data-source-detail-tab]"); if (tab) { const area = tab.closest("[data-source-detail]"); if (area) { all("[data-source-detail-tab]", area).forEach(node => { const active = node === tab; node.classList.toggle("is-active", active); node.setAttribute("aria-selected", String(active)); }); all("[data-source-detail-panel]", area).forEach(node => node.hidden = node.dataset.sourceDetailPanel !== tab.dataset.sourceDetailTab); } return true; }
    const view = target.closest<HTMLElement>("button[data-feed-view]"); if (view) { show(view.dataset.feedView!); return true; }
    if (target.closest("[data-feed-add-toggle]")) { if (host.mount?.surface !== "workbench") host.openView({ surface: "workbench", id: page.selection, panel: "choose", intent: "open" }); else show("choose"); return true; }
    const choice = target.closest<HTMLElement>("[data-feed-choose-kind]"); if (choice) { show("setup", choice.dataset.feedChooseKind); return true; }
    if (target.closest("[data-feed-sources-open],[data-feed-setup-back]")) { show("choose"); return true; }
    if (target.closest("[data-feed-sources-close]")) { show("messages"); return true; }
    const config = target.closest<HTMLElement>("[data-feed-task-config-open]"); if (config) { page.select(config.dataset.feedTaskConfigOpen!, "open", "settings"); show("settings"); return true; }
    const register = target.closest<HTMLButtonElement>("[data-feed-source-register]"); if (register) { event.preventDefault(); const form = q<HTMLFormElement>("[data-feed-add-form]"); form?.requestSubmit(); return true; }
    const configSave = target.closest<HTMLButtonElement>("[data-source-config-save]");
    if (configSave) { await run(configSave, async () => { const area = configSave.closest("[data-source-detail]") || q('[data-feed-task-config]:not([hidden])'); if (!area) return; const read = (name: string) => field(area, '[data-source-config-field="' + name + '"]'); if (all<HTMLInputElement>("[data-source-config-field]", area).some(input => !input.reportValidity())) return; await page.api("/sources/" + encodeURIComponent(configSave.dataset.sourceId!), "PATCH", { name: read("name"), description: read("description"), scope: read("scope") || undefined, feed_url: read("feed_url") || undefined }); await changed(); host.showToast(L("来源资料已保存。")); }); return true; }
    const schedule = target.closest<HTMLButtonElement>("[data-source-schedule-save]");
    if (schedule) { await run(schedule, async () => { const area = schedule.closest("[data-source-detail]") || q('[data-feed-task-config]:not([hidden])'); if (!area) return; const mode = field(area, "[data-source-schedule-mode]") || "manual"; await page.api("/sources/" + encodeURIComponent(schedule.dataset.sourceId!) + "/schedule", "PUT", mode === "manual" ? { mode } : { mode, enabled: Boolean(q<HTMLInputElement>("[data-source-schedule-enabled]", area)?.checked), interval_minutes: Number(field(area, "[data-source-schedule-interval]")) || 60 }); await changed(); }); return true; }
    const runtime = target.closest<HTMLButtonElement>("[data-source-runtime-action],[data-feed-source-toggle],[data-feed-source-sync]");
    if (runtime) { await run(runtime, async () => { const action = runtime.dataset.sourceRuntimeAction || (runtime.dataset.feedSourceSync ? "sync" : runtime.dataset.feedSourceEnabled === "true" ? "pause" : "resume"), id = runtime.dataset.sourceId || runtime.dataset.feedSourceSync || runtime.dataset.feedSourceToggle!; const result = await page.api<SyncAnswer>("/sources/" + encodeURIComponent(id) + "/" + action, "POST", action === "sync" ? { idempotency_key: crypto.randomUUID() } : {}); await changed(); host.showToast(action === "sync" ? result.run?.error_code ? L("拉取失败：{code}。已保留上次成功内容，可按来源提示重试。", { code: result.run.error_code }) : L("拉取完成：新增 {created}，去重 {deduped}", { created: result.created || 0, deduped: result.deduped || 0 }) : L(action === "pause" ? "来源已暂停；消息与历史仍保留。" : action === "resume" ? "来源已恢复。" : "账号已断开，后续不会再拉取。")); }); return true; }
    const remove = target.closest<HTMLButtonElement>("[data-source-delete]"); if (remove) { await run(remove, async () => { const check = page.guard(); const yes = await host.confirm(L(remove.dataset.sourceDelete === "delete_local_history" ? "确认删除这个来源及其本地消息、资料、Inbox 引用和运行记录？此操作无法从 Molis Work 恢复。" : "确认删除这个来源并停止拉取？已有消息和运行历史会保留。 ")); check(); if (!yes) return; await page.api("/sources/" + encodeURIComponent(remove.dataset.sourceId!), "DELETE", { history_decision: remove.dataset.sourceDelete }); await changed(); show("messages"); }); return true; }
    return false;
  };
  return { click, select, show };
}
