import { ActionError, bindArtifactPreview, defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { CODING_REPORT_TYPE } from "./artifacts.js";
import { codingReportPreview } from "./report.js";

/**
 * A saved run report as its Markdown body (specs/artifact-positioning A4); the run itself stays in Coding. A report whose
 * identity does not match its own session and round is not previewed.
 */
export const codingArtifactPreview = defineArtifactPreviewAction("coding.artifacts.preview", "Coding 执行报告", ["artifact:read"]);
export const codingArtifactPreviewHandler = bindArtifactPreview(codingArtifactPreview, CODING_REPORT_TYPE, artifact => {
  const report = codingReportPreview(artifact);
  if (!report) throw new ActionError("actions.input_invalid", "这份报告与它的会话和轮次对不上，不能预览");
  return { media_type: "text/markdown", text: report.body_markdown };
});
