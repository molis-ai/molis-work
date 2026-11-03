import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { CATALOG_SCHEMA_VERSION, LocalProjectDatabase, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { MolisWorkServer, runtimeContextHostFromEnvironment } from "../apps/desktop/launchers/mcp/server.js";


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("mcp runtime surface and catalog reader", () => {
it("defaults to a Runtime-only tool surface", async () => {
    const server = new MolisWorkServer();
    const init = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} },
    });
    const initialized = init as {
      result: {
        serverInfo: { name: string };
        capabilities: { resources: { subscribe: boolean; listChanged: boolean } };
      };
    };
    assert.equal(initialized.result.serverInfo.name, "molis-work-mcp");
    assert.deepEqual(initialized.result.capabilities.resources, { subscribe: false, listChanged: false });
    const tools = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    const listedTools = (
      tools as {
        result: {
          tools: Array<{
            name: string;
            description: string;
            inputSchema: {
              properties?: Record<string, unknown>;
              required?: string[];
            };
          }>;
        };
      }
    ).result.tools;
    const names = listedTools.map((t) => t.name);
    const retired = [
      "molis_work_v1_contract", "molis_work_v1_available", "molis_work_v1_select_goal", "molis_work_v1_claim",
      "molis_work_v1_claim_renew", "molis_work_v1_release", "molis_work_v1_run_start", "molis_work_v1_run_report",
      "molis_work_v1_draft_dialogue_start", "molis_work_v1_draft_dialogue_turn", "molis_work_v1_draft_dialogue_resume",
      "molis_work_v1_evidence_submit", "molis_work_v1_evidence_correct", "molis_work_v1_review_submit",
      "molis_work_v1_revalidate", "molis_work_v1_rework_request", "molis_work_v1_complete",
      "molis_work_v1_contract_propose", "molis_work_v1_candidate_submit", "molis_work_v1_dependency_propose",
      "molis_work_v1_create_goal", "molis_work_v1_goal_intent_create", "molis_work_v1_goal_list", "molis_work_v1_goal_state",
      "molis_work_v1_event_note", "molis_work_v1_event_report", "molis_work_v1_goal_trash", "molis_work_v1_goal_restore",
      "molis_work_v1_planning_methods", "molis_work_v1_functions_list", "molis_work_v1_functions_describe", "molis_work_v1_functions_invoke",
    ];
    for (const name of retired) assert.ok(!names.includes(name), name);
    for (const name of [
      "molis_work_v1_project_delete", "molis_work_v1_context_resolve",
    ]) assert.ok(names.includes(name), name);
    for (const action of ["molis_work_v1_action_goals.tree.submit__v1", "molis_work_v1_action_goals.tree.read__v1", "molis_work_v1_action_goals.tree.check__v2", "molis_work_v1_action_goals.active.set__v1", "molis_work_v1_action_goals.trash.set__v1", "molis_work_v1_action_goals.trash.list__v1", "molis_work_v1_action_goals.create__v1", "molis_work_v1_action_goals.list__v1", "molis_work_v1_action_goals.note__v1", "molis_work_v1_action_goals.state.read__v1", "molis_work_v1_action_goals.events.list__v2", "molis_work_v1_action_goals.events.read__v2", "molis_work_v1_action_goals.events.configure__v1", "molis_work_v1_action_goals.events.report__v1", "molis_work_v1_action_goals.progress.record__v1", "molis_work_v1_action_goals.concerns.apply__v1", "molis_work_v1_action_goals.decisions.request__v1", "molis_work_v1_action_goals.decisions.cite__v1", "molis_work_v1_action_goals.agreement.set__v1", "molis_work_v1_action_goals.closure.submit__v1", "molis_work_v1_action_goals.work.resume__v1"]) {
      assert.equal(names.includes(action), false, "Goals action tools require a bound project and explicit action grants");
    }
    assert.ok(!names.some((name) => !name.startsWith("molis_work_v1_")));
    assert.ok(listedTools.every((tool) => !("database_path" in (tool.inputSchema.properties ?? {}))));
    assert.ok(listedTools.every((tool) => !("project_id" in (tool.inputSchema.properties ?? {})) || tool.name.startsWith("molis_work_v1_context_") || tool.name === "molis_work_v1_project_delete"));
  });

