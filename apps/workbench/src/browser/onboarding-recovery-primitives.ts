import {
  fileKindExtension,
  renderFileKind,
  renderMaterialIssueRow,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderScopeDeltaCard,
} from "@molis-ai/molis-work-plugin-sdk/ui";

(globalThis as unknown as Record<string, unknown>).molisRecoveryParts = {
  fileKindExtension,
  renderFileKind,
  renderMaterialsFunnel,
  renderMaterialsTrack,
  renderMaterialIssueRow,
  renderScopeDeltaCard,
};
