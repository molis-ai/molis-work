import type { IncomingMessage, ServerResponse } from "node:http";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AssistantSendInput } from "@molis-ai/molis-work-contracts/services/assistant";
import { dispatchNativePluginJsonHttp } from "../native-plugin-http.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { actionEffect } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionKey, assistantAuthority, assistantProjectPrompts } from "./assistant-authority.js";
import { AssistantError, AssistantService } from "./assistant-service.js";
import { ASSISTANT_STORE_NAME, AssistantStore, AssistantStoreError } from "./assistant-store.js";

/** The local Web's single person. The same identity every other local write uses. */
const WEB_ACTOR = "web-user";

export interface AssistantHttpPorts {
  localHost: MolisWorkLocalHost;
  homeDirectory: string;
  agentHost: AgentHost;
  agentReady: () => Promise<void>;
  projectTitle(projectId: string): Promise<string | null>;
}

/** One Assistant per Home. Its store is opened once and lives as long as the Host that serves it. */
const services = new WeakMap<MolisWorkLocalHost, { home: string; service: AssistantService; store: AssistantStore }>();

export function assistantServiceFor(ports: AssistantHttpPorts): { service: AssistantService; store: AssistantStore } {
  const existing = services.get(ports.localHost);
  if (existing && existing.home === ports.homeDirectory) return existing;
  const store = new AssistantStore(openHomeSqliteDatabase(ports.homeDirectory, ASSISTANT_STORE_NAME));
  const service = new AssistantService(store, {
    host: async () => { await ports.agentReady(); return ports.agentHost; },
    authority: async work => ({ ...assistantAuthority(ports.localHost, work, () => store.disabledActions(WEB_ACTOR)),
      project_prompts: await assistantProjectPrompts(ports.localHost, work) }),
    projectTitle: ports.projectTitle,
  }, WEB_ACTOR);
  const entry = { home: ports.homeDirectory, service, store };
  services.set(ports.localHost, entry);
  return entry;
}

/**
 * `/api/assistant/*`, served under whichever project page the person is on. The page's project only decides the
 * scope of a *new* work; an existing work keeps the scope it was started with.
 */
export async function handleAssistantHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: AssistantHttpPorts & { projectRef?: LocalHostProjectReference }): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/assistant", maxBodyBytes: 400_000,
    async handle({ method, pathname, body }) {
      const { service, store } = assistantServiceFor(ports);
      const parts = pathname.slice("/api/assistant/".length).split("/").map(decodeURIComponent);
      if (method === "GET" && parts.length === 1 && parts[0] === "works") return { status: 200, body: { works: await service.list() } };
      if (method === "POST" && parts.length === 1 && parts[0] === "send") {
        return { status: 200, body: await service.send(body as unknown as AssistantSendInput, ports.projectRef ? { project_ref: ports.projectRef } : {}) };
      }
      // What the Assistant may use here, and what the person switched off for it.
      if (method === "GET" && parts.length === 1 && parts[0] === "capabilities") {
        const off = store.disabledActions(WEB_ACTOR);
        const reference = ports.projectRef;
        const caller = { actor_id: WEB_ACTOR, actor_kind: "runtime" as const, project_id: reference?.project_id ?? null, audience: "agent" as const, permissions: [] };
        const catalog = await ports.localHost.inspectActions(caller, reference);
        return { status: 200, body: { capabilities: catalog.filter(view => view.action.audiences.includes("agent") && (!view.provider.project_id || view.provider.project_id === caller.project_id)).map(view => ({
          capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, provider: view.provider.title, title: view.action.title,
          description: view.action.description, operation: view.operation, effect: actionEffect(view.action, view.capability_id), scope: view.action.scope,
          enabled: !off.has(actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })),
        })) } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "capabilities") {
        if (typeof body.capability_id !== "string" || !Number.isSafeInteger(body.version) || typeof body.provider_id !== "string" || typeof body.enabled !== "boolean") throw new AssistantError("assistant.invalid", "能力标识无效");
        store.setActionEnabled(WEB_ACTOR, actionKey({ capability_id: body.capability_id, version: body.version as number, provider_id: body.provider_id }), body.enabled);
        return { status: 200, body: { ok: true } };
      }
      if (parts[0] !== "works" || !parts[1]) return null;
      const workId = parts[1];
      if (method === "GET" && parts.length === 2) return { status: 200, body: await service.read(workId) };
      if (method !== "POST") return null;
      if (parts.length === 3 && parts[2] === "control") return { status: 200, body: await service.control(workId, body as never) };
      if (parts.length === 3 && parts[2] === "answer") return { status: 200, body: await service.answer(workId, body as never) };
      if (parts.length === 3 && parts[2] === "draft") return { status: 200, body: { work: service.saveDraft(workId, body.draft as string) } };
      if (parts.length === 3 && parts[2] === "rename") return { status: 200, body: { work: await service.rename(workId, Number(body.revision), String(body.title ?? "")) } };
      if (parts.length === 3 && parts[2] === "archive") return { status: 200, body: { work: await service.archive(workId, body.archived !== false) } };
      if (parts.length === 4 && parts[2] === "reviews") return { status: 200, body: await service.decide(workId, { review_id: parts[3]!, decision: body.decision as "approve" | "reject", ...(typeof body.note === "string" ? { note: body.note } : {}) }) };
      return null;
    },
    mapError(error) {
      if (error instanceof AssistantError) {
        const status = error.code === "assistant.not_found" ? 404 : error.code === "assistant.scope" ? 403
          : ["assistant.conflict", "assistant.pending_request", "assistant.busy", "assistant.stale", "assistant.state", "assistant.needs_check"].includes(error.code) ? 409 : 400;
        return { status, body: { error: error.message, code: error.code, ...(error.action ? { action: error.action } : {}), ...(error.work ? { work: error.work } : {}) } };
      }
      if (error instanceof AssistantStoreError) return { status: error.code === "assistant.not_found" ? 404 : 409, body: { error: error.message, code: error.code } };
      return { status: 500, body: { error: error instanceof Error ? error.message : "助理暂时无法完成，输入已保留", code: "assistant.failed" } };
    },
  });
}
