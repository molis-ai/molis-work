import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { GovernanceRecordStore } from "@molis-ai/molis-work-module-governance-collaboration";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BUILTIN_PLANNING_METHOD_PACKS,
  GoalsModule,
  composePlanningMethodPacks,
  hydratePlanningMethodPack,
  loadBuiltinPlanningMethodPacks,
  normalizePlanningMethodPack,
  resolvePlanningMethodPacks,
  type PlanningMethodPackInput,
} from "@molis-ai/molis-work-module-goals";
import {
  analyzeGoalChangeImpact,
  planningMetrics,
  projectPlanningRelations,
  validatePlanningGraph,
} from "@molis-ai/molis-work-module-goals";

import { readPersonalPlanningMethodPacks } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import type { GoalRecord, GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";

function customMethod(methodId: string): PlanningMethodPackInput {
  return {
    method_id: methodId,
    kind: "custom",
    name: "客户研究方法",
    summary: "从研究问题、样本和证据走到可复核结论。",
    applies_to: ["客户访谈"],
    domain_tags: ["research"],
    steps: ["明确研究问题", "形成样本与访谈证据", "综合结论并标注限制"],
    required_coverage: [{ area: "research_question", label: "研究问题", question: "要支持哪个决定？" }],
    dependency_rules: [{ rule_id: "evidence-before-conclusion", statement: "结论依赖可追溯证据。", direction_hint: "conclusion depends_on evidence" }],
    evidence_requirements: ["访谈记录"],
    completion_checks: ["结论可追溯"],
    failure_modes: ["先有结论再找证据"],
    source_refs: ["user-confirmed method"],
    confidence: 0.8,
    enabled: true,
  };
}

function catalogMethodMarkdown(methodId: string, kind: "work_type" | "domain" = "work_type"): string {
  return `---
method_id: ${methodId}
version: 1
kind: ${kind}
name: "目录测试"
summary: "验证 Markdown 方法目录。"
applies_to: ["目录测试"]
domain_tags: ["test"]
source_refs: ["test fixture"]
confidence: 0.8
---

# 目录测试

## 规划路径

1. 建立可验证结果

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| result | 结果 | 交付什么？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| proof | 验证消费交付结果。 | verification depends_on result |

## 完成证据

- 可读取结果

## 收口检查

- 结果可验证

## 常见误拆

- 把目录当成任务
`;
}

function goal(goalId: string, state: GoalRecord["fulfillment_state"] = "unmet") {
  return {
    goal_id: goalId,
    trashed_at: null,
    fulfillment_state: state,
    decomposition_state: "closed_leaf" as const,
  };
}

function relation(
  relationId: string,
  from: string,
  to: string,
  type: GoalRelationRecord["type"],
): Pick<GoalRelationRecord, "relation_id" | "from_goal_id" | "to_goal_id" | "type" | "state"> {
  return { relation_id: relationId, from_goal_id: from, to_goal_id: to, type, state: "active" };
}

test("planning methods resolve project over personal over cold-start built-ins", () => {
  const requiredColdStartIds = [
    "meta-domain-pack-builder",
    "domain-software-development",
    "domain-data-analysis",
    "domain-market-analysis",
    "domain-product-ux",
    "domain-ai-data-product",
    "domain-game-design",
    "domain-research-content",
    "domain-operations-organization",
  ];
  for (const methodId of requiredColdStartIds) {
    const pack = BUILTIN_PLANNING_METHOD_PACKS.find((item) => item.method_id === methodId);
    assert.ok(pack, `${methodId} should be available as a cold-start method`);
    assert.ok(pack.steps.length > 0);
    assert.ok(pack.required_coverage.length > 0);
    assert.ok(pack.dependency_rules.length > 0);
    assert.ok(pack.completion_checks.length > 0);
    assert.match(pack.instructions, /depends_on/);
    assert.match(pack.instructions, /用户提出新要求时/);
    assert.match(pack.instructions, /没有循环/);
    assert.match(pack.instructions, /Goal.*有限.*可验收.*最终能完成/s);
    assert.match(pack.instructions, /持续运行.*笔记和报告.*意图.*Goal Tree/s);
    assert.match(pack.instructions, /永久未完成 Goal.*循环 depends_on/s);
  }
  const operations = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-operations-organization")!;
  assert.ok(operations.steps.some((step) => /首次能力建设.*持续运行/.test(step)));
  assert.ok(operations.completion_checks.some((check) => /持续运行.*Goal.*完成/.test(check)));
  assert.ok(operations.failure_modes.some((mode) => /永久未完成 Goal/.test(mode)));
  const builtIn = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-software-development")!;
  const personal = normalizePlanningMethodPack({ ...builtIn, name: "个人软件开发方法" }, "personal", null, "2026-08-22T01:00:00.000Z");
  const project = normalizePlanningMethodPack({ ...personal, name: "项目软件开发方法" }, "project", null, "2026-08-22T02:00:00.000Z");
  const resolved = resolvePlanningMethodPacks([personal], [project]);
  const selected = resolved.find((pack) => pack.method_id === builtIn.method_id)!;
  assert.equal(selected.scope, "project");
  assert.equal(selected.name, "项目软件开发方法");
  assert.deepEqual(selected.overridden_scopes, ["personal", "built_in"]);
  assert.ok(resolved.some((pack) => pack.method_id === "meta-domain-pack-builder"));
});

test("built-in Markdown catalog keeps one method per file and exposes all planning layers", () => {
  assert.equal(BUILTIN_PLANNING_METHOD_PACKS.length, 37);
  assert.deepEqual(
    Object.fromEntries(
      ["meta", "work_type", "domain", "industry", "overlay"].map((kind) => [
        kind,
        BUILTIN_PLANNING_METHOD_PACKS.filter((method) => method.kind === kind).length,
      ]),
    ),
    { meta: 1, work_type: 7, domain: 15, industry: 8, overlay: 6 },
  );
  for (const methodId of [
    "domain-growth-distribution",
    "domain-security-privacy",
    "industry-education",
    "industry-healthcare",
    "industry-games",
    "overlay-sensitive-data-privacy",
    "overlay-ai-human-review",
  ]) {
    assert.ok(BUILTIN_PLANNING_METHOD_PACKS.some((method) => method.method_id === methodId), `${methodId} should load from Markdown`);
  }
});

test("Markdown catalog rejects filename drift, duplicate IDs, and malformed tables", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "molis-work-method-catalog-"));
  try {
    const workTypes = path.join(root, "work-types");
    mkdirSync(workTypes, { recursive: true });
    writeFileSync(path.join(workTypes, "wrong-name.md"), catalogMethodMarkdown("catalog-fixture"));
    assert.throws(() => loadBuiltinPlanningMethodPacks(root), /文件名必须是 catalog-fixture\.md/);

    rmSync(path.join(workTypes, "wrong-name.md"));
    writeFileSync(path.join(workTypes, "catalog-fixture.md"), catalogMethodMarkdown("catalog-fixture"));
    const loaded = loadBuiltinPlanningMethodPacks(root);
    assert.equal(loaded[0]?.method_id, "catalog-fixture");
    assert.ok(loaded[0]?.dependency_rules.some((rule) => rule.rule_id === "output-consumption"));

    const domains = path.join(root, "domains");
    mkdirSync(domains, { recursive: true });
    writeFileSync(path.join(domains, "catalog-fixture.md"), catalogMethodMarkdown("catalog-fixture", "domain"));
    assert.throws(() => loadBuiltinPlanningMethodPacks(root), /method_id catalog-fixture 重复/);

    rmSync(path.join(domains, "catalog-fixture.md"));
    writeFileSync(
      path.join(workTypes, "catalog-fixture.md"),
      catalogMethodMarkdown("catalog-fixture").replace("| result | 结果 | 交付什么？ |", "| result | 结果 |"),
    );
    assert.throws(() => loadBuiltinPlanningMethodPacks(root), /必须覆盖.*3 个非空字段/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every built-in method evaluates domain hard dependencies and cross-topic recall", () => {
  const universalRuleIds = new Set([
    "output-consumption",
    "decision-before-commitment",
    "proof-before-close",
    "hierarchy-is-not-dependency",
  ]);
  for (const pack of BUILTIN_PLANNING_METHOD_PACKS) {
    assert.ok(
      pack.dependency_rules.some((rule) => !universalRuleIds.has(rule.rule_id)),
      `${pack.method_id} needs at least one method-specific dependency rule`,
    );
    assert.match(pack.instructions, /规则描述真实产出消费时，它就是不能跳过的硬依赖/);
    assert.match(pack.instructions, /规则明确要求保持并行时/);
    assert.match(pack.instructions, /与其他主题一起规划/);
    assert.match(pack.instructions, /召回相应主题的方法/);
    assert.match(pack.instructions, /一般相关.*保持并行/);
  }
});

