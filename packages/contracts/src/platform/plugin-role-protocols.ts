/**
 * Typed role protocols for plugin-to-plugin discovery (Audit #10, PEQ-09).
 * Providers tag their public actions with these input/output types; consumers discover providers through
 * `services.actions.directory` by role instead of pinning a provider ID or action ID.
 */

type TypedActionShape = { readonly input_type?: string; readonly output_type?: string };

/** Role 1: File-copy intake (e.g. saving a generated image or file copy into a receiver such as Shelf). */
export const FILE_COPY_INTAKE_INPUT_TYPE = /* @version type.molis.file.intake.input "molis.file.intake.input.v{version}" */ "molis.file.intake.input.v1";
export const FILE_COPY_INTAKE_OUTPUT_TYPE = /* @version type.molis.file.intake.output "molis.file.intake.output.v{version}" */ "molis.file.intake.output.v1";

export function isFileCopyIntakeAction(action: TypedActionShape): boolean {
  return action.input_type === FILE_COPY_INTAKE_INPUT_TYPE && action.output_type === FILE_COPY_INTAKE_OUTPUT_TYPE;
}

/** Role 2: Fixed-artifact / process-item Markdown document export (used alongside `isArtifactPreviewAction`). */
export const ARTIFACT_DOCUMENT_INPUT_TYPE = /* @version type.molis.artifacts.document.request "molis.artifacts.document.request.v{version}" */ "molis.artifacts.document.request.v1";
export const ARTIFACT_DOCUMENT_OUTPUT_TYPE = /* @version type.molis.artifacts.document "molis.artifacts.document.v{version}" */ "molis.artifacts.document.v1";

export function isArtifactDocumentAction(action: TypedActionShape): boolean {
  return action.input_type === ARTIFACT_DOCUMENT_INPUT_TYPE && action.output_type === ARTIFACT_DOCUMENT_OUTPUT_TYPE;
}

/** Role 3: Material-to-document generation (4 roles discovered together on one provider). */
export const DOCUMENT_GENERATION_ROLES = ["generate", "generations.get", "generations.list", "document.get"] as const;
export type DocumentGenerationRole = (typeof DOCUMENT_GENERATION_ROLES)[number];

export const DOCUMENT_GENERATION_PROTOCOL: Record<DocumentGenerationRole, { readonly input_type: string; readonly output_type: string }> = {
  "generate": {
    input_type: /* @version type.molis.docgen.generate.input "molis.docgen.generate.input.v{version}" */ "molis.docgen.generate.input.v1",
    output_type: /* @version type.molis.docgen.generate.output "molis.docgen.generate.output.v{version}" */ "molis.docgen.generate.output.v1",
  },
  "generations.get": {
    input_type: /* @version type.molis.docgen.get.input "molis.docgen.get.input.v{version}" */ "molis.docgen.get.input.v1",
    output_type: /* @version type.molis.docgen.get.output "molis.docgen.get.output.v{version}" */ "molis.docgen.get.output.v1",
  },
  "generations.list": {
    input_type: /* @version type.molis.docgen.list.input "molis.docgen.list.input.v{version}" */ "molis.docgen.list.input.v1",
    output_type: /* @version type.molis.docgen.list.output "molis.docgen.list.output.v{version}" */ "molis.docgen.list.output.v1",
  },
  "document.get": {
    input_type: /* @version type.molis.docgen.document.input "molis.docgen.document.input.v{version}" */ "molis.docgen.document.input.v1",
    output_type: /* @version type.molis.docgen.document.output "molis.docgen.document.output.v{version}" */ "molis.docgen.document.output.v1",
  },
};

export function documentGenerationRoleOf(action: TypedActionShape): DocumentGenerationRole | null {
  return DOCUMENT_GENERATION_ROLES.find(role =>
    DOCUMENT_GENERATION_PROTOCOL[role].input_type === action.input_type
    && DOCUMENT_GENERATION_PROTOCOL[role].output_type === action.output_type) ?? null;
}

/** Role 4: Work-goal promotion target (3 roles discovered together on one provider). */
export const WORK_GOAL_PROMOTION_ROLES = ["directory.read", "create", "inputs.confirm"] as const;
export type WorkGoalPromotionRole = (typeof WORK_GOAL_PROMOTION_ROLES)[number];

export const WORK_GOAL_PROMOTION_PROTOCOL: Record<WorkGoalPromotionRole, { readonly input_type: string; readonly output_type: string }> = {
  "directory.read": {
    input_type: /* @version type.molis.goal.promote.read.input "molis.goal.promote.read.input.v{version}" */ "molis.goal.promote.read.input.v1",
    output_type: /* @version type.molis.goal.promote.read.output "molis.goal.promote.read.output.v{version}" */ "molis.goal.promote.read.output.v1",
  },
  "create": {
    input_type: /* @version type.molis.goal.promote.create.input "molis.goal.promote.create.input.v{version}" */ "molis.goal.promote.create.input.v1",
    output_type: /* @version type.molis.goal.promote.create.output "molis.goal.promote.create.output.v{version}" */ "molis.goal.promote.create.output.v1",
  },
  "inputs.confirm": {
    input_type: /* @version type.molis.goal.promote.confirm.input "molis.goal.promote.confirm.input.v{version}" */ "molis.goal.promote.confirm.input.v1",
    output_type: /* @version type.molis.goal.promote.confirm.output "molis.goal.promote.confirm.output.v{version}" */ "molis.goal.promote.confirm.output.v1",
  },
};

export function workGoalPromotionRoleOf(action: TypedActionShape): WorkGoalPromotionRole | null {
  return WORK_GOAL_PROMOTION_ROLES.find(role =>
    WORK_GOAL_PROMOTION_PROTOCOL[role].input_type === action.input_type
    && WORK_GOAL_PROMOTION_PROTOCOL[role].output_type === action.output_type) ?? null;
}
