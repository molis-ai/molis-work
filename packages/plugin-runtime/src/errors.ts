export class PluginRuntimeError extends Error {
  constructor(
    readonly code:
      | "plugin.manifest_invalid"
      | "plugin.definition_missing"
      | "plugin.definition_conflict"
      | "plugin.entrypoint_missing"
      | "plugin.grant_denied"
      | "plugin.state_invalid"
      | "plugin.install_replaced"
      | "plugin.executor_failed"
      | "plugin.contribution_kind_invalid"
      | "plugin.contribution_unredeemed"
      | "plugin.quarantined"
      | "plugin.upgrade_required"
      | "plugin.kept_data_incompatible"
      | "plugin.upgrade_validation_missing"
      | "plugin.upgrade_validation_failed"
      | "plugin.upgrade_rollback_failed",
    message: string,
  ) {
    super(message);
    this.name = "PluginRuntimeError";
  }
}
