import type { IncomingMessage, ServerResponse } from "node:http";
import { FormPluginRouteTable, createFormRouteHandlers,
  type FormRoutePorts, type FormPluginRouteRequest } from "@molis-ai/molis-work-plugin-form";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { withRewrittenPluginApi } from "./native-plugin-api.js";
import { agentQuestionHtml } from "./agent-question-card.js";
import { L } from "./web-locale.js";

/**
 * 「AI 生成题目」 asking first (specs/ai-interaction-experience S1): the Host draws the questions as the same shared question card
 * the Assistant and Coding show, so the Forms page only binds it.
 */
function withQuestionCard<T extends { body?: unknown } | null>(result: T): T {
  const body = result?.body as { status?: string; interaction?: { interaction_id: string; why: string; questions: AgentPendingQuestion["questions"]; html?: string } } | undefined;
  if (body?.status === "needs_input" && body.interaction) body.interaction.html = agentQuestionHtml({ pending_id: body.interaction.interaction_id, kind: "form-draft",
    prompt: body.interaction.why, options: [], allows_free_text: false, questions: body.interaction.questions ?? [] }, L, {}, L("回答后接着生成题目。"));
  return result;
}

export async function handleFormNativePluginHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: (input: FormPluginRouteRequest, transport: { signal: AbortSignal }) => FormRoutePorts | Promise<FormRoutePorts>): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  if (routed.pathname !== "/api/form" && !routed.pathname.startsWith("/api/form/")) return false;
  const controller = new AbortController(), cancel = () => { if (!response.writableEnded) controller.abort(); };
  response.once("close", cancel);
  try { return await dispatchNativePluginJsonHttp(request, response, routed, {
    prefix: "/api/form",
    async handle(input) { return withQuestionCard(await new FormPluginRouteTable(createFormRouteHandlers(await ports(input, { signal: controller.signal }))).handle(input)); },
  }); }
  finally { response.off("close", cancel); }
}
