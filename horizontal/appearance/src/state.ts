import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { UI_FILE_PATTERNS, type UiAppearanceChoice, type UiAppearanceReceipt, type UiAppearanceSelection, type UiDefinitionRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { entryAt, readVersionedFile, sqliteVersionRefusal, type VersionedFile, type VersionedFileRead } from "@molis-ai/molis-work-storage";

export const APPEARANCE_STATE_PATH = join("interface", "state.json");
export const APPEARANCE_STATE_VERSION = /* @version format.ui.appearance-state */ 1;

export interface AppearanceApplication {
  readonly actor_id: string;
  readonly choice: UiAppearanceChoice;
  readonly applied: UiAppearanceReceipt;
  readonly undone?: UiAppearanceReceipt;
}

export interface AppearanceState {
  readonly schema_version: typeof APPEARANCE_STATE_VERSION;
  readonly selection_revision: number;
  readonly selection: UiAppearanceSelection;
  readonly last_recoverable: UiAppearanceSelection;
  /** Previous formal selection for the one application that can still be undone. */
  readonly undo_selection: UiAppearanceSelection | null;
  readonly applications: readonly AppearanceApplication[];
}

function hasFields(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  return isRecord(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

const positiveRevision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

function isRef(value: unknown): value is UiDefinitionRef {
  return hasFields(value, ["id", "revision"]) && typeof value.id === "string"
    && UI_FILE_PATTERNS.definition_id.test(value.id) && positiveRevision(value.revision);
}

function isSelection(value: unknown): value is UiAppearanceSelection {
  if (!hasFields(value, ["skin", "font", "mono"]) || !isRef(value.skin) || (value.mono !== null && !isRef(value.mono))) return false;
  const { font } = value;
  return (hasFields(font, ["policy"]) && font.policy === "follow-skin")
    || (hasFields(font, ["policy", "scheme"]) && font.policy === "pinned" && isRef(font.scheme));
}

function isChoice(value: unknown): value is UiAppearanceChoice {
  return (hasFields(value, ["kind"]) && value.kind === "restore")
    || (hasFields(value, ["kind", "selection"]) && value.kind === "selection" && isSelection(value.selection));
}

function isReceipt(value: unknown): value is UiAppearanceReceipt {
  return hasFields(value, ["request_id", "selection_revision", "selection"]) && typeof value.request_id === "string"
    && value.request_id.length > 0 && [...value.request_id].length <= 200
    && positiveRevision(value.selection_revision) && isSelection(value.selection);
}

function isApplication(value: unknown): value is AppearanceApplication {
  return hasFields(value, ["actor_id", "choice", "applied"], ["undone"]) && typeof value.actor_id === "string" && value.actor_id.length > 0
    && isChoice(value.choice) && isReceipt(value.applied) && (!Object.hasOwn(value, "undone") || isReceipt(value.undone));
}

function hasConsistentReceipts(applications: readonly AppearanceApplication[], selection: UiAppearanceSelection, revision: number, undoSelection: UiAppearanceSelection | null): boolean {
  const keys = new Set<string>();
  let current: UiAppearanceReceipt | undefined;
  for (const { actor_id, choice, applied, undone } of applications) {
    const key = JSON.stringify([actor_id, applied.request_id]);
    if (keys.has(key) || applied.selection_revision !== (current?.selection_revision ?? 0) + 1) return false;
    if (choice.kind === "selection" && !isDeepStrictEqual(choice.selection, applied.selection)) return false;
    if (undone && (undone.request_id !== applied.request_id || undone.selection_revision !== applied.selection_revision + 1)) return false;
    keys.add(key);
    current = undone ?? applied;
  }
  const last = applications.at(-1);
  return current?.selection_revision === revision && isDeepStrictEqual(current.selection, selection)
    && (undoSelection === null) === Boolean(last?.undone);
}

function parse(value: unknown): AppearanceState {
  if (hasFields(value, ["schema_version", "selection_revision", "selection", "last_recoverable", "undo_selection", "applications"])
    && value.schema_version === APPEARANCE_STATE_VERSION && positiveRevision(value.selection_revision)
    && isSelection(value.selection) && isSelection(value.last_recoverable)
    && (value.undo_selection === null || isSelection(value.undo_selection))
    && Array.isArray(value.applications) && value.applications.every(isApplication)
    && hasConsistentReceipts(value.applications, value.selection, value.selection_revision, value.undo_selection)) {
    return { schema_version: value.schema_version, selection_revision: value.selection_revision, selection: value.selection,
      last_recoverable: value.last_recoverable, undo_selection: value.undo_selection, applications: value.applications };
  }
  throw new Error("interface/state.json is not an appearance record of this version");
}

/** The Host registers the same declaration for upgrade inspection. Only this owner reads or replaces the state. */
export const APPEARANCE_STATE_FILE: VersionedFile<AppearanceState> = { version: APPEARANCE_STATE_VERSION, field: "schema_version", upgrades: [], parse };

export function createStateFile(home: string, baseline: UiAppearanceSelection) {
  const path = join(home, APPEARANCE_STATE_PATH), directory = dirname(path);
  const read = (): VersionedFileRead<AppearanceState> => {
    try {
      const parent = entryAt(directory);
      if (realpathSync(home) !== home || (parent && !parent.isDirectory())) return { status: "unreadable" };
    } catch { return { status: "unreadable" }; }
    return readVersionedFile(APPEARANCE_STATE_FILE, path, home);
  };
  const empty: AppearanceState = { schema_version: APPEARANCE_STATE_VERSION, selection_revision: 0, selection: baseline,
    last_recoverable: baseline, undo_selection: null, applications: [] };
  return {
    path, read, empty,
    writable(seen: VersionedFileRead<AppearanceState>): AppearanceState {
      if (seen.status === "absent") return empty;
      if (seen.status === "current") return seen.value;
      throw sqliteVersionRefusal(path, seen.status === "unreadable" ? 0 : seen.found, APPEARANCE_STATE_FILE.version, home);
    },
  };
}

export const findApplication = (state: AppearanceState, actor: string, request: string) =>
  state.applications.find(row => row.actor_id === actor && row.applied.request_id === request);
