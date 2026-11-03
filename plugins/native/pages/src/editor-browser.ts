import { createEditorPreviews } from "./editor-previews.js";
import { editorToolDefinitions, editorToolGroups, editorSelectionScreen } from "./editor-tools.js";
import { pagesKeymap } from "./editor-keyboard.js";
import { baseKeymap } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history } from "prosemirror-history";
import { pagesInputRules } from "./input-rules.js";
import { keymap } from "prosemirror-keymap";
import { DOMSerializer, Node } from "prosemirror-model";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { endPagesTransients } from "./editor-transient.js";
import { fillStaticIndexes } from "./card-content.js";
import { revealHeading, headingIndexAt, selectEnclosingBlock, docStart, popEscape, splitTaskItem } from "./commands.js";
import { findPlugin } from "./editor-find.js";
import { slashPlugin, mentionPlugin } from "./editor-insert-menu.js";
import { chromePlugin } from "./editor-gap.js";
import { handlePaste, handleDrop } from "./editor-paste.js";
import { nodesToMarkdown } from "./to-markdown.js";
import { emptyDoc, nodeFromUnknown, pagesSchema } from "./schema.js";
import { pagesFocusPlugin } from "./focus.js";
import type { Translate, PagesEditorMountOptions, PagesEditorHandle } from "./editor-types.js";
import { t, overlayRoot, escapeHtml, keepFocus } from "./editor-view-ui.js";
import { codeHighlightPlugin } from "./editor-node-media.js";
import { hoverHandlePlugin } from "./editor-block-plugin.js";
import { createEditorPopup } from "./editor-popup.js";
import { createBlockForms, createTextForms } from "./editor-popup-forms.js";
import { createEditorAi } from "./editor-ai.js";
import { handlePagesClick, handlePagesTextInput, handlePagesTripleClick, pagesDomEvents, pagesNodeViews } from "./editor-view-props.js";

export { mountComments } from "./comment-side-client.js";
export { bindComments } from "./comment-editor-client.js";
export { emptyDoc, pagesSchema };
export { applyToPagesFrozen, freezePagesFocus, readPagesFocus, releasePagesFrozen, resolvePagesFrozen, type PagesFocus, type FrozenPagesFocus } from "./focus.js";
export { mountPagesLanding } from "./landing-editor.js";
export type { PagesEditorHandle, PagesToolItem, PagesToolGroup, PagesCommandPreset, PagesListItem, PagesEditorMountOptions } from "./editor-types.js";

/** The document as Markdown, the same conversion the server uses when it hands a page to another plugin. */
export function toMarkdown(value: unknown): string {
  const nodes: Node[] = [];
  nodeFromUnknown(value).forEach((child) => { nodes.push(child); });
  return nodesToMarkdown(nodes).trim() + "\n";
}

export function toHTML(value: unknown): string {
  const node = nodeFromUnknown(value);
  const serializer = DOMSerializer.fromSchema(pagesSchema);
  const wrap = document.createElement("div");
  wrap.append(serializer.serializeFragment(node.content));
  fillStaticIndexes(wrap, node);
  return wrap.innerHTML;
}

function calendarPlugin() {
  return new Plugin({
    view(view) {
      const paint = (next: EditorView) => {
        next.dom.querySelectorAll(".pages-calendar").forEach((host) => {
          renderCalendar(host as HTMLElement, next.state.doc);
        });
      };
      paint(view);
      return { update: paint };
    },
  });
}

function renderCalendar(host: HTMLElement, doc: Node): void {
  if (!host.isConnected) return;
  const events: Array<{ title: string; at: string; day: number }> = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  doc.descendants((node) => {
    if (node.type !== pagesSchema.nodes.event_card) return;
    const at = String(node.attrs.at || "");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(at);
    if (!match) return;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (date.getFullYear() !== year || date.getMonth() !== month) return;
    events.push({ title: String(node.attrs.title || ""), at, day: date.getDate() });
  });
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const today = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : 0;
  const marks = new Set(events.map((item) => item.day));
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const cells: string[] = weekdays.map((label) => `<span class="is-weekday">${label}</span>`);
  for (let i = 0; i < first; i += 1) cells.push("<span></span>");
  for (let day = 1; day <= days; day += 1) {
    const on = marks.has(day);
    const titles = events.filter((item) => item.day === day).map((item) => item.title).join("、");
    const cls = [on ? "is-on" : "", day === today ? "is-today" : ""].filter(Boolean).join(" ");
    cells.push(`<span class="${cls}" title="${escapeHtml(titles)}">${day}</span>`);
  }
  host.innerHTML = `<header>${year} / ${month + 1}</header><div class="pages-calendar-grid">${cells.join("")}</div>`;
}

