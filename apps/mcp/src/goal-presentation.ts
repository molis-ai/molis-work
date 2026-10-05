/** Keep host-specific Error classes outside the presentation package. */
export type McpPresentationErrorFactory = (code: string, message: string, details?: Record<string, unknown>) => Error;

export function mcpWebUrl(path: string, baseUrl: string, createError: McpPresentationErrorFactory): string {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    throw createError("web.url_invalid", `无效的 Molis Work Web 地址: ${baseUrl}`);
  }
}
