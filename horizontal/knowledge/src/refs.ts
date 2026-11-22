import { createHash } from "node:crypto";
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  knowledgeRefFromDigestHex,
  knowledgeSubjectHashInput,
  type KnowledgeCardStorePort,
  type KnowledgePieceName,
} from "@molis-ai/molis-work-contracts/services/knowledge";
import { WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { knowledgeErrors } from "./errors.js";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";

/**
 * A piece's ref (specs/project-knowledge §6.4, PMAT-39): `k` and the first seven hex digits of its subject's hash. The same piece
 * always has the same ref, so an agent copies seven characters instead of a subject whose id may itself be JSON. Workspace files
 * are named by their path and have none.
 */
export function knowledgeRef(subject: ActionSubject): string;
export function knowledgeRef(subject: ActionSubject, workspace: "allow"): string | null;
export function knowledgeRef(subject: ActionSubject, workspace?: "allow"): string | null {
  if (workspace && subject.kind === WORKSPACE_FILE_SUBJECT_KIND) return null;
  return knowledgeRefFromDigestHex(createHash("sha256").update(knowledgeSubjectHashInput(subject)).digest("hex"));
}

/** The pieces a call names, each by its subject or its ref; a ref is looked up among the project's cards. */
export function namedSubjects(cards: Pick<KnowledgeCardStorePort, "list">, project: string, named: readonly KnowledgePieceName[] = []): ActionSubject[] {
  let byRef: Map<string, ActionSubject> | null = null;
  return named.map(name => {
    if (typeof name !== "string") return name;
    byRef ??= new Map(cards.list(project).map(card => [knowledgeRef(card.subject), card.subject]));
    const subject = byRef.get(name.trim().toLowerCase());
    if (!subject) throw knowledgeErrors.unknown(`项目资料里没有编号为 ${JSON.stringify(cutHead(name, 20))} 的资料：ref 照抄目录、knowledge.list、search 或 grep 给的那一个`);
    return subject;
  });
}

/** The one piece a call names, by its subject or its ref. */
export function namedSubject(cards: Pick<KnowledgeCardStorePort, "list">, project: string, name: KnowledgePieceName): ActionSubject {
  return namedSubjects(cards, project, [name])[0]!;
}
