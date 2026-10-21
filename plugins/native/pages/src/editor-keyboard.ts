import { hoverKey, dropSelectedBlock, hoveredGroup, dropHoveredGroup, duplicateHoveredGroup, nudgeEditor } from "./editor-block-selection.js";
import { baseKeymap, chainCommands } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { confirmCodeFence } from "./input-rules.js";
import { keymap } from "prosemirror-keymap";
import { splitListItem } from "prosemirror-schema-list";
import { TextSelection, type Command, type Plugin, type Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { duplicateEnclosingRow, enterHeading, enterInToggle, exitWrappedBlock, indentListItem, indentUnderPrevious, insertCodeIndent, insertHardBreak, leaveCodeDown, leaveEmptyCodeLine, leaveCodeUp, continuePastEnd, continueBeforeStart, selectNeighborAtom, moveColumnEdge, outdentListItem, outdentFromContainer, removeCodeIndent, applyListSelection, applyHeading, selectBlockThenAll, moveSelectedBlock, collapseSelectedBlock, insertAfterSelectedBlock, insertAfterSpan, hardBreakAtSpanEnd, toggleTaskChecked, toggleTaskGroup, toggleInlineMark, toggleSpanMark, turnRowInto, turnGroup, clearSpanMarks, clearInlineMarks, collapseEmptyColumn, unwrapAtStart } from "./commands.js";
import { openFind } from "./editor-find.js";
import { addTableRow, atLastTableCell, moveTableColumn, moveTableEdge, tableHit } from "./table-edit.js";
import { pagesSchema } from "./schema.js";
import { sizeKeys } from "./editor-size-keys.js";

export function pagesKeymap(openLink: (view: EditorView) => void): Plugin {
  return keymap({ ...shortcutKeys(openLink), ...blockKeys(), ...navigationKeys(), ...sizeKeys() });
}

function shortcutKeys(openLink: (view: EditorView) => void): Record<string, Command> {
  return {
    "Mod-z": undo,
    "Mod-y": redo,
    "Mod-Shift-z": redo,
    "Mod-c": (state, _dispatch, editor) => {
      if (state.selection.empty || !editor) return false;
      return document.execCommand("copy");
    },
    "Mod-x": (state, _dispatch, editor) => {
      if (state.selection.empty || !editor) return false;
      return document.execCommand("cut");
    },
    "Mod-b": commandToggle("strong"),
    "Mod-i": commandToggle("em"),
    "Mod-u": commandToggle("underline"),
    "Mod-e": commandToggle("code"),
    "Mod-Shift-x": commandToggle("strike"),
    "Mod-k": (_state, _dispatch, view) => {
      if (!view) return false;
      openLink(view);
      return true;
    },
    "Mod-f": (_state, _dispatch, editor) => {
      if (!editor) return false;
      openFind(editor);
      return true;
    },
    "Shift-Enter": (state, dispatch, editor) => {
      const group = editor ? hoveredGroup(editor) : null;
      if (group) {
        const tr = hardBreakAtSpanEnd(state, group.anchor, group.head);
        if (tr && dispatch) dispatch(tr);
        return true;
      }
      return insertHardBreak(state, dispatch);
    },
    "Mod-d": (_state, _dispatch, view) => {
      if (!view) return false;
      if (duplicateHoveredGroup(view)) return true;
      const tr = duplicateEnclosingRow(view.state);
      if (!tr) return false;
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return true;
    },
    "Mod-Enter": (state, dispatch, editor) => {
      if (editor) {
        const group = hoveredGroup(editor);
        const flipped = group ? toggleTaskGroup(state, group.anchor, group.head) : null;
        if (flipped) {
          if (dispatch) dispatch(flipped.scrollIntoView());
          return true;
        }
      }
      return toggleTaskChecked(state, dispatch);
    },
    "Mod-Alt-0": turnCurrent("paragraph"),
    "Mod-Alt-1": turnCurrent("heading1"),
    "Mod-Alt-2": turnCurrent("heading2"),
    "Mod-Alt-3": turnCurrent("heading3"),
    "Mod-Shift-8": turnCurrent("bullet_list"),
    "Mod-Shift-7": turnCurrent("ordered_list"),
    "Mod-Shift-9": turnCurrent("task_list"),
  };
}

function blockKeys(): Record<string, Command> {
  const listItem = pagesSchema.nodes.list_item;
  return {
    Enter: chainCommands(
      confirmCodeFence,
      (state, dispatch, editorView) => {
        const group = editorView ? hoveredGroup(editorView) : null;
        if (!group) return false;
        const tr = insertAfterSpan(state, group.anchor, group.head);
        if (!tr) return false;
        if (dispatch) dispatch(tr.setMeta(hoverKey, { span: null }));
        return true;
      },
      (state, dispatch) => applySelected(insertAfterSelectedBlock(state), dispatch),
      leaveEmptyCodeLine,
      enterInToggle,
      exitWrappedBlock,
      splitListItem(listItem),
      enterHeading,
    ),
    Backspace: (state, dispatch, editor) => {
      if (editor && dropHoveredGroup(editor)) return true;
      return chainCommands(undoInputRule, dropSelectedBlock, moveTableEdge("left"), collapseEmptyColumn, unwrapAtStart, baseKeymap.Backspace)(state, dispatch, editor);
    },
    Delete: (state, dispatch, editor) => {
      if (editor && dropHoveredGroup(editor)) return true;
      return chainCommands(dropSelectedBlock, moveTableEdge("right"), baseKeymap.Delete)(state, dispatch, editor);
    },
    "Mod-\\": (state, dispatch, editor) => {
      if (editor) {
        const group = hoveredGroup(editor);
        if (group) {
          const tr = clearSpanMarks(state, group.anchor, group.head);
          if (!tr) return false;
          if (dispatch) dispatch(tr.scrollIntoView());
          return true;
        }
      }
      return clearInlineMarks(state, dispatch);
    },
    "Mod-a": selectBlockThenAll,
  };
}

function navigationKeys(): Record<string, Command> {
  return {
    "Mod-Shift-ArrowUp": (_state, _dispatch, view) => view ? nudgeEditor(view, -1) : false,
    "Mod-Shift-ArrowDown": (_state, _dispatch, view) => view ? nudgeEditor(view, 1) : false,
    "Mod-Alt-ArrowLeft": (_state, _dispatch, view) => view ? nudgeTableColumn(view, -1) : false,
    "Mod-Alt-ArrowRight": (_state, _dispatch, view) => view ? nudgeTableColumn(view, 1) : false,
    ArrowLeft: (state, dispatch) => applySelected(collapseSelectedBlock(state, "start"), dispatch) || applySelected(selectNeighborAtom(state, -1), dispatch) || moveTableEdge("left")(state, dispatch) || moveColumnEdge("left")(state, dispatch),
    ArrowRight: (state, dispatch) => applySelected(collapseSelectedBlock(state, "end"), dispatch) || applySelected(selectNeighborAtom(state, 1), dispatch) || moveTableEdge("right")(state, dispatch) || moveColumnEdge("right")(state, dispatch),
    ArrowDown: verticalArrow(1),
    ArrowUp: verticalArrow(-1),
    Tab: tabKey(1),
    "Shift-Tab": tabKey(-1),
  };
}

function turnCurrent(id: string): Command {
  return (_state, _dispatch, view) => {
    if (!view) return false;
    const group = hoveredGroup(view);
    const grouped = group ? turnGroup(view.state, group.anchor, group.head, id) : null;
    if (grouped) {
      view.dispatch(grouped.scrollIntoView());
      view.focus();
      return true;
    }
    let tr: Transaction | null = null;
    if (id === "heading1" || id === "heading2" || id === "heading3") {
      tr = applyHeading(view.state, Number(id.slice(-1)) as 1 | 2 | 3);
    } else if (id === "bullet_list" || id === "ordered_list" || id === "task_list") {
      tr = applyListSelection(view.state, id);
    }
    if (!tr) tr = turnRowInto(view.state, id);
    if (!tr) return false;
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  };
}

export function commandToggle(markName: string): Command {
  return (state, dispatch, editor) => {
    if (editor) {
      const group = hoveredGroup(editor);
      if (group) {
        const tr = toggleSpanMark(state, group.anchor, group.head, markName);
        if (!tr) return false;
        if (dispatch) dispatch(tr.scrollIntoView());
        return true;
      }
    }
    return toggleInlineMark(markName)(state, dispatch);
  };
}

function applySelected(tr: Transaction | null, dispatch?: (tr: Transaction) => void): boolean {
  if (!tr) return false;
  if (dispatch && (tr.docChanged || tr.selectionSet)) dispatch(tr.scrollIntoView());
  return true;
}

function nudgeTableColumn(view: EditorView, direction: -1 | 1): boolean {
  if (!tableHit(view.state)) return false;
  const moved = moveTableColumn(view.state, direction);
  if (!moved) return true;
  view.dispatch(moved.scrollIntoView());
  view.focus();
  return true;
}

function cellNav(view: EditorView, dir: 1 | -1): boolean {
  if (dir > 0 && atLastTableCell(view.state)) {
    const tr = addTableRow(view.state);
    if (!tr) return false;
    view.dispatch(tr.scrollIntoView());
    return true;
  }
  const $from = view.state.selection.$from;
  let depth = $from.depth;
  while (depth > 0 && $from.node(depth).type.name !== "table_cell" && $from.node(depth).type.name !== "table_header") {
    depth -= 1;
  }
  if (depth === 0) return false;
  const cellPos = dir > 0 ? $from.after(depth) : $from.before(depth);
  const found = TextSelection.findFrom(view.state.doc.resolve(cellPos), dir, true);
  if (!found) return false;
  view.dispatch(view.state.tr.setSelection(found).scrollIntoView());
  return true;
}

function verticalArrow(direction: -1 | 1): Command {
  const edge = direction > 0 ? "down" : "up";
  const continueEdge = direction > 0 ? continuePastEnd : continueBeforeStart;
  const leaveCode = direction > 0 ? leaveCodeDown : leaveCodeUp;
  return (state, dispatch) => {
    const moved = moveSelectedBlock(state, direction);
    if (moved && (moved.docChanged || moved.selectionSet)) {
      if (dispatch) dispatch(moved.scrollIntoView());
      return true;
    }
    if (moved) {
      const extra = continueEdge(state);
      if (extra && dispatch) dispatch(extra);
      return true;
    }
    if (moveTableEdge(edge)(state, dispatch)) return true;
    if (moveColumnEdge(edge)(state, dispatch)) return true;
    if (leaveCode(state, dispatch)) return true;
    if (applySelected(selectNeighborAtom(state, direction), dispatch)) return true;
    const extra = continueEdge(state);
    if (!extra) return false;
    if (dispatch) dispatch(extra);
    return true;
  };
}

function tabKey(direction: -1 | 1): Command {
  const code = direction > 0 ? insertCodeIndent : removeCodeIndent;
  const list = direction > 0 ? indentListItem : outdentListItem;
  const nest = direction > 0 ? indentUnderPrevious : outdentFromContainer;
  return (state, dispatch, current) => {
    if (current && cellNav(current, direction)) return true;
    if (code(state, dispatch)) return true;
    if (list(state, dispatch)) return true;
    const hover = current ? hoverKey.getState(current.state) : null;
    const changed = nest(state, hover && hover.anchor >= 0 ? hover.anchor : -1, hover && hover.head >= 0 ? hover.head : -1);
    if (changed && dispatch) dispatch(changed.setMeta(hoverKey, { span: null }).scrollIntoView());
    return true;
  };
}
