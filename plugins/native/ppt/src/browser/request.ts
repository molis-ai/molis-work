import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { PptHost, PptRequest, Translate } from "./types.js";

/** PPT's routes carry the current project and accept an individual generation request's abort signal. */
export function pptRequest(host: PptHost, L: Translate): PptRequest {
  return pluginRequest(host, {
    project: { id: () => host.projectId(), missing: () => L("ppt.error.no-project"), includeInRequest: true },
    fallback: () => L("ppt.error.request"),
    codes: { "ppt.conflict": () => L("ppt.error.conflict") },
  });
}
