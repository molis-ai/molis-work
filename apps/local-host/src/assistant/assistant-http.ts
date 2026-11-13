import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pluginInstallRecords } from "../plugin-install-records.js";
import { HomeConsentLedger } from "../home-plugin-store.js";
import { assistantRelatedRegistration, relatedWorks, type RelatedWorksSource } from "./assistant-related-action.js";
import { executorInputActions } from "./assistant-executor-input.js";
import { AssistantThreads } from "./assistant-threads.js";
import { assistantThreadActions, assistantThreadRegistration } from "./assistant-thread-actions.js";
import { ASSISTANT_AGENT, ASSISTANT_PROMPTS } from "./assistant-agent.js";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ASSISTANT_INSTALL_ID, type AssistantControl, type AssistantHandover, type AssistantPageCardInput, type AssistantSendInput } from "@molis-ai/molis-work-contracts/services/assistant";
import { dispatchNativePluginJsonHttp, type NativePluginJsonResult, writeNativePluginJsonResponse } from "../native-plugin-http.js";
import { activeLocale, readText, pageLocale, type WebLocale } from "../web-locale.js";
import { modelRoundLocale } from "../reply-language.js";
import { lastUsedLocale, rememberUiLocale } from "../ui-locale-memory.js";
import { bindLocalWebActions, localWebActionContext } from "../local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS, MATERIALS_OWNER_PERMISSIONS } from "../local-owner-permissions.js";
import { materialsActions } from "@molis-ai/molis-work-contracts/platform/project-materials";
import type { MolisWorkLocalHost } from "../project-host.js";
import { ActionError, actionEffect, bindActionClient, type ActionCallContext, type ActionDefinition, type ActionSchema, type ActionView, type BoundActionClient, type InferActionInput, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_WRITE_PERMISSION, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { webEntryDoor, webEntryProvider, type WebEntryCall } from "../web-entry-actions.js";
import { assistantCandidate } from "./assistant-memory-tools.js";
import { actionKey, assistantAuthority, assistantProjectPrompts } from "./assistant-authority.js";
import { registerWorkAuthority } from "../agent-work-authority.js";
import { AssistantService, type AssistantServicePorts } from "./assistant-service.js";
import type { SignedBinding } from "./assistant-service-shared.js";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { assistantSurroundings } from "./assistant-surroundings.js";
import { assistantErrors } from "./assistant-errors.js";
import type { PersonActions } from "./assistant-executor.js";
import { ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE, AssistantStore } from "./assistant-store.js";
import { freezeProjectCharacter } from "../characters-host.js";
import { assistantCharacterChoices } from "./assistant-characters.js";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
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
import { recordAssistantWorkStep } from "./assistant-work-records.js";
import { cancelConnectorAuthorizationsForSession, holdConnectorAuthorizationsForSession } from "../connector-authorization-status.js";
import { retainConnectorSetupsForSession } from "../connector-setup-retain.js";
import { assistantSetupMaterial } from "./assistant-setup-material.js";
import { pageChoices } from "./assistant-pages.js";
import { hostLog } from "../host-log.js";
import { assistantConnectionCard } from "./assistant-connection-card.js";
import { handleAssistantSurfaceHttp } from "./assistant-surface-http.js";

/** The works related to an object, and each one's objects, as `assistant.works.related@1` and its HTTP read them. */
const relatedSource = (service: AssistantService): RelatedWorksSource => ({ related: (projectId, subject) => service.reads.related(projectId, subject), read: workId => service.read(workId) });

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

/**
 * The language of a round the page itself starts (a message, an answer, a card prepared again): the page's own, whatever
 * the record says, and using it moves the record (FSS-71). A request with no page language leaves the round to the record. It is read
 * here at the entry and carried down as a parameter, so nothing below looks at the request again.
 */
function pageRoundLanguage(ports: Pick<AssistantHttpPorts, "homeDirectory">): { reply_locale?: WebLocale } {
  const reply_locale = pageLocale();
  if (!reply_locale) return {};
  rememberUiLocale(ports.homeDirectory, reply_locale);
  return { reply_locale };
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

const personCacheKey = (reference: LocalHostProjectReference | undefined) =>
  JSON.stringify([reference?.project_id ?? "", activeLocale()]);

export function assistantServiceFor(ports: AssistantHttpPorts): { service: AssistantService; store: AssistantStore; threads: AssistantThreads; surroundings: ReturnType<typeof assistantSurroundings> } {
  const existing = services.get(ports.localHost);
  if (existing && existing.home === ports.homeDirectory) return existing;
  const store = new AssistantStore(openBaselineHomeSqlite(ports.homeDirectory, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE));
  // The person's grants in a project (or the Home), shared by the calls one list or one round makes in quick succession:
  // working them out inspects every capability, so a list of works re-did it several times per work. Each call is still
  // checked against its current definition, availability and grant owner when it is dispatched.
  const contexts = new Map<string, { at: number; context: Promise<ActionCallContext> }>();
  const personContext = (reference: LocalHostProjectReference | undefined): Promise<ActionCallContext> => {
    const key = personCacheKey(reference), hit = contexts.get(key), now = Date.now();
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
    const key = personCacheKey(reference);
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
  const definitions = () => agentDefinitionsFor(ports.homeDirectory, builtinRegistrations);
  // The shared Skill catalog, read as the person for an Assistant round: the Host's own entry freezes what the person named (§2.3).
  const skillReader = async (reference: LocalHostProjectReference | undefined, named: readonly SkillRef[]) => {
    const caller: ActionCallContext = { ...await personContext(reference), skill_round: { consumer: "assistant", named } };
    return bindActionClient(reference ? ports.localHost.actionClient(reference) : ports.localHost.homeActionClient(), () => caller);
  };
  let threads: AssistantThreads;
  const servicePorts: AssistantServicePorts = {
    lastLocale: () => lastUsedLocale(ports.homeDirectory),
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
        .catch(error => hostLog.warn("memory", "learning_not_queued", error));
    },
    authority: async (work, origin, locale, namedSkills) => work.reply_target ? { manifest: ASSISTANT_AGENT, prompts: ASSISTANT_PROMPTS, authorizedDirectories: [], beforeDispatch: () => threads.authorize(work) } : ({ ...assistantAuthority(ports.localHost, work, () => store.disabledActions(WEB_ACTOR), (offer, views) => service.offers.recordOffer(work, offer, views),
      (view, input, output) => service.outcomes.recordResult(work, view, input, output, origin?.source !== "card"), service.delegation(work),
      (view, call) => service.dispatcher.trackUnsettled(work, `${view.provider.title} · ${view.action.title}`, call), service.memory.memoryTools(work), () => store.confirmAlways(WEB_ACTOR),
      view => service.dispatcher.noteDispatched(work, view), () => {
        const snapshot = store.rounds(work.work_id).at(-1)?.context;
        return snapshot ? { url: null, title: snapshot.source.title ?? snapshot.source.surface, provenance: "client_reported" } : undefined;
      }, locale, namedSkills),
      project_prompts: await assistantProjectPrompts(ports.localHost, work),
      // The platform memory, under the Assistant's switch: re-read and injected by the runtime as data.
      memory: task => service.memory.memoryForRound(work, task),
      // A Character published in the work's project, frozen at its exact version for the round (the Host checks it again at dispatch).
      ...(work.project_ref ? { resolveCharacter: await characterFreezer(ports, work.project_ref) } : {}) }),
    // The Characters the person may choose, read as the person from Characters' own actions (PG-086).
    characters: project => assistantCharacterChoices(personClient(project)),
    projectTitle: ports.projectTitle,
    // Role material from the Home's registry of Agent definitions; Skills from the shared catalog, read as the person.
    methods: { roles: () => definitions().signedRoles(),
      readSigned: (install, ref) => definitions().signedMaterial(install, ref, modelRoundLocale(ports.homeDirectory)),
      recordSignedUse: (material, caller) => definitions().recordSignedUse(material, caller),
      recordSkillUse: use => definitions().skills.recordUse(use),
      bindSigned: async (project, installs) => {
        // One read of each record source for every installation a list names (09 §3.4), never one per role.
        const projectRows = project ? await ports.localHost.withProject(project, runtime => pluginInstallRecords(runtime.store.db)) : undefined;
        const homeRows = () => ports.localHost.homePlugins?.installations() ?? [];
        const ledger = new HomeConsentLedger(ports.homeDirectory), atBind = homeRows();
        const bound = new Map<string, SignedBinding>();
        for (const { install_id: installId, source } of installs) {
          const inProject = projectRows?.get(installId);
          const current = inProject ? () => projectRows!.get(installId) : () => homeRows().find(row => row.install_id === installId);
          const original = inProject ?? atBind.find(row => row.install_id === installId);
          if (!original || bound.has(installId)) continue;
          const assertCurrent = () => {
            const record = current();
            if (!record || record.state !== "running" || record.installation_generation !== original.installation_generation || record.plugin_id !== source.plugin_id
              || record.version !== source.plugin_version || record.publisher_signature !== source.publisher_signature
              || record.publisher_trust !== "pinned" || !ledger.publishers().some(pin => pin.key_id === record.publisher_signature && !pin.revoked_at)) {
              throw assistantErrors.invalid("角色资料的安装来源已失效，请重新选择");
            }
          };
          bound.set(installId, { installation: { install_id: installId, installation_generation: original.installation_generation, project_id: inProject ? project!.project_id : null }, assertCurrent });
        }
        return bound;
      },
      skills: async project => (await skillReader(project, [])).invoke(skillCatalogActions.list, { applies_to: "assistant", states: ["auto", "manual"] }).then(found => found.skills),
      readSkills: async (project, refs) => (await skillReader(project, refs)).invoke(skillCatalogActions.readBodies, { refs: [...refs] }).then(read => read.results) },
    // The person's own actions in the work's project, as the page there would use them. A dispatch, a follow-up's round among them,
    // binds the person's client anew when it acts, never the snapshot the reads share: what was granted or withdrawn by then counts.
    personActions: async (work, use, handed, executorPluginId) => {
      if (!work.project_ref) throw assistantErrors.scope("执行方插件在项目里工作");
      if (handed?.original || handed?.skills?.length) {
        if (!executorPluginId) throw assistantErrors.scope("交给执行方的内容没有明确的执行方");
        return executorInputActions(ports.localHost, work.project_ref, LOCAL_OWNER_PERMISSIONS, handed, executorPluginId);
      }
      return use === "dispatch" ? bindLocalWebActions(ports.localHost, work.project_ref, LOCAL_OWNER_PERMISSIONS) : personBound(work.project_ref);
    },
    // The person's Home, for the reminders they set in Plugins.
    homeActions: async () => personClient(undefined),
    // Reading related objects back from their owners, as the person (the work's project, or the Home), and a material they handed in.
    scopeActions: async work => personClient(work.project_ref), readMaterial: personMaterialReader(ports.localHost),
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
  projectDeletedHooksFor(ports.homeDirectory).register({ id: "assistant", label: { key: "workbench.project-deletion.assistant" }, alive: () => ports.localHost.lifecycle() === "running",
    clear: async projectId => { await purgeAssistantProject(ports.homeDirectory, projectId, { stop: async id => { await service.control(id, { kind: "stop" }); }, dropFollowUp: async id => { await service.followUps.remove(id); } }); } });
  // The person's attention rules are the Assistant's own actions: found like any capability, changed only on confirmation.
  const threadActions = assistantThreadRegistration(threads), relatedActions = assistantRelatedRegistration(() => relatedSource(service));
  try { registerAssistantRuleActions(ports.localHost.actionRegistry(), () => service, ports.homeDirectory,
    { definitions: [...threadActions.definitions, ...relatedActions.definitions], handlers: [...threadActions.handlers, ...relatedActions.handlers] }); }
  catch (error) { hostLog.warn("assistant", "rule_actions_registration_failed", error); }
  return entry;
}

/** A material the person handed in, read through the platform's materials service as them, with the folder read their page has. */
function personMaterialReader(host: MolisWorkLocalHost): NonNullable<AssistantServicePorts["readMaterial"]> {
  return async (project, ref) => bindLocalWebActions(host, project, [...LOCAL_OWNER_PERMISSIONS, ...MATERIALS_OWNER_PERMISSIONS])
    .invoke(materialsActions.read, { ref, mode: "text" });
}

/** One exact published Character of the work's project, frozen for a round: the Host checks the version again at dispatch. */
async function characterFreezer(ports: AssistantHttpPorts, project: LocalHostProjectReference) {
  const { board, artifacts } = await ports.localHost.withProject(project, async runtime => ({ board: runtime.project_id, artifacts: runtime.artifacts.query }));
  return (reference: ArtifactReference) => freezeProjectCharacter(ports.homeDirectory, WEB_ACTOR, board, artifacts, reference);
}

/** What deserves the person's attention now, and on which surface (their rules hold some while it matches). */
export async function assistantNotices(ports: AssistantHttpPorts, surface: string | null) {
  const { service } = assistantServiceFor(ports);
  // Reading the works is what notices a change of state, so a closed panel still hears that a round finished.
  await service.list();
  // What the person already acted on in its plugin is not news any more.
  await service.notices.settleHandledNotices().catch(error => { hostLog.warn("assistant", "handled_notices_settlement_failed", error); return 0; });
  return service.notices.notices(surface);
}

/** What the panel's route hands its writes for one request (B9): the Assistant's ports with the page's project, and the page's language. */
interface AssistantPageEntry { readonly ports: AssistantHttpPorts & { projectRef?: LocalHostProjectReference }; readonly language: () => { reply_locale?: WebLocale } }
const door = webEntryDoor<AssistantPageEntry>("assistant:panel", () => uiText.text("workbench.assistant-http.entry-refused"));
/** The panel's fields as their owner reads them: the owner checks each one, the action's schema bounds only the envelope. */
const pageBody = <T>(body: Readonly<Record<string, unknown>>): T => body as unknown as T;
const pageId = { type: "string", minLength: 1, maxLength: 200 } as const, body = { type: "object", additionalProperties: true } as const;
const ofPanel = { type: "object", properties: { body }, required: ["body"], additionalProperties: false } as const;
const ofWork = { type: "object", properties: { work_id: pageId, body }, required: ["work_id", "body"], additionalProperties: false } as const;
const ofItem = { type: "object", properties: { work_id: pageId, item: pageId, body }, required: ["work_id", "item", "body"], additionalProperties: false } as const;
const scoped = (entry: AssistantPageEntry) => entry.ports.projectRef ? { project_ref: entry.ports.projectRef } : {};
const panel = <const S extends ActionSchema, Output>(name: string, version: number, title: string, input_schema: S,
  handle: (entry: AssistantPageEntry, input: InferActionInput<S>) => Output | Promise<Output>, metered = false, draft?: true) =>
  door.define({ capability_id: `assistant.panel.${name}`, version, title, description: `助理面板：${title}。`, scope: "home", input_schema, ...(metered ? { metered } : {}), ...(draft ? { draft } : {}) },
    async (entry, input) => { const output = await handle(entry, input); recordAssistantWorkStep(entry.ports.homeDirectory, entry.ports.projectRef?.project_id ?? null, name, input, output); return output; });
const of = (entry: AssistantPageEntry) => assistantServiceFor(entry.ports);

/** The Assistant panel's writes (CALL-CHAINS §10.1.1): each the same call of its owner the route made before, now an action only this panel's door reaches. */
export const assistantPanelActions = {
  send: panel("send", /* @version action.assistant.panel.send */ 1, "发送一条输入", ofPanel, (entry, { body }) => {
    checkSendRequest(body);
    return of(entry).service.send(pageBody<AssistantSendInput>(body), { ...entry.language(), ...scoped(entry),
      ...(!body.written_by && body.reask === undefined && typeof body.text === "string" && typeof body.request_id === "string" ? { original_input: {
        input_id: body.request_id, text: body.text, written_by: "person" as const, occurred_at: new Date().toISOString(), install_id: ASSISTANT_INSTALL_ID,
      } } : {}) });
  }, true),
  cards: panel("cards", /* @version action.assistant.panel.cards */ 1, "放下页面准备的操作卡", ofPanel, (entry, { body }) => of(entry).service.offers.offerFromPage(pageBody<AssistantPageCardInput>(body), scoped(entry))),
  attachments: panel("attachments", /* @version action.assistant.panel.attachments */ 1, "读出带来的文档", ofPanel,
    async (entry, { body }) => ({ material: await of(entry).service.materials.readAttachment({ name: String(body.name ?? ""), data: String(body.data ?? "") }) })),
  notices: panel("notices", /* @version action.assistant.panel.notices */ 1, "记下通知已看或略过", ofPanel, (entry, { body }) => ({ settled: of(entry).service.notices.settleNotices(
    { ...(typeof body.notice_id === "string" ? { notice_id: body.notice_id } : {}), ...(typeof body.work_id === "string" ? { work_id: body.work_id } : {}) }, body.state === "dismissed" ? "dismissed" : "seen") })),
  followupRemove: panel("followups.remove", /* @version action.assistant.panel.followups.remove */ 1, "移除一项跟进", ofPanel,
    async (entry, { body }) => ({ removed: await of(entry).service.followUps.remove(String(body.followup_id ?? "")) })),
  control: panel("works.control", /* @version action.assistant.panel.works.control */ 1, "暂停、继续、停止或撤回", ofWork, (entry, input) => of(entry).service.control(input.work_id, pageBody<AssistantControl>(input.body))),
  draft: panel("works.draft", /* @version action.assistant.panel.works.draft */ 1, "保存输入草稿", ofWork,
    (entry, input) => ({ work: of(entry).service.saveDraft(input.work_id, pageBody<{ draft: string }>(input.body).draft) }), false, true),
  rename: panel("works.rename", /* @version action.assistant.panel.works.rename */ 1, "改工作名", ofWork,
    async (entry, input) => ({ work: await of(entry).service.rename(input.work_id, Number(input.body.revision), String(input.body.title ?? "")) })),
  mode: panel("works.mode", /* @version action.assistant.panel.works.mode */ 1, "设定执行方的后续模式", ofWork,
    (entry, input) => of(entry).service.dispatcher.setExecutorMode(input.work_id, String(input.body.mode ?? ""))),
  takeBack: panel("works.take_back", /* @version action.assistant.panel.works.take_back */ 1, "收回委托的子任务", ofWork, (entry, input) => of(entry).service.takeBack(input.work_id)),
  undo: panel("works.undo", /* @version action.assistant.panel.works.undo */ 1, "撤销一项已做的操作", ofItem, (entry, input) => of(entry).service.outcomes.undo(input.work_id, input.item)),
  budget: panel("works.budget", /* @version action.assistant.panel.works.budget */ 1, "设定工作用量上限", ofWork,
    (entry, input) => of(entry).service.budget.saveWorkBudget(input.work_id, input.body.budget_tokens)),
  results: panel("works.results", /* @version action.assistant.panel.works.results */ 1, "交回页面里的结果", ofWork, (entry, input) => of(entry).service.outcomes.receiveResult(input.work_id, input.body)),
  handover: panel("works.handover", /* @version action.assistant.panel.works.handover */ 1, "转交给执行方", ofWork, (entry, input) => of(entry).service.dispatcher.handover(input.work_id,
    { to: pageBody<Pick<AssistantHandover, "to">>(input.body).to, ...(typeof input.body.mode === "string" ? { mode: input.body.mode } : {}) })),
  recovery: panel("works.recovery", /* @version action.assistant.panel.works.recovery */ 1, "关闭中断的一轮", ofWork, async (entry, input): Promise<object> => typeof input.body.run_id === "string"
    ? of(entry).service.closeInterrupted(input.work_id, { run_id: input.body.run_id, version: Number(input.body.version) }) : of(entry).service.recovery(input.work_id)),
  archive: panel("works.archive", /* @version action.assistant.panel.works.archive */ 1, "归档或恢复工作", ofWork,
    async (entry, input) => ({ work: await of(entry).service.archive(input.work_id, input.body.archived !== false) })),
  review: panel("works.review", /* @version action.assistant.panel.works.review */ 1, "批准或拒绝工作里的待审操作", ofItem, (entry, input) => of(entry).service.outcomes.decide(input.work_id,
    { review_id: input.item, decision: pageBody<{ decision: "approve" | "reject" }>(input.body).decision, ...(typeof input.body.note === "string" ? { note: input.body.note } : {}) })),
  answer: panel("works.answer", /* @version action.assistant.panel.works.answer */ 1, "回答待答的问题", ofWork, (entry, input) => answerQuestion(entry, input.work_id, input.body), true),
  questionDraft: panel("works.question_draft", /* @version action.assistant.panel.works.question_draft */ 1, "保存问题的草稿", ofWork, (entry, input) => ({ ok: true,
    ...questionDrafts(of(entry).store).save(input.work_id, String(input.body.pending_id ?? ""), input.body.values, input.body.draft_revision) }), false, true),
  runCard: panel("works.cards.run", /* @version action.assistant.panel.works.cards.run */ 1, "执行一张操作卡", ofItem,
    (entry, input) => of(entry).service.offers.runCard(input.work_id, input.item, { revision: Number(input.body.revision), values: input.body.values })),
  dismissCard: panel("works.cards.dismiss", /* @version action.assistant.panel.works.cards.dismiss */ 1, "收起一张操作卡", ofItem, (entry, input) => of(entry).service.offers.dismissCard(input.work_id, input.item)),
  redoCard: panel("works.cards.redo", /* @version action.assistant.panel.works.cards.redo */ 1, "重新准备一张操作卡", ofItem, (entry, input) => {
    // A stale card is prepared again only when asked: the request goes in as the page's words, nothing runs in its place.
    const card = of(entry).service.offers.card(input.work_id, input.item);
    return of(entry).service.send({ work_id: input.work_id, request_id: randomUUID(), text: uiText.text("workbench.assistant-http.suggestion-title-did-not-run-why-read-latest",
      { title: card.title, why: card.outcome || uiText.text("workbench.assistant-http.data-changed-after-was-suggested") }) }, { ...entry.language(), ...scoped(entry) }, "page");
  }, true),
};
export const assistantPanelProvider = () => webEntryProvider("system.assistant-panel", "助理面板", Object.values(assistantPanelActions));

type Panel<S> = { readonly definition: ActionDefinition<InferActionInput<S>, unknown> };
const named = <T>(table: Readonly<Record<string, T>>, key: string | undefined): T | undefined => key !== undefined && Object.hasOwn(table, key) ? table[key] : undefined;

/** The panel's write a POST names, called as the person through the panel's door; undefined when the path is not one of them. */
async function panelWrite(parts: readonly string[], body: Readonly<Record<string, unknown>>, ports: AssistantHttpPorts & { projectRef?: LocalHostProjectReference },
  request: IncomingMessage): Promise<{ result: unknown } | undefined> {
  const call: WebEntryCall<AssistantPageEntry> = { host: ports.localHost, request, entry: { ports, language: () => pageRoundLanguage(ports) } };
  const run = async <I>(definition: ActionDefinition<I, unknown>, input: I) => ({ result: await door.invoke(call, definition, input) });
  const a = assistantPanelActions;
  if (parts.length === 1) {
    const top = named<Panel<typeof ofPanel>>({ send: a.send, cards: a.cards, attachments: a.attachments, notices: a.notices }, parts[0]);
    return top && run(top.definition, { body });
  }
  if (parts.length === 2 && parts[0] === "followups" && parts[1] === "remove") return run(a.followupRemove.definition, { body });
  if (parts[0] !== "works" || !parts[1]) return undefined;
  const work_id = parts[1];
  if (parts.length === 3) {
    const own = named<Panel<typeof ofWork>>({ control: a.control, draft: a.draft, rename: a.rename, mode: a.mode, "take-back": a.takeBack, budget: a.budget,
      results: a.results, handover: a.handover, recovery: a.recovery, archive: a.archive, answer: a.answer, "question-draft": a.questionDraft }, parts[2]);
    return own && run(own.definition, { work_id, body });
  }
  const item = parts[3]!;
  if (parts.length === 4) { const one = named<Panel<typeof ofItem>>({ undo: a.undo, reviews: a.review }, parts[2]); return one && run(one.definition, { work_id, item, body }); }
  if (parts.length === 5 && parts[2] === "cards") {
    const card = named<Panel<typeof ofItem>>({ run: a.runCard, dismiss: a.dismissCard, redo: a.redoCard }, parts[4]);
    return card && run(card.definition, { work_id, item, body });
  }
  return undefined;
}

/**
 * `/api/assistant/*`, served under whichever project page the person is on. The page's project only decides the
 * scope of a *new* work; an existing work keeps the scope it was started with.
 */
export async function handleAssistantHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: AssistantHttpPorts & { projectRef?: LocalHostProjectReference }): Promise<boolean> {
  return handleAssistantSurfaceHttp(request, response, url, ports.localHost, ports.projectRef, () => assistantServiceFor(ports).store)
    ?? handleAssistantActions(request, response, url, ports);
}

function handleAssistantActions(request: IncomingMessage, response: ServerResponse, url: URL,
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
        return { status: 200, body: await relatedWorks(relatedSource(service), ports.projectRef?.project_id ?? null, { kind, id }) };
      }
      // Characters the person may choose here: for a work (its own project), or for a new work on this page.
      if (method === "GET" && parts.length === 1 && parts[0] === "characters") {
        const work = url.searchParams.get("work") ?? undefined;
        return { status: 200, body: { characters: await service.characters(work, ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      }
      // The plugins that can carry a work here: the person picks one for a new work, or hands an open one over.
      if (method === "GET" && parts.length === 1 && parts[0] === "executors") {
        return { status: 200, body: { executors: await service.dispatcher.executors(ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      }
      // The panel's own writes (send, a card a page prepared, an attachment, notices, a follow-up) are actions behind its door (B9).
      if (method === "POST" && parts[0] !== "works") { const written = await panelWrite(parts, body, ports, request); if (written) return { status: 200, body: written.result }; }
      if (method === "GET" && parts.length === 2 && parts[0] === "requests") return { status: 200, body: store.requests.read(WEB_ACTOR, parts[1]!) };
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
      if (method === "GET" && parts.length === 1 && parts[0] === "diagnostics") return { status: 200, body: await service.reads.diagnostics() };
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
      // Methods Plugins offer that this scope can use (for “/”).
      if (method === "GET" && parts.length === 1 && parts[0] === "methods") return { status: 200, body: { methods: await service.reads.methods(null, ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      // Which object kind each surface's tab items are, from the plugins' search source declarations.
      if (method === "GET" && parts.length === 1 && parts[0] === "surface-kinds") return { status: 200, body: { kinds: await service.reads.surfaceKinds(ports.projectRef ? { project_ref: ports.projectRef } : {}) } };
      // What the Assistant's own rounds used today, and the person's daily cap.
      if (method === "GET" && parts.length === 1 && parts[0] === "usage") return { status: 200, body: await service.budget.usage() };
      if (method === "POST" && parts.length === 1 && parts[0] === "budget") { service.budget.saveBudget(body.daily_tokens); return { status: 200, body: await service.budget.usage() }; }
      // What the person asked the Assistant to keep: personal, and this project's when on a project's page.
      if (method === "GET" && parts.length === 1 && parts[0] === "memories") {
        return { status: 200, body: { memories: await service.memory.memories(ports.projectRef?.project_id ?? null), prefs: service.memory.memoryPrefs() } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "memories") {
        const action = body.action === "update" || body.action === "disable" || body.action === "enable" || body.action === "remove" ? body.action : null;
        if (!action) throw assistantErrors.invalid("不支持的操作");
        return { status: 200, body: { memories: await service.memory.changeMemory({ memory_id: String(body.memory_id ?? ""), action, ...(typeof body.text === "string" ? { text: body.text } : {}) }, ports.projectRef?.project_id ?? null) } };
      }
      if (method === "POST" && parts.length === 1 && parts[0] === "memory-prefs") return { status: 200, body: { prefs: service.memory.saveMemoryPrefs(body as never) } };
      // What works suggest keeping: the person accepts (optionally reworded) or declines each.
      if (method === "GET" && parts.length === 1 && parts[0] === "memory-candidates") return { status: 200, body: { candidates: await service.memory.memoryCandidates() } };
      // Keeping or declining a suggestion is Memory's own action, with the version the panel saw (B9).
      if (method === "POST" && parts.length === 3 && parts[0] === "memory-candidates" && (parts[2] === "accept" || parts[2] === "discard")) {
        return { status: 200, body: await settleMemoryCandidate(ports, parts[1]!, parts[2], body) };
      }
      if (method === "GET" && parts.length === 1 && parts[0] === "rules") return { status: 200, body: { rules: service.followUps.rules(), pages: pageChoices(await ports.pages()) } };
      if (method === "POST" && parts.length === 1 && parts[0] === "rules") return { status: 200, body: { rules: await service.followUps.addRule(body.rule as never, typeof body.rule_id === "string" ? body.rule_id : undefined) } };
      if (method === "POST" && parts.length === 2 && parts[0] === "rules" && parts[1] === "remove") return { status: 200, body: { rules: service.followUps.removeRule(String(body.rule_id ?? "")) } };
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
      if (method === "GET" && parts.length === 4 && parts[2] === "materials") return { status: 200, body: { material: service.materials.material(workId, parts[3]!) } };
      if (method === "GET" && parts.length === 5 && parts[2] === "materials" && parts[4] === "image") return { status: 200, body: { image: await service.materials.materialImage(workId, parts[3]!) } };
      // The connection card of a result that left a connection to finish (ASC-69): read, and cancelled, as whoever prepared it.
      if (parts.length === 5 && parts[2] === "cards" && parts[4] === "connection" && (method === "GET" || method === "POST" && body.step === "cancel")) {
        return { status: 200, body: await assistantConnectionCard(ports.localHost, ports.homeDirectory, store.get(WEB_ACTOR, workId), service.offers.card(workId, parts[3]!), method === "GET" ? "read" : "cancel", readText) };
      }
      if (method !== "POST") return null;
      const threadWork = await threadWorkRoute(workId, parts, body, ports);
      if (threadWork) return threadWork;
      const written = await panelWrite(parts, body, ports, request);
      return written ? { status: 200, body: written.result } : null;
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
  drawAssistantReply(result.body, { say: readText, card: card => service.offers.html(card, readText),
    drafts: workId => { try { return questionDrafts(store).read(workId); } catch (error) {
      if (!(error instanceof ActionError && error.code === "assistant.not_found")) hostLog.warn("assistant", "question_drafts_read_failed", error);
      return {};
    } } });
  writeNativePluginJsonResponse(response, result);
}

/** An answer as the question card's fields hold it (specs/ai-interaction-experience A1): it becomes the Runtime's answer, and its draft goes once the answer is taken. */
async function answerQuestion(entry: AssistantPageEntry, workId: string, body: Readonly<Record<string, unknown>>) {
  const { service, store } = assistantServiceFor(entry.ports);
  const answer = body.values === undefined ? {} : questionAnswer(body.values);
  if (!answer) throw assistantErrors.invalid("请先回答再提交");
  const view = await service.outcomes.answer(workId, { run_id: String(body.run_id ?? ""), pending_id: String(body.pending_id ?? ""),
    ...(body.pending_revision !== undefined ? { pending_revision: Number(body.pending_revision) } : {}), ...(typeof body.text === "string" ? { text: body.text } : {}),
    ...(Array.isArray(body.answers) ? { answers: pageBody<Pick<Parameters<typeof service.outcomes.answer>[1], "answers">>(body).answers } : {}), ...answer },
    { ...entry.language(), ...(entry.ports.projectRef ? { project_ref: entry.ports.projectRef } : {}) }).catch(async (error: { code?: string; message?: string; problems?: unknown }) => {
    // A questionnaire answer the Runtime refused: each question's reason goes beside its own field.
    if (error?.code !== "agent.answer_invalid") throw error;
    // Read back with the questions it answered, so each line can name the limit it crossed.
    const asked = (await service.read(workId).catch(error => {
      if (!(error instanceof ActionError && error.code === "assistant.not_found")) hostLog.warn("assistant", "answer_context_read_failed", error);
      return undefined;
    }))?.rounds.flatMap(round => round.awaiting_input).find(item => item.pending_id === body.pending_id)?.questions;
    throw assistantErrors.invalid(String(error.message), Array.isArray(error.problems) ? { errors: questionErrors(error.problems, readText, asked) } : undefined);
  });
  questionDrafts(store).drop(workId, String(body.pending_id ?? ""));
  return view;
}

/** A suggestion kept (as it was, or reworded) or declined: Memory's `memory.candidates.*`, as the person, with the version the panel saw. */
async function settleMemoryCandidate(ports: AssistantHttpPorts, candidate_id: string, decision: "accept" | "discard", body: Record<string, unknown>) {
  const person = bindLocalWebActions(ports.localHost, undefined, [MEMORY_WRITE_PERMISSION]);
  const expected_version = Number(body.expected_version);
  const settled = decision === "accept"
    ? await person.invoke(memoryActions.accept, { candidate_id, expected_version, ...(typeof body.text === "string" && body.text.trim() ? { text: body.text } : {}) })
    : await person.invoke(memoryActions.discard, { candidate_id, expected_version });
  return { candidate: assistantCandidate(settled.candidate) };
}

/** The Send HTTP input, before invoking its owner. */
function checkSendRequest(body: Record<string, unknown>): void {
        // A page marks the words it wrote itself ("page"); the marks of the Host's and the Assistant's own rounds are set in code and cannot be claimed from outside.
        if (body.written_by !== undefined && body.written_by !== "page") throw assistantErrors.invalid("written_by 只能是 page");
        if (body.target !== undefined && body.target !== "answer" && body.target !== "steer") throw assistantErrors.invalid("target 只能是 answer 或 steer");
        // A re-ask names a closed question of an existing work, and is not an answer: refused before any work is made or touched.
        if (body.reask !== undefined && (!body.work_id || body.target === "answer" || body.about !== undefined)) throw assistantErrors.invalid("重新问只能用在已有的工作上，不能同时作为回答或指向一条输入");
        // A correction names the input it corrects, in a work that has one; it is a supplement, never an answer. Only the id's
        // shape is checked: the runtime keeps `about` as a pointer without looking it up (D34), so an id that is not one of this
        // session's inputs names nothing, and the receipt shows 「更早的一条」.
        if (body.about !== undefined && (typeof body.about !== "string" || !body.about || body.about.length > 200 || !body.work_id || body.target === "answer")) throw assistantErrors.invalid("about 要写一条输入的 id，只能用在已有的工作里，且不能用于回答");
}
