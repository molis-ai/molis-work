import type { ContractDescriptor } from "../platform/package.js";

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
  | "combine";

export interface ShelfItemRecord {
  readonly item_id: string;
  readonly group: ShelfItemGroup;
  readonly kind: ShelfItemKind;
  readonly name: string;
  readonly relative_path: string;
  readonly mime: string;
  readonly size_bytes: number;
  readonly origin_hash: string;
  readonly hidden: boolean;
  readonly created_at: string;
  readonly source_item_id: string | null;
  readonly job_id: string | null;
  readonly preview_text: string | null;
}

export interface ShelfJobRecord {
  readonly job_id: string;
  readonly recipe: ShelfRecipeId;
  readonly status: ShelfJobStatus;
  readonly item_id: string;
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

export interface ShelfRecipeAvailability {
  readonly recipe: ShelfRecipeId;
  readonly available: boolean;
  readonly label: string;
  readonly tone: "slate" | "blue" | "ochre" | "plum" | "clay";
  readonly reason: string | null;
}

export interface ShelfSnapshot {
  readonly materials: readonly ShelfItemRecord[];
  readonly results: readonly ShelfItemRecord[];
  readonly clipboard: readonly ShelfClipboardRecord[];
  readonly recipes: readonly ShelfRecipeAvailability[];
  readonly current_clip_id: string | null;
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

export interface ShelfDeviceSettings {
  readonly drop_wheel_enabled: boolean;
  readonly hotkeys: ShelfHotKeys;
}

export interface ShelfSettingsPatch {
  readonly drop_wheel_enabled?: boolean;
  readonly hotkeys?: Partial<ShelfHotKeys>;
}

export interface ShelfAdmitInput {
  readonly filename: string;
  readonly bytes: Uint8Array;
  readonly mime?: string;
  readonly origin_realpath?: string | null;
}

export interface ShelfRunJobInput {
  readonly recipe: ShelfRecipeId;
  readonly item_id: string;
}
