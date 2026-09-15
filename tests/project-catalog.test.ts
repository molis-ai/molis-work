import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { catalogSchemaCompatibilityError, type MolisWorkProjectCatalog, MolisWorkProjectCatalogError, type RuntimeWorkContext } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { insertHistoricalClaim, insertHistoricalRun } from "./historical-sql-fixture.js";

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-project-catalog-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createLegacyBoard(databasePath: string): void {
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  try {
    coordinator.initializeBoard({
      board_id: "legacy-board",
      title: "旧项目",
      actor_id: "user",
      idempotency_key: "legacy-init",
    });
    for (const goalId of ["legacy-a", "legacy-b"]) {
      coordinator.goals.commands.createGoal(
        "legacy-board",
        {
          goal_id: goalId,
          title: goalId,
          outcome: `${goalId} outcome`,
          why: "migration fixture",
          business_logic: "保留已有 Molis Work 事实。",
          definition_state: "accepted",
          decomposition_state: "closed_leaf",
          acceptance_criteria: [
            {
              criterion_id: `${goalId}-criterion`,
              statement: "fixture acceptance",
              decision_method: "automated_check",
              pass_condition: "fixture passes",
            },
          ],
        },
        { actor_id: "user", idempotency_key: `create-${goalId}` },
      );
    }
    coordinator.goals.commands.addRelation(
      "legacy-board",
      {
        from_goal_id: "legacy-b",
        to_goal_id: "legacy-a",
        type: "depends_on",
        reason: "legacy relation",
      },
      { actor_id: "user", idempotency_key: "legacy-relation" },
    );
    insertHistoricalClaim(store.db, {
      claim_id: "legacy-claim",
      board_id: "legacy-board",
      goal_id: "legacy-a",
      actor_id: "runtime",
      state: "released",
    });
    insertHistoricalRun(store.db, {
      run_id: "legacy-run",
      board_id: "legacy-board",
      goal_id: "legacy-a",
      claim_id: "legacy-claim",
      actor_id: "runtime",
      state: "completed",
      ended_at: "2026-09-02T00:02:00.000Z",
      output_refs_json: JSON.stringify(["fixture://legacy"]),
    });
  } finally {
    store.db.pragma("wal_checkpoint(TRUNCATE)");
    store.close();
  }
}

test("catalog session closes its catalog after successful work", async () => {
  await withTemporaryDirectory(async (directory) => {
    let scopedCatalog: MolisWorkProjectCatalog | null = null;
    const result = await withMolisWorkProjectCatalog(
      { homeDirectory: join(directory, ".molis-work") },
      (catalog) => {
        scopedCatalog = catalog;
        return catalog.listProjects().length;
      },
    );

    assert.equal(result, 0);
    assert.ok(scopedCatalog);
    assert.throws(() => scopedCatalog.listProjects(), /database connection is not open/i);
  });
});

test("catalog session closes its catalog when work fails", async () => {
  await withTemporaryDirectory(async (directory) => {
    let scopedCatalog: MolisWorkProjectCatalog | null = null;
    await assert.rejects(
      withMolisWorkProjectCatalog(
        { homeDirectory: join(directory, ".molis-work") },
        (catalog) => {
          scopedCatalog = catalog;
          throw new Error("fixture failure");
        },
      ),
      /fixture failure/,
    );

    assert.ok(scopedCatalog);
    assert.throws(() => scopedCatalog.listProjects(), /database connection is not open/i);
  });
});

test("a reader that is older than the catalog reports exact versions and a non-destructive recovery", () => {
  const error = catalogSchemaCompatibilityError(9, 8);
  assert.ok(error instanceof MolisWorkProjectCatalogError);
  assert.equal(error.code, "catalog.reader_too_old");
  assert.deepEqual(error.details, {
    actual_schema_version: 9,
    supported_schema_min: 1,
    supported_schema_max: 8,
    recovery: "new_or_fork_session_then_context_resolve",
  });
  assert.match(error.message, /catalog schema=9/);
  assert.match(error.message, /reader.*1\.\.8/);
  assert.match(error.message, /新建或 Fork/);
  assert.match(error.message, /确认当前任务焦点/);
  assert.match(error.message, /context_resolve/);
  assert.match(error.message, /不要回滚 catalog\.db/);
  assert.doesNotMatch(error.message, /版本无法识别/);
});

test("opening a future catalog fails without rewriting its schema or project facts", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const created = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const project = await created.createProject({ display_name: "保留项目", actor_id: "user" });
    created.close();

    const databasePath = join(home, "projects", "catalog.db");
    const future = new Database(databasePath);
    try {
      future.prepare("UPDATE catalog_meta SET value = '12' WHERE key = 'schema_version'").run();
    } finally {
      future.close();
    }

    await assert.rejects(
      () => openMolisWorkProjectCatalog({ homeDirectory: home }),
      (error: unknown) =>
        error instanceof MolisWorkProjectCatalogError
        && error.code === "catalog.reader_too_old"
        && error.details.actual_schema_version === 12
        && error.details.supported_schema_max === 11,
    );

    const preserved = new Database(databasePath, { readonly: true });
    try {
      assert.equal(
        preserved.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").pluck().get(),
        "12",
      );
      assert.equal(
        preserved.prepare("SELECT display_name FROM projects WHERE project_id = ?").pluck().get(project.project_id),
        "保留项目",
      );
    } finally {
      preserved.close();
    }
  });
});

