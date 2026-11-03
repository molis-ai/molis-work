import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { MODEL_DATA_MAX_CHARS } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { KNOWLEDGE_LOCATE_MAX_SUBJECTS, type KnowledgeLocateResponse, type KnowledgeLocatedSection, type KnowledgeOutline } from "@molis-ai/molis-work-contracts/services/knowledge";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { knowledgeErrors } from "./errors.js";
import { knowledgeRef } from "./refs.js";

/** What the model is shown: the question and each piece's section tree by number, headings and notes only. */
export interface KnowledgeLocateDraftInput {
  question: string;
  pieces: Array<{ piece: number; title: string; sections: Array<{ anchor: string; title: string; level: number; summary: string | null }> }>;
}
export interface KnowledgeLocateDraft { sections: Array<{ piece: number; anchor: string; reason: string }> }
/** The project's text model choosing sections with the registered instruction. */
export type KnowledgeLocator = (input: KnowledgeLocateDraftInput) => Promise<KnowledgeLocateDraft>;

const MAX_SECTIONS = 8;
const TREE_SECTIONS = 300;
const TITLE_CHARS = 120;
const REASON_CHARS = 200;
const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;
const chars = (text: string) => [...text].length;
type ShownSection = KnowledgeLocateDraftInput["pieces"][number]["sections"][number];

/** The data the Host's text model reads after the locate instruction: the input as one JSON line. What is measured is what is sent. */
export function knowledgeLocateData(input: KnowledgeLocateDraftInput): string {
  return JSON.stringify(input);
}

/**
 * The trees as the model is shown them, within the data the Host's text model takes (`MODEL_DATA_MAX_CHARS`): whole sections go in
 * by turns (every piece's first, then every piece's second, …) while they fit, and a piece whose next section does not fit shows no
 * more, so each shows the start of its tree and no section is cut. `omitted` counts the sections of the trees that are not shown,
 * those past `TREE_SECTIONS` included.
 */
function shownPieces(question: string, trees: readonly KnowledgeOutline[]): { pieces: KnowledgeLocateDraftInput["pieces"]; omitted: number } {
  const pieces = trees.map((tree, index) => ({ piece: index + 1, title: cutHead(tree.title, TITLE_CHARS), sections: [] as ShownSection[] }));
  const candidates = trees.map(tree => tree.sections.slice(0, TREE_SECTIONS).map(section => ({ anchor: section.anchor, title: cutHead(section.title, TITLE_CHARS), level: section.level, summary: section.summary })));
  // A section adds its own JSON to the data, and a comma after the piece's first: the sum is exactly what is sent.
  let size = chars(knowledgeLocateData({ question, pieces }));
  const open = new Set(pieces.keys());
  for (let turn = 0; open.size; turn++) {
    for (const index of [...open]) {
      const section = candidates[index]![turn];
      const added = section ? chars(JSON.stringify(section)) + (turn ? 1 : 0) : 0;
      if (!section || size + added > MODEL_DATA_MAX_CHARS) { open.delete(index); continue; }
      pieces[index]!.sections.push(section);
      size += added;
    }
  }
  return { pieces, omitted: trees.reduce((sum, tree, index) => sum + tree.sections.length - pieces[index]!.sections.length, 0) };
}

/**
 * `knowledge.locate` (specs/project-knowledge §6.4, PMAT-38): the model reads up to five section trees, PageIndex-style, and names
 * the sections likely to hold the answer. Only sections that are there come back, with the line `read` starts from; nothing of the
 * text is sent or returned. The trees go as whole sections within the data the Host's model takes; `omitted` says how many it did not see. `outline` reads each tree with the caller's authority; `beforeEffect` is checked before answering, so
 * a call cancelled or revoked while the model thought answers nothing.
 */
export async function locateSections(input: { question: string; subjects: readonly ActionSubject[] }, outline: (subject: ActionSubject) => Promise<KnowledgeOutline>, locator: KnowledgeLocator | null,
  beforeEffect?: () => Promise<void>): Promise<KnowledgeLocateResponse> {
  if (!locator) throw knowledgeErrors.no_model("没有可用的文字模型来选节：用「查看资料结构」看分节和每节摘要，自己选要读的节");
  const subjects = input.subjects.filter((subject, index, all) => all.findIndex(other => sameSubject(other, subject)) === index);
  if (!subjects.length || subjects.length > KNOWLEDGE_LOCATE_MAX_SUBJECTS) throw knowledgeErrors.invalid(`用 refs 或 subjects 给 1 到 ${KNOWLEDGE_LOCATE_MAX_SUBJECTS} 份资料`);
  const trees: KnowledgeOutline[] = [], unread: KnowledgeLocateResponse["unread"] = [];
  for (const subject of subjects) {
    try { trees.push(await outline(subject)); }
    catch (error) { unread.push({ subject, reason: (error instanceof Error ? error.message : String(error)).slice(0, REASON_CHARS) }); }
  }
  const unsummarized = trees.filter(tree => !tree.sections.some(section => section.summary)).map(tree => tree.subject);
  if (!trees.length) return { sections: [], unread, unsummarized, omitted: 0 };
  const shown = shownPieces(input.question, trees);
  const draft = await locator({ question: input.question, pieces: shown.pieces });
  const sections: KnowledgeLocatedSection[] = [];
  for (const chosen of Array.isArray(draft?.sections) ? draft.sections : []) {
    const tree = trees[Number(chosen?.piece) - 1], section = tree?.sections.find(item => item.anchor === chosen.anchor);
    // A section the model named that is not in that tree, or one already given, is left out: what comes back can be read.
    if (!tree || !section || sections.some(item => sameSubject(item.subject, tree.subject) && item.anchor === section.anchor)) continue;
    sections.push({ subject: tree.subject, ref: knowledgeRef(tree.subject, "allow"), revision: tree.revision, anchor: section.anchor, title: section.title, line: section.line, reason: String(chosen.reason ?? "").slice(0, REASON_CHARS) });
    if (sections.length === MAX_SECTIONS) break;
  }
  await beforeEffect?.();
  return { sections, unread, unsummarized, omitted: shown.omitted };
}
