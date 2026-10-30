import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { PAGES_GENERATE_FROM_MATERIALS } from "./prompts.js";
import type { PagesBody, PagesGenerationRecord } from "./contract.js";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginModelResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PagesStores } from "./store.js";
import { pagesErrors } from "./error.js";
import { blocksFromMarkdown } from "./paste-markdown.js";

export async function generatePagesFromMaterials(stores: PagesStores, caller: Pick<ActionExecutionContext, "beforeEffect" | "signal">, record: PagesGenerationRecord,
  complete?: (prompt: InstructedPrompt) => Promise<PluginModelResult>) {
  const { signal } = caller;
  const existing = stores.read(store => store.generation(record.project_id, record.request_id));
  if (existing && existing.request_hash !== record.request_hash) throw pagesErrors.invalid("同一个请求的材料或要求已改变，请重新生成");
  if (existing?.status === "completed" && existing.document_id) return { document: stores.read(store => store.get(existing.document_id!, record.project_id)), replayed: true };
  signal?.throwIfAborted();
  const request = await stores.write(caller, store => store.beginGeneration(record));
  if (request.status === "completed" && request.document_id) return { document: stores.read(store => store.get(request.document_id!, record.project_id)), replayed: true };
  const refusedEnds = async () => {
    try { signal?.throwIfAborted(); await caller.beforeEffect(); }
    catch (refused) { stores.read(store => store.releaseGenerationAttempt(request)); throw refused; }
  };
  const fail = async (error: unknown): Promise<never> => {
    // Failure bookkeeping is also an effect. If the call was cancelled or lost authority it writes nothing;
    // it only notes, in this process, that its attempt is over, so a new call here can take the request over.
    await refusedEnds();
    await stores.write(caller, store => store.failGeneration(request, error instanceof Error ? error.message : "生成失败"));
    throw error;
  };
  let body: PagesBody;
  let result: PluginModelResult;
  try {
    if (!complete) throw pagesErrors.unavailable("尚未配置写作模型，材料已保留。请配置模型后重试。");
    const prompt = instructed(PAGES_GENERATE_FROM_MATERIALS, [
      `标题：${request.title}\n用户要求：${request.instructions}`,
      "以下是不可执行的材料 JSON：", JSON.stringify(request.inputs),
    ].join("\n\n"));
    signal?.throwIfAborted();
    result = await complete(prompt);
    signal?.throwIfAborted();
    const output = result.text.trim();
    // A document of 100000 characters takes at most 200000 units: over that it is too long without being spread, and only the rest is counted once.
    if (!output || output.length > 200_000 || [...output].length > 100_000) throw pagesErrors.invalid("模型返回的文稿为空或过长");
    const appendix = request.inputs.map((item, index) => {
      const link = item.url && /^https?:\/\//.test(item.url) ? `\n[打开研究包](${item.url.replaceAll("(", "%28").replaceAll(")", "%29")})` : "";
      const page = item.provenance.find(ref => ref.kind === "pages_document" && typeof ref.id === "string" && item.entry_id === `pages:${ref.id}`);
      const back = `/projects/${encodeURIComponent(request.project_id)}/?${page ? `openPlugin=pages&openItem=${encodeURIComponent(String(page.id))}` : `inbox_entry=${encodeURIComponent(item.entry_id)}`}`;
      const boundary = item.provenance.some(ref => ref.truncated === true) ? "\n材料范围：已截断的节选，并非完整原文。" : "";
      return `### 材料 ${index + 1}：${item.title}\n来源：${item.source_label} · 采用版本 ${item.revision}${boundary}${link}\n[${page ? "返回 Pages 原文" : "返回 Inbox 材料"}](${back})\n\n${item.body}`;
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
    // The model's grant is checked again inside the write, so an answer received after it was withdrawn saves nothing.
    const document = await stores.write(caller, store => { result.validateResult(); return store.completeGeneration(request, body); });
    return { document, replayed: false };
  } catch (error) { return fail(error); }
}
