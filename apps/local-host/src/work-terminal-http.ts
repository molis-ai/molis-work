import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, WORK_TERMINAL_PATH, workTerminalActions } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

function decodeSegment(raw: string): string {
  try { return decodeURIComponent(raw); } catch { throw new ActionError("actions.input_invalid", "终端路径参数无效"); }
}

/**
 * The person's HTTP door to platform object work terminals (`/api/work-terminals/:pluginId/:kind/:id`, PEQ-17).
 * Every request runs as the local person through `system.work-terminal`; plugin frames (`x-molis-plugin-page`) are refused
 * before reaching this route by `PluginPageAuthority.bind`.
 */
export async function handleWorkTerminalHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  localHost: MolisWorkLocalHost,
  hostReference: LocalHostProjectReference,
): Promise<boolean> {
  if (!url.pathname.startsWith(`${WORK_TERMINAL_PATH}/`)) return false;
  const segments = url.pathname.slice(WORK_TERMINAL_PATH.length + 1).split("/");
  if (segments.length !== 3 && segments.length !== 4) return false;
  const method = request.method ?? "GET";
  const isList = segments.length === 3 && method === "GET";
  const isOpen = segments.length === 3 && method === "POST";
  const isClose = segments.length === 4 && method === "DELETE";
  const isPrompt = segments.length === 4 && segments[3] === "prompt" && method === "POST";
  if (!isList && !isOpen && !isClose && !isPrompt) return false;

  const abort = new AbortController();
  const disconnected = () => { if (!response.writableEnded) abort.abort(new ActionError("actions.cancelled", "工作终端请求已取消")); };
  request.once("aborted", disconnected);
  response.once("close", disconnected);
  try {
    const plugin_id = decodeSegment(segments[0]!);
    const subject = { kind: decodeSegment(segments[1]!), id: decodeSegment(segments[2]!) };
    const actions = bindLocalWebActions(localHost, hostReference, LOCAL_OWNER_PERMISSIONS, { signal: abort.signal });
    if (isList) {
      sendLocalWebJson(response, 200, await actions.invoke(workTerminalActions.list, { plugin_id, subject }));
      return true;
    }
    if (isClose) {
      const key = decodeSegment(segments[3]!);
      sendLocalWebJson(response, 200, await actions.invoke(workTerminalActions.close, { plugin_id, subject, key }));
      return true;
    }
    const body = await readLocalWebBody(request);
    if (isPrompt) {
      if ([...url.searchParams.keys()].some(name => name !== "onboarding")) {
        throw new ActionError("actions.input_invalid", "推进提示只接受 onboarding 参数");
      }
      const onboarding = url.searchParams.get("onboarding") === "1";
      sendLocalWebJson(response, 200, await actions.invoke(workTerminalActions.prompt, {
        ...body, plugin_id, subject, ...(onboarding ? { onboarding: true } : {}),
      }));
      return true;
    }
    sendLocalWebJson(response, 200, await actions.invoke(workTerminalActions.open, { ...body, plugin_id, subject }));
    return true;
  } catch (error) {
    const refusal = actionErrorResponse(error);
    sendLocalWebJson(response, refusal.status, refusal.body);
    return true;
  } finally {
    request.off("aborted", disconnected);
    response.off("close", disconnected);
  }
}
