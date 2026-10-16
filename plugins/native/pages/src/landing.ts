import { Fragment, Slice, type Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { pagesErrors } from "./error.js";
import { safePagesHref } from "./link.js";
import { pagesSchema } from "./schema.js";

/**
 * Putting what the person has in hand into a document at the place they left in it (specs/context-program §21.8 step 4):
 * at the cursor (or the end), over the selected text, or as a quote with where it came from. Plain text only, the same
 * way the preview shows it; nothing here reads a model. Positions are the editor's, valid only for the version the
 * caller read, which the action compares before calling this.
 */
export type PagesLandingMode = "insert" | "replace" | "quote";

export interface PagesLandingWrite {
  readonly mode: PagesLandingMode;
  readonly anchor: number;
  readonly head: number;
  readonly text: string;
  /** Only for a quote: what the text came from, written under it. */
  readonly source?: { readonly title: string; readonly url?: string };
}

/** One paragraph per line; blank lines only separate. Spaces stay: " and more" at a cursor keeps its space. */
function paragraphs(text: string): Node[] {
  return text.replace(/\r\n?/gu, "\n").replace(/^\n+|\n+$/gu, "").split(/\n+/u).map(line => pagesSchema.nodes.paragraph.create(null, line ? pagesSchema.text(line) : null));
}

function sourceLine(source: NonNullable<PagesLandingWrite["source"]>): Node {
  const href = source.url ? safePagesHref(source.url) : "";
  const title = pagesSchema.text(source.title, href ? [pagesSchema.marks.link.create({ href })] : []);
  return pagesSchema.nodes.paragraph.create(null, [pagesSchema.text("— "), title]);
}

/** The document body after the write; refuses positions outside the document or that do not fit the mode. */
export function landPagesText(body: unknown, write: PagesLandingWrite): unknown {
  let doc: Node;
  try { doc = pagesSchema.nodeFromJSON(body); } catch { throw pagesErrors.invalid("文档内容无法读取"); }
  const from = Math.min(write.anchor, write.head), to = Math.max(write.anchor, write.head);
  if (from < 0 || to > doc.content.size) throw pagesErrors.invalid("落点不在文档里，请重新选择位置");
  if (write.mode === "replace" ? from === to : from !== to) throw pagesErrors.invalid(write.mode === "replace" ? "没有选中要替换的文字" : "插入的位置应是光标处");
  if (!write.text.trim()) throw pagesErrors.invalid("没有要放进去的文字");
  if (write.mode === "quote" && !write.source?.title.trim()) throw pagesErrors.invalid("引用需要出处");
  const tr = EditorState.create({ doc }).tr;
  try {
    if (write.mode === "quote") tr.replaceRangeWith(from, to, pagesSchema.nodes.blockquote.create(null, [...paragraphs(write.text), sourceLine(write.source!)]));
    // Open on both sides, as a paste is: one line joins the paragraph at the cursor, more lines split it.
    else tr.replaceRange(from, to, new Slice(Fragment.from(paragraphs(write.text)), 1, 1));
  } catch {
    throw pagesErrors.invalid("这个位置放不进文字，请换一个位置");
  }
  return tr.doc.toJSON();
}
