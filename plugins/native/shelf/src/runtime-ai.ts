import path from "node:path";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginMaterialsClient, PluginModelClient, PluginModelFailure, PluginModelResult, PluginModelImage, PluginOwnerFilesClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ShelfAiPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import { finalizeShelfRecipeResult, isShelfFailure, shelfErrors } from "@molis-ai/molis-work-module-shelf";
import { shelfInstruction } from "./prompts.js";

const unavailable = () => shelfErrors.no_model("请在设置中配置 AI 模型，再为置物架选择可用模型");

/** The plugin reads its declared copies; credentials, decoding and cancellation stay in the public services. */
export function shelfRuntimeAi(files: PluginOwnerFilesClient, model: PluginModelClient, materials: PluginMaterialsClient): ShelfAiPorts {
  const status: ShelfAiPorts["status"] = selection => {
    const choices = model.choices(), selected = selection ? choices.find(item => item.provider_id === selection.provider_id && item.model_id === selection.model_id) : choices[0];
    const state = model.availability(selection ?? undefined);
    return { choices, available: Boolean(selected) && state.available, selected: selected ? { provider_id: selected.provider_id, model_id: selected.model_id } : null,
      reason: state.available && selected ? null : state.available ? unavailable().message : state.reason };
  };
  return { status, async generate(input, control) {
    const check = async () => { control.signal?.throwIfAborted(); await control.beforeEffect?.(); control.signal?.throwIfAborted(); };
    await check();
    if (!status(input.selection).available) throw unavailable();
    const prepared = await prepareSources(files, materials, input, control.signal, check);
    const data = JSON.stringify({ recipe: input.recipe, option: input.option_id,
      ...(input.shortcut_prompt ? { user_instruction: input.shortcut_prompt } : {}), materials: prepared.text,
      images: prepared.images.map(image => image.label), coverage: prepared.coverage });
    if (data.length > 180_000) throw shelfErrors.too_large("材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
    const json = input.recipe === "extract_structure" && input.option_id === "json";
    let result: PluginModelResult | undefined;
    try {
      result = await model.complete(instructed(shelfInstruction(input.recipe, input.option_id), data), {
        selection: input.selection, images: prepared.images, signal: control.signal, output: json ? "json" : "text", timeout_ms: 600_000, max_output_tokens: 12_000 });
      await check(); result.validateResult();
      const value = result.value;
      return { text: finalizeShelfRecipeResult(input.recipe, input.option_id, result.text, () => ({ ok: true, value }), prepared.coverage),
        execution: result.execution, coverage: prepared.coverage, validateResult: result.validateResult };
    } catch (error) {
      await check();
      const source = error instanceof Error ? error as PluginModelFailure : undefined;
      const failure = isShelfFailure(error) ? error : shelfErrors.job_failed(error instanceof Error ? error.message : "AI 生成失败");
      throw Object.assign(failure, { execution: source?.execution ?? result?.execution, validateResult: source?.validateResult ?? result?.validateResult });
    }
  } };
}

async function prepareSources(files: PluginOwnerFilesClient, materials: PluginMaterialsClient, input: Parameters<ShelfAiPorts["generate"]>[0],
  signal: AbortSignal | undefined, check: () => Promise<void>) {
  const root = path.relative(files.rootPath(), input.root).split(path.sep).join("/");
  const text: { source: string; text: string }[] = [], images: PluginModelImage[] = [], coverage: string[] = [];
  let totalBytes = 0, characters = 0;
  const visit = async (relative: string, display: string, kind?: string, mime?: string): Promise<void> => {
    await check();
    const file = `${root}/${relative}`, stat = files.stat(file);
    if (!stat) throw shelfErrors.invalid_file(`无法读取材料：${display}`);
    if (stat.kind === "directory") {
      const entries = files.list(file);
      if (!entries.length) text.push({ source: display, text: "（空文件夹）" });
      for (const entry of entries) await visit(`${relative}/${entry.name}`, `${display}/${entry.name}`);
      return;
    }
    totalBytes += stat.byte_length;
    if (stat.byte_length > 32 * 1024 * 1024 || totalBytes > 128 * 1024 * 1024) throw shelfErrors.too_large("单份材料上限 32 MB，本次材料总量上限 128 MB");
    const bytes = files.read(file);
    if (!bytes) throw shelfErrors.invalid_file(`无法读取材料：${display}`);
    const extension = path.extname(relative).toLowerCase();
    if (kind === "image" || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif"].includes(extension) || mime?.startsWith("image/")) {
      if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extension) && !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime ?? "")) throw shelfErrors.image_unsupported(`暂不支持 ${display} 的原图格式；请转为 PNG、JPEG、GIF 或 WebP`);
      images.push({ bytes, label: display }); return;
    }
    if (!materials.extract) throw shelfErrors.extraction_unavailable("材料提取服务不可用");
    const document = kind === "pdf" || [".pdf", ".html", ".htm"].includes(extension);
    const extracted = await materials.extract({ file_name: document ? relative : "source.txt", bytes }, {
      signal, pdfMode: "text", textFormat: document ? "markdown" : "text", timeoutMs: 60_000,
      limits: { maxBytes: 32 * 1024 * 1024, ...(!document ? { maxCharacters: 175_000 } : {}) } });
    await check();
    if (document) {
      if (extracted.coverage.status !== "sufficient" || extracted.coverage.truncated) coverage.push(`${display}：${extracted.coverage.status}，${extracted.coverage.processed_pages}/${extracted.coverage.total_pages} 页；${extracted.coverage.issues.join("；")}`);
      if (!extracted.text.trim()) throw shelfErrors.no_text(`${display} 没有可提取的正文，请先识别文字或使用人工终端处理`);
    } else if (extracted.coverage.truncated) throw shelfErrors.too_large("材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
    characters += extracted.text.length + display.length;
    if (characters > 175_000) throw shelfErrors.too_large("材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
    text.push({ source: display, text: extracted.text });
  };
  for (const source of input.sources) await visit(source.relative_path, source.name, source.kind, source.mime);
  return { text, images, coverage };
}
