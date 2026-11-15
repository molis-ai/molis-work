import {
  fileKindExtension,
  renderFileKind,
  renderMaterialIssueRow,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderScopeDeltaCard,
} from "@molis-ai/molis-work-plugin-sdk/ui";

const recoveryParts = {
  fileKindExtension,
  renderFileKind,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderMaterialIssueRow,
  renderScopeDeltaCard,
};

declare global {
  var molisRecoveryParts: typeof recoveryParts | undefined;
}

globalThis.molisRecoveryParts = recoveryParts;