it("returns structured reader-too-old diagnostics without exposing the catalog path", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "molis-work-mcp-reader-too-old-"));
    const home = path.join(directory, "home", ".molis-work");
    try {
      const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
      await catalog.createProject({ display_name: "保留项目", actor_id: "user" });
      catalog.close();
      const databasePath = path.join(home, "projects", "catalog.db");
      const futureSchema = CATALOG_SCHEMA_VERSION + 1;
      const future = new Database(databasePath);
      try {
        future.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run(String(futureSchema));
      } finally {
        future.close();
      }

      const runtime = new MolisWorkServer("runtime", null, {
        homeDirectory: home,
        runtimeContext: {
          runtime_id: "codex",
          stable_work_context_id: "reader-too-old-session",
          host_declares_stable: true,
        },
        webBaseUrl: "http://127.0.0.1:4173",
      });
      const response = await runtime.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "molis_work_v1_context_resolve", arguments: {} },
      }) as { result: { isError: boolean; content: Array<{ text: string }> } };
      const errorText = response.result.content[0]?.text ?? "";
      assert.equal(response.result.isError, true);
      assert.match(JSON.parse(errorText).error, new RegExp(`Molis Work catalog schema=${futureSchema}`));
      assert.match(errorText, /"code":"catalog\.reader_too_old"/);
      assert.match(errorText, new RegExp(`"actual_schema_version":${futureSchema}`));
      assert.match(errorText, new RegExp(`"supported_schema_max":${CATALOG_SCHEMA_VERSION}`));
      assert.match(errorText, /"recovery":"new_or_fork_session_then_context_resolve"/);
      assert.doesNotMatch(errorText, new RegExp(databasePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

it("does not restore the removed static Runtime DB connection from environment", () => {
    const keys = [
      "MOLIS_WORK_DATABASE",
      "MOLIS_WORK_PROJECT_ID",
      "MOLIS_WORK_WEB_URL",
      "MOLIS_WORK_RUNTIME_ID",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.MOLIS_WORK_DATABASE = "/tmp/legacy-molis-work.db";
      process.env.MOLIS_WORK_PROJECT_ID = "legacy-board";
      process.env.MOLIS_WORK_WEB_URL = "http://127.0.0.1:4173";
      delete process.env.MOLIS_WORK_RUNTIME_ID;
      const runtime = new MolisWorkServer("runtime");
      assert.deepEqual(runtime.runtimeConnection, null);
      assert.equal(runtime.runtimeContextHost, null);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("mcp management database scope", () => {
it("a management call that names no database fails instead of using a path under the working directory", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "molis-work-mcp-no-default-"));
    const previousCwd = process.cwd();
    const previousDatabase = process.env.MOLIS_WORK_DATABASE;
    delete process.env.MOLIS_WORK_DATABASE;
    process.chdir(directory);
    const management = new MolisWorkServer("management");
    try {
      // `initialize` is the call that would have created the default path.
      for (const named of [{}, { database_path: "" }, { database_path: "  " }, { database_path: 5 }]) {
        await assert.rejects(
          () => management.callTool("molis_work_v1_initialize", { project_id: "no-default", idempotency_key: "k", ...named }),
          (error: unknown) => error instanceof ActionError && error.code === "mcp.path_required",
          JSON.stringify(named),
        );
      }
      assert.deepEqual(fs.readdirSync(directory), [], "nothing is created relative to the working directory");
      // The environment variable is an explicit path, so it is honoured: the call now reaches the missing file.
      const named = path.join(directory, "named", "project.db");
      process.env.MOLIS_WORK_DATABASE = named;
      await assert.rejects(
        () => management.callTool("molis_work_v1_goal_tree_decide", { project_id: "no-default" }),
        (error: unknown) => error instanceof ActionError && error.code === "mcp.not_found" && error.message.includes(named),
      );
      assert.deepEqual(fs.readdirSync(directory), []);
    } finally {
      process.chdir(previousCwd);
      if (previousDatabase === undefined) delete process.env.MOLIS_WORK_DATABASE; else process.env.MOLIS_WORK_DATABASE = previousDatabase;
      await management.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

it("a management call takes its database from database_path before MOLIS_WORK_DATABASE", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "molis-work-mcp-argument-over-environment-"));
    const previousDatabase = process.env.MOLIS_WORK_DATABASE;
    const fromEnvironment = path.join(directory, "from-environment.db");
    const fromArgument = path.join(directory, "from-argument.db");
    process.env.MOLIS_WORK_DATABASE = fromEnvironment;
    const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
    const management = new MolisWorkServer("management", null, null, host);
    try {
      const created = JSON.parse(await management.callTool("molis_work_v1_initialize",
        { database_path: fromArgument, project_id: "project/argument-first", idempotency_key: "argument-first" })) as { project_id: string; replayed: boolean };
      assert.deepEqual([created.project_id, created.replayed], ["project/argument-first", false]);
      assert.equal(fs.existsSync(fromArgument), true, "the named database was created");
      assert.equal(fs.existsSync(fromEnvironment), false, "the environment variable's path was left alone");
    } finally {
      if (previousDatabase === undefined) delete process.env.MOLIS_WORK_DATABASE; else process.env.MOLIS_WORK_DATABASE = previousDatabase;
      await management.close();
      await host.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

it("a management call that names no project_id runs as database:<path>, and a later name for the same database conflicts with it", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "molis-work-mcp-database-project-"));
    const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
    const management = new MolisWorkServer("management", null, null, host);
    try {
      const project = await withMolisWorkProjectCatalog({ homeDirectory: directory }, catalog => catalog.createProject({ display_name: "没有项目号", actor_id: "user" }));
      // W3-07-4-02: inspect the real facts without binding the Host to the catalog's project name first.
      const facts = () => {
        const store = new LocalProjectDatabase(project.database_path, { existingOnly: true });
        // S8b: a new project has its root row and no board until it is first opened, so the facts are the rows, not a board snapshot.
        try { return { boards: store.db.prepare("SELECT * FROM boards").all(), goals: store.db.prepare("SELECT * FROM goals").all(), events: store.readEventsDescending(project.project_id) }; }
        finally { store.close(); }
      };
      const before = facts();
      // goal_tree_decide reads no project_id of its own: only the scope the call runs in is in play.
      await assert.rejects(() => management.callTool("molis_work_v1_goal_tree_decide", { database_path: project.database_path }),
        { code: "actions.scope_mismatch" });
      await assert.rejects(() => management.callTool("molis_work_v1_goal_tree_decide", { database_path: project.database_path, project_id: project.project_id }),
        (error: unknown) => (error as { code?: string }).code === "host.project_identity_conflict"
          && (error as Error).message.includes(`database:${path.resolve(project.database_path)}`));
      assert.deepEqual(facts(), before, "both refusals preserve the original project facts");
      assert.deepEqual(host.callLog!.recent(), [], "project pre-open and scope/identity refusal invoke no action or typed business capability");
    } finally {
      await management.close();
      await host.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("mcp contexts and resources", () => {
it("keeps Molis Work Session, native Runtime Session, surface, Goal and legacy work context separate", () => {
    const host = runtimeContextHostFromEnvironment({
      MOLIS_WORK_RUNTIME_ID: "codex",
      MOLIS_WORK_SESSION_ID: "session-molis-work",
      CODEX_THREAD_ID: "thread-native",
      MOLIS_WORK_PANEL_ID: "panel-surface",
      MOLIS_WORK_FOCUS_ID: "goal-current",
      MOLIS_WORK_WORK_CONTEXT_ID: "host-work-context",
      MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
      PWD: "/tmp/molis-work-session-identities",
    }, "/tmp/molis-work-session-identities");
    assert.ok(host);
    assert.equal(host.molisWorkSessionId, "session-molis-work");
    assert.equal(host.nativeRuntimeSessionId, "thread-native");
    assert.equal(host.panelId, "panel-surface");
    assert.equal(host.focusId, "goal-current");
    assert.equal(host.hostWorkContextId, "host-work-context");
    assert.equal(host.runtimeContext.stable_work_context_id, "host-work-context");
  });

it("unknown method", async () => {
    const server = new MolisWorkServer();
    const result = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "foo",
      params: {},
    });
    assert.equal((result as { error: { code: number } }).error.code, -32601);
  });

it("serves empty resource and resource-template lists for clients that enumerate them", async () => {
    const server = new MolisWorkServer();
    const resources = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "resources/list",
      params: {},
    });
    assert.deepEqual(
      (resources as { result: { resources: unknown[] } }).result.resources,
      [],
    );
    const templates = await server.handleMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "resources/templates/list",
      params: {},
    });
    assert.deepEqual(
      (templates as { result: { resourceTemplates: unknown[] } }).result.resourceTemplates,
      [],
    );
  });
});

describe("mcp project deletion", () => {
it("lets the current Runtime list, unbind, and separately confirm project deletion", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "molis-work-mcp-project-lifecycle-"));
    const home = path.join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const call = async (server: MolisWorkServer, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const removable = await catalog.createProject({ display_name: "当前要删除的项目", actor_id: "user" });
      const preserved = await catalog.createProject({ display_name: "保留项目", actor_id: "user" });
      const host = {
        homeDirectory: home,
        runtimeContext: {
          runtime_id: "codex",
          stable_work_context_id: "project-lifecycle-entry",
          host_declares_stable: true,
        },
      };
      const runtime = new MolisWorkServer("runtime", null, host);
      const readConnection = () => runtime.runtimeConnection;

      const listed = await call(runtime, "molis_work_v1_context_list_projects", {});
      assert.equal(listed.result.isError, false, listed.result.content[0]?.text);
      const listedPayload = JSON.parse(listed.result.content[0]?.text ?? "{}") as {
        current_project: unknown;
        projects: Array<{ project_id: string; database_path?: string }>;
      };
      assert.equal(listedPayload.current_project, null);
      assert.deepEqual(listedPayload.projects.map((project) => project.project_id).sort(), [
        removable.project_id,
        preserved.project_id,
      ].sort());
      assert.ok(listedPayload.projects.every((project) => project.database_path === undefined));

      const bound = await call(runtime, "molis_work_v1_context_bind", {
        project_id: removable.project_id,
        user_confirmed: true,
      });
      assert.equal(bound.result.isError, false, bound.result.content[0]?.text);
      assert.equal(readConnection()?.projectId, removable.project_id);

      const deniedUnbind = await call(runtime, "molis_work_v1_context_unbind", {
        user_confirmed: false,
      });
      assert.equal(deniedUnbind.result.isError, true);
      assert.match(deniedUnbind.result.content[0]?.text ?? "", /明确要求解除绑定/);
      assert.equal(readConnection()?.projectId, removable.project_id);

      const unbound = await call(runtime, "molis_work_v1_context_unbind", {
        user_confirmed: true,
      });
      assert.equal(unbound.result.isError, false, unbound.result.content[0]?.text);
      const unboundPayload = JSON.parse(unbound.result.content[0]?.text ?? "{}") as {
        changed: boolean;
        unbound_project: { project_id: string } | null;
      };
      assert.equal(unboundPayload.changed, true);
      assert.equal(unboundPayload.unbound_project?.project_id, removable.project_id);
      assert.deepEqual(runtime.runtimeConnection, null);
      assert.equal(fs.existsSync(removable.database_path), true);

      const rebound = await call(runtime, "molis_work_v1_context_bind", {
        project_id: removable.project_id,
        user_confirmed: true,
      });
      assert.equal(rebound.result.isError, false, rebound.result.content[0]?.text);
      assert.equal(readConnection()?.projectId, removable.project_id);

      const deniedDelete = await call(runtime, "molis_work_v1_project_delete", {
        project_id: removable.project_id,
        delete_confirmed: false,
        idempotency_key: "mcp-delete-current-project",
      });
      assert.equal(deniedDelete.result.isError, true);
      assert.match(deniedDelete.result.content[0]?.text ?? "", /单独明确确认/);
      assert.equal(fs.existsSync(removable.database_path), true);

      const deleted = await call(runtime, "molis_work_v1_project_delete", {
        project_id: removable.project_id,
        delete_confirmed: true,
        idempotency_key: "mcp-delete-current-project",
      });
      assert.equal(deleted.result.isError, false, deleted.result.content[0]?.text);
      const deletedPayload = JSON.parse(deleted.result.content[0]?.text ?? "{}") as {
        replayed: boolean;
        deletion: { project_id: string; deleted_binding_count: number; staged_directory?: string };
      };
      assert.equal(deletedPayload.replayed, false);
      assert.equal(deletedPayload.deletion.project_id, removable.project_id);
      assert.equal(deletedPayload.deletion.deleted_binding_count, 1);
      assert.equal(deletedPayload.deletion.staged_directory, undefined);
      assert.deepEqual(runtime.runtimeConnection, null);
      assert.equal(fs.existsSync(removable.database_path), false);

      const replay = await call(runtime, "molis_work_v1_project_delete", {
        project_id: removable.project_id,
        delete_confirmed: true,
        idempotency_key: "mcp-delete-current-project",
      });
      assert.equal(replay.result.isError, false, replay.result.content[0]?.text);
      assert.equal((JSON.parse(replay.result.content[0]?.text ?? "{}") as { replayed: boolean }).replayed, true);

      const resolved = await call(runtime, "molis_work_v1_context_resolve", {});
      assert.equal(resolved.result.isError, false, resolved.result.content[0]?.text);
      assert.match(resolved.result.content[0]?.text ?? "", /unknown_context/);
      const afterDelete = await call(runtime, "molis_work_v1_context_list_projects", {});
      assert.equal(afterDelete.result.isError, false, afterDelete.result.content[0]?.text);
      assert.match(afterDelete.result.content[0]?.text ?? "", new RegExp(preserved.project_id));
      assert.doesNotMatch(afterDelete.result.content[0]?.text ?? "", new RegExp(removable.project_id));
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("mcp confirmed Session bindings", () => {
it("W1-18-SESSION-CONFIRM-01 suggests one exact workspace project and keeps confirmed Session bindings local", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "molis-work-mcp-workspace-routing-"));
    const home = path.join(directory, "home", ".molis-work");
    const workspace = path.join(directory, "ordinary-workspace");
    fs.mkdirSync(workspace, { recursive: true });
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const host = runtimeContextHostFromEnvironment({
      MOLIS_WORK_RUNTIME_ID: "codex",
      MOLIS_WORK_HOME: home,
      PWD: workspace,
    }, workspace)!;
    const runtime = new MolisWorkServer("runtime", null, host);
    const call = async (
      server: MolisWorkServer,
      name: string,
      args: Record<string, unknown>,
      meta?: Record<string, unknown>,
    ) => server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args, ...(meta ? { _meta: meta } : {}) },
    }) as Promise<{ result: { isError: boolean; content: Array<{ text: string }> } }>;
    try {
      const first = await catalog.createProject({ display_name: "目录默认项目", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "同目录临时项目", actor_id: "user" });

      const unbound = await call(runtime, "molis_work_v1_context_resolve", {});
      assert.equal(unbound.result.isError, false, unbound.result.content[0]?.text);
      const defaultBound = await call(runtime, "molis_work_v1_context_bind", {
        project_id: first.project_id,
        user_confirmed: true,
      });
      assert.equal(defaultBound.result.isError, false, defaultBound.result.content[0]?.text);

      // A restart ends the previous process first: one Home has one Runtime owner per process.
      await runtime.close();
      const restarted = new MolisWorkServer("runtime", null, host);
      const historyCandidate = await call(restarted, "molis_work_v1_context_resolve", {});
      const candidatePayload = JSON.parse(historyCandidate.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: { project_id: string } | null;
        suggested_projects: Array<{ project_id: string }>;
      };
      assert.equal(candidatePayload.status, "suggested");
      assert.equal(candidatePayload.connection, null);
      assert.deepEqual(candidatePayload.suggested_projects.map(project => project.project_id), [first.project_id]);

      const explicitDefault = await call(restarted, "molis_work_v1_context_bind", {
        project_id: first.project_id,
        user_confirmed: true,
        binding_scope: "workspace_default",
      });
      assert.equal(explicitDefault.result.isError, true);
      assert.match(explicitDefault.result.content[0]?.text ?? "", /不再保存默认项目/);
      await restarted.close();
      const afterDefaultRestart = new MolisWorkServer("runtime", null, host);
      const restored = await call(afterDefaultRestart, "molis_work_v1_context_resolve", {});
      const restoredPayload = JSON.parse(restored.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: { project_id: string } | null;
        suggested_projects: Array<{ project_id: string }>;
      };
      assert.equal(restoredPayload.status, "suggested");
      assert.equal(restoredPayload.connection, null);
      assert.deepEqual(restoredPayload.suggested_projects.map(project => project.project_id), [first.project_id]);

      const sessionA = { threadId: "codex-thread-a" };
      const sessionB = { threadId: "codex-thread-b" };
      const override = await call(afterDefaultRestart, "molis_work_v1_context_bind", {
        project_id: second.project_id,
        user_confirmed: true,
        binding_scope: "session",
      }, sessionA);
      assert.equal(override.result.isError, false, override.result.content[0]?.text);
      assert.match(override.result.content[0]?.text ?? "", new RegExp(second.project_id));

      const otherSession = await call(afterDefaultRestart, "molis_work_v1_context_resolve", {}, sessionB);
      const otherPayload = JSON.parse(otherSession.result.content[0]?.text ?? "{}") as {
        status: string;
        suggested_projects: Array<{ project_id: string }>;
      };
      assert.equal(otherPayload.status, "suggested");
      assert.deepEqual(otherPayload.suggested_projects.map((project) => project.project_id), [second.project_id, first.project_id]);
      const restoredOverride = await call(afterDefaultRestart, "molis_work_v1_context_resolve", {}, sessionA);
      assert.match(restoredOverride.result.content[0]?.text ?? "", new RegExp(second.project_id));
      await afterDefaultRestart.close();
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
