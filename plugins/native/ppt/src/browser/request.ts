import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { PptHost, PptRequest } from "./types.js";

const uiText = globalThis.t;

/** PPT's routes carry the current project and accept an individual generation request's abort signal. */
export function pptRequest(host: PptHost): PptRequest {
  return pluginRequest(host, {
    project: { id: () => host.projectId(), missing: () => uiText.text("ppt.error.no-project"), includeInRequest: true },
    fallback: () => uiText.text("ppt.error.request"),
    codes: { "ppt.conflict": () => uiText.text("ppt.error.conflict") },
  });
}