test("planning packs expose provider-consumer rules for representative cross-topic work", () => {
  const scenarios = [
    {
      label: "product decisions provide inputs for the project technical SSOT",
      methodId: "domain-software-development",
      ruleId: "project-ssot-after-product-plan",
      direction: "project SSOT depends_on confirmed product plan",
    },
    {
      label: "data and evaluation provide the baseline for AI capability",
      methodId: "domain-ai-data-product",
      ruleId: "ai-after-eval-baseline",
      direction: "runtime capability depends_on data and evaluation",
    },
    {
      label: "research sources provide evidence for content",
      methodId: "domain-research-content",
      ruleId: "draft-after-sources",
      direction: "draft depends_on sources and method",
    },
  ] as const;

  for (const scenario of scenarios) {
    const pack = BUILTIN_PLANNING_METHOD_PACKS.find((item) => item.method_id === scenario.methodId);
    const rule = pack?.dependency_rules.find((item) => item.rule_id === scenario.ruleId);
    assert.ok(rule, scenario.label);
    assert.equal(rule.direction_hint, scenario.direction);
  }

  for (const pack of BUILTIN_PLANNING_METHOD_PACKS) {
    const parallelRule = pack.dependency_rules.find((rule) => rule.rule_id === "hierarchy-is-not-dependency");
    assert.ok(parallelRule, `${pack.method_id} must reject hierarchy-only dependencies`);
    assert.match(parallelRule.direction_hint, /keep independent goals parallel/);
  }
});

