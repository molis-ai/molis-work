import type { IncomingMessage, ServerResponse } from "node:http";
import { dispatchNativePluginJsonHttp } from "../native-plugin-http.js";
import type { AgentDefinitions } from "./agent-definitions.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentDisplayModel, displayAgentPrompt, displayAgentRole } from "./display-words.js";

/** The local Web's single person, as every other local write. */
const WEB_ACTOR = LOCAL_PERSON_ACTOR_ID;

/**
 * `/api/agent-definitions/*`: every registered prompt and role, the person's edits of prompts, their history. Editing
 * text never changes what a role may do; the Host enforces that in code, and the page says so.
 */
export async function handleAgentDefinitionsHttp(request: IncomingMessage, response: ServerResponse, url: URL, definitions: AgentDefinitions, locale?: string): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/agent-definitions", maxBodyBytes: 200_000,
    async handle({ method, pathname, body }) {
      const path = pathname.slice("/api/agent-definitions".length);
      const key = url.searchParams.get("key") ?? (typeof body.key === "string" ? body.key : "");
      const promptWords = () => agentDisplayModel(definitions.registrations(), locale, "prompt");
      if (method === "GET" && path === "/prompts") {
        const words = promptWords();
        return { status: 200, body: { prompts: definitions.prompts(locale).map(prompt => displayAgentPrompt(prompt, words)) } };
      }
      if (method === "GET" && path === "/roles") {
        const words = agentDisplayModel(definitions.registrations(), locale, "role");
        return { status: 200, body: { roles: definitions.roles().map(role => displayAgentRole(role, words)) } };
      }
      if (method === "GET" && path === "/diagnostics") return { status: 200, body: definitions.diagnostics() };
      if (method === "GET" && path === "/prompt") return { status: 200, body: { prompt: displayAgentPrompt(definitions.prompt(key, locale), promptWords()), history: definitions.history(key), uses: definitions.uses.list(key) } };
      const expected = body.expected_revision === null || body.expected_revision === undefined ? null : Number(body.expected_revision);
      if (method === "POST" && path === "/prompt") return { status: 200, body: { prompt: displayAgentPrompt(definitions.save(key, String(body.body ?? ""), expected, WEB_ACTOR, locale), promptWords()) } };
      if (method === "POST" && path === "/prompt/reset") return { status: 200, body: { prompt: displayAgentPrompt(definitions.reset(key, expected, WEB_ACTOR, locale), promptWords()) } };
      return null;
    },
  });
}
