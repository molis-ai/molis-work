import { pagesKeymap, commandToggle } from "./editor-keyboard.js";
import { hoverKey, runBlockCommand, hoveredGroup } from "./editor-block-selection.js";
import { openEditorComment } from "./editor-comments.js";
import { baseKeymap, setBlockType } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { gapCursor } from "prosemirror-gapcursor";
import { history } from "prosemirror-history";
import { pagesInputRules } from "./input-rules.js";
import { keymap } from "prosemirror-keymap";
import { DOMSerializer, Fragment, Node } from "prosemirror-model";
import { Command, EditorState, NodeSelection, Plugin, TextSelection, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { applyPagesActions, endPagesTransients, ownPagesTransient } from "./editor-transient.js";
import { fillStaticIndexes } from "./card-content.js";
import { blockPos, focusBelowContent, linkAt, revealHeading, headingIndexAt, listKindAt, headingLevelAt, applyListSelection, applyHeading, selectEnclosingBlock, replaceSelectedBlock, replaceSpan, docStart, tripleClickSelection, popEscape, blockSpanToRow, splitTaskItem, setCalloutStyle, toggleTaskChecked, toggleTaskGroup, setLink, setTone, markCovers, toneAt, commentAt, setComment } from "./commands.js";
import { bookmarkLabel, linkClickOpens, safePagesHref } from "./link.js";
import { calloutIconFor, PAGES_CALLOUT_ICONS, safePagesCalloutTone } from "./callout.js";
import { findPlugin } from "./editor-find.js";
import { slashPlugin, mentionPlugin, paragraphNode } from "./editor-insert-menu.js";
import { chromePlugin } from "./editor-gap.js";
import { handlePaste, handleDrop, handleDragOver, writeSpanClipboard } from "./editor-paste.js";
import { followScroll, placeOverlay, type FloatingAnchor } from "@molis-ai/molis-work-design-system/floating";
import { nodesToMarkdown } from "./to-markdown.js";
import { PAGES_TONES } from "./tone.js";
import { emptyDoc, nodeFromUnknown, pagesSchema } from "./schema.js";
import { applyToPagesFrozen, freezePagesFocus, pagesFocusPlugin, readPagesFocus, releasePagesFrozen, resolvePagesFrozen } from "./focus.js";
import type { Translate, PagesEditorMountOptions, PagesEditorHandle, PagesCommandPreset, PagesToolGroup } from "./editor-types.js";
import { t, overlayRoot, dsIcon, escapeHtml, actions } from "./editor-view-ui.js";
import { codeHighlightPlugin, imageNodeView, bookmarkNodeView, codeNodeView } from "./editor-node-media.js";
import { columnNodeView, cellNodeView, taskNodeView, toggleNodeView, calloutNodeView, mentionNodeView, calendarNodeView, tocNodeView } from "./editor-node-layout.js";
import { cardNodeView } from "./editor-node-cards.js";
import { hoverHandlePlugin } from "./editor-block-plugin.js";

export { mountComments } from "./comment-side-client.js";
export { bindComments } from "./comment-editor-client.js";
export { listFailed } from "./list-client.js";
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

function headingCommand(level: 1 | 2 | 3): Command {
  return (state, dispatch) => {
    const grouped = applyHeading(state, level);
    if (grouped) {
      dispatch?.(grouped);
      return true;
    }
    return setBlockType(pagesSchema.nodes.heading, { level })(state, dispatch);
  };
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
      button.addEventListener("mousedown", (event) => event.preventDefault());
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

function applyComment(view: EditorView, from: number, to: number, text: string, id?: string): void {
  const body = text.trim();
  const nextId = body ? (id || crypto.randomUUID()) : "";
  setComment(from, to, text, nextId)(view.state, view.dispatch.bind(view));
  view.focus();
}

function replaceSelectionText(view: EditorView, text: string): void {
  const { from, to } = view.state.selection;
  const parts = text.split(/\n{2,}/).map((part) => paragraphNode(part.trim())).filter((node) => node.textContent);
  const content = parts.length ? Fragment.from(parts) : Fragment.from(paragraphNode(text));
  const tr = view.state.tr.replaceWith(from, to, content);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

function docPlainText(doc: Node): string {
  const lines: string[] = [];
  doc.forEach((node) => {
    const text = node.textContent.trim();
    if (text) lines.push(text);
  });
  return lines.join("\n\n");
}

function dispatchList(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  id: "bullet_list" | "ordered_list" | "task_list",
): boolean {
  const tr = applyListSelection(state, id);
  if (!tr) return false;
  dispatch?.(tr);
  return true;
}

function fillCalloutStyle(pop: HTMLElement, view: EditorView, at: () => ReturnType<typeof resolvePagesFrozen>, node: Node, anchor: HTMLElement, translate: PagesEditorMountOptions["translate"], hidePop: () => void): void {
  const iconHead = document.createElement("p");
  iconHead.className = "pages-menu-label";
  iconHead.textContent = t(translate, "图标");
  const grid = document.createElement("div");
  grid.className = "pages-icon-grid";
  const currentIcon = calloutIconFor(node.attrs.icon, node.attrs.tone);
  PAGES_CALLOUT_ICONS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pages-icon-pick" + (currentIcon === item.id ? " is-on" : "");
    button.innerHTML = dsIcon(item.id);
    const label = t(translate, item.label);
    button.setAttribute("aria-label", label);
    button.title = label;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
        const target = at(); if (!target?.intact) return;
        runBlockCommand(view, setCalloutStyle(target.from, { icon: item.id }));
      hidePop();
    });
    grid.append(button);
  });

  const toneHead = document.createElement("p");
  toneHead.className = "pages-menu-label";
  toneHead.textContent = t(translate, "颜色");
  const strip = document.createElement("div");
  strip.className = "pages-tone-strip";
  const currentTone = safePagesCalloutTone(node.attrs.tone);
  PAGES_TONES.forEach((tone) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pages-tone" + (currentTone === tone.id ? " is-on" : "");
    button.dataset.pagesTone = tone.id;
    const label = t(translate, tone.label);
    button.setAttribute("aria-label", label);
    button.title = label;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
        const target = at(); if (!target?.intact) return;
        runBlockCommand(view, setCalloutStyle(target.from, { tone: tone.id }));
      hidePop();
    });
    strip.append(button);
  });

  pop.append(iconHead, grid, toneHead, strip);
  placeOverlay(pop, anchor.getBoundingClientRect(), "below");
}