test("software planning establishes project and module SSOTs before parallel implementation", () => {
  const software = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-software-development")!;
  const coverageAreas = new Set(software.required_coverage.map((rule) => rule.area));
  for (const area of ["project_ssot", "module_architecture", "module_ssot_contracts", "parallel_impact_boundaries"]) {
    assert.ok(coverageAreas.has(area), `software planning should require ${area}`);
  }

  const stepText = software.steps.join("\n");
  assert.match(stepText, /项目级 SSOT/);
  assert.match(stepText, /纵向端到端结果和横向共享能力/);
  assert.match(stepText, /并行撰写模块 SSOT/);
  assert.match(stepText, /test double、fixture 或兼容层/);

  const rules = new Map(software.dependency_rules.map((rule) => [rule.rule_id, rule]));
  assert.equal(rules.get("project-ssot-after-product-plan")?.direction_hint, "project SSOT depends_on confirmed product plan");
  assert.equal(rules.get("module-ssot-after-project-ssot")?.direction_hint, "module SSOT depends_on project SSOT and module map");
  assert.equal(rules.get("implementation-after-module-ssot")?.direction_hint, "module implementation depends_on its module SSOT and consumed provider contract");
  assert.equal(rules.get("provider-consumer-implementations-parallel")?.direction_hint, "keep provider and consumer implementations parallel after contract");
  assert.equal(rules.get("integration-after-module-implementations")?.direction_hint, "integration and release depend_on provider and consumer implementations");

  assert.match(software.instructions, /每个重要状态、数据、契约和决策由谁唯一拥有/);
  assert.match(software.instructions, /计划并行的 Goal.*Impact surfaces/);
  assert.match(software.instructions, /提供者与消费者.*保持并行/);
  assert.ok(software.completion_checks.some((check) => /只有一个所有者/.test(check)));
  assert.ok(software.failure_modes.some((mode) => /UI、API、数据库/.test(mode)));
});

