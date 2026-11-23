import {
  fileKindExtension,
  renderFileKind,
  renderMaterialIssueRow,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderNote,
  renderScopeDeltaCard,
} from "@molis-ai/molis-work-plugin-sdk/ui";

const recoveryParts = {
  fileKindExtension,
  renderFileKind,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderMaterialIssueRow,
  renderNote,
  renderScopeDeltaCard,
};

declare global {
  var molisRecoveryParts: typeof recoveryParts | undefined;
}

globalThis.molisRecoveryParts = recoveryParts;
