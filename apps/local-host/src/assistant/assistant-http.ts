import type { IncomingMessage, ServerResponse } from "node:http";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AssistantSendInput } from "@molis-ai/molis-work-contracts/services/assistant";
import { dispatchNativePluginJsonHttp } from "../native-plugin-http.js";
import { localWebActionContext } from "../local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../local-owner-permissions.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { actionEffect } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionKey, assistantAuthority, assistantProjectPrompts } from "./assistant-authority.js";
import { AssistantError, AssistantService } from "./assistant-service.js";
import { ASSISTANT_STORE_NAME, AssistantStore, AssistantStoreError } from "./assistant-store.js";
import { codingCharacterPorts } from "../characters-host.js";
import { assistantContributions } from "./assistant-contributions.js";

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
  const service: AssistantService = new AssistantService(store, {
    host: async () => { await ports.agentReady(); return ports.agentHost; },
    authority: async work => ({ ...assistantAuthority(ports.localHost, work, () => store.disabledActions(WEB_ACTOR), (offer, views) => service.recordOffer(work, offer, views),
      (view, input, output) => service.recordResult(work, view, input, output)),
      project_prompts: await assistantProjectPrompts(ports.localHost, work),
      // A Character published in the work's project, frozen at its exact version for the round (the Host checks it again at dispatch).
      ...(work.project_ref ? { resolveCharacter: await projectCharacters(ports, work.project_ref).then(characters => characters.resolve) } : {}) }),
    characters: async project => (await projectCharacters(ports, project)).list().map(choice => ({ reference: { ...choice.reference }, title: choice.title, available: choice.available,
      ...(choice.reason ? { reason: choice.reason } : {}) })),
    projectTitle: ports.projectTitle,
    // The person's own actions in the work's project, as the page there would use them.
    personActions: async work => {
      const reference = work.project_ref;
      if (!reference) throw new AssistantError("assistant.scope", "Coding Agent 在项目里工作");
      const client = ports.localHost.actionClient(reference);
      return {
        discover: async () => client.discover(await localWebActionContext(ports.localHost, reference, LOCAL_OWNER_PERMISSIONS)),
        invoke: async (action, input) => client.invoke(await localWebActionContext(ports.localHost, reference, LOCAL_OWNER_PERMISSIONS), action, input),
      };
    },
    // Reading related objects back from their owners, as the person: the work's project, or the Home for personal work.
    scopeActions: async work => {
      const reference = work.project_ref;
      const client = reference ? ports.localHost.actionClient(reference) : ports.localHost.homeActionClient();
      return {
        discover: async () => client.discover(await localWebActionContext(ports.localHost, reference, LOCAL_OWNER_PERMISSIONS)),
        invoke: async (action, input) => client.invoke(await localWebActionContext(ports.localHost, reference, LOCAL_OWNER_PERMISSIONS), action, input),
      };
    },
  }, WEB_ACTOR);
  const entry = { home: ports.homeDirectory, service, store };
  services.set(ports.localHost, entry);
  return entry;
}

