import { bindArtifactPreview, defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { FORM_ARTIFACT_TYPE_ID, type FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { formMarkdown } from "./content-actions.js";

/** A pinned version of a form as its questions in Markdown (specs/artifact-positioning A4); answers are never part of it. */
export const formArtifactPreview = defineArtifactPreviewAction("form.artifacts.preview", "问卷", ["form:read"]);
export const formArtifactPreviewHandler = bindArtifactPreview(formArtifactPreview, FORM_ARTIFACT_TYPE_ID, artifact => ({
  media_type: "text/markdown", text: formMarkdown({ description: "", questions: [], ...(artifact.payload as object), title: artifact.title } as unknown as FormRecord) }));
