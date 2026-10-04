import type { IncomingMessage, ServerResponse } from "node:http";
import { dispatchNativePluginJsonHttp } from "../native-plugin-http.js";
import { AgentDefinitionsError, type AgentDefinitions } from "./agent-definitions.js";
import { UNREGISTERED_MODEL_CALLS } from "./builtin-instructions.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/** The local Web's single person, as every other local write. */
const WEB_ACTOR = LOCAL_PERSON_ACTOR_ID;

/**
 * `/api/agent-definitions/*`: every registered prompt and role, the person's edits of prompts, their history. Editing
 * text never changes what a role may do; the Host enforces that in code, and the page says so.
 */
export async function handleAgentDefinitionsHttp(request: IncomingMessage, response: ServerResponse, url: URL, definitions: AgentDefinitions): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/agent-definitions", maxBodyBytes: 200_000,
    async handle({ method, pathname, body }) {
      const path = pathname.slice("/api/agent-definitions".length);
      const key = url.searchParams.get("key") ?? (typeof body.key === "string" ? body.key : "");
      if (method === "GET" && path === "/prompts") return { status: 200, body: { prompts: definitions.prompts() } };
      if (method === "GET" && path === "/roles") return { status: 200, body: { roles: definitions.roles() } };
      if (method === "GET" && path === "/diagnostics") return { status: 200, body: definitions.diagnostics(UNREGISTERED_MODEL_CALLS) };
      if (method === "GET" && path === "/prompt") return { status: 200, body: { prompt: definitions.prompt(key), history: definitions.history(key), uses: definitions.uses(key) } };
      const expected = body.expected_revision === null || body.expected_revision === undefined ? null : Number(body.expected_revision);
      if (method === "POST" && path === "/prompt") return { status: 200, body: { prompt: definitions.save(key, String(body.body ?? ""), expected, WEB_ACTOR) } };
      if (method === "POST" && path === "/prompt/reset") return { status: 200, body: { prompt: definitions.reset(key, expected, WEB_ACTOR) } };
      return null;
    },
    mapError(error) {
      if (error instanceof AgentDefinitionsError) {
        return { status: error.code === "agent_definitions.not_found" ? 404 : error.code === "agent_definitions.conflict" ? 409 : 400, body: { error: error.message, code: error.code } };
      }
      return { status: 500, body: { error: error instanceof Error ? error.message : "读取 Prompt 失败" } };
    } });
}
