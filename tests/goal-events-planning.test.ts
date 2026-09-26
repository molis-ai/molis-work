import { grantGoalsMcp } from "./fixtures/goals-mcp-grants.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BUILTIN_PLANNING_METHOD_PACKS } from "@molis-ai/molis-work-module-goals";
import { MolisWorkServer } from "../apps/desktop/launchers/mcp/server.js";
import type { GoalEventConfigView, PlanningMethodPackInput } from "@molis-ai/molis-work-contracts/modules/goals";

function eventMethod(methodId: string, note: string, versionLabel: string): PlanningMethodPackInput {
  return {
    method_id: methodId,
    kind: "custom",
    name: `${versionLabel}记录方法`,
    summary: "为当前测试保存可版本化的事件定义。",
    applies_to: ["规划采用测试"],
    domain_tags: ["test"],
    steps: ["记下可验收观察"],
    required_coverage: [{ area: "note", label: "观察", question: "记下了什么？" }],
    dependency_rules: [{
      rule_id: "note-before-close",
      statement: "收口前需要可读取的观察记录。",
      direction_hint: "close depends_on note",
    }],
    evidence_requirements: ["观察记录"],
    completion_checks: ["观察可回读"],
    failure_modes: ["采用后随模板改写历史"],
    source_refs: ["goal-events-planning"],
    confidence: 0.9,
    enabled: true,
    event_types: [{
      type_id: `${methodId}-note`,
      version: 1,
      name: "观察",
      purpose: "留下当前版本的观察。",
      semantic_family: "observation",
      fields: [
        { field_id: "note", name: "内容", purpose: "观察正文", format: "text", required: true },
        { field_id: "edition", name: "版本说明", purpose: versionLabel, format: "text", required: false },
      ],
    }],
    default_requirements: [{
      requirement_id: `${methodId}-note-needed`,
      statement: note,
      bound_type_id: `${methodId}-note`,
      applies_when: "明确采用后才成为当前要求",
    }],
  };
}

