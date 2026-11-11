import { ACTION_REFERENCE_SCHEMA, ACTION_SUBJECT_SCHEMA, inputSchemaFor,
  type ActionAudience, type ActionDefinition, type ActionSchema, type ActionSubject, type ExactActionReference, type InferActionInput,
} from "../platform/actions.js";
import { defineErrorCodes } from "../platform/action-errors.js";
import { blueprintDraftSourceSchema } from "../platform/blueprint-source.js";
import {
  ADOPTION_OUTCOMES, ADOPTION_REVISION_SCHEMA, BLUEPRINT_LIMITS, BLUEPRINT_PART_ORIGIN_SCHEMA, BLUEPRINT_SOURCE_SCHEMA,
  type AdoptionOutcome, type AdoptionRevision, type Blueprint, type BlueprintPartOrigin, type BlueprintProposal, type BlueprintSource,
} from "../platform/blueprints.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import type { ContractDescriptor } from "../platform/package.js";
import type { SandboxJson } from "../platform/plugin-sandbox.js";
import { SETTINGS_CONSEQUENCES, SETTINGS_LAYERS, type SettingConsequence, type SettingLayer } from "../platform/settings.js";
import { LOCALE_TAG } from "../platform/ui-text.js";

/** The scene service's public contract (specs/scene-and-page-contract/spec.md): the draft, the adoption record and the eight actions declared here. The provider is batch 44's. */
export const servicesBlueprintsContract = {
  contractId: /* @version contract.io.molis.work.service.blueprints "io.molis.work.service.blueprints.v{version}" */ "io.molis.work.service.blueprints.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.blueprints */ 1,
  maturity: "contract-only",
  ssot: "specs/scene-and-page-contract/spec.md",
} as const satisfies ContractDescriptor;

/** The provider id the future `system.blueprints` service (batch 44) registers the eight actions under; declared here, not registered yet. */
export const BLUEPRINTS_PROVIDER_ID = "system.blueprints";

/**
 * The scene owner's refusals (specs/scene-and-page-contract/spec.md, the error-model paragraph of section 13): a part whose owner does
 * not declare it, a step whose owner revision moved, a dependency that is not installed, and a preview that expired before it was used.
 * Declared once, so callers of the future `system.blueprints` provider (a workflow, a Skill, the interface) can tell them apart.
 */
export const blueprintsErrors = /* @__PURE__ */ defineErrorCodes("blueprints", {
  part_unsupported: "invalid",
  step_conflict: "conflict",
  dependency_unmet: "unavailable",
  preview_expired: "not_found",
});

type DraftSource = Extract<BlueprintSource, { kind: "draft" }>;
export type BlueprintDraftSaveInput<Body = Blueprint> = { blueprint: Body } & (
  | { expected_revision: null }
  | { draft_id: string; expected_revision: number }
);
export interface BlueprintDraftReadInput { draft_id: string }
export interface BlueprintDraftResult { draft: { source: DraftSource; blueprint: Blueprint; locale: string } }

export type BlueprintAdoptionTarget =
  | { kind: "personal" | "current_project" }
  | { kind: "new_project"; display_name: string };
export type BlueprintAdoptedTarget = { kind: "personal" } | { kind: "project"; project_id: string };

export type BlueprintPreviewSelection =
  | { kind: "create" }
  | { kind: "reuse" | "update"; subject: ActionSubject };
export interface BlueprintPreviewChange<Proposal = BlueprintProposal> {
  part_id: string;
  proposal?: Proposal;
  selection?: BlueprintPreviewSelection;
  action?: ExactActionReference;
}
export interface BlueprintAdoptionPreviewInput<Proposal = BlueprintProposal> {
  source: BlueprintSource;
  target: BlueprintAdoptionTarget;
  part_ids: string[];
  changes?: BlueprintPreviewChange<Proposal>[];
  upgrade_of?: string;
}