test("legacy method packs receive current dependency guidance without a data migration", () => {
  const software = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-software-development")!;
  const legacy = {
    ...software,
    scope: "project" as const,
    version: 1,
    steps: ["确定用户行为和系统边界", "实现功能"],
    dependency_rules: [{
      rule_id: "legacy-contract",
      statement: "消费者实现依赖提供者契约。",
      direction_hint: "consumer depends_on provider contract",
    }],
    instructions: undefined,
  } as unknown as typeof software;

  const hydrated = hydratePlanningMethodPack(legacy);
  assert.equal(hydrated.steps, legacy.steps);
  assert.match(hydrated.instructions, /项目级 SSOT/);
  assert.match(hydrated.instructions, /横向共享能力/);
  assert.match(hydrated.instructions, /模块实现/);
  assert.match(hydrated.instructions, /consumer depends_on provider contract/);
  assert.match(hydrated.instructions, /召回相应主题的方法/);
});

test("project planning composition keeps method paths separate and merges their checks", () => {
  const workType = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "work-build-change")!;
  const software = BUILTIN_PLANNING_METHOD_PACKS.find((pack) => pack.method_id === "domain-software-development")!;
  const composition = composePlanningMethodPacks([software, workType]);

  assert.deepEqual(composition.method_pack_ids, ["work-build-change", "domain-software-development"]);
  assert.deepEqual(composition.method_paths.map((path) => path.method_id), composition.method_pack_ids);
  assert.equal(composition.method_paths[0]?.steps.length, workType.steps.length);
  assert.equal(composition.method_paths[1]?.steps.length, software.steps.length);
  assert.equal(composition.method_paths[0]?.instructions, workType.instructions);
  assert.match(composition.method_paths[1]?.instructions ?? "", /项目级 SSOT/);
  assert.equal(
    composition.dependency_rules.filter((rule) => rule.direction_hint === "consumer depends_on provider").length,
    1,
  );
  assert.ok(composition.required_coverage.some((rule) => rule.area === "final_outcome"));
  assert.ok(composition.required_coverage.some((rule) => rule.area === "core_function"));
});

test("planning composition keeps work type, domain, industry, and overlay as parallel method paths", () => {
  const selected = [
    "overlay-minors",
    "industry-education",
    "domain-product-ux",
    "work-build-change",
  ].map((methodId) => BUILTIN_PLANNING_METHOD_PACKS.find((method) => method.method_id === methodId)!);
  const composition = composePlanningMethodPacks(selected);
  assert.deepEqual(composition.method_pack_ids, [
    "work-build-change",
    "domain-product-ux",
    "industry-education",
    "overlay-minors",
  ]);
  assert.deepEqual(composition.method_paths.map((method) => method.kind), [
    "work_type",
    "domain",
    "industry",
    "overlay",
  ]);
});

test("project and personal methods persist without a second Goal truth model", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "molis-work-planning-"));
  const store = new LocalProjectDatabase(path.join(root, "board.db"));
  const coordinator = new GoalProjectApplication(store, () => new Date("2026-08-22T03:00:00.000Z"));
  coordinator.initializeBoard({ board_id: "board-1", title: "规划测试", actor_id: "user", idempotency_key: "init" });
  assert.throws(
    () => coordinator.goals.planning.saveProjectMethod({
      board_id: "board-1",
      method: customMethod("domain-unconfirmed-research"),
      actor_id: "runtime",
      user_confirmed: false,
    }),
    /必须由用户确认/,
  );
  const saved = coordinator.goals.planning.saveProjectMethod({
    board_id: "board-1",
    method: customMethod("domain-customer-research"),
    actor_id: "user",
    user_confirmed: true,
  });
  assert.equal(saved.method.scope, "project");
  assert.equal(store.snapshot("board-1").planning_method_packs.length, 1);
  store.close();

  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: root });
  const personal = normalizePlanningMethodPack(customMethod("domain-personal-research"), "personal", null, "2026-08-22T04:00:00.000Z");
  catalog.personalPlanningMethods.save(personal, personal.updated_at);
  catalog.close();
  assert.equal(readPersonalPlanningMethodPacks(root)[0]?.method_id, personal.method_id);
});

