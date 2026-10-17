import type { ServerResponse } from "node:http";
import { ActionError, type ActionProgressEvent } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteResponse, PluginRouteStreamLine } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_ROUTE_STREAM_LIMITS, actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { recordedCallIdField } from "./call-id-response.js";
import { withPluginInteraction } from "./plugin-interaction-answer.js";

/**
 * Answer a route that declares `stream: "ndjson"`. The plugin only hands progress events; this writes each as a `progress` line
 * with the fields an event has (whatever else it carried is dropped), and ends with the one `result` or `error` line, which
 * nothing else writes. Progress past its bounds stops the call (`stop`) and ends the stream with `actions.output_invalid`.
 * Nothing is written once the response has closed. An `error` line names the call the way a JSON refusal does (`call_id`).
 */
export async function answerPluginRouteStream(response: ServerResponse,
  dispatch: (emit: (event: ActionProgressEvent) => void) => Promise<PluginRouteResponse | null>, stop: () => void): Promise<boolean> {
  let lines = 0, progressBytes = 0, overflow = false;
  const write = (line: PluginRouteStreamLine): string => {
    const text = JSON.stringify(line) + "\n";
    if (!response.destroyed && !response.writableEnded) response.write(text);
    return text;
  };
  const emit = (event: ActionProgressEvent) => {
    if (overflow) return;
    const text = JSON.stringify({ type: "progress", stage: event.stage, progress: event.progress,
      ...(event.text_delta !== undefined ? { text_delta: event.text_delta } : {}) }) + "\n";
    const bytes = Buffer.byteLength(text);
    lines += 1; progressBytes += bytes;
    if (bytes > PLUGIN_ROUTE_STREAM_LIMITS.line_bytes || lines > PLUGIN_ROUTE_STREAM_LIMITS.lines || progressBytes > PLUGIN_ROUTE_STREAM_LIMITS.progress_bytes) {
      overflow = true; stop(); return;
    }
    if (!response.destroyed && !response.writableEnded) response.write(text);
  };
  response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.flushHeaders();
  const overflowError = () => new ActionError("actions.output_invalid", "进度超出了流式回复的上限");
  try {
    const result = await dispatch(emit);
    if (overflow) write(errorLine(overflowError()));
    else if (!result) write(errorLine(new ActionError("actions.missing", "插件没有这个入口")));
    else if (result.status >= 200 && result.status < 300) write({ type: "result", result: withPluginInteraction(result.body) });
    else write(refusalLine(result));
  } catch (error) {
    write(errorLine(overflow ? overflowError() : error));
  } finally {
    if (!response.destroyed && !response.writableEnded) response.end();
  }
  return true;
}

function errorLine(error: unknown): PluginRouteStreamLine {
  const refusal = actionErrorResponse(error);
  return refusalLine({ status: refusal.status, body: refusal.body });
}

/** The same fields a JSON route's refusal carries, as one line. */
function refusalLine(result: Pick<PluginRouteResponse, "status" | "body">): PluginRouteStreamLine {
  const body = (result.body ?? {}) as { code?: unknown; error?: unknown; call_id?: unknown; details?: unknown };
  const callId = typeof body.call_id === "string" ? { call_id: body.call_id } : recordedCallIdField();
  return { type: "error", status: result.status, code: typeof body.code === "string" ? body.code : "actions.execution_failed",
    error: typeof body.error === "string" ? body.error : "能力执行失败", ...callId,
    ...(body.details && typeof body.details === "object" ? { details: body.details as Readonly<Record<string, unknown>> } : {}) };
}
