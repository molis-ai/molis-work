import type { ContractDescriptor } from "../platform/package.js";

/** Explicitly saved project material; the personal Shelf copy may change independently. */
export const SHELF_TEXT_MATERIAL_TYPE = "shelf.text-material.v1";
export interface ShelfTextMaterial {
  title: string;
  text: string;
  content_hash: string;
  source: { item_id: string; kind: ShelfItemKind; group: ShelfItemGroup; source_item_ids: string[]; job_id: string | null };
}
export function parseShelfTextMaterial(value: unknown): ShelfTextMaterial {
  const item = value as Partial<ShelfTextMaterial> | null;
  if (!item || typeof item.title !== "string" || !item.title || typeof item.text !== "string"
    || typeof item.content_hash !== "string" || !/^[a-f0-9]{64}$/.test(item.content_hash)
    || !item.source || typeof item.source.item_id !== "string" || !item.source.item_id
    || !["text", "markdown", "file"].includes(item.source.kind)
    || !["material", "result"].includes(item.source.group)
    || !Array.isArray(item.source.source_item_ids) || !item.source.source_item_ids.every(id => typeof id === "string")
    || (item.source.job_id !== null && typeof item.source.job_id !== "string")) throw new Error("Shelf 固定材料格式无效");
  return item as ShelfTextMaterial;
}

export const modulesShelfContract = {
  contractId: "io.molis.work.module.shelf.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/shelf.md",
} as const satisfies ContractDescriptor;

export type ShelfItemGroup = "material" | "result" | "clipboard";
export type ShelfItemKind =
  | "pdf"
  | "image"
  | "text"
  | "markdown"
  | "url"
  | "website"
  | "file"
  | "folder";
export type ShelfJobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type ShelfRecipeId =
  | "extract_text"
  | "summarize"
  | "extract_structure"
  | "translate"
  | "to_markdown"
  | "redact"
  | "combine"
  /** A user's own action: one sentence, run on the copy. */
  | "shortcut";

/** A result row is `failed` when the run broke; it may then carry no file at all. */
export type ShelfItemStatus = "done" | "failed";

/** One file inside a staged folder. Folders expand in place, never as a second directory. */
export interface ShelfFolderChild {
  readonly relative: string;
  readonly name: string;
  readonly kind: ShelfItemKind;
  readonly size_bytes: number;
}

export interface ShelfItemRecord {
  readonly item_id: string;
  readonly group: ShelfItemGroup;
  readonly kind: ShelfItemKind;
  readonly name: string;
  /** Empty when a failed run left nothing to take away. */
  readonly relative_path: string;
  readonly mime: string;
  readonly size_bytes: number;
  readonly origin_hash: string;
  readonly hidden: boolean;
  readonly created_at: string;
  readonly source_item_id: string | null;
  readonly source_item_ids: readonly string[];
  readonly job_id: string | null;
  readonly preview_text: string | null;
  readonly status: ShelfItemStatus;
  readonly failure_reason: string | null;
  readonly children: readonly ShelfFolderChild[];
}

export interface ShelfJobRecord {
  readonly job_id: string;
  readonly recipe: ShelfRecipeId;
  readonly status: ShelfJobStatus;
  readonly item_id: string;
  readonly item_ids: readonly string[];
  readonly option_id: string | null;
  readonly runtime: string;
  readonly result_item_id: string | null;
  readonly isolation: string;
  readonly error: string | null;
  readonly created_at: string;
  readonly finished_at: string | null;
}

export interface ShelfClipboardRecord {
  readonly clip_id: string;
  readonly kind: "text" | "url";
  readonly title: string;
  readonly body: string;
  readonly created_at: string;
  readonly fingerprint: string;
}

export type ShelfRecipeTone = "slate" | "blue" | "ochre" | "plum" | "clay";

/** One option row on the confirmation drawer: 篇幅 / 抽取 / 译成 / 范围 / 版式. */
export interface ShelfRecipeChoice {
  readonly id: string;
  readonly title: string;
}

export interface ShelfRecipeAvailability {
  readonly recipe: ShelfRecipeId;
  readonly available: boolean;
  readonly label: string;
  readonly short_title: string;
  readonly blurb: string;
  readonly tone: ShelfRecipeTone;
  readonly reason: string | null;
  readonly accepts: readonly ShelfItemKind[];
  readonly output_file: string;
  readonly needs_network: boolean;
  readonly requires_agent: boolean;
  readonly minimum_count: number;
  readonly choice_label: string;
  readonly choice_hint: string;
  readonly choices: readonly ShelfRecipeChoice[];
  readonly default_choice: string;
}

/** Isolation grade spoken on the confirmation drawer, word for word from DropAgent. */
export type ShelfIsolationGrade = "workspace" | "unknown" | "tui" | "none";

