import type { ContextualJudgeResponse, ContextualLayoutPlan } from "@molis-ai/molis-work-contracts/services/contextual";
import { $, api, announce, button, run, showError, type Anchor, type Rect } from "./w0-dom.js";
import { choicesFor, destinationsFor, DIRECT, sampleDraft, type Choice, type CreatedItem, type Hand, type Landing, type Material } from "./w0-model.js";
import { PreviewEditor } from "./w0-editor.js";
import { FloatingToolbar } from "./w0-toolbar.js";
import { Slots } from "./w0-slot.js";
import { Creation } from "./w0-create.js";
import { Placements } from "./w0-placement.js";
import { SidePanel, DRAG_TYPE } from "./w0-side.js";
import { ContextStrip } from "./w0-context.js";
import { AssistantHandoff } from "./w0-assistant.js";
import { Records } from "./w0-records.js";

interface State { documents: { id: string; title: string; version: number }[]; materials: Material[]; created: CreatedItem[] }
const editor = new PreviewEditor(), slots = new Slots(), strip = new ContextStrip();
/** One hub, as in context-program §5: what is in hand, where it would land, and the plan for it. */
let hand: Hand | null = null, landing: Landing | null = null, anchor: Anchor = () => null, dropped = false;
let plan: ContextualLayoutPlan | undefined, sequence = 0, composing = false, selecting = false, touch = false, noLanding = false;
let selectionTimer: ReturnType<typeof setTimeout> | undefined;
const sideBounds = (): Pick<Rect, "left" | "right"> => { const rect = $("[data-w0-shelf-pane]").getBoundingClientRect(); return { left: rect.left, right: rect.right }; };
const hideToolbar = () => toolbar.hide();
let toolEdit = false;
const toolbar = new FloatingToolbar({ choose: choice => run(choose(choice)), ask: () => ask(), bring: () => bring(), pressed: name => editor.pressed(name),
  applyTool: name => { toolEdit = true; try { editor.runTool(name); } finally { toolEdit = false; } },
  hoverLanding: at => editor.highlight(at ?? (hand && hand.place !== "main" ? landing : null), !!at) });
const creation = new Creation(slots, { refresh, openDocument, hideToolbar, destinations: destinationsFor,
  reveal: item => { if (item.materialId) side.reveal(item.materialId); else if (item.target === "spark") side.revealSpark(item.id); } });
const placement = new Placements(editor, slots, { showDocument, hideToolbar, refresh, landed: next => { clearHand(); side.clearSelection(); setLanding(next); } });
const side = new SidePanel({ select: selectSide, clear: () => { if (hand && hand.place !== "main") clearHand(); },
  newIn: (tab, entry) => creation.start(tab === "shelf" ? "shelf" : "spark", () => entry.getBoundingClientRect(), () => entry.focus()) });
const assistant = new AssistantHandoff(slots, strip, { hideToolbar, plan: value => value.id === hand?.id ? plan : undefined,
  choose: (choice, chosen, at) => run(choose(choice, chosen, at)) });
const records = new Records({ undo: item => { void creation.undo(item); }, openDocument: id => run(openDocument(id)) });

