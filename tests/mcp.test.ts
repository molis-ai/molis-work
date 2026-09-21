import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { CATALOG_SCHEMA_VERSION } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import Database from "better-sqlite3";
import { MolisWorkCoordinator, SqliteMolisWorkStore } from "../apps/local-host/sdk/index.js";
import { MolisWorkServer, runtimeContextHostFromEnvironment } from "../apps/desktop/launchers/mcp/server.js";

import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("mcp server", () => {
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
      "molis_work_v1_create_goal",
    ];
    for (const name of retired) assert.ok(!names.includes(name), name);
    for (const name of [
      "molis_work_v1_goal_intent_create", "molis_work_v1_goal_state", "molis_work_v1_event_configure",
      "molis_work_v1_event_report", "molis_work_v1_event_list", "molis_work_v1_event_read",
      "molis_work_v1_event_resume", "molis_work_v1_goal_tree_propose", "molis_work_v1_goal_tree_read",
      "molis_work_v1_goal_trash", "molis_work_v1_project_delete", "molis_work_v1_context_resolve",
      "molis_work_v1_functions_list", "molis_work_v1_functions_describe", "molis_work_v1_functions_invoke",
    ]) assert.ok(names.includes(name), name);
    const intentTool = listedTools.find((tool) => tool.name === "molis_work_v1_goal_intent_create");
    assert.ok(!intentTool?.inputSchema.required?.includes("actor_id"));
    assert.ok(!Object.hasOwn(intentTool?.inputSchema.properties ?? {}, "board_id"));
    assert.ok(!names.some((name) => !name.startsWith("molis_work_v1_")));
    assert.ok(listedTools.every((tool) => !("database_path" in (tool.inputSchema.properties ?? {}))));
    assert.ok(listedTools.every((tool) => !("board_id" in (tool.inputSchema.properties ?? {})) || tool.name.startsWith("molis_work_v1_context_") || tool.name === "molis_work_v1_project_delete"));
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
      assert.match(errorText, new RegExp(`错误: Molis Work catalog schema=${futureSchema}`));
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
      "MOLIS_WORK_BOARD_ID",
      "MOLIS_WORK_WEB_URL",
      "MOLIS_WORK_RUNTIME_ID",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.MOLIS_WORK_DATABASE = "/tmp/legacy-molis-work.db";
      process.env.MOLIS_WORK_BOARD_ID = "legacy-board";
      process.env.MOLIS_WORK_WEB_URL = "http://127.0.0.1:4173";
      delete process.env.MOLIS_WORK_RUNTIME_ID;
      const runtime = new MolisWorkServer("runtime");
      assert.equal(runtime.runtimeConnection, null);
      assert.equal(runtime.runtimeContextHost, null);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("keeps Molis Work Session, native Runtime Session, surface, Goal and legacy work context separate", () => {
    const host = runtimeContextHostFromEnvironment({
      MOLIS_WORK_RUNTIME_ID: "codex",
      MOLIS_WORK_SESSION_ID: "session-molis-work",
      CODEX_THREAD_ID: "thread-native",
      MOLIS_WORK_PANEL_ID: "panel-surface",
      MOLIS_WORK_GOAL_ID: "goal-current",
      MOLIS_WORK_WORK_CONTEXT_ID: "legacy-work-context",
      MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
      PWD: "/tmp/molis-work-session-identities",
    }, "/tmp/molis-work-session-identities");
    assert.ok(host);
    assert.equal(host.molisWorkSessionId, "session-molis-work");
    assert.equal(host.nativeRuntimeSessionId, "thread-native");
    assert.equal(host.panelId, "panel-surface");
    assert.equal(host.goalId, "goal-current");
    assert.equal(host.legacyWorkContextId, "legacy-work-context");
    assert.equal(host.runtimeContext.stable_work_context_id, "legacy-work-context");
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
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(bound.result.isError, false, bound.result.content[0]?.text);
      assert.equal(runtime.runtimeConnection?.boardId, removable.board_id);

      const deniedUnbind = await call(runtime, "molis_work_v1_context_unbind", {
        actor_id: "runtime-codex",
        user_confirmed: false,
      });
      assert.equal(deniedUnbind.result.isError, true);
      assert.match(deniedUnbind.result.content[0]?.text ?? "", /明确要求解除绑定/);
      assert.equal(runtime.runtimeConnection?.boardId, removable.board_id);

      const unbound = await call(runtime, "molis_work_v1_context_unbind", {
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(unbound.result.isError, false, unbound.result.content[0]?.text);
      const unboundPayload = JSON.parse(unbound.result.content[0]?.text ?? "{}") as {
        changed: boolean;
        unbound_project: { project_id: string } | null;
      };
      assert.equal(unboundPayload.changed, true);
      assert.equal(unboundPayload.unbound_project?.project_id, removable.project_id);
      assert.equal(runtime.runtimeConnection, null);
      assert.equal(fs.existsSync(removable.database_path), true);

      const rebound = await call(runtime, "molis_work_v1_context_bind", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(rebound.result.isError, false, rebound.result.content[0]?.text);
      assert.equal(runtime.runtimeConnection?.boardId, removable.board_id);

      const deniedDelete = await call(runtime, "molis_work_v1_project_delete", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
        delete_confirmed: false,
        idempotency_key: "mcp-delete-current-project",
      });
      assert.equal(deniedDelete.result.isError, true);
      assert.match(deniedDelete.result.content[0]?.text ?? "", /单独明确确认/);
      assert.equal(fs.existsSync(removable.database_path), true);

      const deleted = await call(runtime, "molis_work_v1_project_delete", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
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
      assert.equal(runtime.runtimeConnection, null);
      assert.equal(fs.existsSync(removable.database_path), false);

      const replay = await call(runtime, "molis_work_v1_project_delete", {
        project_id: removable.project_id,
        actor_id: "runtime-codex",
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

  it("auto-connects one exact workspace project and keeps ambiguous Session overrides local", async () => {
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
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(defaultBound.result.isError, false, defaultBound.result.content[0]?.text);

      const restarted = new MolisWorkServer("runtime", null, host);
      const historyCandidate = await call(restarted, "molis_work_v1_context_resolve", {});
      const candidatePayload = JSON.parse(historyCandidate.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: { project_id: string } | null;
        suggested_projects: Array<{ project_id: string }>;
      };
      assert.equal(candidatePayload.status, "bound");
      assert.equal(candidatePayload.connection?.project_id, first.project_id);
      assert.deepEqual(candidatePayload.suggested_projects, []);

      const explicitDefault = await call(restarted, "molis_work_v1_context_bind", {
        project_id: first.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        binding_scope: "workspace_default",
      });
      assert.equal(explicitDefault.result.isError, true);
      assert.match(explicitDefault.result.content[0]?.text ?? "", /不再保存默认项目/);
      const afterDefaultRestart = new MolisWorkServer("runtime", null, host);
      const restored = await call(afterDefaultRestart, "molis_work_v1_context_resolve", {});
      const restoredPayload = JSON.parse(restored.result.content[0]?.text ?? "{}") as {
        status: string;
        connection: { project_id: string } | null;
        suggested_projects: Array<{ project_id: string }>;
      };
      assert.equal(restoredPayload.status, "bound");
      assert.equal(restoredPayload.connection?.project_id, first.project_id);
      assert.deepEqual(restoredPayload.suggested_projects, []);

      const sessionA = { threadId: "codex-thread-a" };
      const sessionB = { threadId: "codex-thread-b" };
      const override = await call(afterDefaultRestart, "molis_work_v1_context_bind", {
        project_id: second.project_id,
        actor_id: "runtime-codex",
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
    } finally {
      catalog.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

});