test("personal method owner preserves versions and timestamps across reopen and rejects invalid writes", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "molis-work-personal-methods-"));
  try {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: root });
    const method = { ...customMethod("domain-personal-test"), version: 7 };
    try { catalog.personalPlanningMethods.save(method, "2026-09-01T01:00:00.000Z"); }
    finally { catalog.close(); }
    const reopened = await openMolisWorkProjectCatalog({ homeDirectory: root });
    try {
      const saved = reopened.personalPlanningMethods.save({ ...method, name: "更新的方法", enabled: false }, "2026-09-02T01:00:00.000Z");
      assert.equal(saved.version, 8);
      assert.equal(saved.scope, "personal");
      assert.equal(saved.created_at, "2026-09-01T01:00:00.000Z");
      assert.throws(() => reopened.personalPlanningMethods.save({ ...method, name: "" }, "2026-09-03T01:00:00.000Z"));
    } finally { reopened.close(); }
    const [stored] = readPersonalPlanningMethodPacks(root);
    assert.equal(stored?.version, 8);
    assert.equal(stored?.name, "更新的方法");
    assert.equal(stored?.enabled, false);
    assert.equal(stored?.created_at, "2026-09-01T01:00:00.000Z");
    assert.equal(stored?.updated_at, "2026-09-02T01:00:00.000Z");
    const deleting = await openMolisWorkProjectCatalog({ homeDirectory: root });
    try {
      assert.equal(deleting.personalPlanningMethods.delete(method.method_id), true);
      assert.equal(deleting.personalPlanningMethods.delete(method.method_id), false);
    } finally { deleting.close(); }
    assert.deepEqual(readPersonalPlanningMethodPacks(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("personal method reads do not create a Home or migrate v8 catalogs; normal open upgrades them", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "molis-work-personal-upgrade-"));
  try {
    const missingHome = path.join(root, "missing");
    assert.deepEqual(readPersonalPlanningMethodPacks(missingHome), []);
    assert.equal(existsSync(missingHome), false);
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: root });
    const databasePath = catalog.databasePath;
    catalog.close();
    const legacy = new Database(databasePath);
    legacy.exec("DROP TABLE personal_planning_method_packs; UPDATE catalog_meta SET value = '8' WHERE key = 'schema_version'");
    legacy.close();
    assert.deepEqual(readPersonalPlanningMethodPacks(root), []);
    const unchanged = new Database(databasePath, { readonly: true });
    try {
      assert.deepEqual(unchanged.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").get(), { value: "8" });
      assert.equal(unchanged.prepare("SELECT name FROM sqlite_master WHERE name = 'personal_planning_method_packs'").get(), undefined);
    } finally { unchanged.close(); }
    const upgraded = await openMolisWorkProjectCatalog({ homeDirectory: root });
    try { upgraded.personalPlanningMethods.save(customMethod("domain-after-upgrade"), "2026-09-01T01:00:00.000Z"); }
    finally { upgraded.close(); }
    assert.equal(readPersonalPlanningMethodPacks(root)[0]?.method_id, "domain-after-upgrade");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Goals public Planning API owns method versions, graph checks, and change impact", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "molis-work-planning-module-"));
  const store = new LocalProjectDatabase(path.join(root, "board.db"));
  try {
    const clock = () => new Date("2026-08-22T05:00:00.000Z");
    new GoalProjectApplication(store, clock).initializeBoard({
      board_id: "board-module-planning",
      title: "Planning Module",
      actor_id: "user",
      idempotency_key: "init-module-planning",
    });
    const goals = new GoalsModule(store.db, {
      supersedePendingContractProposals: (...args) => new GovernanceRecordStore(store.db).supersedePendingContractProposals(...args),
      currentActionToken: () => "token:planning",
      authorizeRiskUpdate: () => undefined,
      authorizeRiskState: () => undefined,
      transitionRevisionDependents: () => undefined,
      reconcileLifecycle: () => ({ observed_event_cursor: 0 }),
    }, { now: clock });

    const first = goals.planning.saveProjectMethod({
      board_id: "board-module-planning",
      method: customMethod("domain-module-planning"),
      actor_id: "user",
      user_confirmed: true,
    });
    const second = goals.planning.saveProjectMethod({
      board_id: "board-module-planning",
      method: { ...customMethod("domain-module-planning"), summary: "第二版研究方法。" },
      actor_id: "user",
      user_confirmed: true,
    });
    assert.equal(first.method.version, 1);
    assert.equal(second.method.version, 2);
    assert.deepEqual(
      goals.planning.projectComposition("board-module-planning").method_pack_ids,
      ["domain-module-planning"],
    );
    assert.match(second.method.instructions, /拆分时必须回答/u);

    goals.commands.createGoal("board-module-planning", {
      goal_id: "foundation",
      title: "基础",
      outcome: "基础结果",
      why: "被功能消费",
      business_logic: "先提供基础结果。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "foundation-ready",
        statement: "基础结果可用",
        decision_method: "inspection",
        pass_condition: "可以被功能消费",
      }],
    }, { actor_id: "user", idempotency_key: "create-foundation" });
    goals.commands.createGoal("board-module-planning", {
      goal_id: "feature",
      title: "功能",
      outcome: "功能结果",
      why: "消费基础",
      business_logic: "使用基础结果。",
      definition_state: "accepted",
      decomposition_state: "closed_leaf",
      acceptance_criteria: [{
        criterion_id: "feature-ready",
        statement: "功能结果可用",
        decision_method: "inspection",
        pass_condition: "功能消费基础结果",
      }],
    }, { actor_id: "user", idempotency_key: "create-feature" });
    goals.commands.addRelation("board-module-planning", {
      from_goal_id: "feature",
      to_goal_id: "foundation",
      type: "depends_on",
      reason: "功能消费基础结果",
    }, { actor_id: "user", idempotency_key: "feature-depends-foundation" });

    const impact = goals.planning.analyzeChange("board-module-planning", ["foundation"]);
    assert.deepEqual(impact.affected_dependents, ["feature"]);
    assert.deepEqual(goals.planning.validateBoardGraph("board-module-planning").issues, []);
    assert.ok(goals.planning.validateGraph(
      [goal("foundation"), goal("feature")],
      [
        relation("cycle-1", "feature", "foundation", "depends_on"),
        relation("cycle-2", "foundation", "feature", "depends_on"),
      ],
    ).some((issue) => issue.code === "planning.dependency_cycle"));
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("whole-graph validation catches dependency and combined execution cycles", () => {
  const goals = [goal("foundation"), goal("feature"), goal("release")];
  const dependencyCycle = [
    relation("d1", "feature", "foundation", "depends_on"),
    relation("d2", "foundation", "feature", "depends_on"),
  ];
  assert.ok(validatePlanningGraph(goals, dependencyCycle).some((issue) => issue.code === "planning.dependency_cycle"));

  const combinedCycle = [
    relation("p1", "feature", "release", "part_of"),
    relation("d3", "feature", "release", "depends_on"),
  ];
  assert.ok(validatePlanningGraph(goals, combinedCycle).some((issue) => issue.code === "planning.execution_cycle"));

  const projected = projectPlanningRelations([], [
    { action: "add", relation_id: "x1", from_goal_id: "feature", to_goal_id: "foundation", type: "depends_on" },
    { action: "add", relation_id: "x2", from_goal_id: "foundation", to_goal_id: "feature", type: "depends_on" },
  ]);
  assert.equal(projected.length, 2);
});