test("engineering planning drives configure/report; no template is not auto-adopted; method upgrades do not rewrite adopted Goals", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-events-planning-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  let mcp: MolisWorkServer | undefined;
  try {
    const software = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-software-development");
    assert.ok(software);
    assert.ok(software.event_types.some((type) => type.type_id === "engineering-delivery"));
    assert.ok(software.default_requirements.some((item) => item.requirement_id === "engineering-ui-inspection"));

    catalog.personalPlanningMethods.save(eventMethod("personal-story", "留下玩家观察", "个人版"), new Date().toISOString());
    const project = await catalog.createProject({ display_name: "规划采用", actor_id: "user" });
    await grantGoalsMcp(null, homeDirectory, project);
    const runtimeHost = {
      homeDirectory,
      runtimeContext: {
        runtime_id: "codex",
        stable_work_context_id: "thread-planning",
        host_declares_stable: true,
      },
    };
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path,
      boardId: project.board_id,
      projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, runtimeHost);
    const board_id = project.board_id;

    const methods = JSON.parse(await mcp.callTool("molis_work_v1_planning_methods", {
      method_ids: ["domain-software-development"], include_instructions: false,
    }));
    assert.equal(methods.methods[0]?.version, software.version);
    assert.ok(methods.methods[0]?.event_types.some((type: { type_id: string }) => type.type_id === "engineering-behavior-verification"));
    assert.ok(methods.methods[0]?.default_requirements.some((item: { requirement_id: string }) => item.requirement_id === "engineering-concern"));

    const blank = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "空白互动故事", idempotency_key: "blank-intent",
    }));
    const blankState = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", {
      goal_id: blank.goal.goal_id,
    }));
    assert.deepEqual(blankState.config.adopted_planning, []);
    assert.equal(blankState.config.types.length, 0);
    assert.ok(!blankState.config.types.some((type: { type_id: string }) => type.type_id.startsWith("engineering-")));

    const engineeringGoal = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "工程改动", outcome: "行为变化可验证", idempotency_key: "eng-intent",
    }));
    const adopted = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: engineeringGoal.goal.goal_id,
      expected_version: 0,
      idempotency_key: "eng-adopt",
      adopted_planning: [{ method_id: "domain-software-development" }],
    }));
    assert.equal(adopted.config.adopted_planning[0]?.method_id, "domain-software-development");
    assert.equal(adopted.config.adopted_planning[0]?.version, software.version);
    assert.equal(adopted.config.adopted_planning[0]?.source, "built_in");
    assert.ok(adopted.config.types.some((type: { type_id: string }) => type.type_id === "engineering-delivery"));
    assert.ok(adopted.config.types.some((type: { type_id: string }) => type.type_id === "engineering-concern"));
    assert.equal(adopted.config.extra_requirements.length, 0);

    const withRequirement = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: engineeringGoal.goal.goal_id,
      expected_version: 1,
      expected_agreement_version: JSON.parse(await mcp.callTool("molis_work_v1_goal_state", {
        goal_id: engineeringGoal.goal.goal_id,
      })).agreement.version,
      idempotency_key: "eng-req",
      adopted_planning: [{ method_id: "domain-software-development" }],
      adopt_default_requirement_ids: ["engineering-delivery"],
    }));
    const engineeringDeliveryReq = withRequirement.config.extra_requirements.find((item: {
      requirement_id: string;
      source?: { template_requirement_id?: string };
    }) => item.source?.template_requirement_id === "engineering-delivery");
    assert.ok(engineeringDeliveryReq);
    assert.notEqual(engineeringDeliveryReq.requirement_id, "engineering-delivery");
    assert.ok(!withRequirement.config.extra_requirements.some((item: { source?: { template_requirement_id?: string } }) =>
      item.source?.template_requirement_id === "engineering-ui-inspection"));

    const delivered = JSON.parse(await mcp.callTool("molis_work_v1_event_report", {
      goal_id: engineeringGoal.goal.goal_id,
      idempotency_key: "eng-report",
      events: [{
        type_id: "engineering-delivery",
        type_version: 1,
        title: "交出可运行改动",
        fields: { result: "主路径可用", entry: "pnpm test", limits: "未做发布" },
        judgments: [{ requirement_id: engineeringDeliveryReq.requirement_id, verdict: "supports" }],
      }],
    }));
    assert.equal(delivered.events[0]?.payload.result, "主路径可用");
    assert.equal(delivered.events[0]?.type?.source?.method_id, "domain-software-development");
    assert.equal(delivered.events[0]?.type?.source?.method_version, software.version);

    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true,
      method: eventMethod("project-story", "留下项目观察", "项目第一版"),
    });
    const projectGoal = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "项目方法故事", idempotency_key: "project-intent",
    }));
    const projectAdopted = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: projectGoal.goal.goal_id,
      expected_version: 0,
      idempotency_key: "project-adopt",
      adopted_planning: [{ method_id: "project-story" }],
    })) as { config: GoalEventConfigView };
    assert.equal(projectAdopted.config.adopted_planning[0]?.source, "project");
    const firstVersion = projectAdopted.config.adopted_planning[0]?.version;
    assert.ok(firstVersion);
    await mcp.callTool("molis_work_v1_event_report", {
      goal_id: projectGoal.goal.goal_id,
      idempotency_key: "project-report",
      events: [{
        type_id: "project-story-note",
        type_version: 1,
        title: "第一版观察",
        fields: { note: "按第一版字段记录", edition: "项目第一版" },
      }],
    });
    const updatedMethod = eventMethod("project-story", "留下项目观察", "项目第二版");
    updatedMethod.event_types = [{
      type_id: "project-story-note",
      version: 1,
      name: "观察",
      purpose: "第二版改了字段含义，但不该改已采用 Goal。",
      semantic_family: "observation",
      fields: [
        { field_id: "note", name: "内容", purpose: "观察正文", format: "text", required: true },
        { field_id: "rewrite", name: "新字段", purpose: "只有新 Goal 才该看到", format: "text", required: true },
      ],
    }];
    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true, method: updatedMethod,
    });
    const afterUpgrade = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", {
      goal_id: projectGoal.goal.goal_id,
    }));
    assert.equal(afterUpgrade.config.adopted_planning[0]?.version, firstVersion);
    assert.ok(afterUpgrade.config.types[0]?.fields.some((field: { field_id: string }) => field.field_id === "edition"));
    assert.ok(!afterUpgrade.config.types[0]?.fields.some((field: { field_id: string }) => field.field_id === "rewrite"));
    const localAfterUpgrade = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: projectGoal.goal.goal_id,
      expected_version: afterUpgrade.config.version,
      idempotency_key: "project-local-after-upgrade",
      types: [{
        type_id: "local-after-upgrade",
        version: 1,
        name: "局部补充",
        purpose: "模板升级后继续使用已保存约定",
        fields: [{ field_id: "note", name: "内容", purpose: "补充", format: "text", required: true }],
      }],
    }));
    assert.equal(localAfterUpgrade.config.adopted_planning[0]?.version, firstVersion);
    assert.ok(localAfterUpgrade.config.types.some((type: { type_id: string }) => type.type_id === "local-after-upgrade"));
    assert.ok(localAfterUpgrade.config.types.some((type: { type_id: string }) => type.type_id === "project-story-note"));
    const catalogNow = JSON.parse(await mcp.callTool("molis_work_v1_planning_methods", {
      method_ids: ["project-story"], include_instructions: false,
    }));
    assert.ok(catalogNow.methods[0].version > firstVersion);
    assert.ok(catalogNow.methods[0].event_types[0].fields.some((field: { field_id: string }) => field.field_id === "rewrite"));

    const personalGoal = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "个人方法故事", idempotency_key: "personal-intent",
    }));
    const personalAdopted = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: personalGoal.goal.goal_id,
      expected_version: 0,
      idempotency_key: "personal-adopt",
      adopted_planning: [{ method_id: "personal-story", source: "personal" }],
    }));
    assert.equal(personalAdopted.config.adopted_planning[0]?.source, "personal");
    assert.equal(personalAdopted.config.types[0]?.type_id, "personal-story-note");
    const personalReport = JSON.parse(await mcp.callTool("molis_work_v1_event_report", {
      goal_id: personalGoal.goal.goal_id,
      idempotency_key: "personal-report",
      events: [{
        type_id: "personal-story-note",
        type_version: 1,
        title: "个人观察",
        fields: { note: "来自个人规划", edition: "个人版" },
      }],
    }));
    assert.equal(personalReport.events[0]?.payload.edition, "个人版");

    const g2 = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "第二个工程 Goal", goal_id: "g2", idempotency_key: "g2-intent",
    }));
    const g3 = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "第三个工程 Goal", goal_id: "g3", idempotency_key: "g3-intent",
    }));
    const g2Adopted = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: g2.goal.goal_id, expected_version: 0, expected_agreement_version: 0, idempotency_key: "g2-adopt",
      adopted_planning: [{ method_id: "domain-software-development" }],
      adopt_default_requirement_ids: ["engineering-delivery"],
    }));
    const g3Adopted = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: g3.goal.goal_id, expected_version: 0, expected_agreement_version: 0, idempotency_key: "g3-adopt",
      adopted_planning: [{ method_id: "domain-software-development" }],
      adopt_default_requirement_ids: ["engineering-delivery"],
    }));
    const g2Req = g2Adopted.config.extra_requirements.find((item: { source?: { template_requirement_id?: string } }) =>
      item.source?.template_requirement_id === "engineering-delivery");
    const g3Req = g3Adopted.config.extra_requirements.find((item: { source?: { template_requirement_id?: string } }) =>
      item.source?.template_requirement_id === "engineering-delivery");
    assert.ok(g2Req);
    assert.ok(g3Req);
    assert.notEqual(g2Req.requirement_id, g3Req.requirement_id);
    assert.equal(g2Req.source.template_requirement_id, "engineering-delivery");
    const g2Again = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", { goal_id: "g2" }));
    assert.equal(g2Again.config.extra_requirements[0]?.requirement_id, g2Req.requirement_id);
    assert.equal(g2Again.requirements.find((item: { origin?: { planning?: { template_requirement_id?: string } } }) =>
      item.origin?.planning?.template_requirement_id === "engineering-delivery")?.requirement_id, g2Req.requirement_id);
  } finally {
    await mcp?.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("configure idempotency uses the original request before resolving upgraded templates", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-events-idempotency-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  let mcp: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "幂等采用", actor_id: "user" });
    await grantGoalsMcp(null, homeDirectory, project);
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-idempotency", host_declares_stable: true },
    });
    const board_id = project.board_id;
    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true,
      method: eventMethod("project-idempotent", "留下观察", "第一版"),
    });
    const implicitGoal = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "隐式版本", idempotency_key: "implicit-intent",
    }));
    const explicitGoal = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "显式版本", idempotency_key: "explicit-intent",
    }));
    const implicitInput = {
      goal_id: implicitGoal.goal.goal_id, expected_version: 0, idempotency_key: "implicit-adopt",
      adopted_planning: [{ method_id: "project-idempotent" }],
    };
    const implicitFirst = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", implicitInput));
    const savedVersion = implicitFirst.config.adopted_planning[0]?.version as number;
    const explicitInput = {
      goal_id: explicitGoal.goal.goal_id, expected_version: 0, idempotency_key: "explicit-adopt",
      adopted_planning: [{ method_id: "project-idempotent", version: savedVersion, source: "project" as const }],
    };
    const explicitFirst = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", explicitInput));
    const updated = eventMethod("project-idempotent", "留下观察", "第二版");
    updated.event_types = [{
      type_id: "project-idempotent-note",
      version: 1,
      name: "观察",
      purpose: "升级后的字段",
      semantic_family: "observation",
      fields: [
        { field_id: "note", name: "内容", purpose: "观察正文", format: "text", required: true },
        { field_id: "rewrite", name: "新字段", purpose: "新 Goal 才该看到", format: "text", required: true },
      ],
    }];
    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true, method: updated,
    });
    const implicitReplay = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", implicitInput));
    assert.equal(implicitReplay.replayed, true);
    assert.equal(implicitReplay.event_id, implicitFirst.event_id);
    assert.equal(implicitReplay.config.adopted_planning[0]?.version, savedVersion);
    assert.ok(implicitReplay.config.types[0]?.fields.some((field: { field_id: string }) => field.field_id === "edition"));
    const explicitReplay = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", explicitInput));
    assert.equal(explicitReplay.replayed, true);
    assert.equal(explicitReplay.event_id, explicitFirst.event_id);
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_configure", {
        ...implicitInput,
        types: [{
          type_id: "changed-request",
          version: 1,
          name: "不同请求",
          purpose: "同键不能改请求",
          fields: [{ field_id: "note", name: "内容", purpose: "x", format: "text", required: true }],
        }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "request.idempotency_key_reused",
    );
    await mcp.close();
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-idempotency", host_declares_stable: true },
    });
    const persisted = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", {
      goal_id: implicitGoal.goal.goal_id,
    }));
    assert.equal(persisted.config.adopted_planning[0]?.version, savedVersion);
    assert.ok(!persisted.config.types.some((type: { type_id: string }) => type.type_id === "changed-request"));
  } finally {
    await mcp?.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("equivalent planning packs merge with provenance; conflicting packs fail atomically", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-events-merge-"));
  const homeDirectory = join(directory, "home");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  let mcp: MolisWorkServer | undefined;
  try {
    const project = await catalog.createProject({ display_name: "合并规划", actor_id: "user" });
    await grantGoalsMcp(null, homeDirectory, project);
    mcp = new MolisWorkServer("runtime", {
      databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id,
      webBaseUrl: "http://127.0.0.1:4173",
    }, {
      homeDirectory,
      runtimeContext: { runtime_id: "codex", stable_work_context_id: "thread-merge", host_declares_stable: true },
    });
    const board_id = project.board_id;
    const sharedFields = [
      { field_id: "note", name: "内容", purpose: "观察正文", format: "text" as const, required: true },
    ];
    const packA = eventMethod("merge-a", "留下观察", "A");
    packA.event_types = [{
      type_id: "shared-note", version: 1, name: "观察", purpose: "等价定义", semantic_family: "observation", fields: sharedFields,
    }];
    packA.default_requirements = [{
      requirement_id: "shared-note-needed", statement: "留下一条观察", bound_type_id: "shared-note",
    }];
    const packB = eventMethod("merge-b", "留下观察", "B");
    packB.event_types = packA.event_types;
    packB.default_requirements = packA.default_requirements;
    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true, method: packA,
    });
    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true, method: packB,
    });
    const mergedGoal = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "合并采用", idempotency_key: "merge-intent",
    }));
    const merged = JSON.parse(await mcp.callTool("molis_work_v1_event_configure", {
      goal_id: mergedGoal.goal.goal_id, expected_version: 0, expected_agreement_version: 0, idempotency_key: "merge-adopt",
      adopted_planning: [{ method_id: "merge-a" }, { method_id: "merge-b" }],
      adopt_default_requirement_ids: ["shared-note-needed"],
    }));
    assert.equal(merged.config.types.filter((type: { type_id: string }) => type.type_id === "shared-note").length, 1);
    assert.ok(merged.config.types[0]?.source?.contributing_methods?.some((item: { method_id: string }) => item.method_id === "merge-a"));
    assert.ok(merged.config.types[0]?.source?.contributing_methods?.some((item: { method_id: string }) => item.method_id === "merge-b"));
    assert.equal(merged.config.extra_requirements.length, 1);
    assert.deepEqual(
      merged.config.extra_requirements[0]?.source?.methods?.map((item: { method_id: string }) => item.method_id).sort(),
      ["merge-a", "merge-b"],
    );

    const conflictA = eventMethod("conflict-a", "留下观察", "冲突A");
    conflictA.event_types = [{
      type_id: "conflict-note", version: 1, name: "观察", purpose: "A 的定义", semantic_family: "observation",
      fields: [{ field_id: "note", name: "内容", purpose: "A", format: "text", required: true }],
    }];
    const conflictB = eventMethod("conflict-b", "留下观察", "冲突B");
    conflictB.event_types = [{
      type_id: "conflict-note", version: 1, name: "观察", purpose: "B 的定义", semantic_family: "observation",
      fields: [{ field_id: "note", name: "内容", purpose: "B", format: "text", required: false }],
    }];
    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true, method: conflictA,
    });
    await mcp.callTool("molis_work_v1_planning_method_save", {
      user_confirmed: true, method: conflictB,
    });
    const conflictGoal = JSON.parse(await mcp.callTool("molis_work_v1_goal_intent_create", {
      title: "冲突采用", idempotency_key: "conflict-intent",
    }));
    await assert.rejects(
      () => mcp!.callTool("molis_work_v1_event_configure", {
        goal_id: conflictGoal.goal.goal_id, expected_version: 0, idempotency_key: "conflict-adopt",
        adopted_planning: [{ method_id: "conflict-a" }, { method_id: "conflict-b" }],
      }),
      (error: unknown) => error instanceof MolisWorkV1Error && error.code === "event_config.planning_type_conflict",
    );
    const unchanged = JSON.parse(await mcp.callTool("molis_work_v1_goal_state", {
      goal_id: conflictGoal.goal.goal_id,
    }));
    assert.equal(unchanged.config.version, 0);
    assert.equal(unchanged.config.types.length, 0);
    assert.equal(unchanged.config.adopted_planning.length, 0);
  } finally {
    await mcp?.close();
    catalog.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
