import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Hono } from "hono";
import { createApp } from "../app.js";
import { SqliteActivityRepository } from "../db/activity-repository.js";
import { SqliteCalibrationRepository } from "../db/calibration-repository.js";
import { SqliteConversationRepository } from "../db/conversation-repository.js";
import { SqliteDecisionRepository } from "../db/decision-repository.js";
import { SqliteDirectionRepository } from "../db/direction-repository.js";
import { SqliteExplorationRepository } from "../db/exploration-repository.js";
import { SqliteIdeaRepository } from "../db/idea-repository.js";
import { SqliteMemoryRepository } from "../db/memory-repository.js";
import { LATEST_SCHEMA_VERSION, migrate } from "../db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../db/open-database.js";
import { createPreMigrationBackup } from "../db/pre-migration-backup.js";
import { SqlitePulseRepository } from "../db/pulse-repository.js";
import { SqliteResearchRepository } from "../db/research-repository.js";
import { SqliteSettingsRepository } from "../db/settings-repository.js";
import { createJobHandlers } from "../jobs/job-handlers.js";
import { LocalWorker } from "../jobs/local-worker.js";
import { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";
import { FixturePulseSource } from "../runtime/fixture-pulse-source.js";
import { RuleBasedPulseSynthesizer } from "../runtime/pulse-synthesizer.js";
import { ResearchRuntimeSelector } from "../runtime/research-runtime-selector.js";
import { RuntimeSelector } from "../runtime/runtime-selector.js";
import type { AlchemistAiPort } from "../runtime/host-port.js";
import type { LocalSecurityOptions } from "../security/local-session.js";
import { createCalibrationMemoryService } from "../services/calibration-memory.js";
import { createCancelLensRunService } from "../services/cancel-lens-run.js";
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
import { ToolifySource } from "../sources/toolify-source.js";
import { WatchaSource } from "../sources/watcha-source.js";

export interface LocalRuntimeOptions {
  databasePath: string;
  ai: AlchemistAiPort;
  workerIntervalMs?: number;
  jobLeaseMs?: number;
  pulseSourceMode?: "live" | "fixture";
  localSecurity?: LocalSecurityOptions;
}

export interface LocalRuntime {
  app: Hono;
  database: SqliteDatabase;
  worker: LocalWorker;
  runPending(): Promise<void>;
  start(): void;
  close(): Promise<void>;
}

export function createLocalRuntime(options: LocalRuntimeOptions): LocalRuntime {
  mkdirSync(dirname(options.databasePath), { recursive: true });
  const database = openDatabase(options.databasePath);
  const migrationBackup = createPreMigrationBackup({
    database,
    databasePath: options.databasePath,
    backupDirectory: join(dirname(options.databasePath), "backups"),
    latestSchemaVersion: LATEST_SCHEMA_VERSION,
    now: new Date().toISOString(),
  });
  migrate(database);
  const clock = { now: () => new Date().toISOString() };
  const idFactory = { next: (prefix: string) => `${prefix}_${randomUUID()}` };
  seedLocalIdentity(database, clock.now());

  const activity = new SqliteActivityRepository(database);
  if (migrationBackup) {
    activity.create({
      id: idFactory.next("activity"),
      workspaceId: "workspace-local",
      kind: "workspace.migration_backup_created",
      targetKind: "workspace",
      targetId: "workspace-local",
      payload: {
        filename: migrationBackup.filename,
        fromVersion: migrationBackup.fromVersion,
        toVersion: migrationBackup.toVersion,
      },
      createdAt: clock.now(),
    });
  }
  const calibration = new SqliteCalibrationRepository(database);
  const directions = new SqliteDirectionRepository(database);
  const conversations = new SqliteConversationRepository(database);
  const explorations = new SqliteExplorationRepository(database);
  const ideas = new SqliteIdeaRepository(database);
  const memory = new SqliteMemoryRepository(database);
  const research = new SqliteResearchRepository(database);
  const settings = new SqliteSettingsRepository(database);
  settings.ensureDefaults("workspace-local", clock.now());
  const pulse = new SqlitePulseRepository(database);
  pulse.ensureDefaultSourceSettings(clock.now());
  const decisions = new SqliteDecisionRepository(database);
  const jobs = new SqliteJobRunner(database, {
    workerId: `local_${process.pid}_${randomUUID()}`,
    clock,
    idFactory,
    leaseMs: options.jobLeaseMs,
  });
  jobs.recoverExpired();
  const runtimeSettings = new RuntimeSelector({
    workspaceId: "workspace-local",
    settings,
    ai: options.ai,
    now: clock.now,
  });
  const researchRuntime = new ResearchRuntimeSelector({
    ai: options.ai,
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
          new GitHubSource(new SafePublicHttpClient(["api.github.com"]), process.env.GITHUB_TOKEN),
        ];
  const worker = new LocalWorker(
    jobs,
    createJobHandlers({
      explorations,
      runtime: runtimeSettings,
      idFactory,
      clock,
      taste: () => memory.listTasteRules("workspace-local").filter(rule => rule.status === "active"),
      research: {
        repository: research,
        ideas,
        runtime: researchRuntime,
      },
      pulse: {
        repository: pulse,
        sources: pulseSources,
        synthesizer: new RuleBasedPulseSynthesizer(),
      },
    }),
  );
  const createExploration = createExplorationService({
    database,
    directions,
    explorations,
    jobs,
    idFactory,
    clock,
  });
  const ideaCardActions = createIdeaCardActions({
    actorId: "actor-local",
    clock,
    idFactory,
    directions,
    ideas,
  });
  const createResearchPlan = createResearchPlanService({
    actorId: "actor-local",
    workspaceId: "workspace-local",
    clock,
    idFactory,
    ideas,
    memory,
    research,
    runtime: runtimeSettings,
  });
  const getResearchWorkspace = createGetResearchWorkspaceService({
    ideas,
    research,
    runtime: runtimeSettings,
  });
  const decisionWorkspace = createDecisionWorkspaceService({
    actorId: "actor-local",
    clock,
    idFactory,
    ideas,
    research,
    decisions,
  });
  const startLensRun = createStartLensRunService({ database, clock, idFactory, jobs, research });
  const cancelLensRun = createCancelLensRunService({ database, jobs, research, now: clock.now, onCancel: id => worker.cancel(id) });
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
    actorId: "actor-local",
    clock,
    idFactory,
    activity,
    calibration,
    ideas,
    memory,
    research,
  });
  const workspaceExport = new WorkspaceExportService({
    database,
    workspaceId: "workspace-local",
    activity,
    idFactory,
    now: clock.now,
  });
  const app = createApp({
    workspaceId: "workspace-local",
    actorId: "actor-local",
    workspaceName: "炼金术士",
    actorName: "本地创始人",
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
    cancelLensRun,
    getResearchWorkspace,
    decisionWorkspace,
    startPulseRun,
    opportunityActions,
    calibrationMemory,
    runtimeSettings,
    workspaceExport,
    ...(options.localSecurity ? { localSecurity: options.localSecurity } : {}),
  });

  let interval: NodeJS.Timeout | undefined;
  let draining: Promise<void> | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  const runPending = (): Promise<void> => {
    if (draining) return draining;
    if (closed) return Promise.resolve();
    draining = (async () => {
      // A restart can precede the former lease deadline; recover on each idle tick.
      jobs.recoverExpired();
      while (!closed && await worker.runNext()) { /* drain sequentially */ }
    })().finally(() => { draining = undefined; });
    return draining;
  };

  return {
    app,
    database,
    worker,
    runPending,
    start() {
      if (interval || closed) return;
      void runPending();
      interval = setInterval(() => void runPending(), options.workerIntervalMs ?? 250);
      interval.unref();
    },
    close() {
      if (closing) return closing;
      closed = true;
      if (interval) clearInterval(interval);
      worker.stop();
      closing = (async () => { try { await draining; await worker.whenIdle(); } finally { database.close(); } })();
      return closing;
    },
  };
}

function seedLocalIdentity(database: SqliteDatabase, now: string): void {
  database.transaction(() => {
    database
      .prepare("INSERT OR IGNORE INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
      .run("workspace-local", "炼金术士", now);
    database
      .prepare(
        `INSERT OR IGNORE INTO workspace_actors
         (id, workspace_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run("actor-local", "workspace-local", "local_user", "本地创始人", now);
  })();
}
