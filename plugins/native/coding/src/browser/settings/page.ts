import type { UiClientTranslate } from "@molis-ai/molis-work-contracts/platform/ui";
import { errorMessage } from "../dom.js";

/** The route the injected constant names, under the prefix the Host drew on the section (the project's address, or Home's). */
declare const CODING_SETTINGS_API: string;
/** The page's own translator. */
declare const L: UiClientTranslate;

export const translate: UiClientTranslate = L;

/** A directory the project has granted. */
export interface Workspace { readonly workspace_id: string; readonly canonical_path: string }

/** One request to Coding's routes, from a section whose address prefix the Host drew on it. */
export function codingRequest<Answer>(root: HTMLElement, path: string, body?: unknown, fallback?: string): Promise<Answer> {
  const url = (root.dataset.prefix ?? "") + CODING_SETTINGS_API + path;
  return molisWorkRequest<Answer>(url, body === undefined ? { fallback } : { body, fallback });
}

/** The code the Host put on a refusal, when it did. */
export function codeOf(error: unknown): string | undefined {
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : undefined;
}

export { errorMessage };
