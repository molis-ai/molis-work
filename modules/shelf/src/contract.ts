import type { BoundedInferenceReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MaterialExtractor, MaterialWebsiteReader } from "@molis-ai/molis-work-contracts/services/materials";
import type { PluginOwnerFilesReader } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Execution authority is supplied by the Host, never by a serialized Shelf request. */
export interface ShelfExecutionControl { signal?: AbortSignal; beforeEffect?(): void | Promise<void> }
/**
 * The platform's material readers, as Shelf's store uses them. The original-file three are the platform's register of the file the
 * person handed in, kept under the Shelf item's id: the store never names a path.
 */
export interface ShelfMaterialPorts {
  readWebsite?: MaterialWebsiteReader; extract?: MaterialExtractor; imageTextAvailable?(): boolean;
  claimOriginal?(item_id: string): Promise<void>;
  readOriginal?(item_id: string, request?: { signal?: AbortSignal }): Promise<{ bytes: Uint8Array }>;
  releaseOriginal?(item_id: string): Promise<void>;
}

export interface ShelfModelSelection { readonly provider_id: string; readonly model_id: string }
export interface ShelfAiStatus {
  readonly available: boolean; readonly reason: string | null;
  readonly selected: ShelfModelSelection | null;
  readonly choices: readonly (ShelfModelSelection & { readonly label: string; readonly vision: boolean })[];
}
/**
 * Sources are the job's frozen copies, built by the store and never accepted from an Action input: `root` is their folder in
 * Shelf's own files, read through `files`.
 */
export interface ShelfAiPorts {
  status(selection?: ShelfModelSelection | null): ShelfAiStatus;
  generate(input: {
    recipe: Exclude<ShelfRecipeId, "extract_text">; option_id: string | null; shortcut_prompt?: string;
    selection: ShelfModelSelection; files: PluginOwnerFilesReader; root: string;
    sources: readonly { relative_path: string; name: string; kind: ShelfItemKind; mime: string }[];
  }, control: ShelfExecutionControl): Promise<{ text: string; execution?: BoundedInferenceReceipt; coverage?: readonly string[]; validateResult?(): void }>;
}

/** Provenance of an explicitly imported personal copy, never an execution authority. */
export interface ShelfArtifactSource {
  project_id: string;
  project_path: string;
  reference: ArtifactReference;
  producer_plugin_id: string;
  content_hash: string;
}
export interface ShelfArtifactPreview {
  title: string;
  text: string;
  source: ShelfArtifactSource;
  fingerprint: string;
}

/**
 * Shelf text the person explicitly saves into a project's knowledge, with where it came from. The project keeps it as an imported
 * document; the personal Shelf copy may change independently.
 */
export interface ShelfTextMaterial {
  title: string;
  text: string;
  content_hash: string;
  source: { item_id: string; kind: ShelfItemKind; group: ShelfItemGroup; source_item_ids: string[]; job_id: string | null; artifact?: ShelfArtifactSource };
}

/** The input of `shelf.items.admit`: a text or a file copy. A link in the text is kept as a link; fetching its page is `shelf.items.capture`'s. */
export interface ShelfAdmitActionInput {
  text?: string; title?: string;
  filename?: string; bytes_base64?: string; mime?: string;
}
/**
 * `shelf.items.admit`, defined once: Shelf registers its handler for this definition, and another plugin that puts a
 * file it made into the person's Shelf (Images' 放进 Shelf) invokes it through the action directory, never reaching
 * Shelf's implementation. Admitting reads the shelf and writes the copy, and reads a PDF's text for its preview (`materials:read`).
 * It fetches nothing and names no original file: those are `shelf.items.capture` and `shelf.items.original`.
 */
export const SHELF_ADMIT_ACTION: ActionDefinition<ShelfAdmitActionInput, { item: ShelfItemRecord }> = {
  capability_id: "shelf.items.admit", version: 2, operation: "command",
  action: {
    title: "放进 Shelf", description: "把一段文字或一个文件副本放进置物架；文字里的网址按链接保存，不抓取网页", kind: "operation",
    scope: "home", scheduling: "concurrent", audiences: ["user", "workflow", "agent", "mcp"], permissions: ["shelf:read", "shelf:write", "materials:read"], subject_kinds: ["shelf_item"],
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", maxLength: 2_000_000, title: "文字" }, title: { type: "string", maxLength: 200, title: "标题" },
        filename: { type: "string", maxLength: 500, title: "文件名" }, bytes_base64: { type: "string", maxLength: 128 * 1024 * 1024, title: "文件内容（Base64）" }, mime: { type: "string", maxLength: 200, title: "文件类型" },
      },
      required: [], additionalProperties: false,
    },
    output_schema: {
      type: "object",
      properties: { item: { type: "object", required: ["item_id", "group", "kind", "name", "mime", "size_bytes", "hidden", "status", "created_at"] } },
      required: ["item"], additionalProperties: false,
    },
    result_view: { summary: "已接收材料", title_pointer: "/item/name",
      link: { label: "打开材料", href_template: "/projects/{project_id}/?openPlugin=shelf&openItem={/item/item_id}&openTitle={/item/name}" } },
  },
};

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
  readonly material_coverage?: readonly string[];
  readonly item_id: string;
  readonly artifact_source?: ShelfArtifactSource;
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
  readonly execution?: BoundedInferenceReceipt;
  readonly material_coverage?: readonly string[];
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
  /** An executable was found; job support is checked only when a job is requested. */
  readonly capability_pending?: boolean;
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
  /** An executable was found; job support is checked only when a job is requested. */
  readonly capability_pending?: boolean;
  /** Whether this device can read text out of an image on its own. */
  readonly image_text: boolean;
  readonly installed: readonly string[];
  /** Every runtime this Mac could use, plus where to get the missing ones. */
  readonly catalog: readonly ShelfRuntimeInstall[];
}

export interface ShelfSnapshot {
  readonly ai?: ShelfAiStatus;
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
  readonly model_selection?: ShelfModelSelection | null;
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
  readonly model_selection?: ShelfModelSelection | null;
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
}

export interface ShelfAdmitInput {
  readonly artifact_source?: ShelfArtifactSource;
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly mime?: string;
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
