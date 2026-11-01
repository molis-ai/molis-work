import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

export type InboxHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "root" | "scope" | "translate" | "pluginRoute" | "route" | "mount" | "view" | "openItem" | "openPlugin" | "showToast" | "invalidateView">;
interface ComposeDraft { entry_ids: string[]; title: string; instructions: string; request_id: string }
interface ComposeResult extends ComposeDraft { document_id: string | null; status: string; error?: string }

/** Inbox draws only its own surface. Every late result is fenced by its mount and current selection. */
export function inboxClient(host: InboxHost): void {
  const { root, scope, translate: L } = host;
  const q = <T extends HTMLElement = HTMLElement>(selector: string, within: ParentNode = root) => within.querySelector<T>(selector);
  const all = <T extends HTMLElement = HTMLElement>(selector: string, within: ParentNode = root) => [...within.querySelectorAll<T>(selector)];
  const listen = (type: string, listener: EventListener) => { root.addEventListener(type, listener); scope.own(() => root.removeEventListener(type, listener)); };
  let epoch = 0, reads = new AbortController(), selected = "", refreshSequence = 0, composeBusy = false;
  const change = () => { epoch++; reads.abort(); reads = new AbortController(); };
  const guard = () => { const current = epoch; return () => { scope.assertCurrent(); if (!scope.visible || current !== epoch || !root.isConnected) throw new DOMException("View changed", "AbortError"); }; };
  const api = async <T>(path: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<T> => { const check = guard(); const result = await molisWorkRequest<T>(host.pluginRoute(path), { scope, signal: reads.signal, method, body }); check(); return result; };
  const error = (error: unknown, node?: HTMLElement | null) => { if (!scope.visible || !scope.alive || error instanceof DOMException && error.name === "AbortError") return; if (node?.isConnected) { node.hidden = false; molisWorkRequest.show(node, error); } else host.showToast(molisWorkRequest.text(error), true); };
  const storageKey = "molis-inbox-compose:" + host.route("/");
  let draft: ComposeDraft = { entry_ids: [], title: "", instructions: "", request_id: "" };
  try { draft = { ...draft, ...JSON.parse(sessionStorage.getItem(storageKey) || "{}") }; } catch { /* No saved compose draft. */ }
  const saveDraft = () => sessionStorage.setItem(storageKey, JSON.stringify(draft));
  const remember = () => {
    const form = q<HTMLFormElement>("[data-inbox-compose] form"); if (!form) return;
    const next = { entry_ids: all<HTMLInputElement>('input[name="entry_id"]:checked', form).map(input => input.value).sort(), title: q<HTMLInputElement>('[name="title"]', form)?.value || "", instructions: q<HTMLTextAreaElement>('[name="instructions"]', form)?.value || "" };
    if (JSON.stringify(next) !== JSON.stringify({ entry_ids: draft.entry_ids, title: draft.title, instructions: draft.instructions })) draft = { ...next, request_id: "" }; saveDraft();
  };
  const expand = (open: boolean) => { root.dataset.expanded = String(open); const area = q("[data-inbox-stage-workspace]"); if (area) area.hidden = !open; };
  const collapse = () => { if (selected) change(); selected = ""; expand(false); all("[data-inbox-row]").forEach(row => { row.classList.remove("is-selected"); row.setAttribute("aria-selected", "false"); }); all("[data-inbox-detail],[data-inbox-detail-empty]").forEach(node => node.hidden = true); };
  const openPage = (id: string, title: string) => { q<HTMLDialogElement>("[data-inbox-compose]")?.close(); host.openItem("pages", id, title); };
  const showResult = (result: ComposeResult, area: HTMLElement) => {
    const row = document.createElement("div"), text = document.createElement("span"), button = document.createElement("button"); row.className = "inbox-compose-result"; row.dataset.inboxComposeRequest = result.request_id;
    text.textContent = result.title + " · " + L(result.document_id ? "已生成" : result.status === "failed" ? "生成失败，可重试" : "正在处理") + (result.error ? " · " + result.error : "");
    button.type = "button"; button.className = "mw-btn mw-btn--secondary"; button.textContent = L(result.document_id ? "在 Pages 打开" : "恢复处理"); button.disabled = composeBusy;
    button.onclick = () => { if (result.document_id) openPage(result.document_id, result.title); else if (!composeBusy) { draft = { entry_ids: result.entry_ids.slice().sort(), title: result.title, instructions: result.instructions, request_id: result.request_id }; showComposer(); } }; row.append(text, button);
    result.entry_ids.forEach(id => { const source = all("[data-inbox-row]").find(row => row.dataset.inboxEntryId === id); if (!source) return; const back = document.createElement("button"); back.type = "button"; back.className = "mw-btn mw-btn--ghost"; back.textContent = L("返回材料") + "：" + source.querySelector("strong")?.textContent; back.onclick = () => { q<HTMLDialogElement>("[data-inbox-compose]")?.close(); host.openItem("inbox", id); }; row.append(back); }); area.append(row);
  };
  const results = async () => {
    const check = guard(), payload = await api<{ results: ComposeResult[] }>("/pages"); check();
    const area = q("[data-inbox-compose-results]"); if (area) { area.replaceChildren(); payload.results.slice(0, 12).forEach(result => showResult(result, area)); }
    const section = selected && q('[data-inbox-entry-results="' + CSS.escape(selected) + '"]'); if (section) { section.replaceChildren(); payload.results.filter(result => result.entry_ids.includes(selected)).forEach(result => showResult(result, section)); }
  };
  const select = (id: string) => {
    if (id !== selected) change(); selected = id;
    all("[data-inbox-row]").forEach(row => { const active = row.dataset.inboxEntryId === id; row.classList.toggle("is-selected", active); row.setAttribute("aria-selected", String(active)); row.tabIndex = active ? 0 : -1; });
    all("[data-inbox-detail]").forEach(detail => detail.hidden = detail.dataset.inboxDetail !== id); const empty = q("[data-inbox-detail-empty]"); if (empty) empty.hidden = true; expand(true);
    const check = guard(); void results().catch(failure => { try { check(); error(failure, q('[data-inbox-entry-results="' + CSS.escape(id) + '"]')); } catch { /* A newer entry owns the reader. */ } });
  };
  const refresh = async () => {
    const check = guard(), sequence = ++refreshSequence, scroll = q("[data-inbox-list]")?.scrollTop || 0;
    const group = q("[data-inbox-row].is-selected")?.closest<HTMLElement>("[data-inbox-stage-group]")?.dataset.inboxStageGroup;
    const html = await host.view.readDocument(); check(); if (sequence !== refreshSequence) return;
    const next = new DOMParser().parseFromString(html, "text/html").querySelector<HTMLElement>("[data-ui-client-root]"); if (!next) throw new Error(L("无法更新 Inbox 列表"));
    const dialog = q<HTMLDialogElement>("[data-inbox-compose]"), replacement = q<HTMLDialogElement>("[data-inbox-compose]", next); if (dialog && replacement) replacement.replaceWith(dialog);
    const config = q<HTMLDetailsElement>(".inbox-next-config"), nextConfig = q<HTMLDetailsElement>(".inbox-next-config", next); if (config && nextConfig) nextConfig.open = config.open;
    root.replaceChildren(...next.childNodes);
    const row = selected && all("[data-inbox-row]").find(row => row.dataset.inboxEntryId === selected && row.closest<HTMLElement>("[data-inbox-stage-group]")?.dataset.inboxStageGroup === group);
    if (row) select(selected); else collapse(); const list = q("[data-inbox-list]"); if (list) list.scrollTop = scroll;
  };
  const showComposer = (entryId?: string) => {
    const dialog = q<HTMLDialogElement>("[data-inbox-compose]"), form = dialog && q<HTMLFormElement>("form", dialog), materials = form && q("[data-inbox-compose-materials]", form); if (!dialog || !form || !materials) return;
    if (entryId && !composeBusy && !draft.entry_ids.includes(entryId)) { draft.entry_ids.push(entryId); draft.entry_ids.sort(); draft.request_id = ""; }
    all("label,p", materials).forEach(node => node.remove());
    all('[data-inbox-row][data-inbox-subject-type="feed_item"]').forEach(row => { const label = document.createElement("label"), input = document.createElement("input"), title = document.createElement("span"); label.className = "mw-check-row"; input.className = "mw-check"; input.type = "checkbox"; input.name = "entry_id"; input.value = row.dataset.inboxEntryId!; input.checked = draft.entry_ids.includes(input.value); input.disabled = composeBusy; title.textContent = row.querySelector("strong")?.textContent || input.value; label.append(input, title); materials.append(label); });
    const title = q<HTMLInputElement>('[name="title"]', form), instructions = q<HTMLTextAreaElement>('[name="instructions"]', form); if (title) title.value = draft.title; if (instructions) instructions.value = draft.instructions;
    if (!dialog.open) dialog.showModal(); const check = guard(); void results().catch(failure => { try { check(); error(failure, q("[data-inbox-compose-status]", form)); } catch { /* The composer is no longer current. */ } });
  };
  listen("molis-work:select-item", event => { const detail = (event as CustomEvent<{ itemId?: string | null; invalidate?: boolean }>).detail; if (detail?.invalidate) { if (scope.visible) void refresh().catch(failure => error(failure)); } else if (typeof detail?.itemId === "string") select(detail.itemId); else if (detail?.itemId === null) collapse(); });
  listen("input", event => { if (event.target instanceof Element && event.target.closest("[data-inbox-compose]")) remember(); });
  listen("cancel", () => remember());
  listen("click", event => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    void (async () => {
      const settings = target.closest("[data-inbox-functions]"); if (settings) { const link = document.createElement("a"); link.setAttribute("href", "/capabilities/rules?project=" + encodeURIComponent(document.body.dataset.projectId || "")); root.append(link); link.click(); link.remove(); return; }
      if (target.closest("[data-inbox-collapse]")) { collapse(); return; }
      const source = target.closest<HTMLElement>("[data-feed-task-config-open]"); if (source?.dataset.feedTaskConfigOpen) { host.openPlugin("feed", source.dataset.feedTaskConfigOpen, "settings"); return; }
      const feed = target.closest<HTMLElement>("[data-inbox-open-feed]"); if (feed?.dataset.inboxOpenFeed) { host.openItem("feed", feed.dataset.inboxOpenFeed); return; }
      const compose = target.closest<HTMLElement>("[data-inbox-compose-open]"); if (compose) { const id = compose.dataset.inboxComposeOpen, mode = compose.dataset.inboxComposeMode; if (mode && id && !composeBusy) draft = { entry_ids: [id], request_id: "", title: L(mode === "verify" ? "待核查清单" : "材料整理"), instructions: L(mode === "verify" ? "按材料列出待核查问题、已有依据、缺失证据与可执行的核查步骤。每项标明来源，不宣称已完成核查。只输出核查清单，保持原事项待处理。" : "围绕所选材料整理一份简洁的综合工作稿，区分事实、作者自述、推断和待核查。每个主要结论标明材料编号，不把多条材料的差异抹平成共识。正文不重复标题。") }; showComposer(id); return; }
      if (target.closest("[data-inbox-compose-close]")) { remember(); q<HTMLDialogElement>("[data-inbox-compose]")?.close(); return; }
      const action = target.closest<HTMLButtonElement>("[data-inbox-action],[data-inbox-evaluate]");
      if (action) { if (action.disabled) return; const check = guard(); action.disabled = true; const status = q("[data-inbox-action-status]", action.closest("[data-inbox-detail]") || root) || q("[data-inbox-evaluate-status]");
        try { const evaluate = action.hasAttribute("data-inbox-evaluate"); if (evaluate) await api("/judgment/evaluate", "POST", { entry_ids: action.dataset.inboxEvaluate ? [action.dataset.inboxEvaluate] : all('[data-inbox-row][data-inbox-status="open"],[data-inbox-row][data-inbox-status="in_progress"]').slice(0, 20).map(row => row.dataset.inboxEntryId) }); else await api("/entries/" + encodeURIComponent(action.dataset.inboxEntryId!) + "/status", "POST", { status: action.dataset.inboxAction, expected_revision: Number(action.dataset.inboxEntryRevision) }); check(); host.invalidateView(); await refresh(); if (evaluate) { const nextStatus = q("[data-inbox-evaluate-status]"); if (nextStatus) { nextStatus.textContent = L("建议已更新，请查看事项并选择下一步。"); nextStatus.closest("details")?.setAttribute("open", ""); } } }
        catch (failure) { try { check(); error(failure, status); } catch { /* A new entry or hidden mount owns the UI. */ } }
        finally { try { check(); action.disabled = false; } catch { /* No old-finally writes. */ } } return;
      }
      const row = target.closest<HTMLElement>("[data-inbox-row]"); if (row) { const id = row.dataset.inboxEntryId!; if (host.mount?.target_slot_id === "workbench.directory") host.openItem("inbox", id, row.querySelector("strong")?.textContent || undefined); else select(id); }
    })().catch(failure => error(failure));
  });
  listen("submit", event => {
    const form = event.target instanceof HTMLFormElement ? event.target : null; if (!form?.closest("[data-inbox-compose]")) return;
    event.preventDefault(); if (composeBusy) return; remember(); const status = q("[data-inbox-compose-status]", form); if (!draft.entry_ids.length) { if (status) status.textContent = L("请至少选择一条材料"); return; }
    draft.request_id ||= "pages-" + crypto.randomUUID(); saveDraft(); const check = guard(), request = { ...draft, entry_ids: [...draft.entry_ids] }; composeBusy = true;
    const controls = all<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("input,textarea,button[type=submit]", form); controls.forEach(control => control.disabled = true);
    if (status) status.textContent = L("正在整理材料，完成后可在 Pages 中继续编辑…");
    void (async () => {
      try { const result = await api<{ document: { id: string; title: string } }>("/pages", "POST", request); check(); if (status) status.textContent = L("文稿已保存到 Pages；原事项仍待你确认处理结果。"); await results(); check(); host.invalidateView(); if (q<HTMLDialogElement>("[data-inbox-compose]")?.open) openPage(result.document.id, result.document.title); }
      catch (failure) { try { check(); error(failure, status); } catch { /* Keep the saved request id for explicit retry. */ } }
      finally { try { check(); composeBusy = false; controls.forEach(control => control.disabled = false); } catch { /* No late UI or draft writes. */ } }
    })();
  });
  scope.whenVisible(() => { change(); if (composeBusy) { composeBusy = false; all<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>("[data-inbox-compose] input,[data-inbox-compose] textarea,[data-inbox-compose] button[type=submit]").forEach(control => control.disabled = false); } return () => { change(); q<HTMLDialogElement>("[data-inbox-compose]")?.close(); }; });
  scope.own(() => reads.abort());
}