export function mount(host: HTMLElement, options: PagesEditorMountOptions = {}): PagesEditorHandle {
  host.replaceChildren();
  const linkPreview = document.createElement("div");
  linkPreview.className = "pages-link-preview";
  linkPreview.hidden = true;
  const linkLabel = document.createElement("span");
  const linkOpen = document.createElement("button");
  linkOpen.type = "button";
  linkOpen.textContent = t(options.translate, "打开");
  const linkEdit = document.createElement("button");
  linkEdit.type = "button";
  linkEdit.textContent = t(options.translate, "编辑");
  linkPreview.append(linkLabel, linkOpen, linkEdit);
  const commentPreview = document.createElement("div");
  commentPreview.className = "pages-comment-preview";
  commentPreview.hidden = true;
  const commentText = document.createElement("p");
  const commentEdit = document.createElement("button");
  commentEdit.type = "button";
  commentEdit.textContent = t(options.translate, "编辑");
  commentPreview.append(commentText, commentEdit);
  // The tools the context toolbar draws (context-toolbar §3: an editor's own commands, not actions). `group` is how they sit on the bar.
  const toolDefs: Array<{ id: string; group: "marks" | "blocks" | "insert"; label: string; glyph?: string; icon?: string; run?: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean; panel?: "tone" | "link" | "comment" }> = [
    { id: "strong", group: "marks", label: t(options.translate, "加粗"), glyph: "B", run: commandToggle("strong") },
    { id: "em", group: "marks", label: t(options.translate, "斜体"), glyph: "I", run: commandToggle("em") },
    { id: "underline", group: "marks", label: t(options.translate, "下划线"), glyph: "U", run: commandToggle("underline") },
    { id: "strike", group: "marks", label: t(options.translate, "删除线"), glyph: "S", run: commandToggle("strike") },
    { id: "code", group: "marks", label: t(options.translate, "代码"), icon: "code", run: commandToggle("code") },
    { id: "h1", group: "blocks", label: t(options.translate, "标题 1"), glyph: "H1", run: headingCommand(1) },
    { id: "h2", group: "blocks", label: t(options.translate, "标题 2"), glyph: "H2", run: headingCommand(2) },
    { id: "h3", group: "blocks", label: t(options.translate, "标题 3"), glyph: "H3", run: headingCommand(3) },
    { id: "ul", group: "blocks", label: t(options.translate, "无序列表"), icon: "rows", run: (state, dispatch) => dispatchList(state, dispatch, "bullet_list") },
    { id: "ol", group: "blocks", label: t(options.translate, "有序列表"), icon: "list-ordered", run: (state, dispatch) => dispatchList(state, dispatch, "ordered_list") },
    { id: "task", group: "blocks", label: t(options.translate, "清单"), icon: "check", run: (state, dispatch) => dispatchList(state, dispatch, "task_list") },
    { id: "tone", group: "insert", label: t(options.translate, "颜色"), glyph: "A", panel: "tone" },
    { id: "link", group: "insert", label: t(options.translate, "链接"), icon: "link", panel: "link" },
    { id: "comment", group: "insert", label: t(options.translate, "评论"), icon: "message", panel: "comment" },
  ];
  overlayRoot().append(linkPreview, commentPreview);

  const pop = document.createElement("div");
  pop.className = "pages-pop";
  pop.hidden = true;
  overlayRoot().append(pop);

  // A writing request keeps its range frozen while the popup is open; closing the popup any way lets it go.
  let popToken: string | null = null;
  let popRequest = 0;
  // The popup is a selection's form or result: the context toolbar draws it under itself when it can (`docked`); otherwise it sits in the stage.
  let docked = false;
  const clearPop = (fromPanel = false) => {
    const restoreFocus = pop.contains(document.activeElement);
    pop.hidden = true;
    pop.replaceChildren();
    popRequest += 1;
    if (popToken) { releasePagesFrozen(view, popToken); popToken = null; }
    if (docked) { docked = false; pop.classList.remove("is-docked"); if (!fromPanel) options.openPanel?.({ node: null }); }
    const stage = overlayRoot();
    if (pop.parentElement !== stage) stage.append(pop);
    if (restoreFocus) view.focus();
  };
  let hidePop: (fromPanel?: boolean) => void = clearPop;
  const showPop = () => {
    hidePop();
    let fromPanel = false;
    const stop = ownPagesTransient(view, () => clearPop(fromPanel));
    hidePop = (panel = false) => { fromPanel = panel; stop(); };
    pop.hidden = false;
  };
  const anchorPop = (from: number, to: number) => {
    const token = crypto.randomUUID(); popToken = token; freezePagesFocus(view, token, { from, to }, true);
    return () => popToken === token && !view.isDestroyed ? resolvePagesFrozen(view, token) : null;
  };
  // `keep`: a result the person is waiting for stays where it is when they select something else.
  const placePop = (anchor: FloatingAnchor, mode: "above" | "below", label: string, keep = false) => {
    pop.hidden = false;
    docked = Boolean(options.openPanel?.({ node: pop, label, keep, onClose: () => hidePop(true) }));
    pop.classList.toggle("is-docked", docked);
    if (!docked) placeOverlay(pop, anchor, mode);
  };
  // A form that belongs to a block, not to a selection, takes the popup back to the stage.
  const reclaimPop = () => {
    if (!docked) return;
    docked = false;
    options.openPanel?.({ node: null });
    pop.classList.remove("is-docked");
    const stage = overlayRoot();
    if (pop.parentElement !== stage) stage.append(pop);
  };

  const openNote = (view: EditorView, index: number) => {
    reclaimPop();
    const node = view.state.doc.child(index);
    const pos = blockPos(view.state.doc, index);
    showPop();
    const anchor = anchorPop(pos, pos + node.nodeSize);
    const area = document.createElement("textarea");
    area.className = "mw-input";
    area.rows = 4;
    area.placeholder = t(options.translate, "块备注");
    area.value = String(node.attrs.note || "");
    pop.append(area);
    pop.append(actions(options.translate, () => {
      const at = anchor(); if (!at?.intact) return;
      view.dispatch(view.state.tr.setNodeMarkup(at.from, undefined, { ...view.state.doc.nodeAt(at.from)?.attrs, note: area.value.trim() }));
      hidePop();
    }, hidePop));
    placeOverlay(pop, view.coordsAtPos(pos + 1), "above");
    area.focus();
  };

  const openComment = (view: EditorView) => openEditorComment(view, { onComment: options.onComment,
    pop, showPop, anchorPop, translate: options.translate, actions, hidePop, applyComment, placePop });

  const openTone = (view: EditorView) => {
    showPop();
    const rows: Array<{ kind: "font_color" | "highlight"; label: string }> = [
      { kind: "font_color", label: t(options.translate, "文字颜色") },
      { kind: "highlight", label: t(options.translate, "背景色") },
    ];
    rows.forEach(({ kind, label }) => {
      const current = toneAt(view.state, kind);
      const head = document.createElement("p");
      head.className = "pages-menu-label";
      head.textContent = label;
      const strip = document.createElement("div");
      strip.className = "pages-tone-strip";
      const swatch = (tone: string, name: string) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "pages-tone" + (current === tone ? " is-on" : "");
        button.dataset.pagesTone = tone || "none";
        button.dataset.pagesToneKind = kind;
        button.setAttribute("aria-label", name);
        button.title = name;
        strip.append(button);
      };
      swatch("", t(options.translate, "默认"));
      PAGES_TONES.forEach((tone) => swatch(tone.id, t(options.translate, tone.label)));
      strip.addEventListener("mousedown", (event) => event.preventDefault());
      strip.addEventListener("click", (event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-pages-tone]");
        if (!button) return;
        event.preventDefault();
        const tone = button.dataset.pagesTone === "none" ? "" : String(button.dataset.pagesTone);
        runBlockCommand(view, setTone(kind, tone));
        hidePop();
      });
      pop.append(head, strip);
    });
    placePop(view.coordsAtPos(view.state.selection.from), "below", t(options.translate, "颜色"));
  };

  const openCalloutStyle = (view: EditorView, pos: number, anchor: HTMLElement) => {
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    reclaimPop();
    showPop();
    fillCalloutStyle(pop, view, anchorPop(pos, pos + node.nodeSize), node, anchor, options.translate, hidePop);
  };

  const openLink = (view: EditorView) => {
    const found = linkAt(view.state.doc, view.state.selection);
    if (!found) return;
    showPop();
    const anchor = anchorPop(found.from, found.to);
    const field = document.createElement("input");
    field.className = "mw-input";
    field.type = "url";
    field.setAttribute("aria-label", t(options.translate, "链接"));
    field.placeholder = "https://";
    field.value = found.href;
    const error = document.createElement("p");
    error.className = "pages-pop-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const commit = () => {
      const at = anchor(); if (!at?.intact) return;
      if (field.value.trim() && !safePagesHref(field.value)) {
        error.textContent = t(options.translate, "请输入有效链接，例如 https://example.com");
        error.hidden = false;
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      runBlockCommand(view, setLink(at.from, at.to, field.value));
      hidePop();
    };
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      commit();
    });
    pop.append(field, error);
    const row = actions(options.translate, commit, hidePop);
    if (found.href) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mw-btn mw-btn--ghost";
      remove.textContent = t(options.translate, "移除链接");
      remove.addEventListener("click", () => {
        const at = anchor(); if (!at?.intact) return;
        runBlockCommand(view, setLink(at.from, at.to, ""));
        hidePop();
      });
      row.prepend(remove);
    }
    pop.append(row);
    placePop(view.coordsAtPos(found.from), "below", t(options.translate, "链接"));
    field.focus();
    field.select();
  };

  // The candidate goes to the range the person asked about, frozen when they asked; if that text changed while the
  // model was working, nothing is written anywhere (specs/archive/contextual-interaction §3.4, AC-C04/C05).
  const showCandidate = (view: EditorView, command: string, result: { text: string }, token: string | null, mode: "replace" | "insert_after", okLabel?: string) => {
    pop.hidden = false;
    pop.replaceChildren();
    const lead = document.createElement("p");
    lead.textContent = t(options.translate, "候选");
    const area = document.createElement("textarea");
    area.className = "mw-input";
    area.rows = 8;
    area.value = result.text;
    pop.append(lead, area);
    const refuse = () => {
      lead.textContent = t(options.translate, "这段内容在等待期间被改动，没有写入。请重新选择后再试。");
      lead.className = "pages-pop-error";
    };
    const dismiss = () => { if (token) releasePagesFrozen(view, token); hidePop(); };
    pop.append(actions(options.translate, () => {
      if (command === "translate_new") {
        void options.onCreateFromAi?.({ title: t(options.translate, "翻译"), text: area.value });
      } else if (!token) {
        replaceSelectionText(view, area.value);
      } else if (command === "proofread") {
        const at = resolvePagesFrozen(view, token);
        if (!at?.intact) { refuse(); return; }
        const next = nodeFromUnknown({
          type: "doc",
          content: area.value.split(/\n{2,}/).map((part) => paragraphNode(part.trim()).toJSON()),
        });
        releasePagesFrozen(view, token);
        view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, next.content));
      } else if (command === "actions") {
        if (!applyPagesActions(view, token, area.value, mode)) { refuse(); return; }
      } else {
        const applied = applyToPagesFrozen(view, token, area.value, mode);
        if (!applied.ok) { refuse(); return; }
        // The caret goes to the end of what was written, with nothing selected: the format bar does not come back
        // where the popup was, so a second click (a double click, say) cannot land on it.
        const end = Math.min(applied.to, view.state.doc.content.size);
        view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end), -1)));
      }
      hidePop();
    }, dismiss, command === "translate_new" ? t(options.translate, "存为新文档") : okLabel));
    placePop(view.coordsAtPos((token ? resolvePagesFrozen(view, token)?.from : undefined) ?? view.state.selection.from), "below", t(options.translate, "候选"), true);
  };

  const runAiCommand = async (view: EditorView, command: string, style?: string, preset?: PagesCommandPreset) => {
    if (!options.runAi) return;
    // From the bar: the range is what the reported focus covered, and only while that is still the focus.
    let range: { from: number; to: number } | undefined;
    // A whole-document action (整篇) acts on all of the current text, whatever is selected; nothing to have changed.
    const wholeDoc = preset?.scope === "object";
    if (wholeDoc) range = { from: 0, to: view.state.doc.content.size };
    else if (preset?.localId !== undefined) {
      const focus = readPagesFocus(view.state);
      if (!focus || focus.local_id !== preset.localId) {
        showPop();
        pop.innerHTML = `<p class="pages-pop-error">${escapeHtml(t(options.translate, "选中的内容已经变了，请重新选择后再试。"))}</p>`;
        placePop(view.coordsAtPos(view.state.selection.from), "below", t(options.translate, "写作"));
        return;
      }
      // A comparison acts on the part selected last; the part set aside stays as it is.
      const parts = focus.activity === "comparing" ? focus.targets.slice(-1) : focus.targets;
      range = { from: Math.min(...parts.map(part => Math.min(part.anchor, part.head))), to: Math.max(...parts.map(part => Math.max(part.anchor, part.head))) };
    }
    const whole = command === "translate_new" || command === "proofread";
    const selected = range ? view.state.doc.textBetween(range.from, range.to, "\n") : view.state.doc.textBetween(view.state.selection.from, view.state.selection.to, "\n");
    const empty = !selected.trim();
    const text = whole || empty || wholeDoc ? docPlainText(view.state.doc) : selected;
    // Only proofreading rewrites the whole document. With nothing selected, the other commands read the whole
    // document but place their result after the paragraph the caret was in, as the menu always did at the caret.
    showPop();
    const tokenId = "ai-" + Date.now().toString(36);
    const token = command === "translate_new" ? null
      : (command === "proofread" ? freezePagesFocus(view, tokenId, { from: 0, to: view.state.doc.content.size }) : freezePagesFocus(view, tokenId, range))?.token ?? null;
    const mode = preset?.mode ?? (empty && command !== "proofread" ? "insert_after" : "replace");
    if (popToken && popToken !== token) releasePagesFrozen(view, popToken);
    popToken = token;
    const request = ++popRequest;
    pop.innerHTML = `<p>${escapeHtml((preset?.title ? preset.title + " · " : "") + t(options.translate, "正在处理"))}</p>`;
    // Started from outside the editor (the context toolbar): the popup opens under the toolbar, or at the frozen range when there is none.
    if (preset) placePop(view.coordsAtPos(range?.from ?? view.state.selection.from), "below", preset.title || t(options.translate, "写作"), true);
    try {
      // The exact command may come from the offer the Host prepared for this very selection.
      const actual: { command: string; style?: string; text?: string } = preset?.prepare ? await preset.prepare() : { command, style };
      if (request !== popRequest) return;
      const result = await options.runAi({ command: actual.command, text: wholeDoc ? text : actual.text ?? text, style: actual.style });
      // Closed or replaced while the model worked: this result is no longer wanted.
      if (request !== popRequest) return;
      showCandidate(view, actual.command, result, token, mode, preset?.okLabel);
    } catch (error) {
      if (token) releasePagesFrozen(view, token);
      if (request !== popRequest) return;
      pop.innerHTML = `<p class="pages-pop-error">${escapeHtml(error instanceof Error ? error.message : t(options.translate, "写作失败"))}</p>`;
    }
  };

  let view!: EditorView;
  const plugins = [
    history(),
    slashPlugin(options.translate),
    mentionPlugin(options),
    pagesKeymap(openLink),
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

  // The tools as the toolbar draws them: the editor's commands, with whether each is on for the selection.
  const toolGroups = (): PagesToolGroup[] => {
    const { from, to } = view.state.selection;
    const list = listKindAt(view.state), heading = headingLevelAt(view.state);
    const on = (id: string) => (id === "ul" && list === "bullet_list") || (id === "ol" && list === "ordered_list") || (id === "task" && list === "task_list")
      || (/^h[123]$/.test(id) && heading === Number(id.slice(1))) || (Boolean(pagesSchema.marks[id]) && markCovers(view.state.doc, from, to, id));
    const group = (id: "marks" | "blocks" | "insert", collapse: "never" | "overflow"): PagesToolGroup => ({ id, collapse,
      items: toolDefs.filter((tool) => tool.group === id).map((tool) => ({ id: tool.id, label: tool.label, ...(tool.glyph ? { glyph: tool.glyph } : {}),
        ...(tool.icon ? { icon: tool.icon } : {}), ...(tool.run ? { pressed: on(tool.id) } : { opens: "panel" as const }) })) });
    return [group("marks", "overflow"), group("blocks", "overflow"), group("insert", "never")];
  };
  const runTool = (id: string) => {
    const tool = toolDefs.find((entry) => entry.id === id);
    if (!tool) return;
    if (tool.panel === "tone") openTone(view); else if (tool.panel === "link") openLink(view); else if (tool.panel === "comment") openComment(view);
    else { tool.run?.(view.state, view.dispatch.bind(view)); view.focus(); }
  };
  const screen = () => {
    const { from, to } = view.state.selection;
    const a = view.coordsAtPos(from), b = view.coordsAtPos(to);
    return { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
  };

  const placeLinkPreview = (current: EditorView) => {
    const selection = current.state.selection;
    if (!selection.empty || !(selection instanceof TextSelection)) {
      linkPreview.hidden = true;
      return;
    }
    const found = linkAt(current.state.doc, selection);
    if (!found?.href) {
      linkPreview.hidden = true;
      return;
    }
    linkLabel.textContent = bookmarkLabel(found.href) || found.href;
    linkPreview.hidden = false;
    const start = current.coordsAtPos(found.from);
    const end = current.coordsAtPos(found.to);
    placeOverlay(linkPreview, { left: start.left, right: end.left, top: start.top, bottom: end.bottom }, "above");
  };

  const placeCommentPreview = (current: EditorView) => {
    const selection = current.state.selection;
    if (!selection.empty || !(selection instanceof TextSelection)) {
      commentPreview.hidden = true;
      return;
    }
    const found = commentAt(current.state.doc, selection);
    if (!found?.text) {
      commentPreview.hidden = true;
      return;
    }
    commentText.textContent = found.text;
    commentPreview.hidden = false;
    const start = current.coordsAtPos(found.from);
    const end = current.coordsAtPos(found.to);
    placeOverlay(commentPreview, { left: start.left, right: end.left, top: start.top, bottom: end.bottom }, "below");
  };

  view = new EditorView(host, {
    attributes: { role: "textbox", "aria-multiline": "true", "aria-label": t(options.translate, "文档正文") },
    state: EditorState.create({
      doc: nodeFromUnknown(options.doc),
      plugins,
    }),
    nodeViews: {
      column: (node, current, getPos) => columnNodeView(node, current, getPos, options.translate),
      image: (node, current, getPos) => imageNodeView(node, current, getPos, options.translate),
      bookmark: (node, current, getPos) => bookmarkNodeView(node, current, getPos, options.translate),
      table_cell: (node, current, getPos) => cellNodeView(node, current, getPos, options.translate),
      table_header: (node, current, getPos) => cellNodeView(node, current, getPos, options.translate),
      task_item: (node, current, getPos) => taskNodeView(node, current, getPos),
      toggle: (node, current, getPos) => toggleNodeView(node, current, getPos),
      callout: (node, current, getPos) => calloutNodeView(node, getPos, options.translate,
        (pos, anchor) => openCalloutStyle(current, pos, anchor)),
      page_mention: (node) => mentionNodeView(node, options),
      page_ref: (node, current, getPos) => cardNodeView("ref", node, current, getPos, options),
      task_card: (node, current, getPos) => cardNodeView("task", node, current, getPos, options),
      event_card: (node, current, getPos) => cardNodeView("event", node, current, getPos, options),
      calendar: () => calendarNodeView(),
      toc: () => tocNodeView(),
      code_block: (node, current, getPos) => codeNodeView(node, current, getPos, options.translate),
    },
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      placeLinkPreview(view);
      placeCommentPreview(view);
      options.onTools?.();
      if (tr.docChanged) options.onChange?.();
    },
    handleTextInput(current, _from, _to, text) {
      if (text === " ") {
        const group = hoveredGroup(current);
        const flipped = group ? toggleTaskGroup(current.state, group.anchor, group.head) : null;
        if (flipped) {
          current.dispatch(flipped);
          return true;
        }
        if (current.state.selection instanceof NodeSelection
          && current.state.selection.node.type === pagesSchema.nodes.task_item
          && toggleTaskChecked(current.state, current.dispatch.bind(current))) return true;
      }
      const hover = hoverKey.getState(current.state);
      if (hover && hover.anchor >= 0 && hover.head >= 0 && hover.anchor !== hover.head) {
        const tr = replaceSpan(current.state, hover.anchor, hover.head, text);
        if (tr) current.dispatch(tr.setMeta(hoverKey, { span: null, pos: -1 }).scrollIntoView());
        return true;
      }
      if (!(current.state.selection instanceof NodeSelection)) return false;
      const tr = replaceSelectedBlock(current.state, text);
      if (tr) current.dispatch(tr.scrollIntoView());
      return true;
    },
    handleTripleClick(current, pos) {
      const target = tripleClickSelection(current.state.doc, pos);
      if (!target) return false;
      const tr = current.state.tr;
      if (target.atom) {
        try { tr.setSelection(NodeSelection.create(tr.doc, target.from)); }
        catch { return false; }
      } else {
        tr.setSelection(TextSelection.create(tr.doc, target.from, target.to));
      }
      current.dispatch(tr);
      return true;
    },
    handleClick(_current, _pos, event) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return false;
      const href = safePagesHref(anchor.getAttribute("href"));
      const bookmark = anchor.closest("[data-pages-bookmark], .pages-bookmark");
      if (bookmark && !linkClickOpens(event)) {
        event.preventDefault();
        return false;
      }
      if (!href || !linkClickOpens(event)) return false;
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
      return true;
    },
    handlePaste,
    handleDrop,
    handleDOMEvents: {
      mousedown(current, event) {
        if (event.shiftKey && event.button === 0 && !event.altKey && !event.metaKey && !event.ctrlKey) {
          const target = event.target instanceof Element ? event.target : null;
          const inChrome = target?.closest("[data-pages-grip], [data-pages-plus], [data-pages-gap], .pages-block-menu, .pages-provisional");
          const hover = hoverKey.getState(current.state);
          const anchor = hover && hover.anchor >= 0 ? hover.anchor : -1;
          if (!inChrome && anchor >= 0 && target && current.dom.contains(target)) {
            const point = current.posAtCoords({ left: event.clientX, top: event.clientY });
            const span = point ? blockSpanToRow(current.state.doc, anchor, point.pos) : null;
            if (span) {
              event.preventDefault();
              const tr = current.state.tr.setMeta(hoverKey, { span, pos: span.head });
              try { tr.setSelection(NodeSelection.create(tr.doc, span.head)); } catch { /* the caret stays */ }
              current.dispatch(tr);
            } else if (point) {
              event.preventDefault();
            }
            if (span || point) return true;
          }
        }
        if (event.button !== 0 || event.target !== current.dom) return false;
        const end = current.coordsAtPos(current.state.doc.content.size);
        if (event.clientY <= end.bottom + 8) return false;
        const tr = focusBelowContent(current.state);
        if (tr) current.dispatch(tr);
        current.focus();
        event.preventDefault();
        return true;
      },
      copy(current, event) {
        return writeSpanClipboard(current, event, false);
      },
      cut(current, event) {
        return writeSpanClipboard(current, event, true);
      },
      dragover: handleDragOver,
      blur: () => {
        window.setTimeout(() => {
          if (!linkPreview.contains(document.activeElement) && !commentPreview.contains(document.activeElement) && !pop.contains(document.activeElement) && document.activeElement !== view.dom) {
            linkPreview.hidden = true;
            commentPreview.hidden = true;
          }
        }, 120);
        return false;
      },
    },
  });

  placeLinkPreview(view);
  placeCommentPreview(view);
  linkPreview.addEventListener("mousedown", (event) => event.preventDefault());
  commentPreview.addEventListener("mousedown", (event) => event.preventDefault());
  commentEdit.addEventListener("click", () => openComment(view));
  linkOpen.addEventListener("click", () => {
    const found = linkAt(view.state.doc, view.state.selection);
    const href = safePagesHref(found?.href);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  });
  linkEdit.addEventListener("click", () => openLink(view));
  const onPopEscape = (event: KeyboardEvent) => {
    if (event.isComposing || !popEscape(!pop.hidden, event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    hidePop();
    view.focus();
  };
  document.addEventListener("keydown", onPopEscape, true);
  refreshToc(view, options.translate);
  const reposition = () => {
    if (view.hasFocus()) {
      placeLinkPreview(view);
      placeCommentPreview(view);
    } else {
      linkPreview.hidden = true;
      commentPreview.hidden = true;
    }
    // The toolbar follows the selection while a form it holds has the focus too.
    options.onScreen?.();
  };
  const stopScroll = followScroll(linkPreview, reposition);
  window.addEventListener("resize", reposition);
  return { view, runCommand: (command, style, preset) => runAiCommand(view, command, style, preset), tools: toolGroups, runTool, screen,
    release: () => {
      stopScroll();
      window.removeEventListener("resize", reposition);
      hidePop();
      document.removeEventListener("keydown", onPopEscape, true);
      pop.remove();
      linkPreview.remove();
      commentPreview.remove();
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