import { inputSchemaFor } from "./action-input.js";
import type { ActionDefinition } from "./actions.js";
import type { UiEnvironmentProblem } from "./ui-environment.js";
import { UI_FILE_PATTERNS, type UiDefinitionRef } from "./ui-files.js";
import { TEXT_REF_SCHEMA, type TextRef } from "./ui-text.js";

export const APPEARANCE_PROVIDER_ID = "system.appearance";
export const APPEARANCE_READ_PERMISSION = "appearance:read";
export const APPEARANCE_WRITE_PERMISSION = "appearance:write";

/** Home-wide choices. A null mono override uses the effective scheme's code role. */
export interface UiAppearanceSelection {
  readonly skin: UiDefinitionRef;
  readonly font: { readonly policy: "follow-skin" } | { readonly policy: "pinned"; readonly scheme: UiDefinitionRef };
  readonly mono: UiDefinitionRef | null;
}

export type UiAppearanceChoice =
  | { readonly kind: "selection"; readonly selection: UiAppearanceSelection }
  | { readonly kind: "restore" };

export interface UiAppearanceGetInput { readonly request_id?: string }
export interface UiAppearanceApplyInput {
  readonly expected_revision: number;
  readonly request_id: string;
  readonly choice: UiAppearanceChoice;
}
export interface UiAppearanceUndoInput {
  readonly expected_revision: number;
  readonly applied_request_id: string;
}

/** The original outcome, even if a later command has changed the Home again. */
export interface UiAppearanceReceipt {
  readonly request_id: string;
  readonly selection_revision: number;
  readonly selection: UiAppearanceSelection;
}

export interface UiAppearanceRecovery {
  readonly applied: UiAppearanceReceipt;
  readonly undone?: UiAppearanceReceipt;
}

export interface UiAppearanceBuiltin {
  readonly ref: UiDefinitionRef;
  readonly name: TextRef;
}
export interface UiAppearanceSkin extends UiAppearanceBuiltin { readonly recommended_font: UiDefinitionRef }

export interface UiAppearanceView {
  /** Nulls mean the saved state cannot be used or overwritten by this build. An unset Home starts at revision 0. */
  readonly selection: UiAppearanceSelection | null;
  readonly selection_revision: number | null;
  /** May fall back when a saved choice no longer resolves. This does not rewrite that choice. */
  readonly effective_selection: UiAppearanceSelection;
  readonly builtins: { readonly skins: readonly UiAppearanceSkin[]; readonly fonts: readonly UiAppearanceBuiltin[] };
  readonly problems: readonly UiEnvironmentProblem[];
  /** Only the current actor's receipt for the application named by the query. */
  readonly recovery?: UiAppearanceRecovery;
}

const revision = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;
const positiveRevision = { ...revision, minimum: 1 } as const;
const requestId = { type: "string", minLength: 1, maxLength: 200 } as const;
const ref = { type: "object", properties: {
  id: { type: "string", pattern: UI_FILE_PATTERNS.definition_id.source }, revision: positiveRevision,
}, required: ["id", "revision"], additionalProperties: false } as const;
const nullableRef = { anyOf: [ref, { type: "null" }] } as const;
const selection = { type: "object", properties: {
  skin: ref,
  font: { oneOf: [
    { type: "object", properties: { policy: { const: "follow-skin" } }, required: ["policy"], additionalProperties: false },
    { type: "object", properties: { policy: { const: "pinned" }, scheme: ref }, required: ["policy", "scheme"], additionalProperties: false },
  ] },
  mono: nullableRef,
}, required: ["skin", "font", "mono"], additionalProperties: false } as const;
const choice = { oneOf: [
  { type: "object", properties: { kind: { const: "selection" }, selection }, required: ["kind", "selection"], additionalProperties: false },
  { type: "object", properties: { kind: { const: "restore" } }, required: ["kind"], additionalProperties: false },
] } as const;
const receipt = { type: "object", properties: { request_id: requestId, selection_revision: positiveRevision, selection },
  required: ["request_id", "selection_revision", "selection"], additionalProperties: false } as const;
const builtin = { type: "object", properties: { ref, name: TEXT_REF_SCHEMA }, required: ["ref", "name"], additionalProperties: false } as const;
const builtinSkin = { ...builtin, properties: { ...builtin.properties, recommended_font: ref }, required: [...builtin.required, "recommended_font"] } as const;
const view = { type: "object", properties: {
  selection: { anyOf: [selection, { type: "null" }] },
  selection_revision: { anyOf: [revision, { type: "null" }] },
  effective_selection: selection,
  builtins: { type: "object", properties: {
    skins: { type: "array", items: builtinSkin }, fonts: { type: "array", items: builtin },
  }, required: ["skins", "fonts"], additionalProperties: false },
  problems: { type: "array", items: { type: "object", properties: {
    code: { type: "string" }, subject: { type: "string" }, detail: { type: "string" },
  }, required: ["code", "subject"], additionalProperties: false } },
  recovery: { type: "object", properties: { applied: receipt, undone: receipt }, required: ["applied"], additionalProperties: false },
}, required: ["selection", "selection_revision", "effective_selection", "builtins", "problems"], additionalProperties: false } as const;

const person = { scope: "home", audiences: ["user"], subject_kinds: [] } as const;
const writes = { ...person, kind: "operation", effect: "write", permissions: [APPEARANCE_WRITE_PERMISSION] } as const;
const undo: ActionDefinition<UiAppearanceUndoInput, UiAppearanceReceipt> = {
  capability_id: "appearance.selection.undo", version: /* @version action.appearance.selection.undo */ 1, operation: "command",
  action: { ...writes, title: "撤销外观变更", description: "还原本次应用前的外观。之后已有其他变更时请重新选择。",
    input_schema: inputSchemaFor<UiAppearanceUndoInput>()({ type: "object", properties: { expected_revision: positiveRevision, applied_request_id: requestId },
      required: ["expected_revision", "applied_request_id"], additionalProperties: false }),
    output_schema: receipt },
};
const get: ActionDefinition<UiAppearanceGetInput, UiAppearanceView> = {
  capability_id: "appearance.selection.get", version: /* @version action.appearance.selection.get */ 1, operation: "query",
  action: { ...person, kind: "query", effect: "read", permissions: [APPEARANCE_READ_PERMISSION],
    title: "查看当前外观", description: "读取这个 Home 的外观及可选内置方案，也可查看本人的一次应用结果。",
    input_schema: inputSchemaFor<UiAppearanceGetInput>()({ type: "object", properties: { request_id: requestId }, additionalProperties: false }),
    output_schema: view },
};
const apply: ActionDefinition<UiAppearanceApplyInput, UiAppearanceReceipt> = {
  capability_id: "appearance.selection.apply", version: /* @version action.appearance.selection.apply */ 1, operation: "command",
  action: { ...writes, title: "应用外观", description: "应用准确版本的皮肤和字体，或恢复内置外观。",
    input_schema: inputSchemaFor<UiAppearanceApplyInput>()({ type: "object", properties: { expected_revision: revision, request_id: requestId, choice },
      required: ["expected_revision", "request_id", "choice"], additionalProperties: false }),
    output_schema: receipt,
    undo: { capability_id: undo.capability_id, version: undo.version, input: { expected_revision: "selection_revision", applied_request_id: "request_id" } } },
};

export const appearanceSelectionActions = { get, apply, undo } as const;
