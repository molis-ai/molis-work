import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

const runtimeErrors = defineErrorCodes("installer", {
  config_invalid: "invalid",
  installation_invalid: "invalid",
  receipt_invalid: "invalid",
  unsupported: "invalid",
});
const homeErrors = defineErrorCodes("installer.home", {
  not_directory: "invalid",
  unknown_file: "invalid",
});
const releaseErrors = defineErrorCodes("installer.release", {
  conflict: "invalid",
});
const serviceErrors = defineErrorCodes("installer.service", {
  command_failed: "invalid",
  conflict: "invalid",
  plan_missing: "invalid",
  plan_stale: "invalid",
  unsupported: "invalid",
});
const sourceErrors = defineErrorCodes("installer.source", {
  asset_missing: "invalid",
  build_stale: "invalid",
  invalid: "invalid",
});
const uninstallErrors = defineErrorCodes("installer.uninstall", {
  conflict: "invalid",
  plan_missing: "invalid",
  plan_stale: "invalid",
  purge_confirmation_required: "invalid",
  step_failed: "invalid",
});
const versionErrors = defineErrorCodes("installer.version", {
  invalid: "invalid",
});

/** Installer refusals keep the current code and default transport classification. */
export const installerErrors = {
  "installer.config_invalid": runtimeErrors.config_invalid,
  "installer.installation_invalid": runtimeErrors.installation_invalid,
  "installer.receipt_invalid": runtimeErrors.receipt_invalid,
  "installer.unsupported": runtimeErrors.unsupported,
  "installer.home.not_directory": homeErrors.not_directory,
  "installer.home.unknown_file": homeErrors.unknown_file,
  "installer.release.conflict": releaseErrors.conflict,
  "installer.service.command_failed": serviceErrors.command_failed,
  "installer.service.conflict": serviceErrors.conflict,
  "installer.service.plan_missing": serviceErrors.plan_missing,
  "installer.service.plan_stale": serviceErrors.plan_stale,
  "installer.service.unsupported": serviceErrors.unsupported,
  "installer.source.asset_missing": sourceErrors.asset_missing,
  "installer.source.build_stale": sourceErrors.build_stale,
  "installer.source.invalid": sourceErrors.invalid,
  "installer.uninstall.conflict": uninstallErrors.conflict,
  "installer.uninstall.plan_missing": uninstallErrors.plan_missing,
  "installer.uninstall.plan_stale": uninstallErrors.plan_stale,
  "installer.uninstall.purge_confirmation_required": uninstallErrors.purge_confirmation_required,
  "installer.uninstall.step_failed": uninstallErrors.step_failed,
  "installer.version.invalid": versionErrors.invalid,
};
