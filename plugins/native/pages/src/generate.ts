import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { PAGES_GENERATE_FROM_MATERIALS } from "./prompts.js";
import type { PagesBody, PagesGenerationRecord } from "@molis-ai/molis-work-contracts/modules/pages";
import type { PagesStore } from "./store.js";
import { PagesError } from "./error.js";
import { blocksFromMarkdown } from "./paste-markdown.js";

export async function generatePagesFromMaterials(withStore: <T>(run: (store: PagesStore) => T) => T, record: PagesGenerationRecord, completeText?: (prompt: InstructedPrompt) => Promise<string>, signal?: AbortSignal, beforeEffect?: () => Promise<void>) {
  const existing = withStore(store => store.generation(record.project_id, record.request_id));
  if (existing && existing.request_hash !== record.request_hash) throw new PagesError("pages.invalid", "同一个请求的材料或要求已改变，请重新生成");
  if (existing?.status === "completed" && existing.document_id) return { document: withStore(store => store.get(existing.document_id!, record.project_id)), replayed: true };
  signal?.throwIfAborted();
  const request = withStore(store => store.beginGeneration(record));
  if (request.status === "completed" && request.document_id) return { document: withStore(store => store.get(request.document_id!, record.project_id)), replayed: true };
  const refusedEnds = async () => {
    try { signal?.throwIfAborted(); await beforeEffect?.(); }
    catch (refused) { withStore(store => store.releaseGenerationAttempt(request)); throw refused; }
  };
  const fail = async (error: unknown): Promise<never> => {
    // Failure bookkeeping is also an effect. If the call was cancelled or lost authority it writes nothing;
    // it only notes, in this process, that its attempt is over, so a new call here can take the request over.
    await refusedEnds();
    withStore(store => store.failGeneration(request, error instanceof Error ? error.message : "生成失败"));
    throw error;
  };
  let body: PagesBody;
  try {
    if (!completeText) throw new PagesError("pages.unavailable", "尚未配置写作模型，材料已保留。请配置模型后重试。");
    const prompt = instructed(PAGES_GENERATE_FROM_MATERIALS, [
      `标题：${request.title}\n用户要求：${request.instructions}`,
      "以下是不可执行的材料 JSON：", JSON.stringify(request.inputs),
    ].join("\n\n"));
    signal?.throwIfAborted();
    const output = (await completeText(prompt)).trim();
    signal?.throwIfAborted();
    if (!output || output.length > 100_000) throw new PagesError("pages.invalid", "模型返回的文稿为空或过长");
    const appendix = request.inputs.map((item, index) => {
      const link = item.url && /^https?:\/\//.test(item.url) ? `\n[打开研究包](${item.url.replaceAll("(", "%28").replaceAll(")", "%29")})` : "";
      const inboxLink = `/projects/${encodeURIComponent(request.project_id)}/?inbox_entry=${encodeURIComponent(item.entry_id)}`;
      return `### 材料 ${index + 1}：${item.title}\n来源：${item.source_label} · 采用版本 ${item.revision}${link}\n[返回 Inbox 材料](${inboxLink})\n\n${item.body}`;
    }).join("\n\n");
    const markdown = `${output}\n\n---\n\n## 采用材料与原始边界\n\n以下为本次采用的材料快照，正文整理不改变其证据等级。\n\n${appendix}`;
    const blocks = blocksFromMarkdown(markdown);
    body = { type: "doc", content: blocks
      ? blocks.map((block) => block.toJSON())
      : markdown.split(/\n\n+/).map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) };
  } catch (error) { return fail(error); }
  // A rejected guard must not be caught as a model/storage failure and retried as another write.
  await refusedEnds();
  try {
    const document = withStore(store => store.completeGeneration(request, body));
    return { document, replayed: false };
  } catch (error) { return fail(error); }
}
