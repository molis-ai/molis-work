import type { UiConnectionSlotChoice } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FeedPage } from "./factory.js";

interface SourceAnswer { source: { source_id: string } }
interface SyncAnswer { created?: number; deduped?: number; run?: { error_code?: string; receipt?: { rss_http?: { not_modified?: boolean } } } }

/** Reset a draft to the latest owner-rendered defaults, including the native select's visible adapter. */
function resetSourceControls(area: ParentNode, selector = "input,select,textarea"): void {
  for (const control of area.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)) {
    if (control instanceof HTMLSelectElement) control.value = [...control.options].find(option => option.defaultSelected)?.value ?? control.options[0]?.value ?? "";
    else { control.value = control.defaultValue; if (control instanceof HTMLInputElement) control.checked = control.defaultChecked; }
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** The source form owns one in-flight operation; its lifetime also clears busy UI on a view change. */
function beginSourceOperation(page: FeedPage, button: HTMLButtonElement) {
  const dialog = button.closest<HTMLElement>("[data-feed-sources-dialog]");
  if (button.disabled || dialog?.hasAttribute("aria-busy")) return null;
  const area = button.closest<HTMLElement>("[data-source-detail],[data-feed-task-config],[data-feed-add-form],[data-feed-add-account]") || (dialog && page.q(button.matches("[data-feed-source-register]") ? "[data-feed-add-form]" : "[data-feed-task-config]:not([hidden])", dialog)), inert = area?.inert || false;
  button.disabled = true; if (area) area.inert = true; dialog?.setAttribute("aria-busy", "true");
  const controls = dialog ? page.all<HTMLButtonElement>("[data-feed-sources-close],[data-feed-config-submit],[data-feed-source-register]", dialog) : [];
  const disabled = new Map(controls.map(control => [control, control === button ? false : control.disabled])); controls.forEach(control => control.disabled = true);
  const release = page.pending(() => { if (button.isConnected) button.disabled = false; if (area?.isConnected) area.inert = inert; if (dialog?.isConnected) { dialog.removeAttribute("aria-busy"); page.all<HTMLButtonElement>("[data-feed-sources-close],[data-feed-config-submit],[data-feed-source-register]", dialog).forEach(control => control.disabled = disabled.get(control) ?? false); } });
  return { area: area || dialog, release };
}

/** Source selection/configuration belongs to this mount; account choice belongs to the trusted Host. */
export function feedSources(page: FeedPage) {
  const { host, q, all } = page, L = host.translate;
  let filter = "all", previous = "all";
  const field = (area: ParentNode, selector: string) => q<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector, area)?.value || "";
  const status = (area: ParentNode | null, message: unknown) => { const node = area && q("[data-source-action-status],[data-feed-add-error],[data-feed-source-error],[data-feed-connection-status]", area); if (node) { node.hidden = !message; if (typeof message === "string") node.textContent = message; else molisWorkRequest.show(node, message); } };
  const reflectChoice = (region: HTMLElement, choice: UiConnectionSlotChoice | null) => {
    const select = q<HTMLSelectElement>("[data-plugin-record-slot-account]", region);
    if (select) { select.replaceChildren(new Option(choice?.label || L("请选择账号连接"), choice?.connection_id || "")); select.disabled = Boolean(choice); }
    let button = q<HTMLButtonElement>("[data-feed-account-picker]", region);
    if (!button) { button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary"; button.dataset.feedAccountPicker = "true"; select?.after(button); }
    button.textContent = choice?.label || L("请选择账号连接"); button.disabled = Boolean(choice);
    // The native select is a server-rendered label only. Its directory is never sent to the plugin frame.
    if (select) select.hidden = true;
    region.dataset.feedChoiceLoaded = "true";
    status(region, L(choice ? "这个来源已经选好账号。要换账号，先断开来源。" : "为这个来源选一个账号，选好就保存。"));
  };
  const loadChoice = async (region: HTMLElement) => {
    if (region.dataset.loading || region.dataset.feedChoiceLoaded) return; region.dataset.loading = "true";
    const release = page.pending(() => { if (region.isConnected) delete region.dataset.loading; });
    const slot = JSON.parse(region.dataset.pluginRecordSlot!) as { slot_id: string; record_key: string };
    const check = page.guard();
    try { const choice = await host.connectionSlot({ ...slot, mode: "read", signal: page.signal() }); check(); if (region.isConnected) reflectChoice(region, choice); } finally { release(); }
  };
  const show = (view: string, kind = "") => {
    page.panel = view;
    const dialog = q("[data-feed-sources-dialog]"), workbench = q("[data-feed-workbench]") || host.root;
    if (!dialog) return;
    if (kind) dialog.dataset.setupKind = kind; else if (view === "setup") kind = dialog.dataset.setupKind || "";
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
    const back = q("[data-feed-setup-back]", dialog); if (back) back.hidden = Boolean(draft?.dataset.createdSourceId);
    all("[data-feed-setup-kind]", dialog).forEach(panel => { panel.hidden = !setup || panel.dataset.feedSetupKind !== kind; all<HTMLInputElement | HTMLSelectElement>("input,select", panel).forEach(input => input.disabled = panel.hidden || Boolean(draft?.dataset.createdSourceId)); });
    if (draft) draft.hidden = !setup || kind === "github" || kind === "gmail";
    const create = q<HTMLButtonElement>("[data-feed-source-register]", dialog); if (create) { create.hidden = Boolean(draft?.hidden); create.dataset.feedSourceRegister = kind; }
    const save = q<HTMLButtonElement>("[data-feed-config-submit]", dialog); if (save) { save.hidden = !config || view === "rules"; save.dataset.sourceId = page.selection; }
    all<HTMLButtonElement>("[data-feed-sources-close],[data-feed-config-submit],[data-feed-source-register]", dialog).forEach(button => button.disabled = dialog.hasAttribute("aria-busy"));
    all("[data-feed-footer-kind]", dialog).forEach(node => node.hidden = !setup || node.dataset.feedFooterKind !== kind);
    all("button[data-feed-view]").forEach(button => { if (button.dataset.feedView === view) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); });
    if (view === "settings") { const region = q('[data-feed-task-config]:not([hidden]) [data-plugin-record-slot]'); if (region) void loadChoice(region).catch(error => page.error(error, q("[data-feed-connection-status]", region))); }
  };
  const select = (id: string, intent: string) => {
    const changed = previous !== id; previous = id;
    all("[data-feed-task],[data-feed-task-toggle],[data-source-entry-id]").forEach(node => { const active = (node.dataset.feedTask || node.dataset.feedTaskToggle || node.dataset.sourceEntryId) === id; node.classList.toggle("is-selected", active); node.setAttribute("aria-selected", String(active)); if (active) node.setAttribute("aria-current", "page"); else node.removeAttribute("aria-current"); });
    all("[data-source-detail]").forEach(node => node.hidden = node.dataset.sourceDetail !== id);
    if (host.mount?.surface === "source-workbench") { const region = q('[data-source-detail="' + CSS.escape(id) + '"] [data-plugin-record-slot]'); if (region) void loadChoice(region).catch(error => page.error(error, q("[data-feed-connection-status]", region))); }
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
    const operation = beginSourceOperation(page, button); if (!operation) return;
    const check = page.guard(), { area, release } = operation;
    try { await work(); check(); }
    catch (error) { try { check(); status(area, error); } catch { /* The source or mount changed. */ } }
    finally { try { check(); release(); } catch { /* No old-finally DOM writes. */ } }
  };
  const changed = async () => { host.invalidateView(); await page.refresh(); };
  const openSource = (source: HTMLElement) => {
    const id = source.dataset.sourceEntryId!;
    page.select(id, "open"); host.openView({ surface: "source-workbench", id, intent: "select" });
  };
  page.listen("keydown", event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const source = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-source-entry-id]") : null;
    const rows = all("[data-source-entry-id]").filter(row => row.checkVisibility());
    const index = source ? rows.indexOf(source) : -1;
    if (index < 0) return;
    const next = event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : rows[(index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length];
    if (!next) return;
    event.preventDefault(); next.focus(); openSource(next);
  });
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
      const check = page.guard();
      const account = form.dataset.feedAddAccount, kind = button.dataset.feedSourceRegister || "";
      const sourceValue = kind === "rss" ? field(form, "[data-feed-rss-definition]") : field(form, '[data-feed-source-value="' + CSS.escape(kind) + '"]');
      const body = account ? { service: account, name: field(form, "[data-feed-account-name]") } : { kind, name: field(form, "[data-feed-add-name]").trim(), ...(kind === "rss" ? { definition_id: sourceValue } : kind === "research_library" ? { repository: sourceValue, research_source: field(form, "[data-feed-research-source]") } : kind === "web_query" ? { query: sourceValue } : kind === "youtube_channel" ? { channel_id: sourceValue } : { feed_url: sourceValue }) };
      let id = form.dataset.createdSourceId;
      if (!id) { const result = await page.api<SourceAnswer>(account ? "/sources/accounts" : "/sources", "POST", body); id = result.source.source_id; form.dataset.createdSourceId = id; if (!account) show("setup", kind); }
      const minutes = Number(field(form, "[data-feed-create-frequency]"));
      if (minutes) try { await page.api("/sources/" + encodeURIComponent(id) + "/schedule", "PUT", { mode: "interval", enabled: true, interval_minutes: minutes }); }
      catch (error) { check(); status(form, L("任务已创建，拉取计划未保存。请重试，不会重复创建任务。") + " " + molisWorkRequest.text(error)); return; }
      host.invalidateView(); await page.refresh(); page.select(id, "open", account ? "settings" : "messages");
      host.openView({ surface: "workbench", id, panel: account ? "settings" : "messages", intent: "open" });
      form.reset(); delete form.dataset.createdSourceId;
    });
  });
  const click = async (target: Element, event: MouseEvent): Promise<boolean> => {
    const pick = target.closest<HTMLButtonElement>("[data-feed-account-picker]");
    if (pick) { const region = pick.closest<HTMLElement>("[data-plugin-record-slot]"); if (!region) return true; await run(pick, async () => { const check = page.guard(), id = page.selection; const slot = JSON.parse(region.dataset.pluginRecordSlot!) as { slot_id: string; record_key: string }; const choice = await host.connectionSlot({ ...slot, mode: "choose", anchor: pick, signal: page.signal() }); check(); if (id !== page.selection || !choice) return; await changed(); page.select(id, "restore", "settings"); host.showToast(L(region.hasAttribute("data-feed-source-disconnected") ? "账号已保存。这个来源已断开，请点「恢复来源」再拉取。" : "账号已保存。")); }); return true; }
    const task = target.closest<HTMLElement>("[data-feed-task],[data-feed-task-toggle],[data-open-source-record]");
    if (task) { const id = task.dataset.feedTask || task.dataset.feedTaskToggle || task.dataset.openSourceRecord || "all"; page.select(id, "open"); host.openView({ surface: "workbench", id, intent: "open" }); return true; }
    const source = target.closest<HTMLElement>("[data-source-entry-id]"); if (source) { openSource(source); return true; }
    const sourceFilter = target.closest<HTMLElement>("[data-source-filter],[data-source-filter-reset]"); if (sourceFilter) { filter = sourceFilter.dataset.sourceFilter || "all"; filterSources(); return true; }
    const tab = target.closest<HTMLElement>("[data-source-detail-tab]"); if (tab) { const area = tab.closest("[data-source-detail]"); if (area) { all("[data-source-detail-tab]", area).forEach(node => { const active = node === tab; node.classList.toggle("is-active", active); node.setAttribute("aria-selected", String(active)); }); all("[data-source-detail-panel]", area).forEach(node => node.hidden = node.dataset.sourceDetailPanel !== tab.dataset.sourceDetailTab); } return true; }
    const view = target.closest<HTMLElement>("button[data-feed-view]"); if (view) { show(view.dataset.feedView!); return true; }
    if (target.closest("[data-feed-add-toggle]")) { const panel = q<HTMLFormElement>("[data-feed-add-form]")?.dataset.createdSourceId ? "setup" : "choose"; if (host.mount?.surface !== "workbench") host.openView({ surface: "workbench", id: page.selection, panel, intent: "open" }); else show(panel); return true; }
    const choice = target.closest<HTMLElement>("[data-feed-choose-kind]"); if (choice) { show("setup", choice.dataset.feedChooseKind); return true; }
    if (target.closest("[data-feed-sources-open],[data-feed-setup-back]")) { if (host.mount?.surface !== "workbench") host.openView({ surface: "workbench", id: page.selection, panel: "choose", intent: "open" }); else show("choose"); return true; }
    if (target.closest("[data-feed-sources-close]")) { const dialog = q("[data-feed-sources-dialog]"); if (dialog?.hasAttribute("aria-busy")) return true; const area = q('[data-feed-task-config]:not([hidden])'); if (area) { resetSourceControls(area, "[data-source-config-field],[data-feed-plan-region] input,[data-feed-plan-region] select"); status(area, ""); } show("messages"); return true; }
    const config = target.closest<HTMLElement>("[data-feed-task-config-open]"); if (config) { page.select(config.dataset.feedTaskConfigOpen!, "open", "settings"); show("settings"); return true; }
    const register = target.closest<HTMLButtonElement>("[data-feed-source-register]"); if (register) { event.preventDefault(); const form = q<HTMLFormElement>("[data-feed-add-form]"); form?.requestSubmit(); return true; }
    const reset = target.closest("[data-source-schedule-reset]");
    if (reset) { const area = reset.closest("[data-feed-plan-region]"); if (area) resetSourceControls(area); return true; }
    const configSave = target.closest<HTMLButtonElement>("[data-source-config-save]");
    if (configSave) { await run(configSave, async () => { const area = configSave.closest("[data-source-detail]") || q('[data-feed-task-config]:not([hidden])'); if (!area) return; const read = (name: string) => field(area, '[data-source-config-field="' + name + '"]'); if (all<HTMLInputElement>("[data-source-config-field]", area).some(input => !input.reportValidity())) return; await page.api("/sources/" + encodeURIComponent(configSave.dataset.sourceId!), "PATCH", { name: read("name") === q<HTMLInputElement>('[data-source-config-field="name"]', area)?.defaultValue ? undefined : read("name"), description: read("description"), scope: read("scope") || undefined, feed_url: read("feed_url") || undefined }); await changed(); host.showToast(L("来源资料已保存。")); }); return true; }
    const schedule = target.closest<HTMLButtonElement>("[data-source-schedule-save]");
    if (schedule) { await run(schedule, async () => { const area = schedule.closest("[data-source-detail]") || q('[data-feed-task-config]:not([hidden])'); if (!area) return; const mode = field(area, "[data-source-schedule-mode]") || "manual"; await page.api("/sources/" + encodeURIComponent(schedule.dataset.sourceId!) + "/schedule", "PUT", mode === "manual" ? { mode } : { mode, enabled: Boolean(q<HTMLInputElement>("[data-source-schedule-enabled]", area)?.checked), interval_minutes: Number(field(area, "[data-source-schedule-interval]")) || 60 }); await changed(); }); return true; }
    const runtime = target.closest<HTMLButtonElement>("[data-source-runtime-action],[data-feed-source-toggle],[data-feed-source-sync]");
    if (runtime) { await run(runtime, async () => { const action = runtime.dataset.sourceRuntimeAction || (runtime.dataset.feedSourceSync ? "sync" : runtime.dataset.feedSourceEnabled === "true" ? "pause" : "resume"), id = runtime.dataset.sourceId || runtime.dataset.feedSourceSync || runtime.dataset.feedSourceToggle!; const result = await page.api<SyncAnswer>("/sources/" + encodeURIComponent(id) + "/" + action, "POST", action === "sync" ? { idempotency_key: crypto.randomUUID() } : {}); await changed(); host.showToast(action === "sync" ? result.run?.error_code ? L("拉取失败：{code}。已保留上次成功内容，可按来源提示重试。", { code: result.run.error_code }) : L("拉取完成：新增 {created}，去重 {deduped}", { created: result.created || 0, deduped: result.deduped || 0 }) : L(action === "pause" ? "来源已暂停；消息与历史仍保留。" : action === "resume" ? "来源已恢复。" : "账号已断开，后续不会再拉取。")); }); return true; }
    const remove = target.closest<HTMLButtonElement>("[data-source-delete]"); if (remove) { await run(remove, async () => { const check = page.guard(); const yes = await host.confirm(L(remove.dataset.sourceDelete === "delete_local_history" ? "确认删除这个来源及其本地消息、资料、Inbox 引用和运行记录？此操作无法从 Molis Work 恢复。" : "确认删除这个来源并停止拉取？已有消息和运行历史会保留。 ")); check(); if (!yes) return; await page.api("/sources/" + encodeURIComponent(remove.dataset.sourceId!), "DELETE", { history_decision: remove.dataset.sourceDelete }); await changed(); show("messages"); }); return true; }
    return false;
  };
  return { click, select, show };
}
