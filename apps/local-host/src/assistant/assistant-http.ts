import { executorInputActions } from "./assistant-executor-input.js";
import { pageRelatedWorks } from "./assistant-page-related.js";
import { AssistantThreads } from "./assistant-threads.js";
import { assistantThreadActions, assistantThreadRegistration } from "./assistant-thread-actions.js";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "./assistant-agent.js";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ASSISTANT_INSTALL_ID, type AssistantHandover, type AssistantPageCardInput, type AssistantSendInput } from "@molis-ai/molis-work-contracts/services/assistant";
import { dispatchNativePluginJsonHttp, type NativePluginJsonResult, writeNativePluginJsonResponse } from "../native-plugin-http.js";
import { L } from "../web-locale.js";
import { bindLocalWebActions, localWebActionContext } from "../local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../local-owner-permissions.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { actionEffect, bindActionClient, type ActionCallContext, type ActionView, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionKey, assistantAuthority, assistantProjectPrompts } from "./assistant-authority.js";
import { registerWorkAuthority } from "../agent-work-authority.js";
import { AssistantService, type AssistantServicePorts } from "./assistant-service.js";
import { assistantSurroundings } from "./assistant-surroundings.js";
import { assistantErrors } from "./assistant-errors.js";
import type { PersonActions } from "./assistant-executor.js";
import { ASSISTANT_STORE_NAME, AssistantStore } from "./assistant-store.js";
import { codingCharacterPorts } from "../characters-host.js";
import { assistantContributions } from "./assistant-contributions.js";
import { registerAssistantRuleActions } from "./assistant-rule-actions.js";
import { agentDefinitionsFor } from "../agent-definitions/agent-definitions.js";
import { memoryHostFor } from "../memory/memory-host.js";
import { builtinRegistrations } from "../agent-definitions/builtin-agents.js";
import { projectDeletedHooksFor } from "../project-deleted-hooks.js";
import { purgeAssistantProject } from "./assistant-project-purge.js";
import { questionAnswer } from "@molis-ai/molis-work-plugin-sdk";
import { questionErrors } from "../agent-question-card.js";
import { AssistantQuestionDrafts } from "./assistant-questions.js";
import { drawAssistantReply } from "./assistant-view-html.js";
import { cancelConnectorAuthorizationsForSession, holdConnectorAuthorizationsForSession } from "../connector-authorization-status.js";
import { retainConnectorSetupsForSession } from "../connector-setup-retain.js";
import { assistantSetupMaterial } from "./assistant-setup-material.js";
import { pageChoices } from "./assistant-pages.js";

/** The local Web's single person. The same identity every other local write uses. */
const WEB_ACTOR = LOCAL_PERSON_ACTOR_ID;
/** How long one working-out of the person's grants is reused by the calls that follow it. */
const PERSON_CONTEXT_REUSE_MS = 2_000;

export interface AssistantHttpPorts {
  localHost: MolisWorkLocalHost;
  homeDirectory: string;
  agentHost: AgentHost;
  agentReady: () => Promise<void>;
  projectTitle(projectId: string): Promise<string | null>;
  projectReference?(projectId: string): Promise<LocalHostProjectReference>;
  /** The page ids installed in this Home's projects, which an attention rule may name (PG-036). */
  pages(): Promise<readonly string[]>;
}

/** Half-written answers to a work's questions, kept with the work. */
const questionDrafts = (store: AssistantStore) => new AssistantQuestionDrafts({ store, actorId: WEB_ACTOR, fail: (code, message) => assistantErrors[code.slice("assistant.".length) as keyof typeof assistantErrors](message) });

/** One Assistant per Home. Its store is opened once and lives as long as the Host that serves it. */
const services = new WeakMap<MolisWorkLocalHost, { home: string; service: AssistantService; store: AssistantStore; threads: AssistantThreads; surroundings: ReturnType<typeof assistantSurroundings> }>();

/** The Host owns the shared Assistant; closing a borrowed HTTP transport does not release it. */
export function closeAssistantService(host: MolisWorkLocalHost): void {
  services.get(host)?.service.continuations.close();
  services.delete(host);
}

