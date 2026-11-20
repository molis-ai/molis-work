import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { ActionError, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  ONBOARDING_DOCUMENTS_INPUT_SCHEMA, ONBOARDING_DOCUMENTS_RESULT_SCHEMA, type OnboardingDocumentsInput, type OnboardingDocumentsResult,
} from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import { MAX_BODY_CHARS } from "./document.js";
import { pagesErrors } from "./error.js";
import { PAGES_SUBJECT_KIND } from "./presentation.js";
import type { PagesBody } from "./contract.js";

/**
 * Pages keeps a text the platform hands over as documents (specs/plugin-equal-standing/contract-design.md §2.5): onboarding's
 * materials and its summary, a project's automation report. The platform hands each one over by the `documents` intake and names no plugin. A long material is cut into parts here, as the Host cut it before: 400,000
 * units a part, a part whose body is too large halved until it fits. Part k of n is imported as `<request_id>:k` (one part keeps the id
 * itself) with the hash as given, so a retry finds the same documents and a document imported before this move is found again.
 */
export const pagesOnboardingDocuments = createActionDefinition<InferActionInput<typeof ONBOARDING_DOCUMENTS_INPUT_SCHEMA>, OnboardingDocumentsResult>("pages.onboarding.documents", "command", {
  title: "保存文档", description: "把平台交来的一份文字（上手时的材料与工作摘要、项目自动化建议的报告）存成文档；太长时分成几篇，重试返回同样的文档",
  audiences: ["user"], permissions: ["pages:write"], subject_kinds: [PAGES_SUBJECT_KIND],
  input_schema: ONBOARDING_DOCUMENTS_INPUT_SCHEMA, output_schema: ONBOARDING_DOCUMENTS_RESULT_SCHEMA,
  intake: { intake_id: "onboarding.documents", item_kind: PAGES_SUBJECT_KIND, accepts: [{ kind: "documents" }] },
}, /* @version action.pages.onboarding.documents */ 1);

const PART_UNITS = 400_000;
const TITLE_MAX = 80;

/** Where the part that starts at `offset` ends: at a line break in its second half, else at `size` units without splitting a character. */
function partEnd(text: string, offset: number, size: number): number {
  const end = Math.min(offset + size, text.length);
  const line = end < text.length ? text.lastIndexOf("\n", end - 1) : -1;
  return line >= offset + size / 2 ? line + 1 : cutHead(text, end).length;
}

function split(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < text.length;) {
    const end = partEnd(text, offset, size);
    parts.push(text.slice(offset, end));
    offset = end;
  }
  return parts;
}

/** The bodies of a text: each part converted, a part too large for one document halved until it fits. */
function bodies(convert: (markdown: string) => PagesBody, text: string): PagesBody[] {
  const out: PagesBody[] = [];
  const add = (part: string): void => {
    let body: PagesBody | null = null;
    try { body = convert(part); }
    catch (error) { if ((error as { code?: unknown }).code !== "pages.body_too_large" || part.length < 2) throw error; }
    if (body && (part.length < 2 || JSON.stringify(body).length <= MAX_BODY_CHARS)) { out.push(body); return; }
    const half = cutHead(part, Math.ceil(part.length / 2)).length;
    add(part.slice(0, half)); add(part.slice(half));
  };
  for (const part of split(text, PART_UNITS)) add(part);
  return out;
}

/** A part's title: the name cut to fit, then which part it is, so the cut never takes the part number; counted in whole characters. */
function partTitle(title: string, part: number, parts: number): string {
  const suffix = parts > 1 ? t.text("pages.onboarding.part-k-n", { k: part, n: parts }) : "";
  const characters = [...title], room = TITLE_MAX - [...suffix].length;
  return (characters.length <= room ? title : characters.slice(0, room - 1).join("") + "…") + suffix;
}

/** What one call writes: the bodies of the text (an empty one is one blank paragraph) and the import of each as its own request. */
export async function importOnboardingDocuments(input: OnboardingDocumentsInput, ports: {
  convert(markdown: string): PagesBody;
  importPart(request_id: string, request_hash: string, document: { title: string; body: PagesBody }): Promise<{ id: string; title: string }>;
}): Promise<OnboardingDocumentsResult> {
  if (!input.title.trim()) throw pagesErrors.invalid("材料需要标题");
  const parts = input.markdown ? bodies(ports.convert, input.markdown) : [{ type: "doc", content: [{ type: "paragraph" }] } as PagesBody];
  if (!parts.length) throw new ActionError("actions.input_invalid", "材料没有可以保存的正文");
  const out: OnboardingDocumentsResult["parts"][number][] = [];
  for (const [index, body] of parts.entries()) {
    const request_id = input.request_id + (parts.length > 1 ? ":" + (index + 1) : "");
    const made = await ports.importPart(request_id, input.request_hash, { title: partTitle(input.title, index + 1, parts.length), body });
    out.push({ subject: { kind: PAGES_SUBJECT_KIND, id: made.id }, open: { surface: "pages", id: made.id, title: input.title } });
  }
  return { parts: out };
}