function snapshot(databasePath: string) {
  const store = new LocalProjectDatabase(databasePath);
  try {
    return store.snapshot("legacy-board");
  } finally {
    store.close();
  }
}

function stableContext(runtimeId: string, workContextId: string): RuntimeWorkContext {
  return {
    runtime_id: runtimeId,
    stable_work_context_id: workContextId,
    host_declares_stable: true,
  };
}

function workspaceContext(
  runtimeId: string,
  workContextId: string | null,
  workspacePath: string,
): RuntimeWorkContext {
  return {
    runtime_id: runtimeId,
    stable_work_context_id: workContextId,
    host_declares_stable: workContextId !== null,
    workspace: { canonical_path: workspacePath, realpath_verified: false },
  };
}

test("managed projects have immutable identities, duplicate names, and isolated SQLite facts", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const userProjectFile = join(directory, "user-project", "note.txt");
    await mkdir(join(directory, "user-project"), { recursive: true });
    await writeFile(userProjectFile, "untouched");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const first = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      assert.notEqual(first.project_id, second.project_id);
      assert.notEqual(first.database_path, second.database_path);
      assert.equal(first.board_id, first.project_id);
      assert.equal(second.board_id, second.project_id);
      assert.equal(first.data_class, "user");
      assert.equal(catalog.listProjects().length, 2);

      const firstStore = new LocalProjectDatabase(first.database_path);
      try {
        new GoalProjectApplication(firstStore).goals.commands.createGoal(
          first.board_id,
          {
            goal_id: "only-first",
            title: "只在第一个项目",
            outcome: "项目隔离",
            why: "测试隔离",
            business_logic: "第一个项目的 Goal 不应出现在第二个项目。",
            definition_state: "accepted",
            decomposition_state: "closed_leaf",
            acceptance_criteria: [
              {
                criterion_id: "only-first-criterion",
                statement: "fixture",
                decision_method: "automated_check",
                pass_condition: "fixture",
              },
            ],
          },
          { actor_id: "user", idempotency_key: "first-only" },
        );
      } finally {
        firstStore.close();
      }
      const secondStore = new LocalProjectDatabase(second.database_path);
      try {
        assert.equal(secondStore.snapshot(second.board_id).goals.length, 0);
      } finally {
        secondStore.close();
      }

      const renamed = catalog.renameProject(first.project_id, "重命名后", "user");
      assert.equal(renamed.project_id, first.project_id);
      assert.equal(renamed.database_path, first.database_path);
      assert.equal(await readFile(userProjectFile, "utf8"), "untouched");
    } finally {
      catalog.close();
    }
  });
});

test("legacy Molis Work DB migrates to one managed source with complete facts", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacyDirectory = join(directory, "legacy");
    const legacyDatabase = join(legacyDirectory, "molis-work.db");
    await mkdir(legacyDirectory, { recursive: true });
    createLegacyBoard(legacyDatabase);
    const before = snapshot(legacyDatabase);
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: join(directory, "home", ".molis-work") });
    try {
      const migrated = await catalog.migrateLegacyDatabase({ legacy_database_path: legacyDatabase, actor_id: "user" });
      assert.equal(migrated.source, "migrated");
      assert.equal(migrated.data_class, "migrated_user");
      assert.equal(migrated.board_id, "legacy-board");
      await assert.rejects(stat(legacyDatabase));
      assert.deepEqual(snapshot(migrated.database_path), before);
      assert.equal(catalog.listProjects()[0]?.project_id, migrated.project_id);
    } finally {
      catalog.close();
    }
  });
});