export function assistantServiceFor(ports: AssistantHttpPorts): { service: AssistantService; store: AssistantStore; threads: AssistantThreads; surroundings: ReturnType<typeof assistantSurroundings> } {
  const existing = services.get(ports.localHost);
  if (existing && existing.home === ports.homeDirectory) return existing;
  const store = new AssistantStore(openHomeSqliteDatabase(ports.homeDirectory, ASSISTANT_STORE_NAME));
  // The person's grants in a project (or the Home), shared by the calls one list or one round makes in quick succession:
  // working them out inspects every capability, so a list of works re-did it several times per work. Each call is still
  // checked against its current definition, availability and grant owner when it is dispatched.
  const contexts = new Map<string, { at: number; context: Promise<ActionCallContext> }>();
  const personContext = (reference: LocalHostProjectReference | undefined): Promise<ActionCallContext> => {
    const key = reference?.project_id ?? "", hit = contexts.get(key), now = Date.now();
    if (hit && now - hit.at < PERSON_CONTEXT_REUSE_MS) return hit.context;
    const context = localWebActionContext(ports.localHost, reference, LOCAL_OWNER_PERMISSIONS);
    contexts.set(key, { at: now, context });
    context.catch(() => { if (contexts.get(key)?.context === context) contexts.delete(key); });
    return context;
  };
  // What is offered there, likewise: reading several works' objects in one list asked for the same directory each time.
  const directories = new Map<string, { at: number; views: Promise<readonly ActionView[]> }>();
  const personClient = (reference: LocalHostProjectReference | undefined): PersonActions => {
    const client = reference ? ports.localHost.actionClient(reference) : ports.localHost.homeActionClient();
    const key = reference?.project_id ?? "";
    return {
      discover: () => {
        const hit = directories.get(key), now = Date.now();
        if (hit && now - hit.at < PERSON_CONTEXT_REUSE_MS) return hit.views;
        const views = personContext(reference).then(context => client.discover(context));
        directories.set(key, { at: now, views });
        views.catch(() => { if (directories.get(key)?.views === views) directories.delete(key); });
        return views;
      },
      invoke: async (action, input) => client.invoke(await personContext(reference), action, input),
    };
  };
  // The same client, bound the way every client that carries a control is (`bindActionClient`): what the work's executor reads with.
  const personBound = (reference: LocalHostProjectReference): BoundActionClient => {
    const person = personClient(reference), client = ports.localHost.actionClient(reference);
    return { discover: person.discover, invoke: async (definition, input, control, transport) => {
      const caller = await personContext(reference);
      return await bindActionClient(client, () => caller).invoke(definition, input, control, transport);
    } };
  };
  let threads: AssistantThreads;
  const servicePorts: AssistantServicePorts = {
    cancelSetups: sessionId => cancelConnectorAuthorizationsForSession(ports.homeDirectory, sessionId, WEB_ACTOR),
    retainSetups: sessionId => retainConnectorSetupsForSession(ports.homeDirectory, sessionId, WEB_ACTOR, (...args) => ports.localHost.connectorMcp!.remember(...args)),
    holdSetups: (sessionId, revision) => holdConnectorAuthorizationsForSession(ports.homeDirectory, sessionId, WEB_ACTOR, revision),
    setupMaterial: (work, offered, withdrawn) => assistantSetupMaterial(ports.homeDirectory, work, offered, withdrawn),
    host: async () => { await ports.agentReady(); return ports.agentHost; },
    pages: () => ports.pages(),
    // The platform memory, registered with this Home's Agent service (the Assistant is one of its consumers).
    memory: (...execution) => { const memory = memoryHostFor(ports.localHost); return execution.length ? memory?.withExecution(...execution) : memory?.service; },
    memorySources: { check: (caller, request) => memoryHostFor(ports.localHost)?.checkAssistantSources(caller, request) ?? Promise.resolve(false) },
    learnFromRound: ({ work, sources, run_id }) => {
      if (!work.session_id) return;
      void memoryHostFor(ports.localHost)?.learnLater({ actor_id: WEB_ACTOR, work_id: work.work_id, run_id, session_id: work.session_id, sources })
        .catch(error => console.warn("[memory] 没有排上提炼", error));
    },
    authority: async (work, origin) => work.reply_target ? { manifest: ASSISTANT_AGENT, prompts: ASSISTANT_PROMPTS, authorizedDirectories: [], beforeDispatch: () => threads.authorize(work) } : ({ ...assistantAuthority(ports.localHost, work, () => store.disabledActions(WEB_ACTOR), (offer, views) => service.offers.recordOffer(work, offer, views),
      (view, input, output) => service.recordResult(work, view, input, output, origin?.source !== "card"), service.delegation(work),
      (view, call) => service.trackUnsettled(work, `${view.provider.title} · ${view.action.title}`, call), () => service.memoryTools(work), () => store.confirmAlways(WEB_ACTOR),
      view => service.noteDispatched(work, view), () => {
        const snapshot = store.rounds(work.work_id).at(-1)?.context;
        return snapshot ? { url: null, title: snapshot.source.title ?? snapshot.source.surface, provenance: "client_reported" } : undefined;
      }),
      project_prompts: await assistantProjectPrompts(ports.localHost, work),
      // The platform memory, under the Assistant's switch: re-read and injected by the runtime as data.
      memory: task => service.memoryForRound(work, task),
      // A Character published in the work's project, frozen at its exact version for the round (the Host checks it again at dispatch).
      ...(work.project_ref ? { resolveCharacter: await projectCharacters(ports, work.project_ref).then(characters => characters.resolve) } : {}) }),
    characters: async project => (await projectCharacters(ports, project)).list().map(choice => ({ reference: { ...choice.reference }, title: choice.title, available: choice.available,
      ...(choice.reason ? { reason: choice.reason } : {}) })),
    projectTitle: ports.projectTitle,
    // Methods Plugins offer for business work, from the Home's registry of Agent definitions.
    methods: { list: () => agentDefinitionsFor(ports.homeDirectory, builtinRegistrations).methods(),
      read: (owner, skill, version) => agentDefinitionsFor(ports.homeDirectory, builtinRegistrations).method(owner, skill, version) },
    // The person's own actions in the work's project, as the page there would use them. A dispatch, a follow-up's round among them,
    // binds the person's client anew when it acts, never the snapshot the reads share: what was granted or withdrawn by then counts.
    personActions: async (work, use, original, executorPluginId) => {
      if (!work.project_ref) throw assistantErrors.scope("执行方插件在项目里工作");
      if (original) {
        if (!executorPluginId) throw assistantErrors.scope("补充原件没有明确的执行方");
        return executorInputActions(ports.localHost, work.project_ref, LOCAL_OWNER_PERMISSIONS, original, executorPluginId);
      }
      return use === "dispatch" ? bindLocalWebActions(ports.localHost, work.project_ref, LOCAL_OWNER_PERMISSIONS) : personBound(work.project_ref);
    },
    // The person's Home, for the reminders they set in Plugins.
    homeActions: async () => personClient(undefined),
    // Reading related objects back from their owners, as the person: the work's project, or the Home for personal work.
    scopeActions: async work => personClient(work.project_ref),
    // A landing's object, read again from its owner as the person before a round hears of it (H3's reader).
    readReferences: async (projectId, picked) => ports.localHost.search ? ports.localHost.search.readReferences(projectId, picked) : picked.map(() => null),
    // How many documents the round could list in the project, for 「本轮情况」 (specs/project-knowledge PMAT-33).
    knowledgeTally: (projectId, views) => ports.localHost.search?.knowledgeTally(projectId, views) ?? null,
    knowledgeCatalog: (projectId, views, words) => ports.localHost.search?.knowledgeCatalog(projectId, views, words) ?? null,
  };
  const service: AssistantService = new AssistantService(store, servicePorts, WEB_ACTOR), surroundings = assistantSurroundings(store, servicePorts, WEB_ACTOR);
  threads = new AssistantThreads(store, service, {
    actorId: WEB_ACTOR, host: async () => { await ports.agentReady();return ports.agentHost; },
    project: async id => { if (!ports.projectReference) throw assistantErrors.scope("当前宿主未提供项目上下文");return ports.projectReference(id); },
    client: project => ports.localHost.actionClient(project), caller: project => localWebActionContext(ports.localHost, project, LOCAL_OWNER_PERMISSIONS),
    alive: () => ports.localHost.lifecycle() === "running",
  });
  const entry = { home: ports.homeDirectory, service, store, threads, surroundings };
  services.set(ports.localHost, entry);
  // The runtime looks at the background jobs these works follow with the work's own authority, from its first look on.
  registerWorkAuthority(ports.localHost, at => service.jobs.authority(at));
  // Deleting a project also stops the round its works still run and cancels their timed follow-ups, which only this service can do.
  projectDeletedHooksFor(ports.homeDirectory).register({ id: "assistant", label: "助理在这个项目里的工作", alive: () => ports.localHost.lifecycle() === "running",
    clear: async projectId => { await purgeAssistantProject(ports.homeDirectory, projectId, { stop: async id => { await service.control(id, { kind: "stop" }); }, dropFollowUp: async id => { await service.followUps.remove(id); } }); } });
  // The person's attention rules are the Assistant's own actions: found like any capability, changed only on confirmation.
  try { registerAssistantRuleActions(ports.localHost.actionRegistry(), () => service, ports.homeDirectory, assistantThreadRegistration(threads)); }
  catch (error) { console.warn("[assistant] 提醒规则动作没能登记到动作目录", error); }
  return entry;
}