function showDocument() { document.body.dataset.mobileView = "document"; }
function updateStrip() { strip.set(hand, landing); }
function setLanding(next: Landing | null) {
  landing = noLanding ? null : next; updateStrip();
  document.body.dataset.w0Landing = landing?.label ?? "";
  // While something from the right is in hand, its landing stays visible on the left as a quiet caret.
  editor.highlight(hand && hand.place !== "main" ? landing : null);
}
function clearHand() { hand = null; plan = undefined; dropped = false; sequence += 1; toolbar.hide(); updateStrip(); editor.highlight(null); }
async function openDocument(doc: string) {
  slots.close(); clearHand(); side.clearSelection(); showDocument();
  await editor.load(doc); await refresh();
}
async function refresh() {
  const state = await api<State>("/api/w0/state");
  side.setMaterials(state.materials); side.setCreated(state.created); records.set(state.created);
  $("[data-w0-documents]").replaceChildren(...state.documents.map(doc => {
    const node = button(doc.title, () => { document.querySelector<HTMLDetailsElement>(".w0-document-menu")!.open = false; run(openDocument(doc.id)); });
    node.setAttribute("aria-current", doc.id === editor.current().documentId ? "page" : "false"); return node;
  }));
}
function draw() {
  if (!hand || slots.open || composing || selecting) return;
  const source = hand, inSide = hand.place !== "main" && !dropped;
  toolbar.show({ hand, landing, choices: choicesFor(hand, landing, plan), anchor, touch, narrow: dropped ? innerWidth <= 700 : undefined,
    bounds: inSide ? sideBounds : undefined,
    returnFocus: () => source.place === "main" || dropped ? editor.focus() : document.querySelector<HTMLElement>(`[data-w0-hand="${CSS.escape(source.id)}"]`)?.focus() });
  if (inSide || dropped) editor.highlight(landing);
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
function selectSide(item: Hand, row: () => DOMRect | null) {
  clearTimeout(selectionTimer); slots.close(); touch = false; dropped = false;
  run(setHand(item, row));
}
/** Read after the editor has taken the DOM selection (on selectionchange), never on pointerup before it has. */
function selected() {
  clearTimeout(selectionTimer);
  if (composing || slots.open) return;
  const next = editor.landing();
  if (next) { noLanding = false; setLanding(next); }
  const selectedHand = editor.hand();
  if (!selectedHand) {
    if (hand?.place === "main") clearHand();
    else if (hand) draw();
    return;
  }
  if (selecting) return;
  selectionTimer = setTimeout(() => {
    if (composing || selecting || slots.open || !landing || !editor.root()?.contains(document.activeElement)) return;
    side.clearSelection(); dropped = false; run(setHand(selectedHand, editor.anchor(landing)));
  }, 350);
}
/** ProseMirror reads the DOM selection in its own listeners; reading ours a moment later sees its state, not the previous one. */
let readTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSelected() { clearTimeout(readTimer); readTimer = setTimeout(selected, 30); }
editor.onSelection = scheduleSelected;
// Typing ends what was in hand; a format tool on the bar edits the same selection, so the bar stays and re-reads it.
editor.onChange = () => {
  placement.changed();
  if (toolEdit) { scheduleSelected(); return; }
  if (!slots.open) { clearHand(); side.clearSelection(); clearTimeout(selectionTimer); }
};
editor.onLoaded = () => { noLanding = false; setLanding(editor.endLanding()); attachDrop(); };
document.addEventListener("selectionchange", () => {
  const root = editor.root(), selection = getSelection();
  // Decided when the change happens: a quick click elsewhere right after must not discard the caret the person just set.
  if (root && selection?.anchorNode && root.contains(selection.anchorNode) && root.contains(document.activeElement)) scheduleSelected();
});

async function choose(choice: Choice, chosenHand = hand, chosenLanding = landing, location = anchor) {
  if (!chosenHand) return;
  const back = () => chosenHand.place === "main" ? editor.focus() : undefined;
  if (choice.kind === "place") {
    if (!chosenLanding) throw new Error("先在文稿里选择落点。");
    await placement.prepare(choice, chosenHand, chosenLanding);
  } else if (choice.kind === "create" && choice.target) {
    if (DIRECT[choice.target]) await creation.direct(chosenHand, choice.target);
    else creation.draft(choice.target, sampleDraft(choice.target, "", chosenHand.text), location, back);
  } else if (choice.kind === "fragment" && chosenLanding) await placement.fragment(choice, chosenHand, chosenLanding, location);
}
function ask() {
  if (!hand) return;
  const source = hand;
  assistant.ask(source, landing, anchor, () => source.place === "main" ? editor.focus() : undefined);
}
function bring() {
  strip.include(); toolbar.hide();
  $<HTMLInputElement>("[data-w0-assistant-input]").focus();
  announce("已带到助理：输入框上方是手上的内容和落点，可删。");
}

const hooked = new WeakSet<HTMLElement>();
function attachDrop() {
  const root = editor.root(); if (!root || hooked.has(root)) return;
  hooked.add(root);
  root.addEventListener("pointerdown", event => { selecting = true; touch = event.pointerType === "touch"; toolbar.hide(); });
  root.addEventListener("compositionstart", () => { composing = true; toolbar.hide(); clearTimeout(selectionTimer); });
  root.addEventListener("compositionend", () => { composing = false; scheduleSelected(); });
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
      const item = value && typeof value === "object" && "hand" in value && typeof value.hand === "string" ? side.hand(value.hand) : undefined;
      if (!item) throw new Error("这不是本次预览中的材料。");
      const at = editor.landing({ x: event.clientX, y: event.clientY });
      if (!at) throw new Error("请放到文稿的一段文字中。");
      slots.close(); toolbar.hide(); selecting = false; noLanding = false; setLanding(at);
      hand = null; dropped = true; touch = false;
      run(setHand(item, editor.anchor(at)));
    } catch (error) { showError(error); editor.highlight(null); }
  }, true);
}