test("demo data is classified, idempotently opened, reset, and removable without affecting user projects", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const userProject = await catalog.createProject({ display_name: "用户项目", actor_id: "user" });
      await assert.rejects(
        () => catalog.ensureDemoProject({ actor_id: "user", user_confirmed: false }),
        (error: unknown) => error instanceof MolisWorkProjectCatalogError
          && error.code === "catalog.demo_confirmation_required",
      );
      const created = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(created.status, "created");
      assert.equal(created.project.data_class, "regenerable_demo");
      assert.equal(created.project.board_id, DEMO_BOARD_ID);
      const existing = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(existing.status, "existing");
      assert.equal(existing.project.project_id, created.project.project_id);

      const demoStore = new LocalProjectDatabase(created.project.database_path);
      try {
        const demoSnapshot = demoStore.snapshot(DEMO_BOARD_ID);
        assert.equal(demoSnapshot.board.title, "让第一次使用 Molis Work 的人顺利完成一次目标协作");
        assert.equal(
          demoSnapshot.goals.find((goal) => goal.goal_id === "V1")?.title,
          "让第一次使用的人顺利完成一轮目标协作",
        );
        assert.equal(
          demoSnapshot.goals.find((goal) => goal.goal_id === "INTERFACES")?.title,
          "让不同 AI 对话看到同一项目进度",
        );
        assert.equal(demoSnapshot.candidates.length, 0);
        const demoApp = new GoalProjectApplication(demoStore);
        assert.equal(demoApp.goalEvents.isEventStateOwner(DEMO_BOARD_ID, "CORE"), true);
        assert.match(
          JSON.stringify(demoApp.goalEvents.listEvents(DEMO_BOARD_ID, "INTERFACES", { limit: 20 })),
          /升级前应先看到安全说明/,
        );
        assert.ok(demoSnapshot.goals.find((goal) => goal.goal_id === "AUTO-CONNECT")?.trashed_at);
        new GoalProjectApplication(demoStore).goals.commands.createGoal(
          DEMO_BOARD_ID,
          {
            goal_id: "temporary-demo-change",
            title: "临时演示改动",
            outcome: "重置时被清除",
            why: "验证 demo 可重建",
            business_logic: "只改变演示数据。",
            definition_state: "draft",
            decomposition_state: "abstract",
            acceptance_criteria: [],
          },
          { actor_id: "user", idempotency_key: "temporary-demo-change" },
        );
      } finally {
        demoStore.close();
      }
      const reset = await catalog.resetDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(reset.status, "reset");
      const resetStore = new LocalProjectDatabase(reset.project.database_path);
      try {
        const resetSnapshot = resetStore.snapshot(DEMO_BOARD_ID);
        assert.equal(resetSnapshot.goals.some((goal) => goal.goal_id === "temporary-demo-change"), false);
        assert.ok(resetSnapshot.goals.find((goal) => goal.goal_id === "AUTO-CONNECT")?.trashed_at);
        assert.equal(new GoalProjectApplication(resetStore).goalEvents.isEventStateOwner(DEMO_BOARD_ID, "CORE"), true);
      } finally {
        resetStore.close();
      }

      await assert.rejects(
        () => catalog.removeDemoProject({
          project_id: userProject.project_id,
          actor_id: "user",
          delete_confirmed: true,
          idempotency_key: "never-delete-user-as-demo",
        }),
        (error: unknown) => error instanceof MolisWorkProjectCatalogError && error.code === "catalog.not_demo",
      );
      await catalog.removeDemoProject({
        project_id: created.project.project_id,
        actor_id: "user",
        delete_confirmed: true,
        idempotency_key: "remove-regenerable-demo",
      });
      assert.deepEqual(catalog.listProjects().map((project) => project.project_id), [userProject.project_id]);
      assert.equal((await stat(userProject.database_path)).isFile(), true);
    } finally {
      catalog.close();
    }
  });
});

test("failed legacy migration keeps the old DB and does not leave a project record", async () => {
  await withTemporaryDirectory(async (directory) => {
    const legacyDirectory = join(directory, "legacy");
    const legacyDatabase = join(legacyDirectory, "molis-work.db");
    await mkdir(legacyDirectory, { recursive: true });
    createLegacyBoard(legacyDatabase);
    const before = snapshot(legacyDatabase);
    const home = join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      await assert.rejects(
        () =>
          catalog.migrateLegacyDatabase({
            legacy_database_path: legacyDatabase,
            actor_id: "user",
            beforeStep(step) {
              if (step === "before_catalog_commit") throw new Error("injected migration failure");
            },
          }),
        /injected migration failure/,
      );
      assert.deepEqual(snapshot(legacyDatabase), before);
      assert.deepEqual(catalog.listProjects(), []);
      assert.equal((await stat(join(home, "projects", "catalog.db"))).isFile(), true);
    } finally {
      catalog.close();
    }
  });
});

