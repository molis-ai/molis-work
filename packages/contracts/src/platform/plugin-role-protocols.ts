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

/** Role 4: Work-item promotion target (3 roles discovered together on one provider). */
export const WORK_ITEM_PROMOTION_ROLES = ["directory.read", "create", "inputs.confirm"] as const;
export type WorkItemPromotionRole = (typeof WORK_ITEM_PROMOTION_ROLES)[number];

export const WORK_ITEM_PROMOTION_PROTOCOL: Record<WorkItemPromotionRole, { readonly input_type: string; readonly output_type: string }> = {
  "directory.read": {
    input_type: /* @version type.molis.work.promote.read.input "molis.work.promote.read.input.v{version}" */ "molis.work.promote.read.input.v1",
    output_type: /* @version type.molis.work.promote.read.output "molis.work.promote.read.output.v{version}" */ "molis.work.promote.read.output.v1",
  },
  "create": {
    input_type: /* @version type.molis.work.promote.create.input "molis.work.promote.create.input.v{version}" */ "molis.work.promote.create.input.v1",
    output_type: /* @version type.molis.work.promote.create.output "molis.work.promote.create.output.v{version}" */ "molis.work.promote.create.output.v1",
  },
  "inputs.confirm": {
    input_type: /* @version type.molis.work.promote.confirm.input "molis.work.promote.confirm.input.v{version}" */ "molis.work.promote.confirm.input.v1",
    output_type: /* @version type.molis.work.promote.confirm.output "molis.work.promote.confirm.output.v{version}" */ "molis.work.promote.confirm.output.v1",
  },
};

export function workItemPromotionRoleOf(action: TypedActionShape): WorkItemPromotionRole | null {
  return WORK_ITEM_PROMOTION_ROLES.find(role =>
    WORK_ITEM_PROMOTION_PROTOCOL[role].input_type === action.input_type
    && WORK_ITEM_PROMOTION_PROTOCOL[role].output_type === action.output_type) ?? null;
}

/** Role 5: Cross-device work-progress continuity (3 roles discovered on one provider; viewer callers only need read roles). */
export const WORK_PROGRESS_CONTINUITY_ROLES = ["states.read", "progress.record", "progress.receipt"] as const;
export type WorkProgressContinuityRole = (typeof WORK_PROGRESS_CONTINUITY_ROLES)[number];

export const WORK_PROGRESS_CONTINUITY_PROTOCOL: Record<WorkProgressContinuityRole, { readonly input_type: string; readonly output_type: string }> = {
  "states.read": {
    input_type: /* @version type.molis.work.continuity.states.input "molis.work.continuity.states.input.v{version}" */ "molis.work.continuity.states.input.v1",
    output_type: /* @version type.molis.work.continuity.states.output "molis.work.continuity.states.output.v{version}" */ "molis.work.continuity.states.output.v1",
  },
  "progress.record": {
    input_type: /* @version type.molis.work.continuity.record.input "molis.work.continuity.record.input.v{version}" */ "molis.work.continuity.record.input.v1",
    output_type: /* @version type.molis.work.continuity.record.output "molis.work.continuity.record.output.v{version}" */ "molis.work.continuity.record.output.v1",
  },
  "progress.receipt": {
    input_type: /* @version type.molis.work.continuity.receipt.input "molis.work.continuity.receipt.input.v{version}" */ "molis.work.continuity.receipt.input.v1",
    output_type: /* @version type.molis.work.continuity.receipt.output "molis.work.continuity.receipt.output.v{version}" */ "molis.work.continuity.receipt.output.v1",
  },
};

export function workProgressContinuityRoleOf(action: TypedActionShape): WorkProgressContinuityRole | null {
  return WORK_PROGRESS_CONTINUITY_ROLES.find(role =>
    WORK_PROGRESS_CONTINUITY_PROTOCOL[role].input_type === action.input_type
    && WORK_PROGRESS_CONTINUITY_PROTOCOL[role].output_type === action.output_type) ?? null;
}

/**
 * Role 6: Image generation (4 roles discovered together on one provider): the image services the person set up, starting one
 * picture, reading that job's state (never asking the service again), and reading a finished picture's bytes. The plugin studio
 * draws its proposals through whichever plugin declares all four, so the platform names no image plugin.
 */
export const IMAGE_GENERATION_ROLES = ["services.list", "generate", "generations.get", "image.read"] as const;
export type ImageGenerationRole = (typeof IMAGE_GENERATION_ROLES)[number];

export const IMAGE_GENERATION_PROTOCOL: Record<ImageGenerationRole, { readonly input_type: string; readonly output_type: string }> = {
  "services.list": {
    input_type: /* @version type.molis.imagegen.services.input "molis.imagegen.services.input.v{version}" */ "molis.imagegen.services.input.v1",
    output_type: /* @version type.molis.imagegen.services.output "molis.imagegen.services.output.v{version}" */ "molis.imagegen.services.output.v1",
  },
  "generate": {
    input_type: /* @version type.molis.imagegen.generate.input "molis.imagegen.generate.input.v{version}" */ "molis.imagegen.generate.input.v1",
    output_type: /* @version type.molis.imagegen.generate.output "molis.imagegen.generate.output.v{version}" */ "molis.imagegen.generate.output.v1",
  },
  "generations.get": {
    input_type: /* @version type.molis.imagegen.get.input "molis.imagegen.get.input.v{version}" */ "molis.imagegen.get.input.v1",
    output_type: /* @version type.molis.imagegen.get.output "molis.imagegen.get.output.v{version}" */ "molis.imagegen.get.output.v1",
  },
  "image.read": {
    input_type: /* @version type.molis.imagegen.image.input "molis.imagegen.image.input.v{version}" */ "molis.imagegen.image.input.v1",
    output_type: /* @version type.molis.imagegen.image.output "molis.imagegen.image.output.v{version}" */ "molis.imagegen.image.output.v1",
  },
};

// The transferable part of a generation job. Providers may keep additional private job and connection fields.
const imageId = { type: "string", minLength: 1, maxLength: 256 } as const;
const imageObject = <T extends Record<string, unknown>>(properties: T) =>
  ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false } as const);
const imageJob = imageObject({ job: imageObject({ id: imageId, connection_id: imageId, status: { enum: ["running", "succeeded", "failed", "cancelled", "interrupted"] },
  images: { type: "array", items: imageObject({ id: imageId }) }, error: { type: "string" } }) });
export const IMAGE_GENERATION_SCHEMAS = {
  "services.list": { input: imageObject({}), output: imageObject({ connections: { type: "array", items: imageObject({ id: imageId, available: { type: "boolean" } }) } }) },
  generate: { input: imageObject({ request_id: { ...imageId, maxLength: 128 }, connection_id: imageId, prompt: { type: "string", minLength: 1, maxLength: 32000 } }), output: imageJob },
  "generations.get": { input: imageObject({ id: imageId }), output: imageJob },
  "image.read": { input: imageObject({ id: imageId, image_id: imageId }), output: imageObject({ base64: { type: "string" }, mime_type: { type: "string" } }) },
} as const;

export function imageGenerationRoleOf(action: TypedActionShape): ImageGenerationRole | null {
  return IMAGE_GENERATION_ROLES.find(role =>
    IMAGE_GENERATION_PROTOCOL[role].input_type === action.input_type
    && IMAGE_GENERATION_PROTOCOL[role].output_type === action.output_type) ?? null;
}
