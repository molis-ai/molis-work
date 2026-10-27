import { JobResumption } from "../services/job-resumption.js";
import { validateResumption } from "../jobs/resumption-validation.js";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { studioLifecycle } from "./studio-lifecycle.js";
import { actionsInFlight, bindAlchemistActor } from "./actor-actions.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Hono } from "hono";
import { createApp } from "../app.js";
import type { ApiDependencies } from "../api/dependencies.js";
import { createAlchemistOperationExecutor, type AlchemistActionInvoker } from "../services/action-operations.js";
import { SqliteActivityRepository } from "../db/activity-repository.js";
import { SqliteCalibrationRepository } from "../db/calibration-repository.js";
import { SqliteConversationRepository } from "../db/conversation-repository.js";
import { SqliteDecisionRepository } from "../db/decision-repository.js";
import { SqliteDirectionRepository } from "../db/direction-repository.js";
import { SqliteExplorationRepository } from "../db/exploration-repository.js";
import { SqliteIdeaRepository } from "../db/idea-repository.js";
import { SqliteMemoryRepository } from "../db/memory-repository.js";
import { applyStudioBaseline } from "../db/schema.js";
import { openDatabase, type SqliteDatabase } from "../db/open-database.js";
import { SqlitePulseRepository } from "../db/pulse-repository.js";
import { SqliteResearchRepository } from "../db/research-repository.js";
import { SqliteSettingsRepository } from "../db/settings-repository.js";
import { createJobHandlers } from "../jobs/job-handlers.js";
import { LocalWorker, type JobHandler } from "../jobs/local-worker.js";
import { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";
import { FixturePulseSource } from "../runtime/fixture-pulse-source.js";
import { RuleBasedPulseSynthesizer } from "../runtime/pulse-synthesizer.js";
import { ResearchRuntimeSelector } from "../runtime/research-runtime-selector.js";
import { RuntimeSelector } from "../runtime/runtime-selector.js";
import type { AlchemistAiPort } from "../runtime/host-port.js";
import type { LocalSecurityOptions } from "../security/local-session.js";
import { createCalibrationMemoryService } from "../services/calibration-memory.js";
import { createCancelLensRunService } from "../services/cancel-lens-run.js";
import { createCancelPulseRunService } from "../services/cancel-pulse-run.js";
import { createExplorationService } from "../services/create-exploration.js";
import { createResearchPlanService } from "../services/create-research-plan.js";
import { createDecisionWorkspaceService } from "../services/decision-workspace.js";
import { createGetResearchWorkspaceService } from "../services/get-research-workspace.js";
import { createIdeaCardActions } from "../services/idea-card-actions.js";
import { createOpportunityActions } from "../services/opportunity-actions.js";
import { createStartLensRunService } from "../services/start-lens-run.js";
import { createStartPulseRunService } from "../services/start-pulse-run.js";
import { WorkspaceExportService } from "../services/workspace-export.js";
import { GitHubSource } from "../sources/github-source.js";
import { SafePublicHttpClient } from "../sources/http-source-client.js";
import type { AlchemistPulseGithubPort } from "../sources/pulse-github-port.js";
import { ToolifySource } from "../sources/toolify-source.js";
import { WatchaSource } from "../sources/watcha-source.js";

import { WorkReuseService } from "../../../work-reuse/service.js";
import type { WorkReuseHostPort } from "../../../work-reuse/contracts.js";

export interface LocalRuntimeOptions {
  workReuse?: WorkReuseHostPort;
  databasePath: string;
  ai: AlchemistAiPort;
  workerIntervalMs?: number;
  jobLeaseMs?: number;
  pulseSourceMode?: "live" | "fixture";
  /**
   * The Host's transport for the market pulse's GitHub source: it adds the bound Settings GitHub account's credential outside
   * this package. Without it the source searches anonymously. No credential is ever read from the environment. Which account
   * is bound is the Home's choice, read and written through `createAlchemistActionHandlers`, not through a project's studio.
   */
  pulseGithub?: Pick<AlchemistPulseGithubPort, "fetch">;
  localSecurity?: LocalSecurityOptions;
  /** Production Host supplies its trusted Kernel client; standalone Studio uses the same plugin operations. */
  actions?: AlchemistActionInvoker;
}

export interface LocalRuntime {
  app: Hono;
  actions: AlchemistActionInvoker;
  actionsFor(actorId: string): AlchemistActionInvoker;
  database: SqliteDatabase;
  worker: LocalWorker;
  runPending(): Promise<void>;
  /** Nothing to do: no action in flight, no drain under way and no job waiting or running. The Host may then close it. */
  idle(): boolean;
  start(): void;
  close(): Promise<void>;
}

export function createLocalRuntime(options: LocalRuntimeOptions): LocalRuntime {
  mkdirSync(dirname(options.databasePath), { recursive: true });
  const database = openDatabase(options.databasePath);
  applyStudioBaseline(database, options.databasePath);
  const clock = { now: () => new Date().toISOString() };
  const idFactory = { next: (prefix: string) => `${prefix}_${randomUUID()}` };
  const actors = new AsyncLocalStorage<string>();
  const actorId = () => actors.getStore() ?? "actor-local";
  const ai: AlchemistAiPort = { listModels: () => options.ai.listModels(), search: input => options.ai.search(input),
    generate: input => options.ai.generate({ ...input, actorId: actorId() }) };

  const activity = new SqliteActivityRepository(database);
  const calibration = new SqliteCalibrationRepository(database);
  const directions = new SqliteDirectionRepository(database);
  const conversations = new SqliteConversationRepository(database);
  const explorations = new SqliteExplorationRepository(database);
  const ideas = new SqliteIdeaRepository(database);
  const memory = new SqliteMemoryRepository(database);
  const research = new SqliteResearchRepository(database);
  const workReuse = new WorkReuseService({ database, memory, research, ai, host: options.workReuse, actorId, now: clock.now, workspaceId: "workspace-local" });
  const settings = new SqliteSettingsRepository(database);
  const pulse = new SqlitePulseRepository(database);
  const decisions = new SqliteDecisionRepository(database);
  const jobs = new SqliteJobRunner(database, {
    workerId: `local_${process.pid}_${randomUUID()}`,
    clock,
    idFactory,
    leaseMs: options.jobLeaseMs,
    actorId,
  });
  const runtimeSettings = new RuntimeSelector({
    workspaceId: "workspace-local",
    settings,
    ai,
    now: clock.now,
  });
  const researchRuntime = new ResearchRuntimeSelector({
    workReuse,
    ai,
    memory,
  });
  const pulseSources =
    options.pulseSourceMode === "fixture"
      ? [
          new FixturePulseSource("toolify"),
          new FixturePulseSource("watcha"),
          new FixturePulseSource("github"),
        ]
      : [
          new ToolifySource(new SafePublicHttpClient(["www.toolify.ai"])),
          new WatchaSource(new SafePublicHttpClient(["watcha.cn"])),
          new GitHubSource(new SafePublicHttpClient(["api.github.com"], options.pulseGithub ? { fetch: options.pulseGithub.fetch } : {})),
        ];
  const handlers = createJobHandlers({
      explorations,
      runtime: runtimeSettings,
      idFactory,
      clock,
      research: {
        repository: research,
        ideas,
        runtime: researchRuntime,
        workReuse,
      },
      pulse: {
        repository: pulse,
        sources: pulseSources,
        synthesizer: new RuleBasedPulseSynthesizer(),
      },
    });
  const worker = new LocalWorker(jobs, Object.fromEntries(Object.entries(handlers).map(([kind, handler]) => [kind,
    ((job, control) => {
      return actors.run(control.acceptance.actorId, () => handler(job, control));
    }) satisfies JobHandler,
  ])));
  const createExploration = createExplorationService({
    database,
    directions,
    explorations,
    jobs,
    idFactory,
    clock,
  });
  const ideaCardActions = createIdeaCardActions({
    get actorId() { return actorId(); },
    clock,
    idFactory,
    directions,
    ideas,
  });
  const createResearchPlan = createResearchPlanService({
    workReuse,
    get actorId() { return actorId(); },
    workspaceId: "workspace-local",
    clock,
    idFactory,
    ideas,
    memory,
    research,
    runtime: runtimeSettings,
  });
  const getResearchWorkspace = createGetResearchWorkspaceService({
    workReuse,
    ideas,
    research,
    runtime: runtimeSettings,
  });
  const decisionWorkspace = createDecisionWorkspaceService({
    get actorId() { return actorId(); },
    clock,
    idFactory,
    ideas,
    research,
    decisions,
  });
  const startLensRun = createStartLensRunService({ database, clock, idFactory, jobs, research });
  const startPulseRun = createStartPulseRunService({
    database,
    pulse,
    jobs,
    idFactory,
    clock,
    workspaceId: "workspace-local",
  });
  const opportunityActions = createOpportunityActions({
    database,
    workspaceId: "workspace-local",
    clock,
    idFactory,
    pulse,
    directions,
  });
  const calibrationMemory = createCalibrationMemoryService({
    database,
    workspaceId: "workspace-local",
    get actorId() { return actorId(); },
    clock,
    idFactory,
    activity,
    calibration,
    ideas,
    memory,
    research,
  });
  const workspaceExport = new WorkspaceExportService({
    workReuse,
    database,
    workspaceId: "workspace-local",
    activity,
    idFactory,
    now: clock.now,
  });
  const initializeCommand = () => initializeWorkspace(database, settings, pulse, clock.now(), actorId());
  const jobResumption = new JobResumption({ jobs, worker, runtime: runtimeSettings, actorId, now: clock.now, initialize: initializeCommand,
    taste: () => memory.listTasteRules("workspace-local").filter(rule => rule.status === "active"),
    validate: job => validateResumption(job, { jobs, explorations, research, pulse }),
  });
  const dependencies: ApiDependencies = {
    jobResumption, initializeCommand,
    workspaceId: "workspace-local",
    get actorId() { return actorId(); },
    workspaceName: "炼金术士",
    get actorName() { return actorId() === "actor-local" ? "本地创始人" : actorId(); },
    clock,
    idFactory,
    activity,
    calibration,
    directions,
    conversations,
    decisions,
    explorations,
    ideas,
    memory,
    pulse,
    research,
    jobs,
    ideaCardActions,
    createExploration,
    listRuntimeModels: () => runtimeSettings.listModels(),
    createResearchPlan,
    startLensRun,
    cancelLensRun: createCancelLensRunService({ database, jobs, research, now: clock.now, onCancel: id => worker.cancel(id) }),
    getResearchWorkspace,
    decisionWorkspace,
    startPulseRun,
    cancelPulseRun: createCancelPulseRunService({ database, jobs, pulse, now: clock.now, onCancel: id => worker.cancel(id) }),
    opportunityActions,
    calibrationMemory,
    runtimeSettings,
    workspaceExport,
    workReuse,
    ...(options.localSecurity ? { localSecurity: options.localSecurity } : {}),
  };
  const actions = createAlchemistOperationExecutor(dependencies);
  const inFlight = actionsInFlight();
  const app = createApp(dependencies, inFlight.track(options.actions ?? actions));

  const { closed, ...lifecycle } = studioLifecycle({ database, worker, jobs, actions: inFlight, intervalMs: options.workerIntervalMs });
  return {
    app, actions: inFlight.track(actions), database, worker, ...lifecycle,
    actionsFor(owner) { return inFlight.track(bindAlchemistActor(owner, { database, actors, clock, actions, closed })); },
  };
}

function initializeWorkspace(database: SqliteDatabase, settings: SqliteSettingsRepository, pulse: SqlitePulseRepository, now: string, actorId: string): void {
  database.transaction(() => {
    database
      .prepare("INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
      .run("workspace-local", "炼金术士", now);
    database
      .prepare(
        `INSERT OR IGNORE INTO workspace_actors
         (id, workspace_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(actorId, "workspace-local", "local_user", actorId, now);
    settings.ensureDefaults("workspace-local", now);
    pulse.sources.ensureDefaultSourceSettings(now);
  }).immediate();
}