test("runtime Session/work-entry contexts reconnect only after an explicit binding and require a separate rebind confirmation", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const first = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "同名项目", actor_id: "user" });
      const codexEntry = stableContext("codex", "workspace-entry-01");
      const claudeEntry = stableContext("claude-code", "workspace-entry-01");

      assert.deepEqual(catalog.resolveRuntimeContext(codexEntry), {
        status: "unbound",
        reason: "unknown_context",
        next_action: "use_explicit_existing_selection_or_ask_user_to_select_or_create",
        context: { runtime_id: "codex", stable_work_context_id: "workspace-entry-01" },
        project: null,
        connection: null,
        suggested_projects: [],
        available_projects: [
          { project_id: first.project_id, display_name: "同名项目" },
          { project_id: second.project_id, display_name: "同名项目" },
        ],
      });
      assert.equal(
        catalog.resolveRuntimeContext({
          runtime_id: "codex",
          stable_work_context_id: "workspace-entry-01",
          host_declares_stable: false,
        }).reason,
        "missing_stable_context",
      );
      assert.equal(
        catalog.resolveRuntimeContext(stableContext("codex", "same-name-as-project")).status,
        "unbound",
      );
      assert.deepEqual(catalog.listRuntimeContextBindings(), []);

      assert.throws(
        () =>
          catalog.bindRuntimeContext({
            context: codexEntry,
            project_id: first.project_id,
            actor_id: "runtime",
            user_confirmed: false,
          }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "context.user_confirmation_required",
      );
      const initial = catalog.bindRuntimeContext({
        context: codexEntry,
        project_id: first.project_id,
        actor_id: "runtime",
        user_confirmed: true,
      });
      assert.equal(initial.status, "bound");
      assert.equal(initial.connection?.project_id, first.project_id);
      assert.equal(initial.connection?.database_path, first.database_path);

      const secondRuntime = catalog.bindRuntimeContext({
        context: claudeEntry,
        project_id: first.project_id,
        actor_id: "runtime",
        user_confirmed: true,
      });
      assert.equal(secondRuntime.connection?.board_id, initial.connection?.board_id);
      assert.equal(secondRuntime.connection?.database_path, initial.connection?.database_path);
      assert.deepEqual(
        catalog.listRuntimeContextBindings().map((binding) => [
          binding.runtime_id,
          binding.stable_work_context_id,
          binding.project_id,
        ]).sort(),
        [
          ["claude-code", "workspace-entry-01", first.project_id],
          ["codex", "workspace-entry-01", first.project_id],
        ],
      );

      assert.throws(
        () =>
          catalog.bindRuntimeContext({
            context: codexEntry,
            project_id: second.project_id,
            actor_id: "runtime",
            user_confirmed: true,
          }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "context.rebind_confirmation_required",
      );
      assert.equal(catalog.resolveRuntimeContext(codexEntry).connection?.project_id, first.project_id);
      assert.equal(catalog.resolveRuntimeContext(claudeEntry).connection?.project_id, first.project_id);

      const rebound = catalog.bindRuntimeContext({
        context: codexEntry,
        project_id: second.project_id,
        actor_id: "runtime",
        user_confirmed: true,
        rebind_confirmed: true,
      });
      assert.equal(rebound.connection?.project_id, second.project_id);
      assert.equal(catalog.resolveRuntimeContext(claudeEntry).connection?.project_id, first.project_id);
      assert.equal(
        catalog.listRuntimeContextBindings().find((binding) => binding.runtime_id === "codex")?.project_id,
        second.project_id,
      );
      assert.deepEqual(
        catalog.listRuntimeContextBindingEvents(codexEntry).map((event) => [
          event.type,
          event.previous_project_id,
          event.project_id,
        ]),
        [
          ["context.bound", null, first.project_id],
          ["context.rebound", first.project_id, second.project_id],
        ],
      );

      catalog.renameProject(second.project_id, "改过显示名也不影响绑定", "user");
      assert.equal(catalog.resolveRuntimeContext(codexEntry).connection?.project_id, second.project_id);
    } finally {
      catalog.close();
    }

    const reopened = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      assert.equal(
        reopened.resolveRuntimeContext(stableContext("codex", "workspace-entry-01")).status,
        "bound",
      );
      assert.equal(
        reopened.resolveRuntimeContext(stableContext("claude-code", "workspace-entry-01")).status,
        "bound",
      );
      assert.equal(reopened.listRuntimeContextBindings().length, 2);
    } finally {
      reopened.close();
    }
  });
});

