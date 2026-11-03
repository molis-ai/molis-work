import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { charactersActions } from "@molis-ai/molis-work-module-characters";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { matchesNativePluginPrefix, readNativePluginJsonBody, writeNativePluginJsonResponse } from "./native-plugin-http.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const PREFIX = `/api/plugins/${CHARACTER_PLUGIN_ID}`;

type Body = Record<string, unknown>;
interface CharacterRoute {
  readonly method: "GET" | "POST" | "PUT";
  /** The path under the prefix; `([^/]+)` is the draft's id. */
  readonly path: RegExp;
  readonly action: { readonly capability_id: string; readonly version: number };
  input(body: () => Body, id: string): unknown;
}

const a = charactersActions;
const editable = (body: Body) => ({ expected_revision: body.expected_revision, title: body.title, instructions: body.instructions,
  host_tools: body.host_tools, ...(body.action_tools === undefined ? {} : { action_tools: body.action_tools }) });
/** The page's addresses, each the person's own Characters action; the action checks what it is given. */
const ROUTES: readonly CharacterRoute[] = [
  { method: "GET", path: /^\/actions$/u, action: a.actions, input: () => ({}) },
  { method: "POST", path: /^\/imports\/discover$/u, action: a.discover, input: body => body() },
  { method: "POST", path: /^\/imports$/u, action: a.import, input: body => body() },
  { method: "POST", path: /^\/imports\/file$/u, action: a.importFile, input: body => body() },
  { method: "POST", path: /^\/drafts\/([^/]+)\/file$/u, action: a.draftFile, input: (body, id) => ({ ...body(), id }) },
  { method: "POST", path: /^\/publication\/file$/u, action: a.publicationFile, input: body => body() },
  { method: "POST", path: /^\/execution$/u, action: a.execution, input: body => ({ reference: body().reference }) },
  { method: "POST", path: /^\/execution\/native$/u, action: a.launch, input: body => body() },
  { method: "GET", path: /^\/drafts\/([^/]+)\/runs$/u, action: a.runs, input: (_body, id) => ({ id }) },
  { method: "GET", path: /^\/drafts$/u, action: a.list, input: () => ({}) },
  { method: "POST", path: /^\/drafts$/u, action: a.create, input: () => ({}) },
  { method: "PUT", path: /^\/drafts\/([^/]+)$/u, action: a.update, input: (body, id) => ({ id, ...editable(body()) }) },
  { method: "POST", path: /^\/drafts\/([^/]+)\/state$/u, action: a.state, input: (body, id) => ({ id, expected_revision: body().expected_revision, state: body().state }) },
  { method: "POST", path: /^\/drafts\/([^/]+)\/publish$/u, action: a.publish, input: (body, id) => ({ id, expected_revision: body().expected_revision }) },
];

function matchRoute(method: string | undefined, path: string): { route: CharacterRoute; id: string } | undefined {
  for (const route of ROUTES) {
    const match = route.method === method ? route.path.exec(path) : null;
    if (match) return { route, id: match[1] ?? "" };
  }
  return undefined;
}

/** How the door calls an action: as the person, in one project, until `signal` ends. */
export type CharactersInvoke = (signal: AbortSignal, reference: ActionReference, input: unknown) => Promise<unknown>;

/** The person's own call through the project's shared directory, where the Host's provider registered Characters. */
export function hostCharactersInvoke(localHost: MolisWorkLocalHost, projectRef: LocalHostProjectReference): CharactersInvoke {
  return async (signal, reference, input) => localHost.actionClient(projectRef)
    .invoke(await localWebActionContext(localHost, projectRef, LOCAL_OWNER_PERMISSIONS, signal), reference, input);
}

/**
 * The Characters page's door (CHR-1): each address invokes the person's own Characters action in this project. A request that
 * ends early cancels its call.
 */
export async function handleCharactersHttp(request: IncomingMessage, response: ServerResponse, url: URL, invoke: CharactersInvoke): Promise<boolean> {
  if (!matchesNativePluginPrefix(url.pathname, PREFIX)) return false;
  const matched = matchRoute(request.method, url.pathname.slice(PREFIX.length));
  if (!matched) return false;
  const abort = new AbortController();
  const stop = () => abort.abort(new ActionError("actions.cancelled", "这次调用已结束"));
  request.once("aborted", stop); response.once("close", stop);
  try {
    const raw = matched.route.method === "GET" ? {} : await readNativePluginJsonBody(request, 256_000);
    const body = (): Body => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ActionError("actions.input_invalid", "角色请求格式无效");
      return raw;
    };
    const input = matched.route.input(body, decodeURIComponent(matched.id));
    const { capability_id, version } = matched.route.action;
    const result = await invoke(abort.signal, { capability_id, version, provider_id: CHARACTER_PLUGIN_ID }, input);
    writeNativePluginJsonResponse(response, { status: 200, body: result });
  } catch (error) {
    writeNativePluginJsonResponse(response, actionErrorResponse(error));
  } finally {
    request.off("aborted", stop); response.off("close", stop);
  }
  return true;
}
