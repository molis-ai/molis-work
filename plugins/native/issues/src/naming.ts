import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { fencedMaterials, instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginModelClient, PluginModelImage } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IssueImage } from "./images.js";
import { ISSUES_NAME } from "./prompts.js";
import { ISSUE_TYPES, type IssueType } from "./store.js";

export const issueNamingErrors = defineErrorCodes("issues", { model_reply_invalid: "upstream" });

export type IssueNaming = { status: "named"; title: string; type: IssueType } | { status: "needs_input"; question: string };
export interface IssueNamingInput { description: string; images?: readonly IssueImage[]; page?: { title: string | null } | null }

// Within the page's own wait, so the action answers before the page gives up on it.
const TIMEOUT_MS = 90_000, OUTPUT_TOKENS = 4_000;

const bytes = (image: IssueImage, index: number): PluginModelImage => {
  const binary = atob(image.data_url.slice(image.data_url.indexOf(",") + 1));
  return { bytes: Uint8Array.from(binary, char => char.charCodeAt(0)), label: `截图 ${index + 1}` };
};

/** What the person sees when there are screenshots, no words, and the model in use does not declare that it reads images: nothing can be named from nothing. */
export const ISSUE_SCREENSHOTS_UNREAD = "当前模型未声明能看图或已设为不能看图，截图没有交给它；写一句话再整理，或在设置 → 模型 → 供应商的模型列表中将读图能力设为能看图并保存";

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u;
/** The language the title is written in, decided here from the person's words (never left for the model to guess): English for words with Latin letters and no CJK, Chinese otherwise. */
export const titleLanguage = (description: string): "zh" | "en" => !CJK.test(description) && /[A-Za-z]/.test(description) ? "en" : "zh";

const line = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && [...value.trim()].length <= max && !/[\r\n]/.test(value.trim());

/** The model's answer as Issue accepts it; anything else is refused, never repaired into a record. */
export function issueNaming(value: unknown): IssueNaming {
  const reply = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (reply.status === "named" && line(reply.title, 200) && ISSUE_TYPES.includes(reply.type as IssueType)) return { status: "named", title: reply.title.trim(), type: reply.type as IssueType };
  if (reply.status === "needs_input" && line(reply.question, 200)) return { status: "needs_input", question: reply.question.trim() };
  throw issueNamingErrors.model_reply_invalid("模型没有给出可用的标题和类型，点开补全后保存");
}

/**
 * One bounded call to the Host's text model for a title and a type (ISSUE-50, ISSUE-51). The words and screenshots go as
 * data after Issue's own instruction; screenshots only when the model this call uses declares that it reads images, and
 * with screenshots but no words that the model cannot read, the one question comes back without asking it.
 * Nothing here writes: a caller that saves runs `validate()` (the model service's own recheck) inside its write.
 */
export async function nameIssue(model: PluginModelClient | undefined, input: IssueNamingInput, signal: AbortSignal | undefined): Promise<{ naming: IssueNaming; validate: () => void }> {
  const state = model?.availability();
  if (!model || !state?.available) throw new ActionError("actions.connection_required", state && !state.available ? state.reason : "请先在「模型设置」里连接文字模型");
  // Screenshots that cannot be handed over and no words to go by: the model is not asked, and the person is told why and what to do.
  if (state.vision !== true && input.images?.length && !input.description.trim()) return { naming: { status: "needs_input", question: ISSUE_SCREENSHOTS_UNREAD }, validate: () => {} };
  const images = state.vision === true ? (input.images ?? []).map(bytes) : [];
  const data = { description: input.description, page: input.page?.title ?? null, title_language: titleLanguage(input.description), screenshots: { count: input.images?.length ?? 0, attached: images.length > 0 } };
  const result = await model.complete(instructed(ISSUES_NAME, fencedMaterials(data, "ISSUE_" + crypto.randomUUID().replaceAll("-", ""))),
    { output: "json", ...(images.length ? { images } : {}), ...(signal ? { signal } : {}), timeout_ms: TIMEOUT_MS, max_output_tokens: OUTPUT_TOKENS });
  return { naming: issueNaming(result.value), validate: () => result.validateResult() };
}