/** The terminal Agent this device can hand a job to. */
export interface ShelfRuntimeInstall {
  readonly runtime_key: string;
  readonly title: string;
  readonly executable: string;
  readonly kind: ShelfRuntimeKind;
  readonly can_run_job: boolean;
  readonly install_url: string;
}

export interface ShelfRuntimeStatus {
  readonly runtime_key: string;
  readonly title: string;
  readonly executable: string;
  readonly kind: ShelfRuntimeKind;
  readonly isolation: ShelfIsolationGrade;
  readonly isolation_fact: string;
  readonly can_run_job: boolean;
  /** Whether this device can read text out of an image on its own. */
  readonly image_text: boolean;
  readonly installed: readonly string[];
  /** Every runtime this Mac could use, plus where to get the missing ones. */
  readonly catalog: readonly ShelfRuntimeInstall[];
}

export interface ShelfSnapshot {
  readonly materials: readonly ShelfItemRecord[];
  readonly results: readonly ShelfItemRecord[];
  readonly clipboard: readonly ShelfClipboardRecord[];
  readonly recipes: readonly ShelfRecipeAvailability[];
  readonly current_clip_id: string | null;
  readonly runtime: ShelfRuntimeStatus;
  /** Jobs still going, so another surface can show progress or cancel them. */
  readonly running_jobs: readonly ShelfJobRecord[];
  /** Device settings the workbench needs to paint: actions, order, runtimes. */
  readonly settings: ShelfDeviceSettings;
  /** Where the copies live, so a drag-out can hand the real file to macOS. */
  readonly root: string;
}

/** Device-local plugin preferences. Not project data and not Molis appearance. */
export type ShelfHotKeySlot = "toggle" | "capture" | "files";

export interface ShelfHotKeyChord {
  readonly key_code: number;
  readonly carbon_modifiers: number;
}

export interface ShelfHotKeys {
  readonly toggle: ShelfHotKeyChord;
  readonly capture: ShelfHotKeyChord;
  readonly files: ShelfHotKeyChord;
}

/** A TUI takes a send; only a CLI-shaped runtime can close a job. */
export type ShelfRuntimeKind = "tui" | "cli";

export interface ShelfCustomRuntime {
  readonly id: string;
  readonly title: string;
  readonly executable: string;
  readonly kind: ShelfRuntimeKind;
}

/** One line of instruction the user keeps; it runs on the copy like a recipe. */
export interface ShelfShortcutAction {
  readonly id: string;
  readonly name: string;
  readonly kinds: readonly ShelfItemKind[];
  readonly prompt: string;
}

/** In-panel keys. Unlike the global chords these may be bare keys. */
export type ShelfPanelKeySlot = "hide" | "paste" | "copy" | "delete";

export interface ShelfPanelKeyChord {
  readonly code: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

export type ShelfPanelKeys = Readonly<Record<ShelfPanelKeySlot, ShelfPanelKeyChord>>;

export interface ShelfDeviceSettings {
  readonly drop_wheel_enabled: boolean;
  readonly hotkeys: ShelfHotKeys;
  readonly panel_keys: ShelfPanelKeys;
  /** "auto", an engine key, or `custom:<id>`. */
  readonly engine: string;
  readonly custom_runtimes: readonly ShelfCustomRuntime[];
  readonly shortcuts: readonly ShelfShortcutAction[];
  /** Action bar order: recipe ids and `shortcut:<id>`. */
  readonly action_order: readonly string[];
  readonly hidden_actions: readonly string[];
}

export interface ShelfSettingsPatch {
  readonly drop_wheel_enabled?: boolean;
  readonly hotkeys?: Partial<ShelfHotKeys>;
  readonly panel_keys?: Partial<ShelfPanelKeys>;
  readonly engine?: string;
  readonly custom_runtimes?: readonly ShelfCustomRuntime[];
  readonly shortcuts?: readonly ShelfShortcutAction[];
  readonly action_order?: readonly string[];
  readonly hidden_actions?: readonly string[];
}

export interface ShelfFolderEntryInput {
  readonly relative: string;
  readonly bytes: Uint8Array;
  readonly mime?: string;
}

export interface ShelfAdmitFolderInput {
  readonly name: string;
  readonly entries: readonly ShelfFolderEntryInput[];
  readonly origin_realpath?: string | null;
}

export interface ShelfAdmitInput {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly mime?: string;
  readonly origin_realpath?: string | null;
}

export interface ShelfRunJobInput {
  readonly recipe: ShelfRecipeId;
  readonly item_id?: string;
  readonly item_ids?: readonly string[];
  readonly option_id?: string | null;
  readonly shortcut_id?: string | null;
}

export interface ShelfJobOutcome {
  readonly job: ShelfJobRecord;
  readonly result: ShelfItemRecord | null;
  readonly origin_hash: string;
}