test("canonical workspace routing supports symlinks, multiple project candidates, and isolated Session overrides", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const workspace = join(directory, "ordinary-project-directory");
    const workspaceAlias = join(directory, "project-alias");
    await mkdir(workspace, { recursive: true });
    await symlink(workspace, workspaceAlias);
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const first = await catalog.createProject({ display_name: "产品规划", actor_id: "user" });
      const second = await catalog.createProject({ display_name: "发布准备", actor_id: "user" });
      const noSession = workspaceContext("codex", null, workspace);
      const firstSession = workspaceContext("codex", "thread-1", workspace);
      const aliasSession = workspaceContext("codex", "thread-2", workspaceAlias);

      const initial = catalog.bindRuntimeContext({
        context: noSession,
        project_id: first.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(initial.project?.project_id, first.project_id);
      assert.equal(catalog.listRuntimeContextBindings().length, 0);
      const initialMembership = catalog.listWorkspaceMemberships();
      assert.equal(initialMembership.length, 1);
      assert.equal(initialMembership[0]?.is_default, false);
      assert.equal(initialMembership[0]?.workspace_name, "ordinary-project-directory");

      const aliasResolved = catalog.resolveRuntimeContext(aliasSession);
      assert.equal(aliasResolved.status, "bound");
      assert.equal(aliasResolved.project?.project_id, first.project_id);
      assert.deepEqual(aliasResolved.suggested_projects, []);
      assert.equal(
        aliasResolved.context.workspace?.workspace_id,
        initial.context.workspace?.workspace_id,
      );

      catalog.bindRuntimeContext({
        context: firstSession,
        project_id: first.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });

      const sessionOverride = catalog.bindRuntimeContext({
        context: aliasSession,
        project_id: second.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(sessionOverride.project?.project_id, second.project_id);
      assert.equal(catalog.listWorkspaceMemberships().length, 2);
      assert.equal(catalog.listWorkspaceMemberships().some((membership) => membership.is_default), false);
      assert.equal(catalog.resolveRuntimeContext(firstSession).project?.project_id, first.project_id);
      assert.equal(catalog.resolveRuntimeContext(aliasSession).project?.project_id, second.project_id);
      assert.equal(catalog.resolveRuntimeContext(workspaceContext("codex", "thread-3", workspace)).status, "suggested");
      assert.equal(catalog.resolveRuntimeContext(workspaceContext("generic", null, workspace)).status, "suggested");

      const workspaceId = initial.context.workspace!.workspace_id;
      assert.throws(() => catalog.setWorkspaceDefault({
        workspace_id: workspaceId,
        project_id: second.project_id,
        actor_id: "user",
        user_confirmed: true,
      }), /不再保存默认项目/);
      assert.equal(catalog.resolveRuntimeContext(workspaceContext("codex", "thread-4", workspace)).status, "suggested");
      catalog.removeWorkspaceMembership({
        workspace_id: workspaceId,
        project_id: second.project_id,
        actor_id: "user",
        user_confirmed: true,
      });
      const needsChoice = catalog.resolveRuntimeContext(workspaceContext("generic", null, workspace));
      assert.equal(needsChoice.status, "bound");
      assert.equal(needsChoice.project?.project_id, first.project_id);
      assert.deepEqual(needsChoice.suggested_projects, []);

      assert.equal(
        catalog.resolveRuntimeContext({
          runtime_id: "generic",
          stable_work_context_id: null,
          host_declares_stable: false,
        }).reason,
        "missing_stable_context",
      );
    } finally {
      catalog.close();
    }
  });
});

test("a fresh Runtime Session receives host suggestions but needs confirmation, and rejection stays local", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const primary = await catalog.createProject({ display_name: "Alpha 主项目", actor_id: "user" });
      const related = await catalog.createProject({ display_name: "Alpha 文档", actor_id: "user" });
      const unrelated = await catalog.createProject({ display_name: "Beta 项目", actor_id: "user" });
      const firstSession = stableContext("codex", "new-session-a");
      const clues = [
        { kind: "recent_project" as const, value: primary.project_id },
        { kind: "workspace" as const, value: "/private/secret-token-987/alpha" },
      ];

      const suggested = catalog.resolveRuntimeContext(firstSession, clues);
      assert.equal(suggested.status, "suggested");
      assert.equal(suggested.reason, null);
      assert.equal(
        suggested.next_action,
        "use_explicit_existing_selection_or_ask_user_to_confirm_suggestion",
      );
      assert.equal(suggested.project, null);
      assert.equal(suggested.connection, null);
      assert.deepEqual(suggested.suggested_projects.map((project) => project.project_id), [
        primary.project_id,
        related.project_id,
      ]);
      assert.ok(suggested.suggested_projects.every((project) => project.reasons.length > 0));
      assert.doesNotMatch(JSON.stringify(suggested.suggested_projects), /secret-token-987/);
      assert.deepEqual(suggested.available_projects.map((project) => project.project_id).sort(), [
        primary.project_id,
        related.project_id,
        unrelated.project_id,
      ].sort());
      assert.equal(catalog.listRuntimeContextBindingEvents(firstSession).length, 0);

      assert.throws(
        () =>
          catalog.rejectRuntimeContextSuggestion({
            context: firstSession,
            project_id: primary.project_id,
            actor_id: "runtime-codex",
            user_confirmed: false,
            suggestion_clues: clues,
          }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "context.user_confirmation_required",
      );
      const rejected = catalog.rejectRuntimeContextSuggestion({
        context: firstSession,
        project_id: primary.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        suggestion_clues: clues,
      });
      assert.equal(rejected.changed, true);
      assert.equal(rejected.rejected_project.project_id, primary.project_id);
      assert.equal(rejected.resolution.status, "suggested");
      assert.equal(rejected.resolution.connection, null);
      assert.deepEqual(rejected.resolution.suggested_projects.map((project) => project.project_id), [
        related.project_id,
      ]);
      assert.ok(rejected.resolution.available_projects.some((project) => project.project_id === primary.project_id));

      const replayedRejection = catalog.rejectRuntimeContextSuggestion({
        context: firstSession,
        project_id: primary.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        suggestion_clues: clues,
      });
      assert.equal(replayedRejection.changed, false);
      assert.equal(replayedRejection.resolution.suggested_projects[0]?.project_id, related.project_id);

      const distinctSession = stableContext("codex", "new-session-b");
      const distinctResolution = catalog.resolveRuntimeContext(distinctSession, clues);
      assert.equal(distinctResolution.status, "suggested");
      assert.equal(distinctResolution.connection, null);
      assert.equal(distinctResolution.suggested_projects[0]?.project_id, primary.project_id);

      const bound = catalog.bindRuntimeContext({
        context: firstSession,
        project_id: related.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(bound.status, "bound");
      assert.equal(bound.connection?.project_id, related.project_id);
      assert.equal(catalog.resolveRuntimeContext(firstSession, clues).connection?.project_id, related.project_id);
      assert.equal(catalog.resolveRuntimeContext(distinctSession, clues).connection, null);

      const historyOnlySession = stableContext("codex", "new-session-from-confirmed-history");
      const historyOnlySuggestion = catalog.resolveRuntimeContext(historyOnlySession);
      assert.equal(historyOnlySuggestion.status, "suggested");
      assert.equal(historyOnlySuggestion.connection, null);
      assert.equal(historyOnlySuggestion.suggested_projects[0]?.project_id, related.project_id);
    } finally {
      catalog.close();
    }
  });
});