export interface BlueprintAdoptionApplyInput { preview_id: string; part_ids: string[]; request_id: string }
export interface BlueprintAdoptionReadInput { adoption_id: string }
export interface BlueprintAdoptionUndoInput extends BlueprintAdoptionReadInput { request_id: string }
export interface BlueprintPackSaveInput { source: DraftSource | { kind: "adoption"; adoption_id: string } }
export interface BlueprintPackSaveResult { preview_id: string }

export type BlueprintCurrentValue =
  | { state: "present"; value: SandboxJson; origin: BlueprintPartOrigin | null; revision?: AdoptionRevision }
  | { state: "missing" }
  | { state: "unavailable"; reason: string };

export type BlueprintPreviewCandidate =
  | { kind: "owner"; action: ExactActionReference; subject?: ActionSubject; current: BlueprintCurrentValue }
  | { kind: "bundled"; plugin_id: string; version: string };

const decisions = ["create", "reuse", "update", "needs_choice", "needs_install", "skip"] as const;
export interface BlueprintPreviewPart {
  part_id: string;
  proposal: BlueprintProposal;
  layer: SettingLayer;
  candidates: BlueprintPreviewCandidate[];
  decision: (typeof decisions)[number];
  consequences: SettingConsequence[];
  affected_step_ids: string[];
}

const dependencyChanges = ["added", "removed", "changed"] as const;
export type BlueprintUpgradePart = {
  part_id: string;
  current: BlueprintCurrentValue;
  keep_user_changes: boolean;
  dependency_changes: Array<{ part_id: string; change: (typeof dependencyChanges)[number] }>;
} & (
  | { before: BlueprintProposal; after: BlueprintProposal | null }
  | { before: null; after: BlueprintProposal }
);
export interface BlueprintUpgradeComparison { adoption_id: string; locale: string; parts: BlueprintUpgradePart[] }

export interface BlueprintAdoptionPreviewResult {
  preview_id: string;
  expires_at: string;
  source: BlueprintSource;
  target: BlueprintAdoptionTarget;
  locale: string;
  parts: BlueprintPreviewPart[];
  upgrade?: BlueprintUpgradeComparison;
}

export interface BlueprintOwnerReceipt {
  action: ExactActionReference;
  subject: ActionSubject;
  revision: AdoptionRevision;
}

const skipReasons = ["not_selected", "dependency_unmet", "unsupported", "scope_mismatch", "owner_unavailable", "revision_changed", "reused", "shared", "no_revert"] as const;
const appliedCurrentStates = ["changed", "owner_unavailable"] as const;
type BlueprintApprovalStep = { page_id: string; version: number; approval_request_id: string };
type BlueprintStepError = { code: string; message: string };
type InterruptedStep =
  | ({ state: "needs_approval" } & BlueprintApprovalStep)
  | { state: "failed"; error: BlueprintStepError }
  | { state: "pending_verification"; request_id: string }
  | { state: "skipped"; reason: (typeof skipReasons)[number] };

export type BlueprintApplyStep = { part_id: string } & (
  | { state: "not_started" }
  | { state: "needs_install"; preview_id: string }
  | { state: "applied"; outcome: AdoptionOutcome; receipt: BlueprintOwnerReceipt; approval?: BlueprintApprovalStep; current?: (typeof appliedCurrentStates)[number] }
  | { state: "applied"; outcome: "reused"; current?: (typeof appliedCurrentStates)[number] }
  | InterruptedStep
);

export type UndoStep = { part_id: string } & (
  | { state: "restored"; receipt: BlueprintOwnerReceipt }
  | { state: "detached"; receipt?: BlueprintOwnerReceipt }
  | InterruptedStep
);

type UndoOperation = "revert" | "remove";
export interface UndoResult<Operation extends UndoOperation = UndoOperation> { operation: Operation; request_id: string; steps: UndoStep[] }

interface BlueprintAdoptionIdentity {
  adoption_id: string;
  source: BlueprintSource;
  target: BlueprintAdoptedTarget;
  locale: string;
}
export interface BlueprintAdoptionApplyResult extends BlueprintAdoptionIdentity { steps: BlueprintApplyStep[] }
export interface BlueprintAdoptionReadResult extends BlueprintAdoptionIdentity { apply_steps: BlueprintApplyStep[]; latest_undo: UndoResult | null }
export interface BlueprintAdoptionUndoResult<Operation extends UndoOperation = UndoOperation> { adoption_id: string; undo: UndoResult<Operation> }