/** The person's published Characters in one project: listed with whether each can run, and frozen exactly for a round. */
async function projectCharacters(ports: AssistantHttpPorts, project: LocalHostProjectReference) {
  const { board, artifacts } = await ports.localHost.withProject(project, async runtime => ({ board: runtime.board_id, artifacts: runtime.coordinator.artifacts.query }));
  return codingCharacterPorts(ports.homeDirectory, WEB_ACTOR, board, artifacts);
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
      // The works that relate to one object here: for that object's own page ("belongs to …", continue it).
      if (method === "GET" && parts.length === 1 && parts[0] === "related") {
        const kind = url.searchParams.get("kind") ?? "", id = url.searchParams.get("id") ?? "";
        if (!kind || !id) return { status: 400, body: { error: "需要对象种类与标识" } };
        return { status: 200, body: { works: await service.related(ports.projectRef?.project_id ?? null, { kind, id }) } };
      }
      // Characters the person may choose here: for a work (its own project), or for a new work on this page.
      if (method === "GET" && parts.length === 1 && parts[0] === "characters") {
        const work = url.searchParams.get("work") ?? undefined;
        return { status: 200, body: { characters: await service.characters(work, ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      }
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
      // What each plugin here contributes for the Assistant, and exactly what is missing (developer diagnostics).
      if (method === "GET" && parts.length === 1 && parts[0] === "contributions") {
        const reference = ports.projectRef;
        const caller = { actor_id: WEB_ACTOR, actor_kind: "runtime" as const, project_id: reference?.project_id ?? null, audience: "agent" as const, permissions: [] };
        const catalog = (await ports.localHost.inspectActions(caller, reference)).filter(view => !view.provider.project_id || view.provider.project_id === caller.project_id);
        return { status: 200, body: { contributions: assistantContributions(catalog) } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "capabilities") {
        if (typeof body.capability_id !== "string" || !Number.isSafeInteger(body.version) || typeof body.provider_id !== "string" || typeof body.enabled !== "boolean") throw new AssistantError("assistant.invalid", "能力标识无效");
        store.setActionEnabled(WEB_ACTOR, actionKey({ capability_id: body.capability_id, version: body.version as number, provider_id: body.provider_id }), body.enabled);
        return { status: 200, body: { ok: true } };
      }
      // What deserves the person's attention now, and on which surface (their rules hold some while it matches).
      if (method === "GET" && parts.length === 1 && parts[0] === "notices") {
        // Reading the works is what notices a change of state, so a closed panel still hears that a round finished.
        await service.list();
        return { status: 200, body: { notices: service.notices(url.searchParams.get("surface") || null) } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "notices") {
        const target = { ...(typeof body.notice_id === "string" ? { notice_id: body.notice_id } : {}), ...(typeof body.work_id === "string" ? { work_id: body.work_id } : {}) };
        return { status: 200, body: { settled: service.settleNotices(target, body.state === "dismissed" ? "dismissed" : "seen") } };
      }
      if (method === "GET" && parts.length === 1 && parts[0] === "rules") return { status: 200, body: { rules: service.rules() } };
      if (method === "POST" && parts.length === 1 && parts[0] === "rules") return { status: 200, body: { rules: service.saveRule(body.rule as never, typeof body.rule_id === "string" ? body.rule_id : undefined) } };
      if (method === "POST" && parts.length === 2 && parts[0] === "rules" && parts[1] === "remove") return { status: 200, body: { rules: service.removeRule(String(body.rule_id ?? "")) } };
      if (parts[0] !== "works" || !parts[1]) return null;
      const workId = parts[1];
      if (method === "GET" && parts.length === 2) return { status: 200, body: await service.read(workId) };
      if (method === "GET" && parts.length === 3 && parts[2] === "recovery") return { status: 200, body: await service.recovery(workId) };
      if (method !== "POST") return null;
      if (parts.length === 3 && parts[2] === "control") return { status: 200, body: await service.control(workId, body as never) };
      if (parts.length === 3 && parts[2] === "answer") return { status: 200, body: await service.answer(workId, body as never) };
      if (parts.length === 3 && parts[2] === "draft") return { status: 200, body: { work: service.saveDraft(workId, body.draft as string) } };
      if (parts.length === 3 && parts[2] === "rename") return { status: 200, body: { work: await service.rename(workId, Number(body.revision), String(body.title ?? "")) } };
      if (parts.length === 5 && parts[2] === "cards" && parts[4] === "run") return { status: 200, body: await service.runCard(workId, parts[3]!, { revision: Number(body.revision), values: body.values as Record<string, string> | undefined }) };
      if (parts.length === 5 && parts[2] === "cards" && parts[4] === "dismiss") return { status: 200, body: service.dismissCard(workId, parts[3]!) };
      if (parts.length === 3 && parts[2] === "mode") return { status: 200, body: await service.setExecutorMode(workId, String(body.mode ?? "")) };
      if (parts.length === 3 && parts[2] === "results") return { status: 200, body: await service.receiveResult(workId, body) };
      if (parts.length === 3 && parts[2] === "handover") return { status: 200, body: await service.handover(workId, { to: body.to as "coding" | "assistant", ...(typeof body.mode === "string" ? { mode: body.mode } : {}) }) };
      if (parts.length === 3 && parts[2] === "recovery") return { status: 200, body: typeof body.run_id === "string"
        ? await service.closeInterrupted(workId, { run_id: body.run_id, version: Number(body.version) }) : await service.recovery(workId) };
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
