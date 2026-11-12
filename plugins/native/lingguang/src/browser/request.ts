import { pluginRequest } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { LingguangHost, LingguangRequest, Scope } from "./types.js";

const uiText = globalThis.t;

/** Spark and platform requests belong to the mounted Lingguang view. */
export function lingguangRequest(host: LingguangHost, life: Scope): LingguangRequest {
  return pluginRequest(host, { scope: life, readRefusal: true, fallback: () => uiText.text("lingguang.error.request") });
}
