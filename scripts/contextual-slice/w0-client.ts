import type { ContextualJudgeResponse, ContextualLayoutPlan } from "@molis-ai/molis-work-contracts/services/contextual";
import { $, api, el, button, run, showError, type Anchor } from "./w0-dom.js";
import { choicesFor, sampleDraft, type Choice, type CreatedItem, type Hand, type Landing, type Material } from "./w0-model.js";
import { PreviewEditor } from "./w0-editor.js";
import { FloatingToolbar } from "./w0-toolbar.js";
import { Slots } from "./w0-slot.js";
import { Creation } from "./w0-create.js";
import { Placements } from "./w0-placement.js";
import { Shelf, DRAG_TYPE } from "./w0-shelf.js";
import { ContextStrip } from "./w0-context.js";

interface State { documents: { id: string; title: string; version: number }[]; materials: Material[]; created: CreatedItem[] }
const editor = new PreviewEditor(), slots = new Slots(), strip = new ContextStrip();
let hand: Hand | null = null, landing: Landing | null = null, anchor: Anchor = () => null;
let plan: ContextualLayoutPlan | undefined, sequence = 0, composing = false, selecting = false, touch = false;
let selectionTimer: ReturnType<typeof setTimeout> | undefined;
const toolbar = new FloatingToolbar({ choose: choice => run(choose(choice)), assistant: () => assistant(), tool: name => editor.tool(name), hoverLanding: at => editor.highlight(at) });
const creation = new Creation(slots, { refresh, openDocument, hideToolbar: () => toolbar.hide() });
const placement = new Placements(editor, slots, { showDocument, hideToolbar: () => toolbar.hide(), refresh: async () => { clear(); await refresh(); } });
const shelf = new Shelf({ select: selectMaterial, clear: () => { if (hand?.place === "side") clearHand(); },
  undo: item => { void creation.undo(item); }, openDocument: doc => run(openDocument(doc)) });

function showDocument() { document.body.dataset.mobileView = "document"; }
function updateStrip() { strip.set(hand, landing); $("[data-w0-clear-landing]").hidden = !landing; }
function clearHand() { hand = null; plan = undefined; sequence += 1; toolbar.hide(); updateStrip(); }
function clear() { landing = null; clearHand(); shelf.clearSelection(); }
async function openDocument(doc: string) {
  slots.close(); clear(); showDocument();
  await editor.load(doc); await refresh();
}
async function refresh() {
  const state = await api<State>("/api/w0/state");
  shelf.render(state.materials, state.created);
  $("[data-w0-documents]").replaceChildren(...state.documents.map(doc => {
    const node = button(doc.title, () => { document.querySelector<HTMLDetailsElement>(".w0-document-menu")!.open = false; run(openDocument(doc.id)); });
    node.setAttribute("aria-current", doc.id === editor.current().documentId ? "page" : "false"); return node;
  }));
}
function draw() {
  if (!hand || slots.open || composing || selecting) return;
  const source = hand;
  toolbar.show({ hand, landing, choices: choicesFor(hand, landing, plan), anchor, touch,
    returnFocus: () => source.place === "main" ? editor.focus() : shelf.element(source.id)?.focus() });
}
async function setHand(value: Hand, location: Anchor) {
  hand = value; anchor = location; plan = undefined;
  const serial = ++sequence; updateStrip();
  if (value.focus) {
    try {
      const result = await api<ContextualJudgeResponse>("/api/contextual/candidates", { pane_id: "w0-pages", focus: value.focus });
      if (serial !== sequence) return;
      plan = result.plan;
    } catch (error) { if (serial === sequence) showError(error); }
  }
  if (serial === sequence) draw();
}
function selectMaterial(item: Material, _element: HTMLElement) {
  clearTimeout(selectionTimer); slots.close(); touch = false;
  run(setHand({ id: item.id, place: "side", title: item.title, text: item.text }, () => shelf.element(item.id)?.getBoundingClientRect() ?? null));
}
function selected() {
  clearTimeout(selectionTimer);
  if (composing || selecting || slots.open || !editor.root()?.contains(document.activeElement)) return;
  landing = editor.landing(); updateStrip();
  const selectedHand = editor.hand(), at = landing;
  if (!selectedHand || !at) { clearHand(); return; }
  selectionTimer = setTimeout(() => {
    if (composing || selecting || slots.open) return;
    shelf.clearSelection(); run(setHand(selectedHand, editor.anchor(at)));
  }, 350);
}
editor.onSelection = selected;
editor.onChange = () => {
  placement.changed(); landing = null; updateStrip();
  if (!slots.open) { clearHand(); clearTimeout(selectionTimer); }
};
editor.onLoaded = () => { clear(); attachDrop(); };