test("planning order and requirement impact stay local and explain downstream value", () => {
  const goals = [goal("foundation"), goal("feature"), goal("release"), goal("unrelated")];
  const relations = [
    relation("d1", "feature", "foundation", "depends_on"),
    relation("d2", "release", "feature", "depends_on"),
  ];
  const metrics = planningMetrics(goals, relations);
  assert.equal(metrics.get("foundation")?.unlock_count, 2);
  assert.equal(metrics.get("foundation")?.longest_downstream_chain, 2);
  assert.equal(metrics.get("release")?.topological_level, 2);

  const impact = analyzeGoalChangeImpact(goals, relations, ["foundation"]);
  assert.deepEqual(impact.affected_dependents, ["feature", "release"]);
  assert.ok(impact.reusable_open_goal_ids.includes("feature"));
  assert.ok(!impact.review_order.includes("unrelated"));

  const cgsGoals = ["root", "g1", "g2", "g3", "g4", "g4a", "g5", "g6"].map((goalId) => goal(goalId));
  const cgsRelations = [
    relation("p-g1", "g1", "root", "part_of"),
    relation("p-g2", "g2", "root", "part_of"),
    relation("p-g3", "g3", "root", "part_of"),
    relation("p-g4", "g4", "root", "part_of"),
    relation("p-g4a", "g4a", "g4", "part_of"),
    relation("p-g5", "g5", "root", "part_of"),
    relation("p-g6", "g6", "root", "part_of"),
    relation("d-g3-g2", "g3", "g2", "depends_on"),
    relation("d-g4-g3", "g4", "g3", "depends_on"),
    relation("d-g5-g4", "g5", "g4", "depends_on"),
    relation("d-g6-g5", "g6", "g5", "depends_on"),
  ];
  const cgsImpact = analyzeGoalChangeImpact(cgsGoals, cgsRelations, ["g3"]);
  assert.deepEqual(cgsImpact.affected_ancestors, ["root"]);
  assert.deepEqual(cgsImpact.affected_dependents, ["g4", "g5", "g6"]);
  assert.deepEqual(cgsImpact.adjacent_dependencies, ["g2"]);
  assert.ok(!cgsImpact.review_order.includes("g1"));
  assert.ok(!cgsImpact.review_order.includes("g4a"));
});

