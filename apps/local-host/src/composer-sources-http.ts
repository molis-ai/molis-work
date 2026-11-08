import type { IncomingMessage, ServerResponse } from "node:http";
import type { ActionSubject, ActionView, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_TYPE, composerErrors, type ComposerPickInput, type ComposerPickOutput } from "@molis-ai/molis-work-contracts/platform/composer";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { readLocalWebBody as readBody, sendLocalWebJson as sendJson } from "./web-http.js";

/**
 * The unified input's `+` sources (specs/unified-input-voice/implementation-plan.md §3.3, slice K2; S-composer-source-call): the
 * Workbench document lists the `composer_source` actions the person can call here and calls one as they type. The bound client
 * carries the person's own authority and project; nothing here names a plugin. A plugin page has no way in (the page authority
 * lets it only its own routes), so a framed plugin never reads another owner's picks.
 *
 * - `sources` reads the directory now: a source turned off, uninstalled or no longer granted is not listed.
 * - `pick` reads it again and calls only the exact source the menu listed, else `composer.source_unavailable`; the source gets
 *   `query`, `limit` and the page's current object as `near` only when its kind is one of the source's own `subject_kinds`.
 */
export async function handleComposerSourcesHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: () => BoundActionClient): Promise<boolean> {
  if (url.pathname !== "/api/composer/sources" && url.pathname !== "/api/composer/pick") return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  try {
    const body = await readBody(request), client = actions();
    const layer = body.layer === "plain" ? "plain" : "ai";
    const listed = (await client.discover()).filter((view) => isSource(view, layer));
    if (url.pathname === "/api/composer/sources") {
      sendJson(response, 200, { sources: listed.map((view) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
        provider: view.provider.title, title: view.action.composer_source!.title })) });
      return true;
    }
    const view = listed.find((one) => one.capability_id === body.capability_id && one.version === body.version && one.provider.provider_id === body.provider_id);
    if (!view) throw composerErrors.source_unavailable("这个来源现在用不了：已停用、卸载或不再授权");
    const near = sourceNear(view, body.near);
    const input: ComposerPickInput = { query: typeof body.query === "string" ? body.query : "", limit: typeof body.limit === "number" ? body.limit : 20, ...(near ? { near } : {}) };
    const definition = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, operation: view.operation, action: view.action };
    sendJson(response, 200, await client.invoke<ComposerPickInput, ComposerPickOutput>(definition, input));
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendJson(response, failure.status, failure.body);
  }
  return true;
}

/** A source the person can call now in this layer: declared as one, offered to them and available. */
function isSource(view: ActionView, layer: "ai" | "plain"): boolean {
  const declared = view.action.composer_source;
  return Boolean(declared?.layers.includes(layer)) && view.availability.available && view.action.audiences.includes("user")
    && view.action.input_type === COMPOSER_PICK_INPUT_TYPE && view.action.output_type === COMPOSER_PICK_OUTPUT_TYPE;
}

/** The page's object, only when its kind is the source's own: a source never learns which object of another owner the page shows. */
function sourceNear(view: ActionView, near: unknown): ActionSubject | undefined {
  if (!near || typeof near !== "object") return undefined;
  const subject = near as ActionSubject;
  return typeof subject.kind === "string" && view.action.subject_kinds.includes(subject.kind) ? subject : undefined;
}
