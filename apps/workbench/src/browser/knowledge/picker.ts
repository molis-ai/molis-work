import type { KnowledgeCard, KnowledgeCardsResponse, KnowledgeGlobResponse, KnowledgeSearchResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { button, el, request } from "./common.js";

const uiText = globalThis.t;

/** One piece the person confirmed, by its exact reference; `hint` says which part of it (a quote, a snapshot) when not the whole. */
interface Picked { ref: MaterialRef; title: string; hint?: string }
/** `signal`: the asker can end its request (a plugin frame's view went away); the dialog closes and the answer is cancelled. */
interface PickRequest { request_id: string; selected?: Array<{ ref: MaterialRef; title: string }>; max?: number; signal?: AbortSignal }
/** A listed piece: a reference already (a 成果 version, a piece of knowledge as indexed), or a folder file read for its revision when taken. */
interface Row { title: string; plugin_title: string; note: string; ref?: MaterialRef; file?: string }
type Outcome = "confirmed" | "cancelled" | "unavailable";

interface MaterialsReader { open(input: { item: { subject: { kind: string; id: string }; title: string }; file: unknown; isCurrent: () => boolean }): Promise<boolean>; close(): void; say(error: unknown): void }
declare global {
  /** The page's reader of the project's folders (workbench initialization), shared with the side panel and the main area. */
  var molisWorkMaterials: { materialsReader(options: Record<string, unknown>): MaterialsReader } | undefined;
}

const MAX_PICKS = 30;
const GLOB_CHARS = /[*?{}[\]]/u;
const FILE = "workspace_file";
const keyOf = (ref: MaterialRef) => JSON.stringify([ref.subject.kind, ref.subject.id, ref.pin, ref.range ?? null]);
const fixedOf = (id: string): { artifact_id: string; version: number } | null => {
  try {
    const value: unknown = JSON.parse(id);
    return Array.isArray(value) && typeof value[0] === "string" && Number.isSafeInteger(value[1]) && value[1] > 0 ? { artifact_id: value[0], version: value[1] } : null;
  } catch { return null; }
};
/** A 成果 is its fixed version; any other piece is as its owner indexed it; a folder file is read when taken, for its exact revision. */
const rowOf = (card: Pick<KnowledgeCard, "subject" | "title" | "plugin_title" | "revision">, note: string): Row => {
  const fixed = card.subject.kind === "artifact" ? fixedOf(card.subject.id) : null;
  const base = { title: card.title, plugin_title: card.plugin_title, note };
  if (card.subject.kind === FILE) return { ...base, file: card.subject.id };
  return { ...base, ref: fixed ? { subject: card.subject, pin: { mode: "fixed", version: fixed } } : { subject: card.subject, pin: { mode: "current", read_revision: card.revision } } };
};

interface DialogHandlers { confirm(): void; closed(): void; typed(): void; kind(): void; source(): void; back(): void }

/** The picker's frame: search, scope and source above, the list beside the reader, what is chosen, and 取消/添加. */
function buildDialog(on: DialogHandlers): HTMLDialogElement {
  const box = el("dialog", "mw-dialog mw-dialog--form knowledge-picker");
  box.setAttribute("aria-labelledby", "knowledge-picker-title");
  const head = el("header"), close = button(uiText.text("common.control.close")), heading = el("h2", "", uiText.text("workbench.picker.choose-project-knowledge"));
  close.addEventListener("click", () => box.close());
  heading.id = "knowledge-picker-title";
  head.append(heading, close);
  const tools = el("div", "knowledge-picker-tools"), query = el("input", "mw-input");
  query.type = "search"; query.placeholder = uiText.text("workbench.picker.find-title-content"); query.setAttribute("aria-label", uiText.text("workbench.picker.find-knowledge")); query.dataset.knowledgePickerQuery = "";
  const kind = el("select", "mw-select");
  kind.setAttribute("aria-label", uiText.text("workbench.picker.scope")); kind.dataset.knowledgePickerKind = "";
  kind.append(new Option(uiText.text("workbench.picker.project-knowledge"), "pieces"), new Option(uiText.text("workbench.picker.workspace-files"), "files"));
  const source = el("select", "mw-select");
  source.setAttribute("aria-label", uiText.text("workbench.picker.source")); source.dataset.knowledgePickerSource = "";
  tools.append(query, kind, source);
  const list = el("ul", "knowledge-picker-list"), stage = el("div", "knowledge-picker-stage");
  list.dataset.knowledgePickerList = ""; list.setAttribute("aria-label", uiText.text("workbench.picker.pieces-choose"));
  stage.append(list, buildPreview(on.back));
  const picked = el("ul", "knowledge-picker-chosen");
  picked.dataset.knowledgePickerChosen = ""; picked.setAttribute("aria-label", uiText.text("workbench.picker.chosen-material"));
  const status = el("p", "knowledge-picker-status");
  status.setAttribute("role", "status"); status.dataset.knowledgePickerStatus = "";
  const foot = el("footer"), count = el("span", "knowledge-picker-count"), cancel = button(uiText.text("common.control.cancel"), "mw-btn--secondary"), confirm = button(uiText.text("workbench.picker.add"), "mw-btn--primary");
  count.dataset.knowledgePickerCount = ""; confirm.dataset.knowledgePickerConfirm = "";
  cancel.addEventListener("click", () => box.close());
  confirm.addEventListener("click", () => { on.confirm(); box.close(); });
  foot.append(count, cancel, confirm);
  box.append(head, tools, stage, picked, status, foot);
  query.addEventListener("input", on.typed);
  kind.addEventListener("change", on.kind);
  source.addEventListener("change", on.source);
  // The event comes after the closing; when a new request has opened the dialog again by then, it belongs to the one before.
  box.addEventListener("close", () => { if (!box.open) on.closed(); });
  document.body.append(box);
  return box;
}

/** The reader beside the list: the same controls as the side panel's, its 「加入」 adding to this choice. */
function buildPreview(back: () => void): HTMLElement {
  const pane = el("section", "knowledge-picker-preview");
  pane.dataset.knowledgePickerPreview = ""; pane.hidden = true;
  const head = el("header", "knowledge-picker-preview-head"), toList = button(uiText.text("common.generated.back")), title = el("strong");
  toList.dataset.knowledgePickerBack = ""; toList.addEventListener("click", back);
  title.dataset.knowledgePickerPreviewTitle = "";
  head.append(toList, title);
  const tools = el("div", "side-materials-tools");
  tools.dataset.pickerMaterialsTools = ""; tools.setAttribute("role", "toolbar"); tools.setAttribute("aria-label", uiText.text("workbench.picker.use-material")); tools.hidden = true;
  const control = (action: string, text: string, variant = "mw-btn--ghost") => { const node = button(text, variant); node.dataset.pickerMaterials = action; return node; };
  const held = el("span", "side-materials-held"); held.dataset.pickerMaterialsHeld = ""; held.hidden = true;
  const problem = el("p", "side-materials-problem"); problem.dataset.pickerMaterialsProblem = ""; problem.setAttribute("role", "status"); problem.hidden = true;
  tools.append(control("quote", uiText.text("workbench.picker.quote-selection")), control("pin", uiText.text("workbench.picker.pin-snapshot")), held, control("add", uiText.text("workbench.picker.add-choice"), "mw-btn--secondary"), problem);
  const body = el("div", "side-files-body knowledge-picker-preview-body");
  body.dataset.knowledgePickerPreviewBody = ""; body.tabIndex = 0;
  pane.append(head, tools, body);
  return pane;
}

/** One listed piece: its tick, its title and where it is from, and 预览 for a folder file when the page has a reader. */
function rowItem(row: Row, checked: boolean, change: (box: HTMLInputElement) => void, open: (() => void) | null): HTMLLIElement {
  const item = el("li", "knowledge-picker-row"), label = el("label"), box = el("input", "mw-check"), copy = el("span", "knowledge-picker-copy");
  box.type = "checkbox"; box.checked = checked;
  box.addEventListener("change", () => change(box));
  copy.append(el("strong", "", row.title), el("small", "", row.plugin_title + (row.note ? " · " + row.note : "")));
  label.append(box, copy);
  item.append(label);
  if (open && row.file) {
    const preview = button(uiText.text("workbench.assistant-side-context.preview"), "mw-btn--ghost", uiText.text("workbench.picker.preview-title", { title: row.title }));
    preview.dataset.knowledgePickerOpen = row.file;
    preview.addEventListener("click", open);
    item.append(preview);
  }
  return item;
}

/** One chosen piece, quotes and snapshots included, with a way to take it out. */
function chosenItem(item: Picked, drop: () => void): HTMLLIElement {
  const row = el("li"), control = button("×", "mw-btn--ghost", uiText.text("workbench.picker.remove-title", { title: item.title }));
  control.addEventListener("click", drop);
  row.append(el("span", "", item.title + (item.hint ? " · " + item.hint : "")), control);
  return row;
}

/**
 * The one picker of project materials (specs/project-knowledge §8.2, PMAT-17; materials-ui-contract §3). An input that brings pieces
 * into a round asks for it with `molis-work:knowledge-pick` and hears `molis-work:knowledge-picked` once: `confirmed` with the
 * person's whole choice as exact references (an empty choice clears what the input had), `cancelled` when they closed it or another
 * request took its place, `unavailable` where there is no project to pick from. It lists what `knowledge.search` finds (the recent
 * pieces before anything is typed) and the linked folders' files by name; a file opens beside the list (one step at a time on a
 * narrow screen) in the same reader as the side panel, where a quote or a snapshot is added to the choice. Opening and reading only
 * read; a snapshot is fixed only when the person asks.
 */
export function bindKnowledgePicker(): void {
  if (document.documentElement.dataset.knowledgePicker === "1") return;
  document.documentElement.dataset.knowledgePicker = "1";
  let dialog: HTMLDialogElement | null = null, asked: PickRequest | null = null, seq = 0, timer = 0, reader: MaterialsReader | null = null, viewing = "";
  const chosen = new Map<string, Picked>();
  /** The live reference a listed folder file was taken as, by its id. */
  const fileRefs = new Map<string, string>();
  const prefix = () => document.body.dataset.routePrefix || "";
  const base = () => prefix() + "/api/knowledge";
  const answer = (outcome: Outcome, items: Picked[] = []) => {
    if (!asked) return;
    const id = asked.request_id;
    asked = null;
    document.dispatchEvent(new CustomEvent("molis-work:knowledge-picked", { detail: { request_id: id, outcome, items } }));
  };

  const build = () => buildDialog({
    confirm: () => answer("confirmed", [...chosen.values()]),
    // Closed without 「添加」: the asking input keeps what it had.
    closed: () => { answer("cancelled"); seq++; hidePreview(); },
    typed: () => { clearTimeout(timer); timer = window.setTimeout(() => void load(), 250); },
    kind: () => void load(), source: () => draw(rows),
    back: () => { const was = viewing; hidePreview(); dialog?.querySelector<HTMLElement>(`[data-knowledge-picker-open="${CSS.escape(was)}"]`)?.focus(); },
  });

  const hidePreview = () => { viewing = ""; reader?.close(); dialog?.classList.remove("has-preview"); const pane = dialog?.querySelector<HTMLElement>("[data-knowledge-picker-preview]"); if (pane) pane.hidden = true; };

  async function show(row: Row): Promise<void> {
    const kit = globalThis.molisWorkMaterials;
    if (!kit || !row.file || !dialog) return;
    const pane = $("preview"), body = $("preview-body"), id = row.file, ticket = viewing = id;
    reader ??= kit.materialsReader({ name: "picker-materials", esc: (value: unknown) => String(value ?? "").replace(/[&<>"]/gu, ch => `&#${ch.charCodeAt(0)};`), body,
      tools: pane.querySelector("[data-picker-materials-tools]"), held: pane.querySelector("[data-picker-materials-held]"), problem: pane.querySelector("[data-picker-materials-problem]"),
      post: (path: string, value: unknown) => request()(prefix() + path, { body: value, fallback: uiText.text("workbench.settings-page.that-did-not-finish") }),
      renderFile: (file: { text?: string }) => { body.replaceChildren(el("pre", "side-materials-text", file.text ?? "")); },
      take: (item: Picked) => { if (choose(item)) $("status").textContent = uiText.text("workbench.picker.added-title", { title: item.title }); } });
    reader.close();
    $("preview-title").textContent = row.title;
    body.replaceChildren(el("p", "side-files-note", uiText.text("workbench.assistant-tabs.loading")));
    pane.hidden = false; dialog.classList.add("has-preview");
    try {
      const file = await request()<unknown>(prefix() + "/api/materials/content?id=" + encodeURIComponent(id), { fallback: uiText.text("workbench.side-panel-files.file-could-not-be-read") });
      if (viewing !== ticket) return;
      if (!await reader.open({ item: { subject: { kind: FILE, id }, title: row.title }, file, isCurrent: () => viewing === ticket })) body.replaceChildren(el("p", "side-files-note", uiText.text("workbench.picker.file-cant-previewed")));
      body.focus();
    } catch (error) { if (viewing === ticket) { body.replaceChildren(); request().show(body, error); } }
  }

  let rows: Row[] = [];
  const $ = <T extends HTMLElement>(name: string) => dialog!.querySelector<T>(`[data-knowledge-picker-${name}]`)!;
  const choose = (item: Picked): boolean => {
    const max = asked?.max ?? MAX_PICKS, key = keyOf(item.ref);
    if (!chosen.has(key) && chosen.size >= max) { $("status").textContent = uiText.text("workbench.picker.up-count-count-time", { count: max }); return false; }
    chosen.set(key, item); paintChosen(); return true;
  };
  const isChosen = (row: Row) => row.ref ? chosen.has(keyOf(row.ref)) : chosen.has(fileRefs.get(row.file!) ?? "");

  async function load(): Promise<void> {
    const ticket = ++seq, text = $<HTMLInputElement>("query").value.trim(), files = $<HTMLSelectElement>("kind").value === "files";
    $("status").textContent = uiText.text("workbench.picker.searching");
    let partial = false;
    try {
      if (files) {
        const pattern = !text ? "**/*" : GLOB_CHARS.test(text) ? text : `**/*${text}*`;
        const found = await request()<KnowledgeGlobResponse>(base() + "/glob?pattern=" + encodeURIComponent(pattern));
        rows = found.files.map(file => ({ title: file.path, plugin_title: file.workspace_name, note: "", file: file.subject.id }));
        partial = found.more;
      } else if (text) {
        const found = await request()<KnowledgeSearchResponse>(base() + "/search?q=" + encodeURIComponent(text));
        // Where the words were found says why a piece came up; its brief when there is no such passage.
        rows = found.cards.map(card => rowOf(card, card.hint || card.brief || ""));
      } else {
        const listed = await request()<KnowledgeCardsResponse>(base() + "/overview");
        rows = listed.cards.filter(card => !card.excluded && card.state !== "missing")
          .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? "")).map(card => rowOf(card, card.brief));
      }
    } catch (error) {
      if (ticket === seq) { request().show($("status"), error); rows = []; draw(rows); }
      return;
    }
    if (ticket !== seq) return;
    $("status").textContent = partial ? uiText.text("workbench.picker.only-part-listed-type-file-name-narrow") : "";
    const source = $<HTMLSelectElement>("source"), was = source.value;
    source.replaceChildren(new Option(uiText.text("workbench.picker.all-sources"), ""), ...[...new Set(rows.map(row => row.plugin_title))].sort().map(title => new Option(title, title)));
    source.value = [...source.options].some(option => option.value === was) ? was : "";
    draw(rows);
  }

  /** A folder file is taken as it is now: its revision is read when the person ticks it, so the reference names that exact content. */
  async function takeFile(row: Row, box: HTMLInputElement): Promise<void> {
    box.disabled = true;
    try {
      const read = await request()<{ read_revision: string; title: string }>(prefix() + "/api/materials/read",
        { body: { ref: { subject: { kind: FILE, id: row.file }, pin: { mode: "current", read_revision: "size:0" } }, mode: "head" }, fallback: uiText.text("workbench.side-panel-files.file-could-not-be-read") });
      const ref: MaterialRef = { subject: { kind: FILE, id: row.file! }, pin: { mode: "current", read_revision: read.read_revision } };
      if (asked && choose({ ref, title: row.title })) fileRefs.set(row.file!, keyOf(ref)); else box.checked = false;
    } catch (error) { box.checked = false; request().show($("status"), error); }
    finally { box.disabled = false; }
  }

  const tick = (row: Row, box: HTMLInputElement) => {
    if (!box.checked) { chosen.delete(row.ref ? keyOf(row.ref) : fileRefs.get(row.file!) ?? ""); paintChosen(); return; }
    if (row.ref) { if (!choose({ ref: row.ref, title: row.title })) box.checked = false; return; }
    void takeFile(row, box);
  };
  function draw(all: Row[]): void {
    const source = $<HTMLSelectElement>("source").value, kit = globalThis.molisWorkMaterials;
    const shown = all.filter(row => !source || row.plugin_title === source);
    $("list").replaceChildren(...shown.map(row => rowItem(row, isChosen(row), box => tick(row, box), row.file && kit ? () => void show(row) : null)));
    if (!shown.length) $("list").append(el("li", "knowledge-picker-empty", uiText.text("workbench.picker.nothing-found")));
    paintChosen();
  }
  // What is chosen, quotes and snapshots included, each with a way to take it out. Adding nothing is allowed only to clear what
  // the asking input had (it handed its picks in `selected`).
  function paintChosen(): void {
    $("chosen").replaceChildren(...[...chosen].map(([key, item]) => chosenItem(item, () => {
      chosen.delete(key); for (const [file, ref] of fileRefs) if (ref === key) fileRefs.delete(file); draw(rows);
    })));
    $("count").textContent = chosen.size ? uiText.text("workbench.picker.count-selected", { count: chosen.size }) : "";
    $<HTMLButtonElement>("confirm").disabled = !chosen.size && !asked?.selected?.length;
  }

  document.addEventListener("molis-work:knowledge-pick", event => {
    const detail = (event as CustomEvent<PickRequest>).detail;
    if (!detail?.request_id || detail.signal?.aborted) return;
    // A new request takes the place of one still open; that one is told it was cancelled.
    answer("cancelled");
    if (!prefix()) { asked = detail; answer("unavailable"); return; }
    dialog ??= build();
    asked = detail;
    chosen.clear(); fileRefs.clear(); hidePreview();
    for (const item of detail.selected ?? []) {
      chosen.set(keyOf(item.ref), { ref: item.ref, title: item.title });
      if (item.ref.subject.kind === FILE && item.ref.pin.mode === "current" && !item.ref.range) fileRefs.set(item.ref.subject.id, keyOf(item.ref));
    }
    $<HTMLInputElement>("query").value = "";
    $<HTMLSelectElement>("kind").value = "pieces";
    detail.signal?.addEventListener("abort", () => { if (asked === detail && dialog?.open) dialog.close(); }, { once: true });
    if (!dialog.open) dialog.showModal();
    $<HTMLInputElement>("query").focus();
    void load();
  });
}