const token = { type: "string", pattern: "\\S" } as const;
const locale = { type: "string", pattern: LOCALE_TAG.source } as const;
const timestamp = { type: "string", format: "date-time" } as const;
const nullValue = { type: "null" } as const;
const boolean = { type: "boolean" } as const;
const version = blueprintDraftSourceSchema.properties.revision;
const items = <const S extends ActionSchema>(schema: S, maxItems: number = BLUEPRINT_LIMITS.parts) =>
  ({ type: "array", maxItems, items: schema } as const);
const partIds = { ...items(token), uniqueItems: true } as const;
const exactAction = {
  ...ACTION_REFERENCE_SCHEMA,
  properties: { ...ACTION_REFERENCE_SCHEMA.properties, version },
  required: ["capability_id", "version", "provider_id"],
} as const;

// The service validates a draft and the accepted replacement suggestions with the existing Blueprint inspector.
const blueprintBody = { type: "object" } as const;
const proposalBody = blueprintBody;
const saveDraftInput = inputSchemaFor<BlueprintDraftSaveInput<InferActionInput<typeof blueprintBody>>>()({ oneOf: [
  closedObjectSchema({ expected_revision: nullValue, blueprint: blueprintBody }),
  closedObjectSchema({ draft_id: token, expected_revision: version, blueprint: blueprintBody }),
] });
const draftReadInput = inputSchemaFor<BlueprintDraftReadInput>()(closedObjectSchema({ draft_id: token }));
const draftResult = closedObjectSchema({ draft: closedObjectSchema({
  source: blueprintDraftSourceSchema, blueprint: blueprintBody, locale,
}) });

const personalTarget = closedObjectSchema({ kind: { const: "personal" } });
const previewTarget = { oneOf: [
  personalTarget,
  closedObjectSchema({ kind: { const: "current_project" } }),
  closedObjectSchema({ kind: { const: "new_project" }, display_name: token }),
] } as const;
const adoptedTarget = { oneOf: [
  personalTarget, closedObjectSchema({ kind: { const: "project" }, project_id: token }),
] } as const;
const previewSelection = { oneOf: [
  closedObjectSchema({ kind: { const: "create" } }),
  closedObjectSchema({ kind: { enum: ["reuse", "update"] }, subject: ACTION_SUBJECT_SCHEMA }),
] } as const;
const previewChange = closedObjectSchema({
  part_id: token, proposal: proposalBody, selection: previewSelection, action: exactAction,
}, ["part_id"]);
const previewInput = inputSchemaFor<BlueprintAdoptionPreviewInput<InferActionInput<typeof proposalBody>>>()(closedObjectSchema({
  source: BLUEPRINT_SOURCE_SCHEMA, target: previewTarget, part_ids: partIds,
  changes: { ...items(previewChange), uniqueItems: true }, upgrade_of: token,
}, ["source", "target", "part_ids"]));

const applyInput = inputSchemaFor<BlueprintAdoptionApplyInput>()(closedObjectSchema({
  preview_id: token, part_ids: partIds, request_id: token,
}));
const readInput = inputSchemaFor<BlueprintAdoptionReadInput>()(closedObjectSchema({ adoption_id: token }));
const undoInput = inputSchemaFor<BlueprintAdoptionUndoInput>()(closedObjectSchema({ adoption_id: token, request_id: token }));
const packInput = inputSchemaFor<BlueprintPackSaveInput>()(closedObjectSchema({ source: { oneOf: [
  blueprintDraftSourceSchema, closedObjectSchema({ kind: { const: "adoption" }, adoption_id: token }),
] } }));
const packResult = closedObjectSchema({ preview_id: token });

