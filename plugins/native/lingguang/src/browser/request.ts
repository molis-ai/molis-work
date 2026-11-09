import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { LingguangHost, LingguangRequest, Scope, Translate } from "./types.js";

/** Spark and platform requests belong to the mounted Lingguang view. */
export function lingguangRequest(host: LingguangHost, life: Scope, L: Translate): LingguangRequest {
  return pluginRequest(host, { scope: life, readRefusal: true, fallback: () => L("lingguang.error.request") });
}
