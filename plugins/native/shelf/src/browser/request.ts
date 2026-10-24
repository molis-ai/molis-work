import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestFailure } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ShelfPage, Snapshot } from "./types.js";

/** One POST to Shelf's routes (`path` follows the plugin's route): the answer, or an error that says why in the Host's words. */
export const post = <T = unknown>(page: ShelfPage, path: string, body: Record<string, unknown> = {}): Promise<T> =>
  molisWorkRequest<T>(page.api + path, { method: "POST", body, scope: page.lifetime, fallback: page.L("shelf.request.shelf-request-failed") });

/** One read of a route as JSON. */
export const read = <T>(page: ShelfPage, path: string, fallback: string, signal?: AbortSignal): Promise<T> =>
  molisWorkRequest<T>(page.api + path, { scope: page.lifetime, fallback, ...(signal ? { signal } : {}) });

/** One read of a file or route as text. */
export const readText = (page: ShelfPage, url: string, fallback: string): Promise<string> =>
  molisWorkRequest<string>(url, { as: "text", scope: page.lifetime, fallback });

/** The snapshot a failed job carries in its answer (Shelf keeps the failure as a row), or nothing. */
export const failureSnapshot = (error: unknown): Snapshot | undefined => {
  const body = (error as UiRequestFailure).body as { snapshot?: Snapshot } | null;
  return body && typeof body === "object" ? body.snapshot : undefined;
};

export const failureCode = (error: unknown): string => (error as UiRequestFailure).code ?? "";
