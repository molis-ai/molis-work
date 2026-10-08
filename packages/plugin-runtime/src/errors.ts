export class PluginRuntimeError extends Error {
  constructor(
    readonly code:
      | "plugin_manifest_invalid"
      | "plugin_definition_missing"
      | "plugin_definition_conflict"
      | "plugin_entrypoint_missing"
      | "plugin_grant_denied"
      | "plugin_state_invalid"
      | "plugin_install_replaced"
      | "plugin_executor_failed"
      | "plugin_contribution_kind_invalid"
      | "plugin_contribution_unredeemed"
      | "plugin_quarantined"
      | "plugin_upgrade_required"
      | "plugin_kept_data_incompatible"
      | "plugin_upgrade_validation_missing"
      | "plugin_upgrade_validation_failed"
      | "plugin_upgrade_rollback_failed",
    message: string,
  ) {
    super(message);
    this.name = "PluginRuntimeError";
  }
}
