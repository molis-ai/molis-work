import path from "node:path";
import type {
  ShelfAiPorts,
  ShelfAiStatus,
  ShelfDeviceSettings,
  ShelfJobRecord,
  ShelfMaterialPorts,
  ShelfRecipeId,
  ShelfRunJobInput,
  ShelfShortcutAction,
} from "./contract.js";
import type { ExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { now, requireItem, saveCatalog, type CatalogFile, type ShelfCatalogAccess, type StoredItem } from "./catalog.js";
import { contentHash } from "./copy-checks.js";
import { appendEvent, copyTree, freezeReadOnly } from "./copy-tree.js";
import { isShelfFailure, readShelfCopy, shelfErrors } from "./errors.js";
import { extractionNote, extractionText, markdownFromExtract } from "./extract.js";
import { uniqueName } from "./item-names.js";
import { OCR_MISSING, ocrLanguages, ocrMarkdown } from "./ocr.js";
import { resolvedChoiceId, shelfRecipeOutputName, shelfRecipeSpec, type ShelfRecipeSpec } from "./recipes.js";
import { normalizeShelfSettings, shortcutOutputName } from "./settings.js";

export const noAi: ShelfAiStatus = { available: false, selected: null, choices: [], reason: "请在设置中配置 AI 模型，再为置物架选择可用模型" };

/** What a run was asked to do, settled before anything is copied: the recipe, the chosen shortcut, the materials and the model. */
export interface JobPlan {
  spec: ShelfRecipeSpec;
  settings: ShelfDeviceSettings;
  shortcut: ShelfShortcutAction | undefined;
  actionName: string;
  items: StoredItem[];
  optionId: string | null;
  ai: ShelfAiStatus;
}

/** A run whose input copy and `running` row are on disk. */
export interface StagedJob {
  jobId: string;
  jobRoot: string;
  inputRoot: string;
  outputFile: string;
  outputName: string;
  running: ShelfJobRecord;
  workNames: string[];
}

/** What the run learns while it works and the final write needs to know. */
export interface JobOutcomeState {
  execution?: ShelfJobRecord["execution"];
  coverage?: readonly string[];
  validateResult?: () => void;
}

export function requireRecipe(recipe: ShelfRecipeId): ShelfRecipeSpec {
  try {
    return shelfRecipeSpec(recipe);
  } catch {
    throw shelfErrors.recipe_unavailable("这个动作不存在");
  }
}

/** Every check that needs no copy to be made: nothing is written until the request is known to be one this shelf can run. */
export function planJob(input: ShelfRunJobInput, access: ShelfCatalogAccess, ports: { materials: ShelfMaterialPorts; ai?: ShelfAiPorts }): JobPlan {
  const spec = requireRecipe(input.recipe);
  const catalog = access.read();
  const settings = normalizeShelfSettings(catalog.settings);
  const shortcut = input.recipe === "shortcut"
    ? settings.shortcuts.find((action) => action.id === (input.shortcut_id ?? ""))
    : undefined;
  if (input.recipe === "shortcut" && !shortcut) {
    throw shelfErrors.recipe_unavailable("这个快捷动作已经不在了");
  }
  const accepts = shortcut ? shortcut.kinds : spec.accepts;
  const itemIds = input.item_ids?.length ? [...input.item_ids] : input.item_id ? [input.item_id] : [];
  if (!itemIds.length) throw shelfErrors.empty_selection("请先选择一份材料");
  const items = itemIds.map((id) => requireItem(catalog, id));
  for (const item of items) {
    if (item.group !== "material" || item.hidden) throw shelfErrors.item_not_found("请先选择一份材料");
    if (!accepts.includes(item.kind)) {
      throw shelfErrors.recipe_unavailable(`选中的材料不能用「${shortcut ? shortcut.name : spec.short_title}」`);
    }
  }
  if (items.length < spec.minimum_count) {
    throw shelfErrors.recipe_unavailable(`「${spec.short_title}」至少要两份材料`);
  }
  const ai = spec.requires_agent ? ports.ai?.status(settings.model_selection) ?? noAi : noAi;
  if (spec.requires_agent && (!ai.available || !ai.selected)) throw shelfErrors.no_model(ai.reason ?? noAi.reason!);
  if (!spec.requires_agent && !ports.materials.extract) throw shelfErrors.extraction_unavailable("材料提取服务不可用，请从 Molis Work 打开置物架后重试");
  if (!spec.requires_agent && items.some(item => item.kind === "image") && !(ports.materials.imageTextAvailable?.() ?? false)) throw shelfErrors.no_ocr(OCR_MISSING);
  const optionId = spec.choices.length ? resolvedChoiceId(spec.recipe, input.option_id) : null;
  return { spec, settings, shortcut, actionName: shortcut ? shortcut.name : spec.label, items, optionId, ai };
}

export function localActor(kind: StoredItem["kind"]): string {
  if (kind === "pdf") return "pdfkit";
  return kind === "image" ? "vision" : "local";
}

/** Copies the selected materials into a read-only `input/`, writes the manifest, and files the `running` row, all in one write. */
export async function stageJob(access: ShelfCatalogAccess, plan: JobPlan, jobId: string): Promise<StagedJob> {
  const { spec, items, shortcut, optionId } = plan;
  const jobRoot = `jobs/${jobId}`;
  const inputRoot = `${jobRoot}/input`;
  const outputRoot = `${jobRoot}/output`;
  const outputName = shortcut
    ? shortcutOutputName(items[0].name, shortcut.name)
    : shelfRecipeOutputName(spec.recipe, items[0].kind, optionId);
  const running: ShelfJobRecord = {
    job_id: jobId,
    recipe: spec.recipe,
    status: "running",
    item_id: items[0].item_id,
    item_ids: items.map((item) => item.item_id),
    option_id: optionId,
    runtime: spec.requires_agent ? "prologue" : localActor(items[0].kind),
    result_item_id: null,
    isolation: spec.requires_agent ? "仅发送所选材料，无终端或文件写入工具" : "本机抽字，不调用模型",
    error: null,
    created_at: now(),
    finished_at: null,
  };
  const workNames: string[] = [];
  await access.files.write((writer) => {
    writer.mkdir(inputRoot);
    writer.mkdir(outputRoot);
    for (const item of items) {
      const name = uniqueName(item.name, (candidate) => writer.stat(`${inputRoot}/${candidate}`) !== null);
      if (item.kind === "folder") copyTree(writer, item.relative_path, `${inputRoot}/${name}`);
      else writer.copyFile(item.relative_path, `${inputRoot}/${name}`);
      workNames.push(name);
    }
    freezeReadOnly(writer, inputRoot);
    appendEvent(writer, jobRoot, "复制到只读 input/");
    writer.replaceFileAtomic(`${jobRoot}/manifest.json`, Buffer.from(`${JSON.stringify({
      id: jobId,
      recipe: spec.recipe,
      action: plan.actionName,
      agent: spec.requires_agent ? "prologue" : localActor(items[0].kind),
      isolation: spec.requires_agent ? "model-input-only" : "none",
      items: items.map((item) => ({ id: item.item_id, title: item.name, checksum: item.origin_hash })),
    }, null, 2)}\n`));
    const catalog = access.from(writer);
    catalog.jobs.unshift(running);
    saveCatalog(writer, catalog);
  });
  return { jobId, jobRoot, inputRoot, outputFile: `${outputRoot}/${outputName}`, outputName, running, workNames };
}

/** The check run before each effect and inside the final write: the settings, the job row and every material are still what the run started with. */
export function currentCheck(access: ShelfCatalogAccess, plan: JobPlan, staged: StagedJob, copyHashes: ReadonlyMap<string, string>): () => void {
  const { settings, shortcut, items, spec } = plan;
  return () => {
    const current: CatalogFile = access.read();
    if (spec.requires_agent && (JSON.stringify(normalizeShelfSettings(current.settings).model_selection) !== JSON.stringify(settings.model_selection)
      || (shortcut && JSON.stringify(normalizeShelfSettings(current.settings).shortcuts.find(row => row.id === shortcut.id)) !== JSON.stringify(shortcut)))) {
      throw shelfErrors.configuration_changed("生成期间模型选择或快捷动作已变化，结果未保存");
    }
    if (current.jobs.find(job => job.job_id === staged.jobId)?.status !== "running") throw shelfErrors.cancelled("任务已取消");
    for (const [index, item] of items.entries()) {
      const latest = requireItem(current, item.item_id);
      if (latest.hidden || latest.relative_path !== item.relative_path) throw shelfErrors.item_not_found("材料已收起或改变，未保存结果");
      if (contentHash(access.files, latest) !== copyHashes.get(item.item_id)
        || contentHash(access.files, item, `${staged.inputRoot}/${staged.workNames[index]}`) !== copyHashes.get(item.item_id)) throw shelfErrors.hash_changed("架子上的副本 Hash 已变化，已停止写入");
    }
  };
}

/** The on-device path: each material is extracted through the Host's port and joined into one Markdown deliverable. */
export async function extractLocally(
  access: ShelfCatalogAccess,
  materials: ShelfMaterialPorts,
  plan: JobPlan,
  staged: StagedJob,
  lifetime: ExecutionLifetime,
  beforeCommit: () => Promise<void>,
): Promise<string> {
  const { items, optionId } = plan;
  const parts: string[] = [];
  for (const [index, item] of items.entries()) {
    const sourceName = item.kind === "pdf" ? "source.pdf" : path.extname(item.name) ? item.name : `source.${item.mime.slice("image/".length)}`;
    const extracted = await materials.extract!({ file_name: sourceName, bytes: readShelfCopy(access.files, `${staged.inputRoot}/${staged.workNames[index]}`) },
      { signal: lifetime.signal, pdfMode: "text", ...(item.kind === "image" ? { ocrLanguages: ocrLanguages(optionId) } : {}),
        timeoutMs: 60_000, limits: { maxBytes: 32 * 1024 * 1024 } });
    await beforeCommit();
    if (item.kind !== "image" && !extracted.text.trim()) throw shelfErrors.no_text("这份 PDF 没有可抽取的文字");
    const body = item.kind === "image" ? ocrMarkdown([{ name: item.name,
      lines: extracted.pages.flatMap(page => page.lines ?? (page.text ? [{ text: page.text, confidence: null }] : [])) }]) + extractionNote(extracted) : extractionText(extracted);
    parts.push(items.length > 1 ? `## ${item.name}\n\n${body}` : item.kind === "image" ? body : markdownFromExtract(item.name, body));
  }
  return parts.join("\n\n");
}

/** DropAgent `JobService.failureCopy`: one plain reason, never a stack. */
export function failureCopy(error: unknown): string {
  if (isShelfFailure(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "任务失败";
}
