import type { KnowledgeCard, KnowledgeCardsResponse, KnowledgeGlobResponse, KnowledgeSearchResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { button, el, L, request } from "./common.js";

interface KnowledgePick { kind: string; id: string; title: string; plugin_title: string }
interface PickRequest { request_id: string; selected?: Array<{ kind: string; id: string; title: string }>; max?: number }
interface Row extends KnowledgePick { note: string }

const MAX_PICKS = 30;
const GLOB_CHARS = /[*?{}[\]]/u;

/**
 * The one picker of project knowledge (specs/project-knowledge §8.2, PMAT-17). An input that brings pieces into a round
 * asks for it with `molis-work:knowledge-pick` and hears `molis-work:knowledge-picked` with the person's whole choice. What
 * it lists is what `knowledge.search` finds (the recent pieces before anything is typed), and the linked folders' files by
 * name, so the person and the Agent see the same pieces. Pieces kept from agents are not offered.
 */
export function bindKnowledgePicker(): void {
  if (document.documentElement.dataset.knowledgePicker === "1") return;
  document.documentElement.dataset.knowledgePicker = "1";
  let dialog: HTMLDialogElement | null = null, asked: PickRequest | null = null, seq = 0, timer = 0;
  const chosen = new Map<string, KnowledgePick>();
  const key = (pick: { kind: string; id: string }) => pick.kind + "\u0000" + pick.id;
  const base = () => (document.body.dataset.routePrefix || "") + "/api/knowledge";

  function build(): HTMLDialogElement {
    const box = el("dialog", "mw-dialog mw-dialog--form knowledge-picker");
    box.setAttribute("aria-labelledby", "knowledge-picker-title");
    const head = el("header");
    const close = button(L("关闭"));
    close.addEventListener("click", () => box.close());
    const heading = el("h2", "", L("选择项目资料"));
    heading.id = "knowledge-picker-title";
    head.append(heading, close);
    const tools = el("div", "knowledge-picker-tools");
    const query = el("input", "mw-input");
    query.type = "search"; query.placeholder = L("按标题或内容查找"); query.setAttribute("aria-label", L("查找资料")); query.dataset.knowledgePickerQuery = "";
    const kind = el("select", "mw-select");
    kind.setAttribute("aria-label", L("范围"));
    kind.append(new Option(L("项目资料"), "pieces"), new Option(L("工作区文件"), "files"));
    kind.dataset.knowledgePickerKind = "";
    const source = el("select", "mw-select");
    source.setAttribute("aria-label", L("来源"));
    source.dataset.knowledgePickerSource = "";
    tools.append(query, kind, source);
    const list = el("ul", "knowledge-picker-list");
    list.dataset.knowledgePickerList = "";
    list.setAttribute("aria-label", L("可选的资料"));
    const status = el("p", "knowledge-picker-status");
    status.setAttribute("role", "status"); status.dataset.knowledgePickerStatus = "";
    const foot = el("footer");
    const count = el("span", "knowledge-picker-count");
    count.dataset.knowledgePickerCount = "";
    const cancel = button(L("取消"), "mw-btn--secondary");
    cancel.addEventListener("click", () => box.close());
    const confirm = button(L("添加"), "mw-btn--primary");
    confirm.dataset.knowledgePickerConfirm = "";
    confirm.addEventListener("click", () => {
      if (!asked) return;
      document.dispatchEvent(new CustomEvent("molis-work:knowledge-picked", { detail: { request_id: asked.request_id, picks: [...chosen.values()] } }));
      asked = null; box.close();
    });
    foot.append(count, cancel, confirm);
    box.append(head, tools, list, status, foot);
    query.addEventListener("input", () => { clearTimeout(timer); timer = window.setTimeout(() => void load(), 250); });
    kind.addEventListener("change", () => void load());
    source.addEventListener("change", () => draw(rows));
    box.addEventListener("close", () => { asked = null; seq++; });
    document.body.append(box);
    return box;
  }

  let rows: Row[] = [];
  const $ = <T extends HTMLElement>(name: string) => dialog!.querySelector<T>(`[data-knowledge-picker-${name}]`)!;
  const fromCard = (card: Pick<KnowledgeCard, "subject" | "title" | "plugin_title"> & { note: string }): Row =>
    ({ kind: card.subject.kind, id: card.subject.id, title: card.title, plugin_title: card.plugin_title, note: card.note });

  async function load(): Promise<void> {
    const ticket = ++seq, text = $<HTMLInputElement>("query").value.trim(), files = $<HTMLSelectElement>("kind").value === "files";
    $("status").textContent = L("正在查找…");
    let partial = false;
    try {
      if (files) {
        const pattern = !text ? "**/*" : GLOB_CHARS.test(text) ? text : `**/*${text}*`;
        const found = await request()<KnowledgeGlobResponse>(base() + "/glob?pattern=" + encodeURIComponent(pattern));
        rows = found.files.map(file => ({ kind: file.subject.kind, id: file.subject.id, title: file.path, plugin_title: file.workspace_name, note: "" }));
        partial = found.more;
      } else if (text) {
        const found = await request()<KnowledgeSearchResponse>(base() + "/search?q=" + encodeURIComponent(text));
        // Where the words were found says why a piece came up; its brief when there is no such passage.
        rows = found.cards.map(card => fromCard({ ...card, note: card.hint || card.brief || "" }));
      } else {
        const listed = await request()<KnowledgeCardsResponse>(base() + "/overview");
        rows = listed.cards.filter(card => !card.excluded && card.state !== "missing")
          .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).map(card => fromCard({ ...card, note: card.brief }));
      }
    } catch (error) {
      if (ticket === seq) { request().show($("status"), error); rows = []; draw(rows); }
      return;
    }
    if (ticket !== seq) return;
    $("status").textContent = partial ? L("只列出了一部分，输入文件名缩小范围。") : "";
    const source = $<HTMLSelectElement>("source"), was = source.value;
    source.replaceChildren(new Option(L("全部来源"), ""), ...[...new Set(rows.map(row => row.plugin_title))].sort().map(title => new Option(title, title)));
    source.value = [...source.options].some(option => option.value === was) ? was : "";
    draw(rows);
  }

  function draw(all: Row[]): void {
    const source = $<HTMLSelectElement>("source").value, max = asked?.max ?? MAX_PICKS;
    const shown = all.filter(row => !source || row.plugin_title === source);
    $("list").replaceChildren(...shown.map(row => {
      const item = el("li", "knowledge-picker-row");
      const label = el("label");
      const box = el("input", "mw-check");
      box.type = "checkbox"; box.checked = chosen.has(key(row));
      box.addEventListener("change", () => {
        if (box.checked && chosen.size >= max) { box.checked = false; $("status").textContent = L("一次最多选 {count} 份。", { count: max }); return; }
        if (box.checked) chosen.set(key(row), { kind: row.kind, id: row.id, title: row.title, plugin_title: row.plugin_title }); else chosen.delete(key(row));
        counted();
      });
      const copy = el("span", "knowledge-picker-copy");
      copy.append(el("strong", "", row.title), el("small", "", row.plugin_title + (row.note ? " · " + row.note : "")));
      label.append(box, copy);
      item.append(label);
      return item;
    }));
    if (!shown.length) $("list").append(el("li", "knowledge-picker-empty", L("没有找到相关的资料")));
    counted();
  }
  // Adding nothing is allowed only to clear what the asking input had (it handed its picks in `selected`).
  const counted = () => {
    $("count").textContent = chosen.size ? L("已选 {count} 份", { count: chosen.size }) : "";
    $<HTMLButtonElement>("confirm").disabled = !chosen.size && !asked?.selected?.length;
  };

  document.addEventListener("molis-work:knowledge-pick", event => {
    const detail = (event as CustomEvent<PickRequest>).detail;
    if (!detail?.request_id) return;
    dialog ??= build();
    asked = detail;
    chosen.clear();
    for (const pick of detail.selected ?? []) chosen.set(key(pick), { ...pick, plugin_title: "" });
    $<HTMLInputElement>("query").value = "";
    $<HTMLSelectElement>("kind").value = "pieces";
    if (!dialog.open) dialog.showModal();
    $<HTMLInputElement>("query").focus();
    void load();
  });
}
