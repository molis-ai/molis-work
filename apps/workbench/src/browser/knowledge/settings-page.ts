import type { KnowledgeCardRecord, KnowledgeCardsResponse, KnowledgeOrganizeResponse, KnowledgeReadReceipt, KnowledgeReceiptsResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { badge, el, L, readerOf, request, stateOf, subjectKey, unbound, when } from "./common.js";
import { renderDetail, type KnowledgeDetailHost } from "./detail.js";
import { drawQuota, drawReceipts, pageNotices } from "./settings-parts.js";
import { knowledgeBinding } from "./bind.js";

type Overview = KnowledgeCardsResponse & { recent: KnowledgeReceiptsResponse };
const POLL_MS = 4_000;
const BACKEND_STATES = ["pending", "ready", "listed", "failed", "over_quota", "missing"];
/** Waiting for organizing; a piece kept from agents waits for nothing (its text goes to no model). */
const waiting = (card: KnowledgeCardRecord) => card.state === "pending" && !card.excluded && !unbound(card);

/**
 * The read asked for last wins (VUX-31): an answer that comes after a newer question (another state, a refresh, a longer list)
 * changes nothing, and a longer list is not asked for while the list is being replaced, so it is never added to a list other than
 * its own. `read` asks, `apply` changes the page; the answer says whether the page changed.
 */
function latestReads() {
  let newest = 0, replacing = 0;
  return async <T>(more: boolean, read: () => Promise<T>, apply: (data: T) => void): Promise<boolean> => {
    if (more && replacing) return false;
    const ticket = ++newest;
    if (!more) replacing = ticket;
    try { const data = await read(); return ticket === newest && (apply(data), true); }
    catch (error) { if (ticket === newest) throw error; return false; }
    finally { if (replacing === ticket) replacing = 0; }
  };
}

/**
 * Binds one 项目资料 page (a standalone settings page, or the same page placed into the settings cover). Everything is drawn
 * with textContent: nothing a card or a piece says is ever parsed as markup.
 */
export function bindKnowledgeSettings(root: HTMLElement): void {
  if (root.dataset.knowledgeBound === "1") return;
  root.dataset.knowledgeBound = "1";
  const project = root.dataset.project || "";
  const base = "/projects/" + encodeURIComponent(project) + "/api/knowledge";
  const $ = <T extends Element = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const errorBox = $("[data-knowledge-error]");
  const list = $("[data-knowledge-list]");
  const stateFilter = $<HTMLSelectElement>("[data-knowledge-filter=state]");
  const queryFilter = $<HTMLInputElement>("[data-knowledge-filter=query]");
  let cards: KnowledgeCardRecord[] = [], total = 0, recent: KnowledgeReadReceipt[] = [], open = "", timer = 0, modelReady = true, listing = false;
  const selected = new Set<string>();

  const api = <T>(path: string, body?: unknown) => request()<T>(base + path, body === undefined ? {} : { body, fallback: L("操作没有完成") });
  const { toast, fail } = pageNotices(errorBox);

  const backendState = () => BACKEND_STATES.includes(stateFilter.value) ? stateFilter.value : "";
  const reading = latestReads();
  async function load(more = false): Promise<boolean> {
    return reading(more, () => api<Overview>("/overview?offset=" + (more ? cards.length : 0) + (backendState() ? "&state=" + backendState() : "")), data => {
      cards = more ? [...cards, ...data.cards] : data.cards;
      binding.current(cards);
      total = data.total; recent = data.recent.receipts; modelReady = data.model_ready; listing = data.listing;
      $("[data-knowledge-model]").hidden = modelReady || !cards.some(waiting);
      errorBox.hidden = true;
      drawQuota(root, data.quota, data.quota.reached || cards.some(card => card.state === "over_quota"));
      drawList(); drawReceipts(root, recent, cards, data.recent.total);
      schedule();
    });
  }
  /** Loads again as far as the person had loaded (a refresh does not fold the list back to its first page). */
  async function reload(): Promise<void> {
    const had = cards.length;
    if (!await load()) return;
    while (cards.length < Math.min(had, total)) if (!await load(true)) break;
  }
  // While anything waits for organizing, or the project's sources are still being listed, the page looks again now and then; it
  // stops once nothing does or the page is gone. An open card the person is writing in is not redrawn under them.
  function schedule() {
    clearTimeout(timer);
    if (!listing && (!modelReady || !cards.some(waiting))) return;
    timer = window.setTimeout(() => {
      if (!root.isConnected) return;
      if (document.hidden || (open && writing())) { schedule(); return; }
      void reload().catch(() => schedule());
    }, POLL_MS);
  }
  const writing = () => { const detail = list.querySelector("[data-knowledge-detail]"); return !!detail && (detail.contains(document.activeElement) || detail.hasAttribute("data-knowledge-dirty")); };
  // The filters the page applies itself (changed, kept from agents, the words) look at every card, not only the loaded pages.
  const whole = async () => { while (cards.length < total) { const had = cards.length; if (!await load(true) || cards.length === had) break; } };
  const local = () => !!queryFilter.value.trim() || stateFilter.value === "changed" || stateFilter.value === "excluded";

  const visible = () => {
    const query = queryFilter.value.trim().toLowerCase();
    return cards.filter(card => (stateFilter.value !== "changed" || !!card.suggestion) && (stateFilter.value !== "excluded" || card.excluded)
      && (!query || [card.title, card.plugin_title, card.brief, ...card.keywords].some(text => text.toLowerCase().includes(query))));
  };
  const lastRead = (card: KnowledgeCardRecord) => recent.find(receipt => subjectKey(receipt.subject) === subjectKey(card.subject));

  function drawList() {
    const shown = visible();
    const counts = { all: cards.length, ready: 0, pending: 0, failed: 0 };
    for (const card of cards) if (card.state === "ready" || card.state === "failed" || waiting(card)) counts[card.state as "ready" | "pending" | "failed"] += 1;
    $("[data-knowledge-summary]").textContent = !total && listing ? L("正在清点项目里的资料…")
      : !total ? L("还没有资料。项目里的文档、页面、目标和导入的文件会出现在这里。")
      : backendState() ? L("{count} 份", { count: total })
      : L("共 {total} 份 · 已整理 {ready} · 等待整理 {pending} · 失败 {failed}", { total, ready: counts.ready, pending: counts.pending, failed: counts.failed });
    list.replaceChildren(...(shown.length ? shown.map(row) : [el("li", "settings-muted knowledge-empty", cards.length ? L("没有符合筛选的资料。") : L("这里还是空的。"))]));
    $("[data-knowledge-more]").hidden = cards.length >= total;
    $(".knowledge-select-all").hidden = !shown.length;
    $("[data-knowledge-organize-all]").hidden = !cards.some(card => !unbound(card) && !card.excluded && (card.state === "failed" || card.state === "over_quota"));
    drawBatch();
  }

  function row(card: KnowledgeCardRecord): HTMLLIElement {
    const key = subjectKey(card.subject);
    const item = el("li", "knowledge-row" + (card.excluded ? " is-excluded" : ""));
    item.dataset.knowledgeSubject = card.subject.kind + ":" + card.subject.id;
    const pick = el("input");
    pick.type = "checkbox"; pick.checked = selected.has(key);
    pick.setAttribute("aria-label", L("选择") + " " + card.title);
    pick.addEventListener("change", () => { if (pick.checked) selected.add(key); else selected.delete(key); drawBatch(); });
    const copy = el("div", "knowledge-row-copy");
    const title = el("button", "knowledge-title", card.title);
    title.type = "button";
    title.setAttribute("aria-expanded", String(open === key));
    title.addEventListener("click", () => { open = open === key ? "" : key; drawList(); if (!open) schedule(); });
    const meta = el("div", "knowledge-meta");
    const state = stateOf(card);
    meta.append(badge(state.label, state.tone), el("span", "", card.plugin_title));
    if (card.excluded) meta.append(el("span", "knowledge-tag", L("不给 Agent 用")));
    if (card.edited.length) meta.append(el("span", "knowledge-tag", L("你改过")));
    if (card.updated_at) meta.append(el("span", "", L("更新于 {time}", { time: when(card.updated_at) })));
    const read = lastRead(card);
    if (read) meta.append(el("span", "", L("{who} 在 {time} 读过", { who: readerOf(read), time: when(read.at) })));
    copy.append(title);
    if (card.brief) copy.append(el("p", "knowledge-brief", card.brief));
    copy.append(meta);
    item.append(pick, copy);
    if (open === key) item.append(renderDetail(card, detailHost));
    return item;
  }

  function drawBatch() {
    const keys = new Set(visible().map(card => subjectKey(card.subject)));
    for (const key of [...selected]) if (!cards.some(card => subjectKey(card.subject) === key)) selected.delete(key);
    $("[data-knowledge-batch]").hidden = selected.size === 0;
    $("[data-knowledge-batch-count]").textContent = L("已选 {count} 份", { count: selected.size });
    const all = $<HTMLInputElement>("[data-knowledge-select-all]");
    all.checked = keys.size > 0 && [...keys].every(key => selected.has(key));
  }

  async function organize(subjects: KnowledgeCardRecord["subject"][] | undefined, confirm = false) {
    try {
      const result = await api<KnowledgeOrganizeResponse>("/organize", { ...(subjects ? { subjects } : {}), ...(confirm ? { confirm_over_quota: true } : {}) });
      toast(result.queued ? L("已排进整理队列：{count} 份", { count: result.queued }) : L("没有要整理的资料"));
      await reload();
    } catch (error) { fail(error); }
  }
  const binding = knowledgeBinding(root, { api, fail, toast,
    redraw: drawList,
    replaced: card => detailHost.replaced(card),
  });
  const detailHost: KnowledgeDetailHost = {
    api, fail, toast, ...binding,
    replaced: card => { cards = cards.map(item => subjectKey(item.subject) === subjectKey(card.subject) ? card : item); drawList(); },
    organize: card => organize([card.subject]),
  };

  async function batch(action: string) {
    const picked = cards.filter(card => selected.has(subjectKey(card.subject)));
    if (action === "clear") { selected.clear(); drawList(); return; }
    if (action === "organize") { await organize(picked.filter(card => !unbound(card)).map(card => card.subject)); selected.clear(); drawList(); return; }
    const excluded = action === "exclude";
    try {
      for (const card of picked.filter(item => item.excluded !== excluded)) detailHost.replaced(await api<KnowledgeCardRecord>("/exclude", { subject: card.subject, excluded }));
      toast(excluded ? L("这些资料不再给 Agent 用") : picked.some(unbound) ? L("已保存；待关联的旧卡片仍不会给 Agent 使用") : L("这些资料又能给 Agent 用了"));
      selected.clear(); drawList();
    } catch (error) { fail(error); }
  }

  stateFilter.addEventListener("change", () => { selected.clear(); void load().then(applied => applied && local() ? whole() : undefined).then(() => drawList()).catch(fail); });
  queryFilter.addEventListener("input", () => { drawList(); if (local() && cards.length < total) void whole().then(() => drawList()).catch(fail); });
  $("[data-knowledge-more]").addEventListener("click", () => void load(true).catch(fail));
  $("[data-knowledge-select-all]").addEventListener("change", event => {
    const on = (event.target as HTMLInputElement).checked;
    for (const card of visible()) if (on) selected.add(subjectKey(card.subject)); else selected.delete(subjectKey(card.subject));
    drawList();
  });
  root.querySelectorAll<HTMLButtonElement>("[data-knowledge-batch-action]").forEach(control =>
    control.addEventListener("click", () => void batch(control.dataset.knowledgeBatchAction || "")));
  $("[data-knowledge-organize-all]").addEventListener("click", () => void organize(undefined));
  $("[data-knowledge-confirm]").addEventListener("click", () => void organize(undefined, true));
  void load().catch(fail);
}