test("current Runtime can create and bind one new project without orphaning data on a rejected switch", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const context = stableContext("codex", "create-and-bind-entry");
    try {
      const created = await catalog.createProjectAndBindRuntimeContext({
        context,
        display_name: "当前 Runtime 项目",
        actor_id: "runtime-codex",
        user_confirmed: true,
        idempotency_key: "create-current-runtime-project",
      });
      assert.equal(created.status, "bound");
      assert.equal(created.project?.display_name, "当前 Runtime 项目");
      assert.equal(catalog.listProjects().length, 1);
      assert.ok(created.connection);
      assert.equal((await stat(created.connection.database_path)).isFile(), true);

      const replay = await catalog.createProjectAndBindRuntimeContext({
        context,
        display_name: "当前 Runtime 项目",
        actor_id: "runtime-codex",
        user_confirmed: true,
        idempotency_key: "create-current-runtime-project",
      });
      assert.equal(replay.connection?.project_id, created.connection?.project_id);
      assert.equal(catalog.listProjects().length, 1);

      await assert.rejects(
        () =>
          catalog.createProjectAndBindRuntimeContext({
            context,
            display_name: "同一个请求却换了名称",
            actor_id: "runtime-codex",
            user_confirmed: true,
            idempotency_key: "create-current-runtime-project",
          }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "context.idempotency_conflict",
      );

      await assert.rejects(
        () =>
          catalog.createProjectAndBindRuntimeContext({
            context,
            display_name: "未经确认的切换项目",
            actor_id: "runtime-codex",
            user_confirmed: true,
            idempotency_key: "create-without-rebind-confirmation",
          }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "context.rebind_confirmation_required",
      );
      assert.equal(catalog.listProjects().length, 1);

      await assert.rejects(
        () =>
          catalog.createProjectAndBindRuntimeContext({
            context: {
              runtime_id: "codex",
              stable_work_context_id: null,
              host_declares_stable: false,
            },
            display_name: "没有稳定入口的项目",
            actor_id: "runtime-codex",
            user_confirmed: true,
            idempotency_key: "create-without-stable-context",
          }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "context.stable_identity_required",
      );
      assert.equal(catalog.listProjects().length, 1);
    } finally {
      catalog.close();
    }
  });
});

test("existing Molis Work project catalogs migrate context-binding storage without touching project facts", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const created = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const project = await created.createProject({ display_name: "迁移项目", actor_id: "user" });
    created.close();

    const databasePath = join(home, "projects", "catalog.db");
    const legacy = new Database(databasePath);
    try {
      legacy.exec("DROP TABLE runtime_context_binding_events; DROP TABLE runtime_context_bindings;");
      legacy.prepare("UPDATE catalog_meta SET value = '1' WHERE key = 'schema_version'").run();
    } finally {
      legacy.close();
    }

    const migrated = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      assert.equal(migrated.getProject(project.project_id).database_path, project.database_path);
      const resolution = migrated.bindRuntimeContext({
        context: stableContext("codex", "migration-entry"),
        project_id: project.project_id,
        actor_id: "user",
        user_confirmed: true,
      });
      assert.equal(resolution.connection?.project_id, project.project_id);
      assert.equal(migrated.listRuntimeContextBindingEvents().length, 1);
    } finally {
      migrated.close();
    }
  });
});

