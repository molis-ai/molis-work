import { closedObjectSchema as object } from "../platform/closed-object-schema.js";

// `SkillRef`'s closed schema as a literal, so `inputSchemaFor` can hold each request that carries one to its interface. No subpath exports
// this file: `services/skills` exports the schema as `SKILL_REF_SCHEMA`. It lives apart because the work executor protocol, which
// `platform/actions` re-exports, takes `SkillRef`s too, and `services/skills` imports `platform/actions`: importing it from there would be
// a cycle that reads the schema before it is made.
const id = { type: "string", minLength: 1, maxLength: 200 } as const;

/** `SKILL_BODY_READ_MAX_REFS` (`services/skills`, where its reason is written): also the most a round may select. */
export const SKILL_REFS_MAX = 20;

export const skillRefSchema = object({
  source: object({ kind: { const: "plugin" }, plugin_id: id, plugin_version: id, publisher_signature: id }),
  skill_id: id, version: { type: "integer", minimum: 1 }, install_id: id, installation_generation: id,
});
