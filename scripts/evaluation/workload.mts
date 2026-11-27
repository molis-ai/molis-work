import {
  ActionError,
  LOCAL_PERSON_ACTOR_ID,
  bindActionClient,
  type ActionCallContext,
  type ActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ModelApiFormat } from "@molis-ai/molis-work-contracts/modules/model-providers";
import type { AgentRunHandle, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  MolisWorkLocalHost,
  ensureSystemAgentService,
  installHostUiText,
  molisWorkHostProjectReference,
  projectActionAvailability,
  registerEvaluationReplayScenario,
  type LocalWebCatalogRunner,
} from "@molis-ai/molis-work-app-local-host";
import { PAGES_SUBJECT_KIND, pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";
import { servicesEvaluationContract } from "@molis-ai/molis-work-contracts/services/evaluation";
import {
  STAND_IN_DUMMY_TOKEN,
  configureIsolatedModelProvider,
  startEvaluationStandInServer,
  type StandInModelServer,
} from "./stand-in-server.mjs";
import type { SuiteContextIds } from "./suite.mjs";

const REV = servicesEvaluationContract.schemaVersion;

export interface WorkloadModelConfig {
  readonly mode: "stand-in" | "live";
  readonly modelId: string;
  readonly baseUrl: string;
  readonly apiFormat: ModelApiFormat;
  readonly apiKey?: string;
}

export interface BootedEvaluationEnvironment {
  readonly host: MolisWorkLocalHost;
  readonly homeCaller: () => Promise<ActionCallContext>;
  readonly ids: SuiteContextIds;
  close(): Promise<void>;
}

interface CatalogProjectRefs {
  readonly mainRef: LocalHostProjectReference;
  readonly holdRef: LocalHostProjectReference;
  readonly replayRef: LocalHostProjectReference;
}

async function waitForPrologueRound(
  read: (ref: AgentRunHandle["ref"]) => Promise<AgentRunView>,
  handle: AgentRunHandle,
): Promise<AgentRunView> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const view = await read(handle.ref);
    if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) {
      if (view.phase !== "completed") {
        throw new Error(`评测模型回合未完成：phase=${view.phase} reason=${view.stop_reason ?? "unknown"}`);
      }
      return view;
    }
    if (Date.now() > deadline) {
      throw new Error(`等待评测模型回合超时：phase=${view.phase}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function createCatalogProjects(withCatalog: LocalWebCatalogRunner, home: string): Promise<CatalogProjectRefs> {
  return withCatalog({ homeDirectory: home }, async (catalog) => {
    const main = await catalog.createProject({ display_name: "评测主项目", actor_id: LOCAL_PERSON_ACTOR_ID });
    const hold = await catalog.createProject({ display_name: "留存豁免对比项目", actor_id: LOCAL_PERSON_ACTOR_ID });
    const replay = await catalog.createProject({ display_name: "隔离回放项目", actor_id: LOCAL_PERSON_ACTOR_ID });
    for (const pluginId of ["pages", "todo"] as const) {
      catalog.addProjectPlugin({ project_id: main.project_id, plugin_id: pluginId, actor_id: LOCAL_PERSON_ACTOR_ID });
    }
    catalog.addProjectPlugin({ project_id: replay.project_id, plugin_id: "todo", actor_id: LOCAL_PERSON_ACTOR_ID });
    return {
      mainRef: molisWorkHostProjectReference({ projectId: main.project_id, databasePath: main.database_path }),
      holdRef: molisWorkHostProjectReference({ projectId: hold.project_id, databasePath: hold.database_path }),
      replayRef: molisWorkHostProjectReference({ projectId: replay.project_id, databasePath: replay.database_path }),
    };
  });
}

async function runModelSummaryRound(
  system: ReturnType<typeof ensureSystemAgentService>,
  projectId: string,
): Promise<string> {
  const adapter = system.agentHost.adapter("prologue");
  const owner = {
    project_id: projectId,
    plugin_id: "system.assistant",
    install_id: "assistant-eval",
    actor_id: LOCAL_PERSON_ACTOR_ID,
  };
  const session = await adapter.createSession({
    ...owner,
    workspace: "business",
    role_id: "eval-summarizer",
    title: "最小真实评测路径摘要",
  });
  const handle = await adapter.start(
    {
      ...owner,
      session,
      workspace: "business",
      role_id: "eval-summarizer",
      task: "请根据提供的批次说明输出一句中文总结，必须包含「留存豁免」与「隔离回放」两个词语，不要调用工具。",
      text_materials: [
        {
          material_id: "batch-30-note",
          title: "第 30 批说明",
          text: "评测样本挂留存后获得留存豁免，不随到期清理删除；重跑采用隔离回放并阻断外部副作用。",
        },
      ],
      role: {
        role_id: "eval-summarizer",
        version: REV,
        workspace: "business",
        execution: "read-only",
        host_tools: [],
        prompts: [{ prompt_id: "eval.summary", version: REV, body: "你只根据材料做简短准确的中文事实总结。" }],
        skills: [],
      },
    },
    { call_id: "call-eval-ec02-round" },
  );
  await waitForPrologueRound((ref) => adapter.read(ref), handle);
  return handle.ref.run_id;
}

async function seedMainProjectCases(
  host: MolisWorkLocalHost,
  system: ReturnType<typeof ensureSystemAgentService>,
  mainRef: LocalHostProjectReference,
) {
  const mainPerson = await host.localPersonContext(mainRef);
  const pagesCallId = "call-eval-ec01-pages";
  const pagesClient = bindActionClient(host.actionClient(mainRef), () => ({ ...mainPerson, call_id: pagesCallId }));
  const mainClient = bindActionClient(host.actionClient(mainRef), () => mainPerson);
  const obsLayer = host.observation!.layer;
  const assistantSink = obsLayer.sink("assistant");

  const createdDoc = await pagesClient.invoke(pagesActions.create, {
    title: "最小评测方案",
    markdown: "初稿：梳理工作记录与预期规则",
  });
  assistantSink
    .bind({ kind: "background", entry: "background", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: mainRef.project_id, call_id: pagesCallId })
    .record({
      fact: "assistant.work",
      stage: "document_created",
      outcome: "succeeded",
      occurred_at: new Date().toISOString(),
      subjects: [{ kind: PAGES_SUBJECT_KIND, id: createdDoc.document.id, version: createdDoc.document.version }],
      evidence: [{ role: "document", ref: { kind: "owner", owner: PAGES_SUBJECT_KIND, id: createdDoc.document.id, version: createdDoc.document.version } }],
    });
  const aiDraft = await pagesClient.invoke(pagesActions.ai, {
    id: createdDoc.document.id,
    command: "summarize",
    text: "样本留存豁免清理；隔离回放阻断外部副作用。",
  });
  const updatedDoc = await pagesClient.invoke(pagesActions.update, {
    id: createdDoc.document.id,
    expected_version: createdDoc.document.version,
    markdown: `修订稿：第二版行动方案\n\n${aiDraft.text}`,
  });
  assistantSink
    .bind({ kind: "background", entry: "background", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: mainRef.project_id, call_id: pagesCallId })
    .record({
      fact: "assistant.work",
      stage: "document_revised",
      outcome: "succeeded",
      occurred_at: new Date().toISOString(),
      subjects: [{ kind: PAGES_SUBJECT_KIND, id: updatedDoc.document.id, version: updatedDoc.document.version }],
      evidence: [{ role: "document", ref: { kind: "owner", owner: PAGES_SUBJECT_KIND, id: updatedDoc.document.id, version: updatedDoc.document.version } }],
    });
  await pagesClient.invoke(pagesActions.promote, { id: createdDoc.document.id });

  const agentRunId = await runModelSummaryRound(system, mainRef.project_id);
  const selfCertCallId = "call-eval-self-cert";
  obsLayer.observed(
    {
      actor_id: "agent:assistant",
      actor_kind: "runtime",
      audience: "agent",
      project_id: mainRef.project_id,
      permissions: [],
      call_id: selfCertCallId,
    },
    { capability_id: "todo.create", version: REV, provider_id: "io.molis.work.todo", operation: "command" },
    {
      invocation_id: "inv-eval-fail",
      started_at: 100,
      ended_at: 120,
      handler_started: true,
      outcome: { ok: false, code: "todo.invalid" },
      aborted: false,
    },
  );
  const agentSink = obsLayer.sink("agent");
  agentSink
    .bind({ kind: "background", entry: "agent", actor_id: "agent:assistant", project_id: mainRef.project_id, call_id: selfCertCallId })
    .record({ fact: "agent.run", stage: "completed", outcome: "succeeded", occurred_at: new Date().toISOString(), work: { work_ref: "work-eval-self-cert" } });

  const quietWorkRef = "work-eval-quiet";
  const unexposedWorkRef = "work-eval-unexposed";
  assistantSink
    .bind({ kind: "background", entry: "background", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: mainRef.project_id })
    .record({ fact: "assistant.work", stage: "opportunity.evaluated", outcome: "no_action", occurred_at: new Date().toISOString(), work: { work_ref: quietWorkRef }, detail: { posture: "quiet" } });
  assistantSink
    .bind({ kind: "background", entry: "background", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: mainRef.project_id })
    .record({ fact: "assistant.work", stage: "opportunity.prepared", outcome: "no_action", occurred_at: new Date().toISOString(), work: { work_ref: unexposedWorkRef } });

  const createdTodo = await mainClient.invoke(todoActions.create, { title: "核对留存豁免快照" });
  const otherTodo = await mainClient.invoke(todoActions.create, { title: "穿插支线记录" });
  const primaryWorkRef = "work-eval-primary";
  const secondaryWorkRef = "work-eval-secondary";
  assistantSink
    .bind({ kind: "background", entry: "background", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: mainRef.project_id, call_id: "call-eval-primary" })
    .record({
      fact: "assistant.work",
      stage: "completed",
      outcome: "succeeded",
      occurred_at: new Date().toISOString(),
      work: { work_ref: primaryWorkRef },
      subjects: [{ kind: "todo_item", id: createdTodo.item.id, version: createdTodo.item.revision }],
    });
  assistantSink
    .bind({ kind: "background", entry: "background", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: mainRef.project_id, call_id: "call-eval-secondary" })
    .record({
      fact: "assistant.work",
      stage: "completed",
      outcome: "succeeded",
      occurred_at: new Date().toISOString(),
      work: { work_ref: secondaryWorkRef },
      subjects: [{ kind: "todo_item", id: otherTodo.item.id, version: otherTodo.item.revision }],
    });
  obsLayer.flush();

  return {
    pagesCallId,
    pageDocumentId: createdDoc.document.id,
    agentRunId,
    selfCertCallId,
    quietWorkRef,
    unexposedWorkRef,
    primaryWorkRef,
    secondaryWorkRef,
    primaryTodoId: createdTodo.item.id,
  };
}

function seedHoldAndReplayCases(
  home: string,
  host: MolisWorkLocalHost,
  projects: CatalogProjectRefs,
  cleanupDisposers: Array<() => void>,
) {
  const obsLayer = host.observation!.layer;
  const agentSink = obsLayer.sink("agent");
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const heldWorkRef = "work-eval-held";
  const unheldWorkRef = "work-eval-unheld";

  agentSink
    .bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projects.holdRef.project_id })
    .record({
      fact: "agent.materials",
      outcome: "succeeded",
      occurred_at: fourteenDaysAgo,
      work: { work_ref: heldWorkRef },
      evidence: [{ role: "material:held", ref: { kind: "content", media_type: "text/plain", text: "受留存保护的历史证据" } }],
    });
  agentSink
    .bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projects.holdRef.project_id })
    .record({
      fact: "agent.materials",
      outcome: "succeeded",
      occurred_at: fourteenDaysAgo,
      work: { work_ref: unheldWorkRef },
      evidence: [{ role: "material:unheld", ref: { kind: "content", media_type: "text/plain", text: "未挂留存即将清理的证据" } }],
    });
  obsLayer.flush();

  const externalConnectorRef: ActionReference = {
    capability_id: "connectors.cli.connect",
    version: REV,
    provider_id: "system.connectors",
  };
  const replayScenarioV1 = "scenario-ec18-baseline";
  const replayScenarioV2 = "scenario-ec18-improved";
  cleanupDisposers.push(
    registerEvaluationReplayScenario(home, replayScenarioV1, async (ctx) => {
      const replayCaller = await host.localPersonContext(projects.replayRef);
      try {
        await ctx.client.invoke(replayCaller, externalConnectorRef, { connector_id: "eval-webhook" });
        throw new Error("隔离回放未拦截外部连接写动作 connectors.cli.connect");
      } catch (error) {
        if (!(error instanceof ActionError) || error.code !== "evaluation.replay_external_effect_blocked") {
          throw error;
        }
      }
      await ctx.client.invoke(replayCaller, todoActions.list, {});
      obsLayer.flush();
    }),
  );
  cleanupDisposers.push(
    registerEvaluationReplayScenario(home, replayScenarioV2, async (ctx) => {
      const replayCaller = await host.localPersonContext(projects.replayRef);
      try {
        await ctx.client.invoke(replayCaller, externalConnectorRef, { connector_id: "eval-webhook" });
        throw new Error("隔离回放未拦截外部连接写动作 connectors.cli.connect");
      } catch (error) {
        if (!(error instanceof ActionError) || error.code !== "evaluation.replay_external_effect_blocked") {
          throw error;
        }
      }
      await ctx.client.invoke(replayCaller, todoActions.list, {});
      agentSink
        .bind({ kind: "background", entry: "agent", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projects.replayRef.project_id })
        .record({
          fact: "agent.materials",
          outcome: "succeeded",
          occurred_at: new Date().toISOString(),
          evidence: [{ role: "material:replay", ref: { kind: "content", media_type: "text/plain", text: "回放装载背景材料" } }],
        });
      obsLayer.flush();
    }),
  );
  return { heldWorkRef, unheldWorkRef, replayScenarioV1, replayScenarioV2 };
}

export async function bootAndSeedEvaluationWorkload(
  home: string,
  model: WorkloadModelConfig,
): Promise<BootedEvaluationEnvironment> {
  installHostUiText();
  let standIn: StandInModelServer | undefined;
  let host: MolisWorkLocalHost | undefined;
  const cleanupDisposers: Array<() => void> = [];

  try {
    if (model.mode === "stand-in") {
      standIn = await startEvaluationStandInServer();
    }
    let withCatalog!: LocalWebCatalogRunner;
    host = new MolisWorkLocalHost({
      homeDirectory: home,
      workspacesFor: (projectId) => withCatalog({ homeDirectory: home }, (catalog) => catalog.listWorkspaceDirectory(projectId)),
      actionAvailability: projectActionAvailability((settings, operation) => withCatalog(settings, operation), home),
    });
    withCatalog = host.configurePersonalPlanning(home, host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog);

    await configureIsolatedModelProvider({
      home,
      withCatalog,
      providerId: model.mode === "stand-in" ? "eval-stand-in" : "eval-gemini",
      displayName: model.mode === "stand-in" ? "Local Stand-in" : "Gemini Evaluation",
      baseUrl: standIn ? standIn.baseUrl : model.baseUrl,
      apiFormat: model.apiFormat,
      modelId: model.modelId,
      apiKey: standIn ? STAND_IN_DUMMY_TOKEN : (model.apiKey ?? ""),
    });

    const system = ensureSystemAgentService(host, home, withCatalog);
    await system.ready;
    const projects = await createCatalogProjects(withCatalog, home);
    const activeHost = host;
    await activeHost.withProject(projects.holdRef, () => undefined);
    await activeHost.withProject(projects.replayRef, () => undefined);

    const mainSeeded = await seedMainProjectCases(activeHost, system, projects.mainRef);
    const holdReplaySeeded = seedHoldAndReplayCases(home, activeHost, projects, cleanupDisposers);

    return {
      host: activeHost,
      homeCaller: () => activeHost.localPersonContext(),
      ids: {
        mainProjectId: projects.mainRef.project_id,
        holdProjectId: projects.holdRef.project_id,
        replayProjectId: projects.replayRef.project_id,
        ...mainSeeded,
        ...holdReplaySeeded,
      },
      close: async () => {
        for (const dispose of cleanupDisposers.splice(0)) dispose();
        await activeHost.close();
        if (standIn) await standIn.close();
      },
    };
  } catch (error) {
    for (const dispose of cleanupDisposers.splice(0)) dispose();
    if (host) await host.close();
    if (standIn) await standIn.close();
    throw error;
  }
}
