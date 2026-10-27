import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_LOCATE_MAX_SUBJECTS, type KnowledgeLocateResponse, type KnowledgeLocatedSection, type KnowledgeOutline } from "@molis-ai/molis-work-contracts/services/knowledge";
import { knowledgeErrors } from "./errors.js";
import { knowledgeRef } from "./refs.js";

/** What the model is shown: the question and each piece's section tree by number, headings and notes only. */
export interface KnowledgeLocateDraftInput {
  question: string;
  pieces: Array<{ piece: number; title: string; sections: Array<{ anchor: string; title: string; level: number; summary: string | null }> }>;
}
export interface KnowledgeLocateDraft { sections: Array<{ piece: number; anchor: string; reason: string }> }
/** The project's text model choosing sections with the registered instruction. */
export interface KnowledgeLocateControl { beforeDispatch(): Promise<void>; afterResult(): Promise<void>; assertCurrent?(): void; signal?: AbortSignal }
export type KnowledgeLocator = (input: KnowledgeLocateDraftInput, control?: KnowledgeLocateControl) => Promise<KnowledgeLocateDraft>;
/** A tree's original read identity is retained only for this call. */
export interface KnowledgePreparedOutline { tree: KnowledgeOutline; assertCurrent(): Promise<void>; assertCardsCurrent?(): void }

const MAX_SECTIONS = 8;
const TREE_SECTIONS = 300;
const TITLE_CHARS = 120;
const REASON_CHARS = 200;
const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;

/**
 * `knowledge.locate` (specs/project-knowledge §6.4, PMAT-38): the model reads up to five section trees, PageIndex-style, and names
 * the sections likely to hold the answer. Only sections that are there come back, with the line `read` starts from; nothing of the
 * text is sent or returned. `outline` reads each tree with the caller's authority; `beforeEffect` is checked before answering, so
 * a call cancelled or revoked while the model thought answers nothing.
 */
export async function locateSections(input: { question: string; subjects: readonly ActionSubject[] }, outline: (subject: ActionSubject) => Promise<KnowledgeOutline | KnowledgePreparedOutline>, locator: KnowledgeLocator | null,
  beforeEffect?: () => Promise<void>, signal?: AbortSignal, assertSourcesCurrent?: () => void): Promise<KnowledgeLocateResponse> {
  if (!locator) throw knowledgeErrors.no_model("没有可用的文字模型来选节：用「查看资料结构」看分节和每节摘要，自己选要读的节");
  const subjects = input.subjects.filter((subject, index, all) => all.findIndex(other => sameSubject(other, subject)) === index);
  if (!subjects.length || subjects.length > KNOWLEDGE_LOCATE_MAX_SUBJECTS) throw knowledgeErrors.invalid(`用 refs 或 subjects 给 1 到 ${KNOWLEDGE_LOCATE_MAX_SUBJECTS} 份资料`);
  const guards: Array<() => Promise<void>> = [], cardGuards: Array<() => void> = [];
  const trees: KnowledgeOutline[] = [], unread: KnowledgeLocateResponse["unread"] = [];
  for (const subject of subjects) {
    try {
      const prepared = await outline(subject);
      if ("tree" in prepared) { trees.push(prepared.tree); guards.push(prepared.assertCurrent); if (prepared.assertCardsCurrent) cardGuards.push(prepared.assertCardsCurrent); }
      else trees.push(prepared);
    }
    catch (error) { unread.push({ subject, reason: (error instanceof Error ? error.message : String(error)).slice(0, REASON_CHARS) }); }
  }
  const unsummarized = trees.filter(tree => !tree.sections.some(section => section.summary)).map(tree => tree.subject);
  if (!trees.length) return { sections: [], unread, unsummarized };
  let prepared = false;
  const assertCurrent = () => {
    if (!prepared) throw knowledgeErrors.unreadable("资料来源尚未完成本次核验");
    assertSourcesCurrent?.();
    for (const guard of cardGuards) guard();
  };
  const current = async () => {
    prepared = false;
    await beforeEffect?.();
    for (const guard of guards) await guard();
    signal?.throwIfAborted();
    prepared = true; assertCurrent();
  };
  await current();
  const draft = await locator({ question: input.question, pieces: trees.map((tree, index) => ({ piece: index + 1, title: tree.title.slice(0, TITLE_CHARS),
    sections: tree.sections.slice(0, TREE_SECTIONS).map(section => ({ anchor: section.anchor, title: section.title.slice(0, TITLE_CHARS), level: section.level, summary: section.summary })) })) }, { beforeDispatch: current, afterResult: current, assertCurrent, ...(signal ? { signal } : {}) });
  const sections: KnowledgeLocatedSection[] = [];
  for (const chosen of Array.isArray(draft?.sections) ? draft.sections : []) {
    const tree = trees[Number(chosen?.piece) - 1], section = tree?.sections.find(item => item.anchor === chosen.anchor);
    // A section the model named that is not in that tree, or one already given, is left out: what comes back can be read.
    if (!tree || !section || sections.some(item => sameSubject(item.subject, tree.subject) && item.anchor === section.anchor)) continue;
    sections.push({ subject: tree.subject, ref: knowledgeRef(tree.subject, "allow"), revision: tree.revision, anchor: section.anchor, title: section.title, line: section.line, reason: String(chosen.reason ?? "").slice(0, REASON_CHARS) });
    if (sections.length === MAX_SECTIONS) break;
  }
  await current();
  assertCurrent();
  return { sections, unread, unsummarized };
}