document.addEventListener("pointerup", () => { if (selecting) { selecting = false; scheduleSelected(); } });
document.addEventListener("dragend", () => { if (!dropped) editor.highlight(hand && hand.place !== "main" ? landing : null); });
document.addEventListener("pointerdown", event => {
  const target = event.target as HTMLElement;
  if (!toolbar.contains(target) && !slots.contains(target) && !target.closest("[data-w0-hand], [data-w0-web], .w0-float-menu, [data-w0-toast]")) {
    sequence += 1; toolbar.hide();
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !event.defaultPrevented) { if (slots.open) slots.close(); else toolbar.hide(); }
});
$("[data-w0-assistant-form]").addEventListener("submit", event => { event.preventDefault(); assistant.submit(); });
for (const entry of document.querySelectorAll<HTMLButtonElement>("[data-w0-new=pages]")) entry.addEventListener("click", () => {
  creation.start("pages", () => entry.getBoundingClientRect(), () => entry.focus());
});
for (const entry of document.querySelectorAll<HTMLButtonElement>("[data-w0-show]")) entry.addEventListener("click", () => {
  document.body.dataset.mobileView = entry.dataset.w0Show; toolbar.hide();
});
$("[data-w0-side-toggle]").addEventListener("click", event => {
  const hidden = document.body.dataset.sideHidden !== "true"; document.body.dataset.sideHidden = String(hidden);
  (event.currentTarget as HTMLElement).setAttribute("aria-expanded", String(!hidden));
  if (hidden && hand && hand.place !== "main") { clearHand(); side.clearSelection(); }
});
// The tokens follow the resolved theme (THEME_BOOTSTRAP_SCRIPT); the preview flips it for this page only and stores nothing.
$("[data-w0-theme]").addEventListener("click", () => {
  const next = document.documentElement.dataset.resolvedTheme === "dark" ? "light" : "dark";
  Object.assign(document.documentElement.dataset, { theme: next, resolvedTheme: next });
});
$("[data-w0-no-landing]").addEventListener("click", () => {
  noLanding = true; setLanding(null); draw();
  announce("演示：左边没有落点。在文稿里点一下即可恢复。");
});
const about = $("[data-w0-about-panel]"), aboutButton = $("[data-w0-about]");
aboutButton.addEventListener("click", () => { about.hidden = !about.hidden; aboutButton.setAttribute("aria-expanded", String(!about.hidden)); });
$("[data-w0-about-close]").addEventListener("click", () => { about.hidden = true; aboutButton.setAttribute("aria-expanded", "false"); aboutButton.focus(); });

side.show("shelf");
run(openDocument("doc-q4-plan"));