const json = { type: ["null", "boolean", "number", "string", "array", "object"] } as const;
const currentValue = { oneOf: [
  closedObjectSchema({
    state: { const: "present" }, value: json, origin: { oneOf: [BLUEPRINT_PART_ORIGIN_SCHEMA, nullValue] }, revision: ADOPTION_REVISION_SCHEMA,
  }, ["state", "value", "origin"]),
  closedObjectSchema({ state: { const: "missing" } }),
  closedObjectSchema({ state: { const: "unavailable" }, reason: token }),
] };
const previewCandidate = { oneOf: [
  closedObjectSchema({ kind: { const: "owner" }, action: exactAction, subject: ACTION_SUBJECT_SCHEMA, current: currentValue }, ["kind", "action", "current"]),
  closedObjectSchema({ kind: { const: "bundled" }, plugin_id: token, version: token }),
] };
const previewPart = closedObjectSchema({
  part_id: token, proposal: proposalBody, layer: { enum: SETTINGS_LAYERS }, candidates: items(previewCandidate),
  decision: { enum: decisions }, consequences: { ...items({ enum: SETTINGS_CONSEQUENCES }), uniqueItems: true }, affected_step_ids: partIds,
});
const comparison = {
  part_id: token, current: currentValue, keep_user_changes: boolean,
  dependency_changes: items(closedObjectSchema({ part_id: token, change: { enum: dependencyChanges } })),
};
const nullableProposal = { oneOf: [proposalBody, nullValue] };
const upgradePart = { oneOf: [
  closedObjectSchema({ ...comparison, before: proposalBody, after: nullableProposal }),
  closedObjectSchema({ ...comparison, before: nullValue, after: proposalBody }),
] };
const previewResult = closedObjectSchema({
  preview_id: token, expires_at: timestamp, source: BLUEPRINT_SOURCE_SCHEMA, target: previewTarget, locale, parts: items(previewPart),
  upgrade: closedObjectSchema({ adoption_id: token, locale, parts: items(upgradePart, 2 * BLUEPRINT_LIMITS.parts) }),
}, ["preview_id", "expires_at", "source", "target", "locale", "parts"]);

const part = { part_id: token };
const receipt = closedObjectSchema({ action: exactAction, subject: ACTION_SUBJECT_SCHEMA, revision: ADOPTION_REVISION_SCHEMA });
const approval = { page_id: token, version, approval_request_id: token };
const interrupted = [
  closedObjectSchema({ ...part, state: { const: "needs_approval" }, ...approval }),
  closedObjectSchema({ ...part, state: { const: "failed" }, error: closedObjectSchema({ code: token, message: token }) }),
  closedObjectSchema({ ...part, state: { const: "pending_verification" }, request_id: token }),
  closedObjectSchema({ ...part, state: { const: "skipped" }, reason: { enum: skipReasons } }),
] as const;
const applied = { ...part, state: { const: "applied" }, current: { enum: appliedCurrentStates } } as const;
const applyStep = { oneOf: [
  closedObjectSchema({ ...part, state: { const: "not_started" } }),
  closedObjectSchema({ ...part, state: { const: "needs_install" }, preview_id: token }),
  closedObjectSchema({ ...applied, outcome: { enum: ADOPTION_OUTCOMES }, receipt, approval: closedObjectSchema(approval) }, ["part_id", "state", "outcome", "receipt"]),
  closedObjectSchema({ ...applied, outcome: { const: "reused" } }, ["part_id", "state", "outcome"]),
  ...interrupted,
] };
const undoStep = { oneOf: [
  closedObjectSchema({ ...part, state: { const: "restored" }, receipt }),
  closedObjectSchema({ ...part, state: { const: "detached" }, receipt }, ["part_id", "state"]),
  ...interrupted,
] };
const undoFields = { request_id: token, steps: items(undoStep) };
const undoResult = closedObjectSchema({ operation: { enum: ["revert", "remove"] }, ...undoFields });
const adoptionIdentity = { adoption_id: token, source: BLUEPRINT_SOURCE_SCHEMA, target: adoptedTarget, locale };
const applyResult = closedObjectSchema({ ...adoptionIdentity, steps: items(applyStep) });
const readResult = closedObjectSchema({ ...adoptionIdentity, apply_steps: items(applyStep), latest_undo: { oneOf: [undoResult, nullValue] } });
const undoOutput = (operation: UndoOperation) => closedObjectSchema({
  adoption_id: token, undo: closedObjectSchema({ operation: { const: operation }, ...undoFields }),
});

