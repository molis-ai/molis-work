import { bindArtifactPreview, defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { PPT_ARTIFACT_TYPE_ID, type PptRecord } from "@molis-ai/molis-work-contracts/modules/ppt";
import { pptMarkdown } from "./content-actions.js";

/** A pinned version of a deck as its outline in Markdown (specs/artifact-positioning A4). */
export const pptArtifactPreview = defineArtifactPreviewAction("ppt.artifacts.preview", "演示稿", ["ppt:read"]);
export const pptArtifactPreviewHandler = bindArtifactPreview(pptArtifactPreview, PPT_ARTIFACT_TYPE_ID, artifact => ({
  media_type: "text/markdown", text: pptMarkdown({ description: "", slides: [], ...(artifact.payload as object), title: artifact.title } as unknown as PptRecord) }));