test("v3 catalogs retain binding history while upgrading for unbind, deletion receipts, and suggestion rejection", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const context = stableContext("codex", "v3-history-entry");
    const created = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const project = await created.createProject({ display_name: "V3 历史项目", actor_id: "user" });
    created.bindRuntimeContext({
      context,
      project_id: project.project_id,
      actor_id: "runtime-codex",
      user_confirmed: true,
    });
    created.close();

    const databasePath = join(home, "projects", "catalog.db");
    const legacy = new Database(databasePath);
    try {
      legacy.exec(`
        ALTER TABLE runtime_context_binding_events RENAME TO runtime_context_binding_events_v4;
        CREATE TABLE runtime_context_binding_events (
          event_id TEXT PRIMARY KEY,
          binding_id TEXT NOT NULL,
          runtime_id TEXT NOT NULL,
          stable_work_context_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('context.bound', 'context.rebound')),
          previous_project_id TEXT,
          project_id TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT INTO runtime_context_binding_events (
          event_id, binding_id, runtime_id, stable_work_context_id, type,
          previous_project_id, project_id, actor_id, created_at
        )
        SELECT
          event_id, binding_id, runtime_id, stable_work_context_id, type,
          previous_project_id, project_id, actor_id, created_at
        FROM runtime_context_binding_events_v4;
        DROP TABLE runtime_context_binding_events_v4;
        CREATE INDEX runtime_context_binding_events_context_idx
          ON runtime_context_binding_events(runtime_id, stable_work_context_id, created_at, event_id);
        DROP TABLE project_deletions;
        DROP TABLE runtime_context_suggestion_rejections;
        UPDATE catalog_meta SET value = '3' WHERE key = 'schema_version';
      `);
    } finally {
      legacy.close();
    }

    const migrated = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      assert.equal(migrated.resolveRuntimeContext(context).connection?.project_id, project.project_id);
      assert.deepEqual(migrated.listRuntimeContextBindingEvents(context).map((event) => event.type), ["context.bound"]);
      const unbound = migrated.unbindRuntimeContext({
        context,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(unbound.changed, true);
      assert.deepEqual(
        migrated.listRuntimeContextBindingEvents(context).map((event) => event.type),
        ["context.bound", "context.unbound"],
      );
      const suggestionContext = stableContext("codex", "v3-new-session");
      const suggested = migrated.resolveRuntimeContext(suggestionContext, [
        { kind: "recent_project", value: project.project_id },
      ]);
      assert.equal(suggested.status, "suggested");
      const rejected = migrated.rejectRuntimeContextSuggestion({
        context: suggestionContext,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
        suggestion_clues: [{ kind: "recent_project", value: project.project_id }],
      });
      assert.equal(rejected.resolution.status, "unbound");
      assert.equal(migrated.getProject(project.project_id).board_id, project.board_id);
    } finally {
      migrated.close();
    }
  });
});