const person = ["user"] as const;
const drafting = ["user", "agent"] as const;

/** Public declarations; the scene owner will bind them under system.blueprints. */
export const blueprintActions: {
  draftSave: ActionDefinition<BlueprintDraftSaveInput, BlueprintDraftResult>;
  draftRead: ActionDefinition<BlueprintDraftReadInput, BlueprintDraftResult>;
  preview: ActionDefinition<BlueprintAdoptionPreviewInput, BlueprintAdoptionPreviewResult>;
  apply: ActionDefinition<BlueprintAdoptionApplyInput, BlueprintAdoptionApplyResult>;
  read: ActionDefinition<BlueprintAdoptionReadInput, BlueprintAdoptionReadResult>;
  revert: ActionDefinition<BlueprintAdoptionUndoInput, BlueprintAdoptionUndoResult<"revert">>;
  remove: ActionDefinition<BlueprintAdoptionUndoInput, BlueprintAdoptionUndoResult<"remove">>;
  packSave: ActionDefinition<BlueprintPackSaveInput, BlueprintPackSaveResult>;
} = {
  draftSave: blueprintAction("blueprints.drafts.save", /* @version action.blueprints.drafts.save */ 1, "保存场景草稿", "保存场景正文的新稿或按修订保存现有草稿", "command", drafting, saveDraftInput, draftResult, false),
  draftRead: blueprintAction("blueprints.drafts.read", /* @version action.blueprints.drafts.read */ 1, "读取场景草稿", "读取草稿正文和固定的当前修订", "query", drafting, draftReadInput, draftResult, false),
  preview: blueprintAction("blueprints.adoption.preview", /* @version action.blueprints.adoption.preview */ 1, "预览场景采用", "核对选中部分和各主人，返回短期预览及影响", "command", person, previewInput, previewResult),
  apply: blueprintAction("blueprints.adoption.apply", /* @version action.blueprints.adoption.apply */ 1, "采用场景", "按本人确认的预览采用选中部分，回读各主人结果", "command", person, applyInput, applyResult),
  read: blueprintAction("blueprints.adoption.read", /* @version action.blueprints.adoption.read */ 1, "读取场景采用", "回读采用历史与最近一次撤销或移除的结果", "query", person, readInput, readResult),
  revert: blueprintAction("blueprints.adoption.revert", /* @version action.blueprints.adoption.revert */ 1, "撤销场景采用", "按各主人当前凭据尝试恢复本次采用改过的部分", "command", person, undoInput, undoOutput("revert")),
  remove: blueprintAction("blueprints.adoption.remove", /* @version action.blueprints.adoption.remove */ 1, "移除已采用场景", "解除本次场景绑定并回报各部分实际结果", "command", person, undoInput, undoOutput("remove")),
  packSave: blueprintAction("blueprints.packs.save", /* @version action.blueprints.packs.save */ 1, "另存个人场景包", "将固定草稿或采用的快照另存为个人场景包并返回安装预览", "command", person, packInput, packResult),
};

function blueprintAction<Input, Output>(capability_id: string, actionVersion: number, title: string, description: string,
  operation: "query" | "command", audiences: readonly ActionAudience[], input_schema: ActionSchema, output_schema: ActionSchema, concurrent = true,
): ActionDefinition<Input, Output> {
  return { capability_id, version: actionVersion, operation, action: {
    title, description, audiences, input_schema, output_schema, scope: "home", permissions: [], subject_kinds: [],
    kind: operation === "query" ? "query" : "operation", effect: operation === "query" ? "read" : "write",
    ...(audiences.includes("agent") && !audiences.includes("plugin") ? { plugin: false as const } : {}),
    ...(concurrent ? { scheduling: "concurrent" } : {}),
  } };
}