async function choose(choice: Choice, chosenHand = hand, chosenLanding = landing, location = anchor) {
  if (!chosenHand) return;
  if (choice.kind === "place") {
    if (!chosenLanding) throw new Error("先在文稿里选择落点。");
    await placement.prepare(chosenHand, chosenLanding);
  } else if (choice.kind === "create" && choice.target) {
    if (choice.target === "todo") await creation.direct(chosenHand, choice.target);
    else creation.draft(choice.target, sampleDraft(choice.target, "", chosenHand.text), location, () => editor.focus());
  } else if (choice.kind === "fragment" && chosenLanding) await placement.fragment(choice, chosenHand, chosenLanding, location);
}
function assistant() {
  const input = $<HTMLInputElement>("[data-w0-assistant-input]"), context = strip.get();
  const selectedPlan = context.hand?.id === hand?.id ? plan : undefined;
  toolbar.hide();
  const panel = slots.show("交给助理 · 交接预览", () => $(".w0-composer").getBoundingClientRect(), () => input.focus());
  panel.body.append(el("p", { class: "w0-simulated", text: "模拟交接，尚未发送给助理，也没有输入回执。" }),
    el("p", { text: input.value || "带着这些内容继续处理。" }));
  if (context.hand) panel.body.append(el("p", { class: "w0-preview-text", text: `${context.hand.title}\n${context.hand.text}` }));
  if (context.landing) panel.body.append(el("p", { text: `落点：${context.landing.label}` }));
  if (context.hand) for (const choice of choicesFor(context.hand, context.landing, selectedPlan).primary) {
    const node = button(choice.title, () => { slots.close(); run(choose(choice, context.hand, context.landing)); });
    node.dataset.w0AssistantChoice = choice.key; panel.actions.append(node);
  }
  if (!context.hand && !context.landing) panel.body.append(el("p", { text: "未附带材料或落点。" }));
  slots.position(); panel.root.querySelector<HTMLButtonElement>("button")?.focus();
}

const hooked = new WeakSet<HTMLElement>();
function attachDrop() {
  const root = editor.root(); if (!root || hooked.has(root)) return;
  hooked.add(root);
  root.addEventListener("pointerdown", event => { selecting = true; touch = event.pointerType === "touch"; toolbar.hide(); });
  root.addEventListener("compositionstart", () => { composing = true; toolbar.hide(); clearTimeout(selectionTimer); });
  root.addEventListener("compositionend", () => { composing = false; selected(); });
  root.addEventListener("dragover", event => {
    if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy";
    editor.highlight(editor.landing({ x: event.clientX, y: event.clientY }));
  }, true);
  root.addEventListener("drop", event => {
    if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return;
    event.preventDefault(); event.stopPropagation();
    try {
      const value: unknown = JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
      const item = value && typeof value === "object" && "materialId" in value && typeof value.materialId === "string" ? shelf.material(value.materialId) : null;
      if (!item) throw new Error("这不是本次预览中的材料。");
      const at = editor.landing({ x: event.clientX, y: event.clientY });
      if (!at) throw new Error("请放到文稿的一段文字中。");
      slots.close(); toolbar.hide(); landing = at; selecting = false;
      run(setHand({ id: item.id, place: "side", title: item.title, text: item.text }, editor.anchor(at)));
    } catch (error) { showError(error); }
    editor.highlight(null);
  }, true);
}

document.addEventListener("pointerup", () => { if (selecting) { selecting = false; selected(); } });
document.addEventListener("dragend", () => editor.highlight(null));
document.addEventListener("pointerdown", event => {
  const target = event.target as HTMLElement;
  if (!toolbar.contains(target) && !slots.contains(target) && !target.closest("[data-w0-material]")) { sequence += 1; toolbar.hide(); }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !event.defaultPrevented) { if (slots.open) slots.close(); else toolbar.hide(); }
});
$("[data-w0-clear-landing]").addEventListener("click", () => { landing = null; updateStrip(); draw(); });
$("[data-w0-assistant-form]").addEventListener("submit", event => { event.preventDefault(); assistant(); });
for (const entry of document.querySelectorAll<HTMLButtonElement>("[data-w0-new]")) entry.addEventListener("click", () => {
  creation.start(entry.dataset.w0New === "pages" ? "pages" : "shelf", () => entry.getBoundingClientRect(), () => entry.focus());
});
for (const entry of document.querySelectorAll<HTMLButtonElement>("[data-w0-show]")) entry.addEventListener("click", () => {
  document.body.dataset.mobileView = entry.dataset.w0Show; toolbar.hide();
});
$("[data-w0-side-toggle]").addEventListener("click", event => {
  const hidden = document.body.dataset.sideHidden !== "true"; document.body.dataset.sideHidden = String(hidden);
  (event.currentTarget as HTMLElement).setAttribute("aria-expanded", String(!hidden)); if (hand?.place === "side") toolbar.hide();
});
$("[data-w0-theme]").addEventListener("click", () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
});
const about = $("[data-w0-about-panel]"), aboutButton = $("[data-w0-about]");
aboutButton.addEventListener("click", () => { about.hidden = !about.hidden; aboutButton.setAttribute("aria-expanded", String(!about.hidden)); });
$("[data-w0-about-close]").addEventListener("click", () => { about.hidden = true; aboutButton.setAttribute("aria-expanded", "false"); aboutButton.focus(); });

run(openDocument("doc-q4-plan"));
