import type { ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";

/** A published character as Markdown (specs/artifact-positioning A4): its instructions and the tools it may use. */
export function characterArtifactMarkdown(artifact: ArtifactVersionRecord): { media_type: string; text: string } {
  const payload = (artifact.payload ?? {}) as { instructions?: unknown; host_tools?: unknown };
  const lines = [`# ${artifact.title}`, ""];
  if (typeof payload.instructions === "string") lines.push(payload.instructions.trim());
  const tools = Array.isArray(payload.host_tools) ? payload.host_tools.filter((tool): tool is string => typeof tool === "string") : null;
  lines.push("", tools === null ? "可用工具：沿用运行时的选择" : tools.length ? `可用工具：${tools.join("、")}` : "可用工具：无");
  return { media_type: "text/markdown", text: lines.join("\n") + "\n" };
}
