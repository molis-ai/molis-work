import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginModelClient, PluginModelFailure, PluginModelImage } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { BoundedInferenceReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ShelfAiPorts, ShelfAiStatus, ShelfExecutionControl, ShelfMaterialPorts, ShelfModelSelection } from "@molis-ai/molis-work-module-shelf/contract";
import { finalizeShelfRecipeResult, isShelfFailure, resolvedChoiceId, shelfErrors, type ShelfFailure } from "@molis-ai/molis-work-module-shelf";
import { shelfInstruction } from "./prompts.js";

const unavailable = () => shelfErrors.no_model("请在设置中配置 AI 模型，再为置物架选择可用模型");
const configurationChanged = () => shelfErrors.configuration_changed("生成期间模型或连接已变化，结果未保存");
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif"]);
const originalImages = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const MAX_IMAGES = 50;

/** A model binding that changed under the call is Shelf's own refusal: the store then keeps no result and no failure row. */
function shelfBinding(validate?: () => void): () => void {
  return () => {
    try { validate?.(); }
    catch (error) {
      if (error instanceof ActionError && error.code === "actions.configuration_changed") throw configurationChanged();
      throw error;
    }
  };
}

/** Recipes run on the Host's model service; the frozen copies are read through Shelf's own files, never a real path. */
export function shelfAiPorts(model: PluginModelClient, materials: ShelfMaterialPorts): ShelfAiPorts {
  const status = (selection?: ShelfModelSelection | null): ShelfAiStatus => {
    const choices = model.choices().map(({ provider_id, model_id, label, vision }) => ({ provider_id, model_id, label, vision }));
    const selected = selection ? choices.find(choice => choice.provider_id === selection.provider_id && choice.model_id === selection.model_id) : choices[0];
    const state = model.availability(selection ?? undefined);
    return { choices, available: !!selected && state.available, selected: selected ? { provider_id: selected.provider_id, model_id: selected.model_id } : null,
      reason: state.available && selected ? null : state.available ? unavailable().message : state.reason };
  };
  return { status, async generate(input, control) {
    let validateBinding = () => {};
    const check = async () => { control.signal?.throwIfAborted(); await control.beforeEffect?.(); control.signal?.throwIfAborted(); validateBinding(); };
    await check();
    if (!status(input.selection).available) throw unavailable();
    const { text, images, coverage } = await prepareSources(input, materials, control, check);
    await check();
    const data = JSON.stringify({ recipe: input.recipe, option: input.option_id,
      ...(input.shortcut_prompt ? { user_instruction: input.shortcut_prompt } : {}), materials: text, images: images.map(image => image.label), coverage });
    if (data.length > 180_000) throw shelfErrors.too_large("材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
    const json = input.recipe === "extract_structure" && resolvedChoiceId(input.recipe, input.option_id) === "json";
    let execution: BoundedInferenceReceipt | undefined;
    try {
      const result = await model.complete(instructed(shelfInstruction(input.recipe, input.option_id), data), { selection: input.selection,
        signal: control.signal, images, timeout_ms: 600_000, max_output_tokens: 12_000, output: json ? "json" : "text" });
      execution = result.execution;
      const validateResult = shelfBinding(result.validateResult);
      validateBinding = validateResult;
      await check();
      const output = finalizeShelfRecipeResult(input.recipe, input.option_id, result.text, () => ({ ok: true, value: result.value }), coverage);
      return { text: output, ...(execution ? { execution } : {}), coverage, validateResult };
    } catch (error) {
      if (error instanceof ActionError && error.code === "actions.configuration_changed") throw configurationChanged();
      const source = error as PluginModelFailure;
      if (source?.validateResult) validateBinding = shelfBinding(source.validateResult);
      await check();
      const failure: ShelfFailure = isShelfFailure(error) ? error
        : error instanceof ActionError && error.code === "plugin.model_output_invalid" ? shelfErrors.invalid_result("结构化结果必须是 JSON 对象")
          : shelfErrors.job_failed(error instanceof Error ? error.message : "AI 生成失败");
      failure.execution = source?.execution ?? execution;
      throw failure;
    }
  } };
}

type SourceText = { source: string; text: string };

async function prepareSources(input: Parameters<ShelfAiPorts["generate"]>[0], materials: ShelfMaterialPorts,
  control: ShelfExecutionControl, check: () => Promise<void>): Promise<{ text: SourceText[]; images: PluginModelImage[]; coverage: string[] }> {
  const { files, root } = input, text: SourceText[] = [], images: PluginModelImage[] = [], coverage: string[] = [];
  let totalBytes = 0, characters = 0;
  const read = (relative: string, display: string) => {
    const bytes = files.read(`${root}/${relative}`);
    if (!bytes) throw shelfErrors.path_invalid(`材料路径已改变：${display}`);
    return bytes;
  };
  const visit = async (relative: string, display: string, kind?: string, mime?: string): Promise<void> => {
    await check();
    const stat = files.stat(`${root}/${relative}`);
    if (!stat) throw shelfErrors.path_invalid("材料路径已改变");
    if (stat.kind === "directory") {
      const entries = files.list(`${root}/${relative}`).map(entry => entry.name).sort();
      if (!entries.length) text.push({ source: display, text: "（空文件夹）" });
      for (const entry of entries) await visit(`${relative}/${entry}`, `${display}/${entry}`);
      return;
    }
    totalBytes += stat.byte_length;
    if (stat.byte_length > 32 * 1024 * 1024 || totalBytes > 128 * 1024 * 1024) throw shelfErrors.too_large("单份材料上限 32 MB，本次材料总量上限 128 MB");
    const extension = path.posix.extname(relative).toLowerCase();
    if (kind === "image" || imageExtensions.has(extension) || mime?.startsWith("image/")) {
      if (!originalImages.has(extension) && !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime ?? "")) throw shelfErrors.image_unsupported(`暂不支持 ${display} 的原图格式；请转为 PNG、JPEG、GIF 或 WebP`);
      if (images.length >= MAX_IMAGES) throw shelfErrors.too_large(`一次最多处理 ${MAX_IMAGES} 张图片，请减少选择`);
      images.push({ bytes: read(relative, display), label: display });
      return;
    }
    const bytes = read(relative, display);
    if (!materials.extract) throw shelfErrors.extraction_unavailable("材料提取服务不可用");
    let content: string;
    if (kind === "pdf" || extension === ".pdf" || extension === ".html" || extension === ".htm") {
      const extracted = await materials.extract({ file_name: kind === "pdf" ? "source.pdf" : path.posix.basename(relative), bytes },
        { signal: control.signal, pdfMode: "text", textFormat: "markdown", timeoutMs: 60_000, limits: { maxBytes: 32 * 1024 * 1024 } });
      await check();
      if (extracted.coverage.status !== "sufficient" || extracted.coverage.truncated) coverage.push(`${display}：${extracted.coverage.status}，${extracted.coverage.processed_pages}/${extracted.coverage.total_pages} 页；${extracted.coverage.issues.join("；")}`);
      content = extracted.text;
      if (!content.trim()) throw shelfErrors.no_text(`${display} 没有可提取的正文，请先识别文字或使用人工终端处理`);
    } else {
      // Generic source files use the same strict text decoder (including BOM support), not a second parser.
      const extracted = await materials.extract({ file_name: "source.txt", bytes }, {
        signal: control.signal, textFormat: "text", timeoutMs: 60_000,
        limits: { maxBytes: 32 * 1024 * 1024, maxCharacters: 175_000 },
      });
      await check();
      if (extracted.coverage.truncated) throw shelfErrors.too_large("材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
      content = extracted.text;
    }
    characters += content.length + display.length;
    if (characters > 175_000) throw shelfErrors.too_large("材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
    text.push({ source: display, text: content });
  };
  for (const source of input.sources) await visit(source.relative_path, source.name, source.kind, source.mime);
  return { text, images, coverage };
}