function refreshToc(view: EditorView, translate?: Translate): void {
  const headings: Array<{ level: number; text: string }> = [];
  view.state.doc.descendants((node) => {
    if (node.type === pagesSchema.nodes.heading) {
      headings.push({ level: node.attrs.level as number, text: node.textContent });
    }
  });
  const current = headingIndexAt(view.state.doc, view.state.selection.from);
  view.dom.querySelectorAll("[data-pages-toc]").forEach((nav) => {
    if (!(nav instanceof HTMLElement) || !nav.isConnected) return;
    nav.replaceChildren();
    const lead = document.createElement("p");
    lead.className = "pages-toc-label";
    lead.textContent = t(translate, "目录");
    nav.append(lead);
    if (!headings.length) {
      const empty = document.createElement("p");
      empty.textContent = t(translate, "还没有标题");
      nav.append(empty);
      return;
    }
    const list = document.createElement("ol");
    headings.forEach((item, index) => {
      const li = document.createElement("li");
      li.dataset.level = String(item.level);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pages-toc-jump" + (index === current ? " is-on" : "");
      button.textContent = item.text || t(translate, "无标题");
      button.addEventListener("mousedown", keepFocus);
      button.addEventListener("click", () => {
        const tr = revealHeading(view.state, index);
        if (!tr) return;
        view.dispatch(tr);
        view.focus();
      });
      li.append(button);
      list.append(li);
    });
    nav.append(list);
  });
}

function tocPlugin(translate: Translate | undefined) {
  return new Plugin({
    view(view) {
      const paint = (next: EditorView) => refreshToc(next, translate);
      paint(view);
      return { update: paint };
    },
  });
}

export function mount(host: HTMLElement, options: PagesEditorMountOptions = {}): PagesEditorHandle {
  host.replaceChildren();
  const previews = createEditorPreviews(options);
  // The tools the context toolbar draws (context-toolbar §3: an editor's own commands, not actions). `group` is how they sit on the bar.
  const toolDefs = editorToolDefinitions(options.translate);
  overlayRoot().append(previews.linkPreview, previews.commentPreview);

  const popup = createEditorPopup(options);
  const { pop, hidePop } = popup;
  const { openNote, openTone, openCalloutStyle } = createBlockForms(popup, options);
  const { openComment, openLink } = createTextForms(popup, options);
  const { runAiCommand } = createEditorAi(popup, options);

  let view!: EditorView;
  const plugins = [
    history(),
    slashPlugin(options.translate),
    mentionPlugin(options),
    pagesKeymap(openLink, options.translate),
    keymap({ Enter: splitTaskItem }),
    keymap(baseKeymap),
    pagesInputRules(),
    gapCursor(),
    dropCursor({ width: 3, color: false, class: "pages-native-drop" }),
    chromePlugin(options.translate),
    codeHighlightPlugin(),
    hoverHandlePlugin(options.translate, (index) => openNote(view, index)),
    tocPlugin(options.translate),
    calendarPlugin(),
    findPlugin(options.translate),
    keymap({ Escape: selectEnclosingBlock }),
    pagesFocusPlugin({ onFocus: options.onFocus }),
    ...(options.plugins ?? []),
  ];

  const runTool = (id: string) => {
    const tool = toolDefs.find((entry) => entry.id === id);
    if (!tool) return;
    if (tool.panel === "tone") openTone(view); else if (tool.panel === "link") openLink(view); else if (tool.panel === "comment") openComment(view);
    else { tool.run?.(view.state, view.dispatch.bind(view)); view.focus(); }
  };

  view = new EditorView(host, {
    attributes: { role: "textbox", "aria-multiline": "true", "aria-label": t(options.translate, "文档正文") },
    state: EditorState.create({
      doc: nodeFromUnknown(options.doc),
      plugins,
    }),
    nodeViews: pagesNodeViews(options, openCalloutStyle),
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      previews.update(view);
      options.onTools?.();
      if (tr.docChanged) options.onChange?.();
    },
    handleTextInput: handlePagesTextInput,
    handleTripleClick: handlePagesTripleClick,
    handleClick: handlePagesClick,
    handlePaste,
    handleDrop,
    handleDOMEvents: { ...pagesDomEvents, blur: (current) => previews.blur(current, pop) },
  });
  popup.mounted(view);


  previews.update(view);
  previews.bind(view, openLink, openComment);
  const onPopEscape = (event: KeyboardEvent) => {
    if (event.isComposing || !popEscape(!pop.hidden, event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    hidePop();
    view.focus();
  };
  document.addEventListener("keydown", onPopEscape, true);
  refreshToc(view, options.translate);
  const stopPreviews = previews.follow(view, () => options.onScreen?.());
  return { view, runCommand: (command, style, preset) => runAiCommand(view, command, style, preset), tools: () => editorToolGroups(view, toolDefs), runTool, screen: () => editorSelectionScreen(view),
    release: () => {
      stopPreviews();
      hidePop();
      document.removeEventListener("keydown", onPopEscape, true);
      pop.remove();
      previews.remove();
    } };
}
export function focusStart(handle: PagesEditorHandle): void {
  const { view } = handle;
  const selection = TextSelection.create(view.state.doc, docStart(view.state.doc));
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  view.focus();
}

export function getDoc(handle: PagesEditorHandle): unknown {
  return handle.view.state.doc.toJSON();
}

/** Whether a stored body is one this editor can show as it is (an empty body is). */
export function canShow(value: unknown): boolean {
  const content = value && typeof value === "object" ? (value as { content?: unknown }).content : undefined;
  if (!Array.isArray(content) || !content.length) return true;
  try { pagesSchema.nodeFromJSON(value).check(); return true; } catch { return false; }
}

export function setDoc(handle: PagesEditorHandle, value: unknown): void {
  const doc = nodeFromUnknown(value);
  endPagesTransients(handle.view);
  handle.view.updateState(EditorState.create({
    doc,
    plugins: handle.view.state.plugins,
  }));
}

export function destroy(handle: PagesEditorHandle): void {
  endPagesTransients(handle.view);
  handle.release();
  handle.view.destroy();
}