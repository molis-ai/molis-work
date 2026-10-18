import { setBlockType } from "prosemirror-commands";
import type { Command, EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { applyHeading, applyListSelection, headingLevelAt, listKindAt, markCovers } from "./commands.js";
import { commandToggle } from "./editor-keyboard.js";
import type { PagesToolGroup, Translate } from "./editor-types.js";
import { t } from "./editor-view-ui.js";
import { pagesSchema } from "./schema.js";

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

function listCommand(id: "bullet_list" | "ordered_list" | "task_list"): Command {
  return (state, dispatch) => {
    const tr = applyListSelection(state, id);
    if (!tr) return false;
    dispatch?.(tr);
    return true;
  };
}

export function editorToolDefinitions(translate: Translate | undefined): Array<{ id: string; group: "marks" | "blocks" | "insert"; label: string; glyph?: string; icon?: string; run?: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean; panel?: "tone" | "link" | "comment" }> {
  return [
    { id: "strong", group: "marks", label: t(translate, "加粗"), glyph: "B", run: commandToggle("strong") },
    { id: "em", group: "marks", label: t(translate, "斜体"), glyph: "I", run: commandToggle("em") },
    { id: "underline", group: "marks", label: t(translate, "下划线"), glyph: "U", run: commandToggle("underline") },
    { id: "strike", group: "marks", label: t(translate, "删除线"), glyph: "S", run: commandToggle("strike") },
    { id: "code", group: "marks", label: t(translate, "代码"), icon: "code", run: commandToggle("code") },
    { id: "h1", group: "blocks", label: t(translate, "标题 1"), glyph: "H1", run: headingCommand(1) },
    { id: "h2", group: "blocks", label: t(translate, "标题 2"), glyph: "H2", run: headingCommand(2) },
    { id: "h3", group: "blocks", label: t(translate, "标题 3"), glyph: "H3", run: headingCommand(3) },
    { id: "ul", group: "blocks", label: t(translate, "无序列表"), icon: "rows", run: listCommand("bullet_list") },
    { id: "ol", group: "blocks", label: t(translate, "有序列表"), icon: "list-ordered", run: listCommand("ordered_list") },
    { id: "task", group: "blocks", label: t(translate, "清单"), icon: "check", run: listCommand("task_list") },
    { id: "tone", group: "insert", label: t(translate, "颜色"), glyph: "A", panel: "tone" },
    { id: "link", group: "insert", label: t(translate, "链接"), icon: "link", panel: "link" },
    { id: "comment", group: "insert", label: t(translate, "评论"), icon: "message", panel: "comment" },
  ];
}

// The tools as the toolbar draws them: the editor's commands, with whether each is on for the selection.
export function editorToolGroups(view: EditorView, toolDefs: ReturnType<typeof editorToolDefinitions>): PagesToolGroup[] {
  const { from, to } = view.state.selection;
  const list = listKindAt(view.state), heading = headingLevelAt(view.state);
  const on = (id: string) => (id === "ul" && list === "bullet_list") || (id === "ol" && list === "ordered_list") || (id === "task" && list === "task_list")
    || (/^h[123]$/.test(id) && heading === Number(id.slice(1))) || (Boolean(pagesSchema.marks[id]) && markCovers(view.state.doc, from, to, id));
  const group = (id: "marks" | "blocks" | "insert", collapse: "never" | "overflow"): PagesToolGroup => ({ id, collapse,
    items: toolDefs.filter((tool) => tool.group === id).map((tool) => ({ id: tool.id, label: tool.label, ...(tool.glyph ? { glyph: tool.glyph } : {}),
      ...(tool.icon ? { icon: tool.icon } : {}), ...(tool.run ? { pressed: on(tool.id) } : { opens: "panel" as const }) })) });
  return [group("marks", "overflow"), group("blocks", "overflow"), group("insert", "never")];
}

export function editorSelectionScreen(view: EditorView) {
  const { from, to } = view.state.selection;
  const a = view.coordsAtPos(from), b = view.coordsAtPos(to);
  return { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
}
