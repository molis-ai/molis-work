import type { ActionSchema } from "./actions.js";
import { closedObjectSchema } from "./closed-object-schema.js";

/** Blueprints owns this source identity. It carries neither installation nor caller authority. */
export type BlueprintSource =
  | { kind: "package"; plugin_id: string; version: string }
  | { kind: "draft"; draft_id: string; revision: number };

export type BlueprintPartOrigin = { source: BlueprintSource; part_id: string };

const nonEmptyString = { type: "string", minLength: 1 } as const;
export const blueprintDraftSourceSchema = closedObjectSchema({
  kind: { const: "draft" },
  draft_id: nonEmptyString,
  revision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
});

export const BLUEPRINT_SOURCE_SCHEMA = { oneOf: [
  closedObjectSchema({ kind: { const: "package" }, plugin_id: nonEmptyString, version: nonEmptyString }),
  blueprintDraftSourceSchema,
] } as const satisfies ActionSchema;

export const BLUEPRINT_PART_ORIGIN_SCHEMA = closedObjectSchema({
  source: BLUEPRINT_SOURCE_SCHEMA,
  part_id: nonEmptyString,
});
