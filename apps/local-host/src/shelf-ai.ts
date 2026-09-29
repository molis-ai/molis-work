import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { BoundedInferenceReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ShelfAiPorts, ShelfExecutionControl, ShelfMaterialPorts, ShelfModelSelection } from "@molis-ai/molis-work-contracts/modules/shelf";
import { ShelfError, finalizeShelfRecipeResult } from "@molis-ai/molis-work-module-shelf";
import { SHELF_PLUGIN_ID, shelfInstruction } from "@molis-ai/molis-work-plugin-shelf";
import { decodePrologueJsonOutput, PrologueInferenceError, type PrologueInputImage } from "@molis-ai/molis-work-service-agent-host";
import { configuredModelChoices, configuredTextModelSnapshot } from "./configured-models.js";
import { hostTextGeneration } from "./host-complete-text.js";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";

const unavailable = () => new ShelfError("shelf.no_model", "请在设置中配置 AI 模型，再为置物架选择可用模型");
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif"]);
const originalImages = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** Material IO and model credentials stay in the Home Host. The Shelf owns jobs and saved results. */
export function shelfAiPorts(home: string, materials: ShelfMaterialPorts): ShelfAiPorts {
  const status = (selection?: ShelfModelSelection | null) => {
    const choices = configuredModelChoices(home);
    const selected = selection ? choices.find(choice => choice.provider_id === selection.provider_id && choice.model_id === selection.model_id) : choices[0];
    return { choices, available: !!selected, selected: selected ? { provider_id: selected.provider_id, model_id: selected.model_id } : null,
      reason: selected ? null : unavailable().message };
  };
  return { status, async generate(input, control) {
    let validateBinding = () => {};
    const check = async () => { control.signal?.throwIfAborted(); await control.beforeEffect?.(); control.signal?.throwIfAborted(); validateBinding(); };
    await check();
    const selected = status(input.selection);
    if (!selected.available) throw unavailable();
    const binding = JSON.stringify(configuredTextModelSnapshot(home, input.selection));
    const validateResult = () => {
      if (JSON.stringify(configuredTextModelSnapshot(home, input.selection)) !== binding) throw new ShelfError("shelf.configuration_changed", "生成期间模型或连接已变化，结果未保存");
    };
    validateBinding = validateResult;
    const generate = hostTextGeneration({ homeDirectory: home, selection: input.selection });
    if (!generate) throw unavailable();
    const { text, images, coverage } = await prepareSources(input, materials, control, check);
    await check();
    validateResult();
    // Resolve only after the original invocation is still valid: this records prompt usage.
    const system = resolveModelPrompt(home, instructed(shelfInstruction(input.recipe, input.option_id), ""), SHELF_PLUGIN_ID);
    const data = JSON.stringify({ recipe: input.recipe, option: input.option_id,
      ...(input.shortcut_prompt ? { user_instruction: input.shortcut_prompt } : {}), materials: text, images: images.map(image => image.label), coverage });
    if (data.length > 180_000) throw new ShelfError("shelf.too_large", "材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
    let execution: BoundedInferenceReceipt | undefined;
    try {
      const result = await generate(data, { system, images, signal: control.signal, beforeDispatch: check, timeoutMs: 600_000, maxOutputTokens: 12_000 });
      execution = { run_ref: result.run_ref, state: result.state, configuredModel: result.configuredModel, reportedModels: result.reportedModels, usage: result.usage };
      await check();
      const output = finalizeShelfRecipeResult(input.recipe, input.option_id, result.value,
        text => decodePrologueJsonOutput(text, { allowCodeFence: true }), coverage);
      return { text: output, execution, coverage, validateResult };
    } catch (error) {
      await check();
      const failure = error instanceof ShelfError ? error : new ShelfError("shelf.job_failed", error instanceof Error ? error.message : "AI 生成失败");
      failure.execution = error instanceof PrologueInferenceError ? error.execution : execution;
      throw failure;
    }
  } };
}

async function prepareSources(input: Parameters<ShelfAiPorts["generate"]>[0], materials: ShelfMaterialPorts,
  control: ShelfExecutionControl, check: () => Promise<void>): Promise<{ text: { source: string; text: string }[]; images: PrologueInputImage[]; coverage: string[] }> {
  const root = realpathSync(input.root), text: { source: string; text: string }[] = [], images: PrologueInputImage[] = [], coverage: string[] = [];
  let totalBytes = 0, characters = 0;
  const visit = async (relative: string, display: string, kind?: string, mime?: string): Promise<void> => {
    await check();
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`) || lstatSync(file).isSymbolicLink() || realpathSync(file) !== file) throw new ShelfError("shelf.path_invalid", "材料路径已改变");
    const stat = lstatSync(file);
    if (stat.isDirectory()) {
      const entries = readdirSync(file).sort();
      if (!entries.length) text.push({ source: display, text: "（空文件夹）" });
      for (const entry of entries) await visit(path.join(relative, entry), `${display}/${entry}`);
      return;
    }
    if (!stat.isFile()) throw new ShelfError("shelf.invalid_file", `无法读取材料：${display}`);
    totalBytes += stat.size;
    if (stat.size > 32 * 1024 * 1024 || totalBytes > 128 * 1024 * 1024) throw new ShelfError("shelf.too_large", "单份材料上限 32 MB，本次材料总量上限 128 MB");
    const extension = path.extname(file).toLowerCase();
    if (kind === "image" || imageExtensions.has(extension) || mime?.startsWith("image/")) {
      if (!originalImages.has(extension) && !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime ?? "")) throw new ShelfError("shelf.image_unsupported", `暂不支持 ${display} 的原图格式；请转为 PNG、JPEG、GIF 或 WebP`);
      images.push({ root_path: root, relative_path: relative, label: display });
      return;
    }
    const bytes = readFileSync(file);
    let content: string;
    if (kind === "pdf" || extension === ".pdf" || extension === ".html" || extension === ".htm") {
      if (!materials.extract) throw new ShelfError("shelf.extraction_unavailable", "材料提取服务不可用");
      const extracted = await materials.extract({ file_name: kind === "pdf" ? "source.pdf" : file, bytes },
        { signal: control.signal, pdfMode: "text", textFormat: "markdown", timeoutMs: 60_000, limits: { maxBytes: 32 * 1024 * 1024 } });
      await check();
      if (extracted.coverage.status !== "sufficient" || extracted.coverage.truncated) coverage.push(`${display}：${extracted.coverage.status}，${extracted.coverage.processed_pages}/${extracted.coverage.total_pages} 页；${extracted.coverage.issues.join("；")}`);
      content = extracted.text;
      if (!content.trim()) throw new ShelfError("shelf.no_text", `${display} 没有可提取的正文，请先识别文字或使用人工终端处理`);
    } else {
      if (!materials.extract) throw new ShelfError("shelf.extraction_unavailable", "材料提取服务不可用");
      // Generic source files use the same strict text decoder (including BOM support), not a second parser.
      const extracted = await materials.extract({ file_name: "source.txt", bytes }, {
        signal: control.signal, textFormat: "text", timeoutMs: 60_000,
        limits: { maxBytes: 32 * 1024 * 1024, maxCharacters: 175_000 },
      });
      await check();
      if (extracted.coverage.truncated) throw new ShelfError("shelf.too_large", "材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
      content = extracted.text;
    }
    characters += content.length + display.length;
    if (characters > 175_000) throw new ShelfError("shelf.too_large", "材料超过本次 AI 输入容量，请减少选择或先提取需要的部分");
    text.push({ source: display, text: content });
  };
  for (const source of input.sources) await visit(source.relative_path, source.name, source.kind, source.mime);
  return { text, images, coverage };
}
