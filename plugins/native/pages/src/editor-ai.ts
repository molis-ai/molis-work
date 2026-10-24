import type { EditorView } from "prosemirror-view";
import { Fragment, type Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { applyPagesActions } from "./editor-transient.js";
import { paragraphNode } from "./editor-insert-menu.js";
import { nodeFromUnknown } from "./schema.js";
import { applyToPagesFrozen, freezePagesFocus, readPagesFocus, releasePagesFrozen, resolvePagesFrozen } from "./focus.js";
import type { EditorPopup } from "./editor-popup.js";
import type { PagesCommandPreset, PagesEditorMountOptions } from "./editor-types.js";
import { t, escapeHtml, actions } from "./editor-view-ui.js";

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

/** A writing request and the candidate it brings back, shown in the editor's popup. */
export function createEditorAi(popup: EditorPopup, options: PagesEditorMountOptions) {
  const { pop, state, showPop, hidePop, placePop } = popup;

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
    if (state.token && state.token !== token) releasePagesFrozen(view, state.token);
    state.token = token;
    const request = ++state.request;
    pop.innerHTML = `<p>${escapeHtml((preset?.title ? preset.title + " · " : "") + t(options.translate, "正在处理"))}</p>`;
    // Started from outside the editor (the context toolbar): the popup opens under the toolbar, or at the frozen range when there is none.
    if (preset) placePop(view.coordsAtPos(range?.from ?? view.state.selection.from), "below", preset.title || t(options.translate, "写作"), true);
    try {
      // The exact command may come from the offer the Host prepared for this very selection.
      const actual: { command: string; style?: string; text?: string } = preset?.prepare ? await preset.prepare() : { command, style };
      if (request !== state.request) return;
      const result = await options.runAi({ command: actual.command, text: wholeDoc ? text : actual.text ?? text, style: actual.style });
      // Closed or replaced while the model worked: this result is no longer wanted.
      if (request !== state.request) return;
      showCandidate(view, actual.command, result, token, mode, preset?.okLabel);
    } catch (error) {
      if (token) releasePagesFrozen(view, token);
      if (request !== state.request) return;
      pop.innerHTML = `<p class="pages-pop-error">${escapeHtml(error instanceof Error ? error.message : t(options.translate, "写作失败"))}</p>`;
    }
  };

  return { runAiCommand };
}
