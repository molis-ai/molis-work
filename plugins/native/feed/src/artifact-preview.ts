import { bindArtifactPreview, defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { FEED_CAPTURE_ARTIFACT_TYPE_ID } from "./identity.js";

/** A captured message as Markdown (specs/artifact-positioning A4): its title, summary, source and link as captured. */
export const feedArtifactPreview = defineArtifactPreviewAction("feed.artifacts.preview", "捕获的消息", ["feed:read"]);
export const feedArtifactPreviewHandler = bindArtifactPreview(feedArtifactPreview, FEED_CAPTURE_ARTIFACT_TYPE_ID, artifact => {
  const payload = (artifact.payload ?? {}) as { title?: unknown; summary?: unknown; url?: unknown; source?: { source_label?: unknown } };
  const lines = [`# ${artifact.title}`];
  if (typeof payload.summary === "string" && payload.summary.trim()) lines.push("", payload.summary.trim());
  const source = typeof payload.source?.source_label === "string" ? payload.source.source_label : "";
  if (source) lines.push("", `来源：${source}`);
  if (typeof payload.url === "string" && /^https?:\/\//u.test(payload.url)) lines.push("", `[打开原文](${payload.url})`);
  return { media_type: "text/markdown", text: lines.join("\n") + "\n" };
});
