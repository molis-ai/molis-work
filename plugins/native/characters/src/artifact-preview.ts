import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";

/** A published character as the 成果库 and side panel show it: Markdown of its instructions and tools (the conversion is Characters', modules/characters). */
export const charactersArtifactPreview = defineArtifactPreviewAction("characters.artifacts.preview", "角色", ["artifact:read"]);
