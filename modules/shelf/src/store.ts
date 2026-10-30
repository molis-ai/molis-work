import type { PluginOwnerFilesClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type {
  ShelfAdmitFolderInput,
  ShelfAdmitInput,
  ShelfClipboardRecord,
  ShelfDeviceSettings,
  ShelfExecutionControl,
  ShelfAiPorts,
  ShelfAiStatus,
  ShelfItemRecord,
  ShelfJobOutcome,
  ShelfJobRecord,
  ShelfMaterialPorts,
  ShelfRecipeAvailability,
  ShelfRunJobInput,
  ShelfRuntimeStatus,
  ShelfSettingsPatch,
  ShelfSnapshot,
} from "./contract.js";
import { ShelfAdmissions } from "./admissions.js";
import { ShelfCatalogAccess, sha256, publicItem, type StoredItem } from "./catalog.js";
import { CLIPBOARD_LIMIT, ShelfClipboard } from "./clipboard-store.js";
import { ShelfCopies } from "./copies.js";
import { isStaleJob } from "./job-registry.js";
import { noAi } from "./job-steps.js";
import { ShelfJobs } from "./jobs.js";
import { recipeAvailability, SHELF_RECIPES } from "./recipes.js";
import { detectShelfRuntime, emptyShelfRuntime, type ShelfRuntimeLookup } from "./runtimes.js";
import { mergeShelfSettings, normalizeShelfSettings } from "./settings.js";

export { SHELF_FOLDER_MAX_BYTES } from "./admissions.js";
export { CLIPBOARD_LIMIT } from "./clipboard-store.js";
export { isEditableShelfItem } from "./item-names.js";
export { SHELF_JOB_TIMEOUT_MS } from "./jobs.js";
export { initializeShelfFiles } from "./shelve.js";

function recipeTable(ai: ShelfAiStatus): readonly ShelfRecipeAvailability[] {
  return SHELF_RECIPES.map((spec) => recipeAvailability(spec.recipe, {
    available: spec.requires_agent ? ai.available : true,
    reason: spec.requires_agent && !ai.available ? ai.reason : null,
  }));
}

/**
 * The shelf as the Host and the pages see it. Each kind of work lives in its own collaborator over the same catalog: what comes in
 * (`ShelfAdmissions`), what happens to a copy (`ShelfCopies`), runs (`ShelfJobs`) and the clipboard history (`ShelfClipboard`).
 * This class keeps the settings, the runtime probe and the snapshot, and forwards the rest.
 */
export class ShelfStore {
  private readonly lookup: ShelfRuntimeLookup;
  private readonly access: ShelfCatalogAccess;
  private readonly admissions: ShelfAdmissions;
  private readonly copies: ShelfCopies;
  private readonly jobs: ShelfJobs;
  private readonly clipboard: ShelfClipboard;

  /**
   * Shelf's own data is read and written only through `files`; `root` is the real folder behind it, named in the snapshot and nowhere
   * else (a job's model reads its frozen copies through `files` too). The folders are created by the first write that needs them.
   */
  constructor(readonly root: string, files: PluginOwnerFilesClient, lookup: ShelfRuntimeLookup = {}, private readonly materials: ShelfMaterialPorts = {}, private readonly ai?: ShelfAiPorts) {
    this.lookup = lookup;
    this.access = new ShelfCatalogAccess(root, files);
    this.admissions = new ShelfAdmissions(this.access, materials);
    this.copies = new ShelfCopies(this.access, materials);
    this.jobs = new ShelfJobs(this.access, materials, ai);
    this.clipboard = new ShelfClipboard(this.access, this.admissions);
  }

  /** Manual terminal discovery. Automatic recipes use the independent AI port. */
  async runtime(settings: ShelfDeviceSettings = this.settings()): Promise<ShelfRuntimeStatus> {
    const image_text = this.materials.imageTextAvailable?.() ?? false;
    try {
      return {
        ...await detectShelfRuntime({ ...this.lookup, preferred: settings.engine, customRuntimes: settings.custom_runtimes }),
        image_text,
      };
    } catch {
      return { ...emptyShelfRuntime(), image_text };
    }
  }

  settings(): ShelfDeviceSettings {
    return normalizeShelfSettings(this.access.read().settings);
  }

  async saveSettings(patch: ShelfSettingsPatch): Promise<ShelfDeviceSettings> {
    await this.access.update((catalog) => {
      catalog.settings = normalizeShelfSettings(mergeShelfSettings(normalizeShelfSettings(catalog.settings), patch));
    });
    return this.settings();
  }

  async snapshot(): Promise<ShelfSnapshot> {
    const catalog = this.access.read();
    const visible = (group: StoredItem["group"]) =>
      catalog.items.filter((item) => item.group === group && !item.hidden).map(publicItem);
    const settings = normalizeShelfSettings(catalog.settings);
    const runtime = await this.runtime(settings);
    const ai = this.ai?.status(settings.model_selection) ?? noAi;
    return {
      ai,
      materials: visible("material"),
      results: visible("result"),
      clipboard: catalog.clipboard.slice(0, CLIPBOARD_LIMIT),
      recipes: recipeTable(ai),
      current_clip_id: catalog.current_clip_id,
      runtime,
      running_jobs: catalog.jobs.filter((job) => job.status === "running" && !isStaleJob(job, this.root)),
      settings,
      root: this.root,
    };
  }

  admitFile(input: ShelfAdmitInput, control?: ShelfExecutionControl): Promise<ShelfItemRecord> { return this.admissions.admitFile(input, control); }
  admit(input: ShelfAdmitInput, preparedPreview?: string | null): Promise<ShelfItemRecord> { return this.admissions.admit(input, preparedPreview); }
  admitFolder(input: ShelfAdmitFolderInput): Promise<ShelfItemRecord> { return this.admissions.admitFolder(input); }
  admitText(body: string, title = "粘贴文字", capture = true, control?: ShelfExecutionControl): Promise<ShelfItemRecord> { return this.admissions.admitText(body, title, capture, control); }
  admitUrl(url: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord> { return this.admissions.admitUrl(url, control); }
  seedSample(): Promise<ShelfItemRecord> { return this.admissions.seedSample(); }
  useAsMaterial(itemId: string): Promise<ShelfItemRecord> { return this.admissions.useAsMaterial(itemId); }

  readChild(itemId: string, relative: string): { name: string; mime: string; bytes: Buffer } { return this.copies.readChild(itemId, relative); }
  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer } { return this.copies.readFile(itemId); }
  hide(itemId: string): Promise<void> { return this.copies.hide(itemId); }
  claimOriginal(itemId: string): Promise<void> { return this.copies.claimOriginal(itemId); }
  deleteCopy(itemId: string): Promise<void> { return this.copies.deleteCopy(itemId); }
  writeCopy(itemId: string, text: string): Promise<ShelfItemRecord> { return this.copies.writeCopy(itemId, text); }

  runJob(input: ShelfRunJobInput, control?: ShelfExecutionControl): Promise<ShelfJobOutcome> { return this.jobs.runJob(input, control); }
  cancelJob(jobId: string): Promise<ShelfJobRecord> { return this.jobs.cancelJob(jobId); }

  addClipboard(body: string, options: { concealed?: boolean; types?: readonly string[] } = {}): Promise<ShelfClipboardRecord | null> { return this.clipboard.add(body, options); }
  deleteClipboard(clipId: string): Promise<void> { return this.clipboard.remove(clipId); }
  clipboardToMaterial(clipId: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord> { return this.clipboard.toMaterial(clipId, control); }
}

/** `root` is the real folder behind `files`; the Host that supplies both keeps them the same place. */
export function openShelfStore(root: string, files: PluginOwnerFilesClient, lookup: ShelfRuntimeLookup = {}, materials: ShelfMaterialPorts = {}, ai?: ShelfAiPorts): ShelfStore {
  return new ShelfStore(root, files, lookup, materials, ai);
}

export function hashBytes(bytes: Uint8Array): string {
  return sha256(Buffer.from(bytes));
}
