import { defineErrorCodes } from "./action-errors.js";

/** Current Runtime and authoring refusals; the transport classification remains the prior default 400. */
export const pluginErrors = defineErrorCodes("plugin", {
  always_on: "invalid",
  capability_denied: "invalid",
  consent_required: "invalid",
  consent_revoked: "invalid",
  consent_unknown: "not_found",
  contribution_kind_invalid: "invalid",
  contribution_unredeemed: "invalid",
  declaration_invalid: "invalid",
  definition_conflict: "invalid",
  definition_missing: "invalid",
  entrypoint_missing: "invalid",
  event_type_missing: "invalid",
  event_type_undeclared: "invalid",
  executor_failed: "invalid",
  /** A package that cannot be exported (`details.reason`: `host_build`, `not_content_package`, `package_missing`; capability-pack §4.9). */
  export_unavailable: "not_found",
  grant_denied: "invalid",
  home_scope_unavailable: "invalid",
  id_namespace_conflict: "invalid",
  in_process_denied: "invalid",
  install_replaced: "invalid",
  integration_declaration_conflict: "invalid",
  integration_unavailable: "unavailable",
  kept_data_incompatible: "invalid",
  manifest_invalid: "invalid",
  manifest_version_invalid: "invalid",
  package_invalid: "invalid",
  permission_invalid: "invalid",
  preview_unknown: "not_found",
  publisher_revoked: "invalid",
  publisher_untrusted: "invalid",
  quarantined: "invalid",
  rule_key_reserved: "invalid",
  scene_not_declared: "forbidden",
  signature_invalid: "invalid",
  signer_mismatch: "invalid",
  state_invalid: "invalid",
  storage_denied: "invalid",
  storage_input_invalid: "invalid",
  upgrade_required: "invalid",
  upgrade_rollback_failed: "invalid",
  upgrade_validation_failed: "invalid",
  upgrade_validation_missing: "invalid",
});

/**
 * One reason a declaration was refused, pointing at the Skill and the package file when there is one, e.g.
 * `{ skill_id: "meeting-notes", path: "skills/meeting-notes/SKILL.md", reason: "包里找不到" }`. A `plugin.declaration_invalid` from the
 * Manifest or package checks carries all of them as `details.problems`, in the order found; the page lists them as they are.
 */
export interface PluginDeclarationProblem {
  skill_id?: string;
  path?: string;
  reason: string;
}