/** The person's published Characters in one project: listed with whether each can run, and frozen exactly for a round. */
async function projectCharacters(ports: AssistantHttpPorts, project: LocalHostProjectReference) {
  const { board, artifacts } = await ports.localHost.withProject(project, async runtime => ({ board: runtime.project_id, artifacts: runtime.artifacts.query }));
  return codingCharacterPorts(ports.homeDirectory, WEB_ACTOR, board, artifacts);
}

/** What deserves the person's attention now, and on which surface (their rules hold some while it matches). */
export async function assistantNotices(ports: AssistantHttpPorts, surface: string | null) {
  const { service } = assistantServiceFor(ports);
  // Reading the works is what notices a change of state, so a closed panel still hears that a round finished.
  await service.list();
  // What the person already acted on in its plugin is not news any more.
  await service.settleHandledNotices().catch(() => 0);
  return service.notices(surface);
}

/**
 * `/api/assistant/*`, served under whichever project page the person is on. The page's project only decides the
 * scope of a *new* work; an existing work keeps the scope it was started with.
 */
export async function handleAssistantHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: AssistantHttpPorts & { projectRef?: LocalHostProjectReference }): Promise<boolean> {
  // A document the person brings travels as base64 (up to 8 MB of file); everything else stays small.
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/assistant", maxBodyBytes: url.pathname.endsWith("/api/assistant/attachments") ? 11_500_000 : 400_000,
    async handle({ method, pathname, body }) {
      const { service, store, surroundings } = assistantServiceFor(ports);
      const parts = pathname.slice("/api/assistant/".length).split("/").map(decodeURIComponent);
      const thread = await handleThreadHttp(parts, method, url, body, ports);
      if (thread) return thread;
      if (method === "GET" && parts.length === 1 && parts[0] === "works") return { status: 200, body: { works: await service.list() } };
      // The works that relate to one object here: for that object's own page ("belongs to …", continue it).
      if (method === "GET" && parts.length === 1 && parts[0] === "related") {
        const kind = url.searchParams.get("kind") ?? "", id = url.searchParams.get("id") ?? "";
        if (!kind || !id) throw assistantErrors.invalid("需要对象种类与标识");
        return { status: 200, body: await pageRelatedWorks(service, request, ports.projectRef?.project_id ?? null, { kind, id }) };
      }
      // Characters the person may choose here: for a work (its own project), or for a new work on this page.
      if (method === "GET" && parts.length === 1 && parts[0] === "characters") {
        const work = url.searchParams.get("work") ?? undefined;
        return { status: 200, body: { characters: await service.characters(work, ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      }
      // The plugins that can carry a work here: the person picks one for a new work, or hands an open one over.
      if (method === "GET" && parts.length === 1 && parts[0] === "executors") {
        return { status: 200, body: { executors: await service.executors(ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      }
      // A card a page prepared from the person's selection (a contextual action they clicked); runs only when clicked.
      if (method === "POST" && parts.length === 1 && parts[0] === "cards") {
        return { status: 200, body: await service.offers.offerFromPage(body as unknown as AssistantPageCardInput, ports.projectRef ? { project_ref: ports.projectRef } : {}) };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "send") {
        // A page marks the words it wrote itself ("page"); the marks of the Host's and the Assistant's own rounds are set in code and cannot be claimed from outside.
        if (body.written_by !== undefined && body.written_by !== "page") throw assistantErrors.invalid("written_by 只能是 page");
        if (body.target !== undefined && body.target !== "answer" && body.target !== "steer") throw assistantErrors.invalid("target 只能是 answer 或 steer");
        // A re-ask names a closed question of an existing work, and is not an answer: refused before any work is made or touched.
        if (body.reask !== undefined && (!body.work_id || body.target === "answer" || body.about !== undefined)) throw assistantErrors.invalid("重新问只能用在已有的工作上，不能同时作为回答或指向一条输入");
        // A correction names the input it corrects, in a work that has one; it is a supplement, never an answer. Only the id's
        // shape is checked: the runtime keeps `about` as a pointer without looking it up (D34), so an id that is not one of this
        // session's inputs names nothing, and the receipt shows 「更早的一条」.
        if (body.about !== undefined && (typeof body.about !== "string" || !body.about || body.about.length > 200 || !body.work_id || body.target === "answer")) throw assistantErrors.invalid("about 要写一条输入的 id，只能用在已有的工作里，且不能用于回答");
        return { status: 200, body: await service.send(body as unknown as AssistantSendInput, { ...(ports.projectRef ? { project_ref: ports.projectRef } : {}),
          ...(!body.written_by && body.reask === undefined && typeof body.text === "string" && typeof body.request_id === "string" ? { original_input: {
            input_id: body.request_id, text: body.text, written_by: "person" as const, occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID,
          } } : {}) }) };
      }
      // What the Assistant may use here, and what the person switched off for it.
      if (method === "GET" && parts.length === 1 && parts[0] === "capabilities") {
        const off = store.disabledActions(WEB_ACTOR), confirm = store.confirmAlways(WEB_ACTOR);
        const reference = ports.projectRef;
        const caller = { actor_id: WEB_ACTOR, actor_kind: "runtime" as const, project_id: reference?.project_id ?? null, audience: "agent" as const, permissions: [] };
        const catalog = await ports.localHost.inspectActions(caller, reference);
        return { status: 200, body: { capabilities: catalog.filter(view => view.action.audiences.includes("agent") && (!view.provider.project_id || view.provider.project_id === caller.project_id)).map(view => ({
          capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, provider: view.provider.title, title: view.action.title,
          description: view.action.description, operation: view.operation, effect: actionEffect(view.action, view.capability_id), scope: view.action.scope,
          enabled: !off.has(actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })),
          // A change that says how it is undone runs when asked without a confirmation, unless the person set it to confirm each time.
          ...(view.action.undo && view.operation === "command" ? { reversible: true, confirm_always: confirm.has(actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })) } : {}),
        })) } };
      }
      // The runtime's assembly and the latest rounds with their exact identities (developer diagnostics).
      if (method === "GET" && parts.length === 1 && parts[0] === "diagnostics") return { status: 200, body: await service.diagnostics() };
      // What each plugin here contributes for the Assistant, and exactly what is missing (developer diagnostics).
      if (method === "GET" && parts.length === 1 && parts[0] === "contributions") {
        const reference = ports.projectRef;
        const caller = { actor_id: WEB_ACTOR, actor_kind: "runtime" as const, project_id: reference?.project_id ?? null, audience: "agent" as const, permissions: [] };
        const catalog = (await ports.localHost.inspectActions(caller, reference)).filter(view => !view.provider.project_id || view.provider.project_id === caller.project_id);
        return { status: 200, body: { contributions: assistantContributions(catalog) } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "capabilities") {
        if (typeof body.capability_id !== "string" || !Number.isSafeInteger(body.version) || typeof body.provider_id !== "string"
          || (typeof body.enabled !== "boolean" && typeof body.confirm_always !== "boolean")) throw assistantErrors.invalid("能力标识无效");
        const key = actionKey({ capability_id: body.capability_id, version: body.version as number, provider_id: body.provider_id });
        if (typeof body.enabled === "boolean") store.setActionEnabled(WEB_ACTOR, key, body.enabled);
        if (typeof body.confirm_always === "boolean") store.setConfirmAlways(WEB_ACTOR, key, body.confirm_always);
        return { status: 200, body: { ok: true } };
      }
      if (method === "GET" && parts.length === 1 && parts[0] === "notices") return { status: 200, body: { notices: await assistantNotices(ports, url.searchParams.get("surface") || null) } };
      if (method === "POST" && parts.length === 1 && parts[0] === "notices") {
        const target = { ...(typeof body.notice_id === "string" ? { notice_id: body.notice_id } : {}), ...(typeof body.work_id === "string" ? { work_id: body.work_id } : {}) };
        return { status: 200, body: { settled: service.settleNotices(target, body.state === "dismissed" ? "dismissed" : "seen") } };
      }
      // Methods Plugins offer that this scope can use (for “/”).
      if (method === "GET" && parts.length === 1 && parts[0] === "methods") return { status: 200, body: { methods: await service.methods(null, ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      // Which object kind each surface's tab items are, from the plugins' search source declarations.
      if (method === "GET" && parts.length === 1 && parts[0] === "surface-kinds") return { status: 200, body: { kinds: await service.surfaceKinds(ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      // What the Assistant's own rounds used today, and the person's daily cap.
      if (method === "GET" && parts.length === 1 && parts[0] === "usage") return { status: 200, body: await service.usage() };
      if (method === "POST" && parts.length === 1 && parts[0] === "budget") { service.saveBudget(body.daily_tokens); return { status: 200, body: await service.usage() }; }
      // A document the person brings (PDF): read by the runtime's parser, returned as this Send's material.
      if (method === "POST" && parts.length === 1 && parts[0] === "attachments") return { status: 200, body: { material: await service.readAttachment({ name: String(body.name ?? ""), data: String(body.data ?? "") }) } };
      // What the person asked the Assistant to keep: personal, and this project's when on a project's page.
      if (method === "GET" && parts.length === 1 && parts[0] === "memories") {
        return { status: 200, body: { memories: await service.memories(ports.projectRef?.project_id ?? null), prefs: service.memoryPrefs() } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "memories") {
        const action = body.action === "update" || body.action === "disable" || body.action === "enable" || body.action === "remove" ? body.action : null;
        if (!action) throw assistantErrors.invalid("不支持的操作");
        return { status: 200, body: { memories: await service.changeMemory({ memory_id: String(body.memory_id ?? ""), action, ...(typeof body.text === "string" ? { text: body.text } : {}) }, ports.projectRef?.project_id ?? null) } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "memory-prefs") return { status: 200, body: { prefs: service.saveMemoryPrefs(body as never) } };
      // What works suggest keeping: the person accepts (optionally reworded) or declines each.
      if (method === "GET" && parts.length === 1 && parts[0] === "memory-candidates") return { status: 200, body: { candidates: await service.memoryCandidates() } };
      if (method === "POST" && parts.length === 3 && parts[0] === "memory-candidates" && parts[2] === "accept")
        return { status: 200, body: { candidate: await service.acceptMemoryCandidate(parts[1]!, { ...(typeof body.text === "string" ? { text: body.text } : {}) }) } };
      if (method === "POST" && parts.length === 3 && parts[0] === "memory-candidates" && parts[2] === "discard") return { status: 200, body: { candidate: await service.discardMemoryCandidate(parts[1]!) } };
      if (method === "GET" && parts.length === 1 && parts[0] === "rules") return { status: 200, body: { rules: service.followUps.rules(), pages: pageChoices(await ports.pages()) } };
      if (method === "POST" && parts.length === 1 && parts[0] === "rules") return { status: 200, body: { rules: await service.followUps.addRule(body.rule as never, typeof body.rule_id === "string" ? body.rule_id : undefined) } };
      if (method === "POST" && parts.length === 2 && parts[0] === "rules" && parts[1] === "remove") return { status: 200, body: { rules: service.followUps.removeRule(String(body.rule_id ?? "")) } };
      if (method === "POST" && parts.length === 2 && parts[0] === "followups" && parts[1] === "remove") return { status: 200, body: { removed: await service.followUps.remove(String(body.followup_id ?? "")) } };
      if (parts[0] !== "works" || !parts[1]) return null;
      const workId = parts[1];
      if (method === "GET" && parts.length === 2) return { status: 200, body: await service.read(workId) };
      // The page follows a live work by waiting for its view to change (closing the request ends the wait).
      if (method === "GET" && parts.length === 3 && parts[2] === "wait") {
        const ended = new AbortController(), stop = () => ended.abort();
        response.once("close", stop);
        try { return { status: 200, body: await service.waitForChange(workId, url.searchParams.get("since") || null, Number(url.searchParams.get("timeout") ?? 20_000) || 0, ended.signal) }; }
        finally { response.off("close", stop); }
      }
      if (method === "GET" && parts.length === 3 && parts[2] === "recovery") return { status: 200, body: await service.recovery(workId) };
      if (method === "GET" && parts.length === 3 && parts[2] === "surroundings") return { status: 200, body: await surroundings(workId) };
      if (method === "GET" && parts.length === 4 && parts[2] === "materials") return { status: 200, body: { material: service.material(workId, parts[3]!) } };
      if (method === "GET" && parts.length === 5 && parts[2] === "materials" && parts[4] === "image") return { status: 200, body: { image: await service.materialImage(workId, parts[3]!) } };
      if (method !== "POST") return null;
      const threadWork = await threadWorkRoute(workId, parts, body, ports);
      if (threadWork) return threadWork;
      if (parts.length === 3 && parts[2] === "control") return { status: 200, body: await service.control(workId, body as never) };
      const interaction = await interactionRoute(workId, parts, body, service, store, ports.projectRef);
      if (interaction) return interaction;
      if (parts.length === 3 && parts[2] === "draft") return { status: 200, body: { work: service.saveDraft(workId, body.draft as string) } };
      if (parts.length === 3 && parts[2] === "rename") return { status: 200, body: { work: await service.rename(workId, Number(body.revision), String(body.title ?? "")) } };
      if (parts.length === 3 && parts[2] === "mode") return { status: 200, body: await service.setExecutorMode(workId, String(body.mode ?? "")) };
      if (parts.length === 3 && parts[2] === "take-back") return { status: 200, body: await service.takeBack(workId) };
      if (parts.length === 4 && parts[2] === "undo") return { status: 200, body: await service.undo(workId, parts[3]!) };
      if (parts.length === 3 && parts[2] === "budget") return { status: 200, body: await service.saveWorkBudget(workId, body.budget_tokens) };
      if (parts.length === 3 && parts[2] === "results") return { status: 200, body: await service.receiveResult(workId, body) };
      if (parts.length === 3 && parts[2] === "handover") return { status: 200, body: await service.handover(workId, { to: body.to as AssistantHandover["to"], ...(typeof body.mode === "string" ? { mode: body.mode } : {}) }) };
      if (parts.length === 3 && parts[2] === "recovery") return { status: 200, body: typeof body.run_id === "string"
        ? await service.closeInterrupted(workId, { run_id: body.run_id, version: Number(body.version) }) : await service.recovery(workId) };
      if (parts.length === 3 && parts[2] === "archive") return { status: 200, body: { work: await service.archive(workId, body.archived !== false) } };
      if (parts.length === 4 && parts[2] === "reviews") return { status: 200, body: await service.decide(workId, { review_id: parts[3]!, decision: body.decision as "approve" | "reject", ...(typeof body.note === "string" ? { note: body.note } : {}) }) };
      return null;
    },
    // Questions, cards and next steps are drawn by their Host owner; common refusals keep the shared error envelope.
    write: (response, result) => writeDrawn(ports, response, result),
  });
}

/** Thread requests keep the page's trusted project and pass through the common action gateway. */
async function handleThreadHttp(parts: string[], method: "GET" | "POST", url: URL, body: Record<string, unknown>,
  ports: AssistantHttpPorts & { projectRef?: LocalHostProjectReference }) {
  if (parts.length !== 2 || parts[0] !== "threads" || !ports.projectRef) return null;
  const action = parts[1] === "start" ? assistantThreadActions.start : parts[1] === "status" ? assistantThreadActions.status
    : parts[1] === "retry" ? assistantThreadActions.retry : parts[1] === "stop" ? assistantThreadActions.stop : null;
  if (!action || method === "GET" && parts[1] !== "status") return null;
  const input = method === "GET" ? { target: { provider_id: url.searchParams.get("provider_id"), subject_kind: url.searchParams.get("subject_kind"), subject_id: url.searchParams.get("subject_id"), thread_id: url.searchParams.get("thread_id") } } : body;
  const result = await ports.localHost.actionClient(ports.projectRef).invoke(await localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS), action, input);
  return { status: 200, body: parts[1] === "status" ? { status: result } : result };
}

/** Thread replies keep their original gateway authority even when stopped from the Assistant view. */
async function threadWorkRoute(workId: string, parts: string[], body: Record<string, unknown>, ports: AssistantHttpPorts): Promise<NativePluginJsonResult | null> {
  const { service, store } = assistantServiceFor(ports);
  const bound = store.get(WEB_ACTOR, workId);
  if (!bound.reply_target || ["rename", "archive", "recovery", "budget"].includes(parts[2] ?? "")) return null;
  if (parts[2] !== "control" || body.kind !== "stop" || !bound.project_ref) throw assistantErrors.scope("请回到原评论继续这项回复");
  await ports.localHost.actionClient(bound.project_ref).invoke(await localWebActionContext(ports.localHost, bound.project_ref, LOCAL_OWNER_PERMISSIONS), assistantThreadActions.stop, { work_id: workId });
  return { status: 200, body: await service.read(workId) };
}

/** A reply with its questions, cards and next steps drawn (the page only binds them). */
function writeDrawn(ports: AssistantHttpPorts, response: ServerResponse, result: NativePluginJsonResult): void {
  const { service, store } = assistantServiceFor(ports);
  drawAssistantReply(result.body, { say: L, card: card => service.offers.html(card, L),
    drafts: workId => { try { return questionDrafts(store).read(workId); } catch { return {}; } } });
  writeNativePluginJsonResponse(response, result);
}

/**
 * The question card's and the action cards' own routes (specs/ai-interaction-experience A1, H2): an answer as the card's
 * fields hold it, a half-written answer kept with the work, a card run, set aside or asked to be prepared again.
 */
async function interactionRoute(workId: string, parts: string[], body: Record<string, unknown>, service: AssistantService, store: AssistantStore,
  projectRef: LocalHostProjectReference | undefined): Promise<NativePluginJsonResult | null> {
  const drafts = questionDrafts(store);
  // The card sends what its fields hold; it becomes the Runtime's answer here, and its draft goes once the answer is taken.
  if (parts.length === 3 && parts[2] === "answer") {
    const answer = body.values === undefined ? {} : questionAnswer(body.values);
    if (!answer) throw assistantErrors.invalid("请先回答再提交");
    const view = await service.answer(workId, { run_id: String(body.run_id ?? ""), pending_id: String(body.pending_id ?? ""),
      ...(body.pending_revision !== undefined ? { pending_revision: Number(body.pending_revision) } : {}), ...(typeof body.text === "string" ? { text: body.text } : {}),
      ...(Array.isArray(body.answers) ? { answers: body.answers as never } : {}), ...answer }, projectRef ? { project_ref: projectRef } : {}).catch(async (error: { code?: string; message?: string; problems?: unknown }) => {
      // A questionnaire answer the Runtime refused: each question's reason goes beside its own field.
      if (error?.code !== "agent.answer_invalid") throw error;
      // Read back with the questions it answered, so each line can name the limit it crossed.
      const asked = (await service.read(workId).catch(() => undefined))?.rounds.flatMap(round => round.awaiting_input).find(item => item.pending_id === body.pending_id)?.questions;
      throw assistantErrors.invalid(String(error.message), Array.isArray(error.problems) ? { errors: questionErrors(error.problems, L, asked) } : undefined);
    });
    drafts.drop(workId, String(body.pending_id ?? ""));
    return { status: 200, body: view };
  }
  if (parts.length === 3 && parts[2] === "question-draft") { drafts.save(workId, String(body.pending_id ?? ""), body.values); return { status: 200, body: { ok: true } }; }
  if (parts.length !== 5 || parts[2] !== "cards") return null;
  if (parts[4] === "run") return { status: 200, body: await service.offers.runCard(workId, parts[3]!, { revision: Number(body.revision), values: body.values }) };
  if (parts[4] === "dismiss") return { status: 200, body: service.offers.dismissCard(workId, parts[3]!) };
  // A stale card is prepared again only when asked: the request goes in as the page's words, nothing runs in its place.
  if (parts[4] !== "redo") return null;
  const card = service.offers.card(workId, parts[3]!);
  return { status: 200, body: await service.send({ work_id: workId, request_id: randomUUID(), text: L("建议「{title}」没有执行：{why}。请读取最新状态，按现在的情况重新准备这一项的操作卡。",
    { title: card.title, why: card.outcome || L("数据在建议之后变化了") }) }, projectRef ? { project_ref: projectRef } : {}, "page") };
}
