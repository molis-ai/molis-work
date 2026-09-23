import { InputRule, inputRules, wrappingInputRule, textblockTypeInputRule } from "prosemirror-inputrules";
import { EditorState, type Command, type Transaction } from "prosemirror-state";
import { markdownBlock, markdownLink, markdownTask, markdownWrapMark } from "./commands.js";
import { pagesSchema } from "./schema.js";

type Rewrite = (state: EditorState, start: number, end: number) => Transaction | null;

/** InputRule runs before the keystroke reaches the document. Insert it and rewrite
 * on one transaction so marks, selection and undo all see the actual typed text. */
type TypedInput = { from: number; to: number; text: string };

function typedRule(pattern: RegExp, rewrite: Rewrite, pending: () => TypedInput | null): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    // compositionend runs after the DOM text is committed; ordinary input has
    // an explicit range, which need not match the editor's previous selection.
    const input = pending() ?? { from: end, to: end, text: "" };
    if ((state.storedMarks ?? state.doc.resolve(input.from).marks()).some((mark) => mark.type.spec.code)) return null;
    let atom = false;
    state.doc.nodesBetween(start, end, (node) => {
      if (node.isInline && !node.isText) atom = true;
    });
    if (atom) return null;
    const tr = state.tr.insertText(input.text, input.from, input.to);
    const typed = EditorState.create({ doc: tr.doc, selection: tr.selection, storedMarks: tr.storedMarks });
    const result = rewrite(typed, start, start + match[0].length);
    if (!result) return null;
    for (const step of result.steps) tr.step(step);
    tr.setSelection(result.selection.getBookmark().resolve(tr.doc));
    tr.setStoredMarks(result.storedMarks ?? state.storedMarks ?? state.selection.$from.marks());
    return tr;
  }, { inCodeMark: false });
}

function codeFence(state: EditorState, start: number, end: number): Transaction | null {
  const marker = state.doc.textBetween(start, end);
  if (!/^```[A-Za-z0-9_+#-]* $/u.test(marker)) return null;
  const tr = state.tr.delete(end - 1, end);
  const typed = EditorState.create({ doc: tr.doc, selection: tr.selection });
  const result = markdownBlock(typed, start, end - 1);
  if (!result) return null;
  for (const step of result.steps) tr.step(step);
  return tr.setSelection(result.selection.getBookmark().resolve(tr.doc));
}

/** Enter confirms a fence after its optional language; normal paragraphs keep Enter. */
export const confirmCodeFence: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type !== pagesSchema.nodes.paragraph || $from.parentOffset !== $from.parent.content.size) return false;
  if (!/^```[A-Za-z0-9_+#-]*$/u.test($from.parent.textContent)) return false;
  const tr = markdownBlock(state, $from.start(), $from.pos);
  if (!tr) return false;
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

export function pagesInputRules() {
  let pending: TypedInput | null = null;
  const rule = (pattern: RegExp, rewrite: Rewrite) => typedRule(pattern, rewrite, () => pending);
  const plugin = inputRules({ rules: [
    wrappingInputRule(/^\s*([-+*])\s$/u, pagesSchema.nodes.bullet_list),
    wrappingInputRule(/^(\d+)\.\s$/u, pagesSchema.nodes.ordered_list, (match) => ({ order: Number(match[1]) || 1 })),
    textblockTypeInputRule(/^#\s$/u, pagesSchema.nodes.heading, { level: 1 }),
    textblockTypeInputRule(/^##\s$/u, pagesSchema.nodes.heading, { level: 2 }),
    textblockTypeInputRule(/^###\s$/u, pagesSchema.nodes.heading, { level: 3 }),
    rule(/^(?:---|___|\*\*\*|>\s)$/u, markdownBlock),
    rule(/^```[A-Za-z0-9_+#-]* $/u, codeFence),
    rule(/\*\*([^*]+)\*\*$/u, (state, start, end) => markdownWrapMark(state, start, end, "**", "**", "strong")),
    rule(/(?:^|[^*])\*([^*]+)\*$/u, (state, start, end) => {
      const lead = state.doc.textBetween(start, start + 1) === "*" ? 0 : 1;
      return markdownWrapMark(state, start + lead, end, "*", "*", "em");
    }),
    rule(/~~([^~]+)~~$/u, (state, start, end) => markdownWrapMark(state, start, end, "~~", "~~", "strike")),
    rule(/`([^`]+)`$/u, (state, start, end) => markdownWrapMark(state, start, end, "`", "`", "code")),
    rule(/\[[^\]]+\]\([^)\s]+\)$/u, markdownLink),
    rule(/https?:\/\/\S+ $/u, markdownLink),
    rule(/^\[(?:\]| \]|x\]|X\]) $/u, markdownTask),
  ] });
  const handle = plugin.props.handleTextInput!;
  plugin.props.handleTextInput = function (view, from, to, text, defaultTransaction) {
    pending = { from, to, text };
    try { return handle.call(this, view, from, to, text, defaultTransaction); }
    finally { pending = null; }
  };
  return plugin;
}