test("unbinding removes only the current Runtime entry and preserves the managed project", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const context = stableContext("codex", "unbind-current-entry");
    try {
      const project = await catalog.createProject({ display_name: "保留数据的项目", actor_id: "user" });
      catalog.bindRuntimeContext({
        context,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });

      assert.throws(
        () =>
          catalog.unbindRuntimeContext({
            context,
            actor_id: "runtime-codex",
            user_confirmed: false,
          }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "context.user_confirmation_required",
      );
      assert.equal(catalog.resolveRuntimeContext(context).connection?.project_id, project.project_id);

      const unbound = catalog.unbindRuntimeContext({
        context,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(unbound.changed, true);
      assert.equal(unbound.unbound_project?.project_id, project.project_id);
      assert.equal(unbound.resolution.status, "unbound");
      assert.equal((await stat(project.database_path)).isFile(), true);
      assert.equal(catalog.getProject(project.project_id).display_name, "保留数据的项目");

      const rebound = catalog.bindRuntimeContext({
        context,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      assert.equal(rebound.connection?.project_id, project.project_id);
      assert.deepEqual(
        catalog.listRuntimeContextBindingEvents(context).map((event) => event.type),
        ["context.bound", "context.unbound", "context.bound"],
      );
    } finally {
      catalog.close();
    }
  });
});

test("project deletion needs separate confirmation, protects active work, and records an idempotent receipt", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    const context = stableContext("codex", "delete-current-entry");
    try {
      const project = await catalog.createProject({ display_name: "可删除项目", actor_id: "user" });
      catalog.bindRuntimeContext({
        context,
        project_id: project.project_id,
        actor_id: "runtime-codex",
        user_confirmed: true,
      });
      const deletionInput = {
        project_id: project.project_id,
        actor_id: "runtime-codex",
        delete_confirmed: true,
        idempotency_key: "delete-managed-project-once",
      };

      await assert.rejects(
        () => catalog.deleteProject({ ...deletionInput, delete_confirmed: false }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "catalog.delete_confirmation_required",
      );

      const store = new LocalProjectDatabase(project.database_path);
      let runId = "";
      try {
        const coordinator = new GoalProjectApplication(store);
        coordinator.goals.commands.createGoal(
          project.board_id,
          {
            goal_id: "active-project-work",
            title: "删除保护测试",
            outcome: "删除期间不能丢失进行中的工作",
            why: "验证项目删除门禁",
            business_logic: "有有效 Claim 或未结束 Run 时，删除必须被拒绝。",
            definition_state: "accepted",
            decomposition_state: "closed_leaf",
            acceptance_criteria: [
              {
                criterion_id: "active-project-work-check",
                statement: "删除被拒绝",
                decision_method: "automated_check",
                pass_condition: "删除调用返回 active-work 拒绝",
              },
            ],
          },
          { actor_id: "user", idempotency_key: "create-active-project-work" },
        );
        insertHistoricalClaim(store.db, {
          claim_id: "claim-active-project-work",
          board_id: project.board_id,
          goal_id: "active-project-work",
          actor_id: "runtime-codex",
          state: "active",
          released_at: null,
          release_reason: null,
        });
        insertHistoricalRun(store.db, {
          run_id: "run-active-project-work",
          board_id: project.board_id,
          goal_id: "active-project-work",
          claim_id: "claim-active-project-work",
          actor_id: "runtime-codex",
          state: "started",
          ended_at: null,
        });
        runId = "run-active-project-work";
      } finally {
        store.close();
      }

      await assert.rejects(
        () => catalog.deleteProject(deletionInput),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "catalog.project_active_work",
      );
      assert.equal(catalog.getProject(project.project_id).project_id, project.project_id);

      const cleanupStore = new LocalProjectDatabase(project.database_path);
      try {
        new GoalProjectApplication(cleanupStore);
        cleanupStore.db.prepare(`
          UPDATE claims SET state = 'released', released_at = ?, release_reason = ?
          WHERE claim_id = 'claim-active-project-work'
        `).run("2026-09-02T00:10:00.000Z", "测试结束，允许删除");
        cleanupStore.db.prepare(`
          UPDATE runs SET state = 'abandoned', block_reason = ?, ended_at = ?
          WHERE run_id = ?
        `).run("测试结束，允许删除", "2026-09-02T00:10:00.000Z", runId);
      } finally {
        cleanupStore.close();
      }

      const deleted = await catalog.deleteProject(deletionInput);
      assert.equal(deleted.replayed, false);
      assert.equal(deleted.deletion.project_id, project.project_id);
      assert.equal(deleted.deletion.deleted_binding_count, 1);
      assert.equal(deleted.deletion.cleanup_state, "complete");
      assert.equal(catalog.resolveRuntimeContext(context).status, "unbound");
      assert.deepEqual(catalog.listProjects(), []);
      await assert.rejects(stat(join(home, "projects", project.project_id, "molis-work.db")));
      assert.equal(catalog.listProjectDeletions()[0]?.deletion_id, deleted.deletion.deletion_id);

      const replay = await catalog.deleteProject(deletionInput);
      assert.equal(replay.replayed, true);
      assert.equal(replay.deletion.deletion_id, deleted.deletion.deletion_id);

      const other = await catalog.createProject({ display_name: "不应被同键删除", actor_id: "user" });
      await assert.rejects(
        () => catalog.deleteProject({ ...deletionInput, project_id: other.project_id }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "catalog.deletion_idempotency_conflict",
      );
      assert.equal(catalog.getProject(other.project_id).project_id, other.project_id);
    } finally {
      catalog.close();
    }
  });
});

test("opening a desktop TUI panel binds that work context to the Goal and aliases a later host session", async () => {
  await withTemporaryDirectory(async (directory) => {
    const home = join(directory, "home", ".molis-work");
    const workspace = join(directory, "repo");
    await mkdir(workspace, { recursive: true });
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const project = await catalog.createProject({ display_name: "桌面项目", actor_id: "user" });
      assert.throws(
        () => catalog.openDesktopPanel({
          project_id: project.project_id,
          goal_id: "leaf-goal",
          runtime_kind: "codex",
          launch_command: "codex",
          actor_id: "user",
          user_confirmed: false,
        }),
        (error: unknown) =>
          error instanceof MolisWorkProjectCatalogError && error.code === "catalog.panel_confirmation_required",
      );

      const panel = catalog.openDesktopPanel({
        project_id: project.project_id,
        goal_id: "leaf-goal",
        runtime_kind: "codex",
        launch_command: "codex",
        cwd: workspace,
        actor_id: "user",
        user_confirmed: true,
      });
      assert.equal(panel.goal_id, "leaf-goal");
      assert.equal(panel.project_id, project.project_id);
      assert.equal(catalog.listDesktopPanels(project.project_id, "leaf-goal").length, 1);
      assert.equal(catalog.listDesktopPanels(project.project_id, "other-goal").length, 0);
      assert.equal(
        catalog.resolveRuntimeContext(stableContext("codex", panel.work_context_id)).status,
        "bound",
      );
      assert.equal(
        catalog.resolveRuntimeContext(stableContext("codex", panel.work_context_id)).project?.project_id,
        project.project_id,
      );

      const aliased = catalog.aliasDesktopPanelSession({
        panel_id: panel.panel_id,
        runtime_id: "codex",
        host_session_id: "codex-thread-99",
        actor_id: "desktop-panel",
      });
      assert.equal(aliased.host_session_id, "codex-thread-99");
      assert.equal(
        catalog.findDesktopPanelByWorkContext("codex", "codex-thread-99")?.panel_id,
        panel.panel_id,
      );
      assert.equal(
        catalog.resolveRuntimeContext(stableContext("codex", "codex-thread-99")).project?.project_id,
        project.project_id,
      );

      catalog.closeDesktopPanel(panel.panel_id, "user");
      assert.equal(catalog.listDesktopPanels(project.project_id, "leaf-goal").length, 0);
      assert.equal(
        catalog.resolveRuntimeContext(stableContext("codex", panel.work_context_id)).status,
        "bound",
      );
    } finally {
      catalog.close();
    }
  });
});
