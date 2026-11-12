import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { SUBJECT_CONTEXT_PATH, UI_SUBJECT_CONTEXT_KINDS, UI_SUBJECT_CONTEXT_PLUGINS, type SubjectContextAnswer, type UiSubjectContextKind } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse, subjectContextAction, subjectContextInput, subjectContextText } from "@molis-ai/molis-work-plugin-sdk";
import { pinOwnerRead, type RuntimeStageOwner } from "./project-plugin-stages.js";
import { sendLocalWebJson } from "./web-http.js";

/** The longest object id the route takes, in Unicode code points; a longer one is refused, never cut (a cut id names another object). */
const ID_LIMIT = 256;
/** A plugin that is not there to answer, or no longer offers the read, gives nothing; any other failure is the page's to show. */
const ABSENT = new Set(["actions.forbidden", "actions.plugin_disabled", "actions.missing", "actions.provider_changed"]);
const KINDS: ReadonlySet<string> = new Set(UI_SUBJECT_CONTEXT_KINDS);

export interface SubjectContextPorts {
  /** The running owners of the plugins the project shows, in the order the Host lists its plugins. */
  readonly owners: () => Promise<readonly RuntimeStageOwner[]>;
  /** The person's client for exactly that owner's one read, carrying only that action's permissions (`bindLocalWebAction`). */
  readonly bind: (action: ActionDefinition, owner: RuntimeStageOwner, signal: AbortSignal) => BoundActionClient;
}

function requested(url: URL): { kind: UiSubjectContextKind; id: string } {
  const kinds = url.searchParams.getAll("kind"), ids = url.searchParams.getAll("id");
  if ([...url.searchParams.keys()].some(name => name !== "kind" && name !== "id") || kinds.length !== 1 || ids.length !== 1) {
    throw new ActionError("actions.input_invalid", "关联原文只接受一个 kind 和一个 id");
  }
  const kind = kinds[0]!, id = ids[0]!;
  if (!KINDS.has(kind)) throw new ActionError("actions.input_invalid", `关联原文的 kind 只能是 ${[...KINDS].join("、")}`);
  if (!id.trim() || [...id].length > ID_LIMIT) throw new ActionError("actions.input_invalid", `关联原文的 id 必须是 1 到 ${ID_LIMIT} 个字符`);
  return { kind: kind as UiSubjectContextKind, id };
}

/** One owner's text about the object, read as the person through the owner's own declared read; null when it keeps none. */
async function ownerText(owner: RuntimeStageOwner, kind: UiSubjectContextKind, id: string, ports: SubjectContextPorts, signal: AbortSignal): Promise<string | null> {
  const action = subjectContextAction(owner.entry.manifest, kind);
  if (!action) return null;
  try {
    const { client, pinned } = await pinOwnerRead(owner, action, (declared, bound) => ports.bind(declared, bound, signal));
    const answer = await client.invoke(pinned, subjectContextInput(kind, id));
    owner.assertCurrent();
    return subjectContextText(answer);
  } catch (error) {
    if (error instanceof ActionError && ABSENT.has(error.code)) return null;
    throw error;
  }
}

/**
 * The text each plugin the project shows keeps about one object (GAS-01), from the read its Manifest declares in `ui.subject_context`,
 * called as the person in the project with only that action's permissions and with exactly the object's id. No plugin is named here, and
 * nothing is delegated: the reads keep the person's own `user` audience, so an Agent, workflow, MCP client or plugin page never gets the
 * text this way (plugin pages are refused this path by `PluginPageAuthority.bind`). At most `UI_SUBJECT_CONTEXT_PLUGINS` answers.
 */
export async function handleSubjectContextHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: SubjectContextPorts): Promise<boolean> {
  if (request.method !== "GET" || url.pathname !== SUBJECT_CONTEXT_PATH) return false;
  const abort = new AbortController();
  const disconnected = () => { if (!response.writableEnded) abort.abort(new ActionError("actions.cancelled", "页面读取已取消")); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  try {
    const { kind, id } = requested(url);
    const contexts: Array<SubjectContextAnswer["contexts"][number]> = [];
    for (const owner of await ports.owners()) {
      if (contexts.length >= UI_SUBJECT_CONTEXT_PLUGINS) break;
      abort.signal.throwIfAborted();
      const text = await ownerText(owner, kind, id, ports, abort.signal);
      if (text) contexts.push({ plugin_id: owner.entry.manifest.plugin_id, source_context: text });
    }
    abort.signal.throwIfAborted();
    const answer: SubjectContextAnswer = { contexts };
    response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(JSON.stringify(answer));
  } catch (error) {
    const refusal = actionErrorResponse(error);
    sendLocalWebJson(response, refusal.status, refusal.body);
  } finally {
    request.off("aborted", disconnected); response.off("close", disconnected);
  }
  return true;
}
