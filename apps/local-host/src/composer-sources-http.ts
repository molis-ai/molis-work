import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, isSubjectReader, type ActionProvider, type ActionSubject, type ActionView, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { COMPOSER_PICK_INPUT_TYPE, COMPOSER_PICK_OUTPUT_TYPE, composerErrors, type ComposerPickInput, type ComposerPickOutput } from "@molis-ai/molis-work-contracts/platform/composer";
import { composerDraftInner, parseComposerDraftKey } from "@molis-ai/molis-work-design-system";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { installedPluginManifest } from "./plugin-installation-directory.js";
import { pluginInstallRecords } from "./plugin-install-records.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { pageLocale } from "./web-locale.js";
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
 * - The call carries the request's abort: a page that moved on (a newer query, the menu closed) closes the request, so a pick not
 *   started yet is not run and one under way gets the cancellation on its `caller.signal` (N42–N56: a late pick costs nothing).
 */
/** The plugin words a source's name may be written in, by the language the page is in (a provider's manifest `ui.translations`). */
export type ComposerSourceWords = (provider: ActionProvider) => Readonly<Record<string, string>> | undefined;

/**
 * The English names of this page's plugins, read once per request: the Home's installations and, with a project, the project's
 * (the same manifests the plugin directory shows). Only the page's language matters; the source's own title is a plugin word and
 * follows the plugin's `ui.translations`, as `SearchSourceKind.title` does (specs/unified-input-voice/implementation-plan.md §3.3).
 */
export async function composerSourceWords(localHost: MolisWorkLocalHost, reference: LocalHostProjectReference | undefined): Promise<ComposerSourceWords> {
  if (pageLocale() !== "en") return () => undefined;
  const words = new Map<string, Readonly<Record<string, string>>>();
  const keep = (manifest: PluginManifest | undefined): void => {
    if (manifest?.ui?.translations) words.set(manifest.plugin_id, manifest.ui.translations);
  };
  for (const record of localHost.homePlugins?.installations() ?? []) keep(localHost.homePlugins?.manifest(record.plugin_id));
  if (reference) await localHost.withProject(reference, runtime => {
    for (const record of pluginInstallRecords(runtime.store.db).list()) keep(installedPluginManifest(runtime.store.db, record.install_id)?.manifest);
  });
  return provider => provider.plugin_id ? words.get(provider.plugin_id) : undefined;
}

export async function handleComposerSourcesHttp(request: IncomingMessage, response: ServerResponse, url: URL, actions: (signal: AbortSignal) => BoundActionClient, words?: ComposerSourceWords): Promise<boolean> {
  if (url.pathname !== "/api/composer/sources" && url.pathname !== "/api/composer/pick") return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  const left = new AbortController();
  const cancel = () => left.abort(new ActionError("actions.cancelled", "这次选取已经结束"));
  const closed = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", closed);
  try {
    const body = await readBody(request), client = actions(left.signal);
    const layer = body.layer === "plain" ? "plain" : "ai";
    const directory = await client.discover(), listed = directory.filter((view) => isSource(view, layer));
    // A source's provider and its own name are plugin words: in an English page they follow that plugin's `ui.translations`,
    // else stay as declared. The picked items' titles are the person's own content and are never translated.
    const word = (provider: ActionProvider, text: string) => pageLocale() === "en" ? words?.(provider)?.[text] ?? text : text;
    if (url.pathname === "/api/composer/sources") {
      sendJson(response, 200, { sources: listed.map((view) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
        provider: word(view.provider, view.provider.title), title: word(view.provider, view.action.composer_source!.title) })) });
      return true;
    }
    const view = listed.find((one) => one.capability_id === body.capability_id && one.version === body.version && one.provider.provider_id === body.provider_id);
    if (!view) throw composerErrors.source_unavailable("这个来源现在用不了：已停用、卸载或不再授权");
    const near = sourceNear(view, body.near, directory);
    const input: ComposerPickInput = { query: typeof body.query === "string" ? body.query : "", limit: typeof body.limit === "number" ? body.limit : 20, ...(near ? { near } : {}) };
    const definition = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, operation: view.operation, action: view.action };
    const picked = await client.invoke<ComposerPickInput, ComposerPickOutput>(definition, input);
    if (picked.items.some(item => !sourceOwns(view, item.ref.subject.kind, directory)))
      throw composerErrors.source_unavailable("这个来源返回了不属于自己的资料");
    sendJson(response, 200, picked);
  } catch (error) {
    const failure = actionErrorResponse(error);
    if (!response.destroyed) sendJson(response, failure.status, failure.body);
  } finally { request.off("aborted", cancel); response.off("close", closed); }
  return true;
}

/** The most keys one sweep judges: a machine with more drafts than this sweeps the rest on a later start. */
const SWEEP_KEYS = 500;

/**
 * The composer's start-up sweep (§3.4, UIC-10): the Workbench document sends its draft keys (no text), and gets back those whose
 * project is no longer in the Home, or whose plugin is no longer in its project. Home drafts and the Workbench's own are not judged,
 * nor is a plugin the catalog does not know (`undefined`): its drafts go with the live `molis-work:plugins-changed` event when it
 * is removed. A key that is not a draft is never named. Reads only; nothing is written on the host.
 */
export async function handleComposerDraftsHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  home: { projects: () => readonly string[]; reach: (project: string) => Promise<(plugin: string) => boolean | undefined> }): Promise<boolean> {
  if (url.pathname !== "/api/composer/drafts/sweep") return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  try {
    const body = await readBody(request), listed = new Set(home.projects()), judges = new Map<string, (plugin: string) => boolean | undefined>();
    const remove: string[] = [];
    for (const key of (Array.isArray(body.keys) ? body.keys : []).slice(0, SWEEP_KEYS)) {
      const place = typeof key === "string" ? parseComposerDraftKey(composerDraftInner(key) ?? "") : null;
      if (!place || place.project === "home") continue;
      if (!listed.has(place.project)) { remove.push(key as string); continue; }
      if (place.install === "workbench") continue;
      if (!judges.has(place.project)) judges.set(place.project, await home.reach(place.project));
      if (judges.get(place.project)!(place.install) === false) remove.push(key as string);
    }
    sendJson(response, 200, { remove });
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
function sourceNear(view: ActionView, near: unknown, directory: readonly ActionView[]): ActionSubject | undefined {
  if (!near || typeof near !== "object") return undefined;
  const subject = near as ActionSubject & { plugin_id?: unknown };
  if (typeof subject.plugin_id !== "string" || subject.plugin_id !== view.provider.plugin_id) return undefined;
  return typeof subject.kind === "string" && sourceOwns(view, subject.kind, directory) ? { kind: subject.kind, id: subject.id } : undefined;
}

/** The same directory proves ownership for both the page's near object and each returned pick. */
function sourceOwns(view: ActionView, kind: string, directory: readonly ActionView[]): boolean {
  if (!view.action.subject_kinds.includes(kind)) return false;
  const readers = directory.filter(one => isSubjectReader(one.action) && one.action.subject_kinds.includes(kind));
  const owners = new Set(readers.map(one => one.provider.provider_id));
  return owners.size === 1 && owners.has(view.provider.provider_id) && readers.some(one => one.availability.available);
}
