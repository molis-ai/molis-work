import type { McpPresentationErrorFactory } from "./query-presentation.js";

export function mcpWebUrl(path: string, baseUrl: string, createError: McpPresentationErrorFactory): string {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    throw createError("web.url_invalid", `无效的 Molis Work Web 地址: ${baseUrl}`);
  }
}

export function mcpGoalContractResponse<T extends { goal_path: string }>(
  contract: T,
  baseUrl: string,
  projectId: string | null | undefined,
  createError: McpPresentationErrorFactory,
): T & { goal_url: string } {
  const path = projectId
    ? `/projects/${encodeURIComponent(projectId)}${contract.goal_path}`
    : contract.goal_path;
  return { ...contract, goal_url: mcpWebUrl(path, baseUrl, createError) };
}