test("reusable open goals and unlock metrics follow current event work status, not old leaf kinds", () => {
  const goals = [
    { ...goal("parent"), decomposition_state: "closed_compound" as const, fulfillment_state: "satisfied" as const },
    { ...goal("child"), decomposition_state: "closed_compound" as const, fulfillment_state: "satisfied" as const },
  ];
  const relations = [relation("p-child", "child", "parent", "part_of")];
  const withoutStatus = analyzeGoalChangeImpact(goals, relations, ["child"]);
  assert.deepEqual(withoutStatus.affected_ancestors, ["parent"]);
  assert.ok(withoutStatus.reusable_open_goal_ids.includes("parent"));
  assert.ok(withoutStatus.reusable_open_goal_ids.includes("child"));

  const currentWork = new Map([
    ["parent", "open" as const],
    ["child", "completed" as const],
  ]);
  const impact = analyzeGoalChangeImpact(goals, relations, ["child"], currentWork);
  assert.deepEqual(impact.affected_ancestors, ["parent"]);
  assert.ok(impact.reusable_open_goal_ids.includes("parent"), "open closed_compound remains reusable");
  assert.ok(!impact.reusable_open_goal_ids.includes("child"), "completed work is not reusable");
  const metrics = planningMetrics(goals, relations, currentWork);
  assert.equal(metrics.get("child")?.unlock_count, 1);
  assert.equal(metrics.get("parent")?.unlock_count, 0);
});
