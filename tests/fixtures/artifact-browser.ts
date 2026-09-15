import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../../apps/desktop/launchers/web/server.js";
import { insertHistoricalEvidence } from "../historical-sql-fixture.js";

const directory = mkdtempSync(join(tmpdir(), "molis-work-ar3-browser-"));
const databasePath = join(directory, "fixture.db");
writeFileSync(join(directory, "result.txt"), "AR3 browser fixture: 原始结果内容，打开不会改变 Goal 或 Evidence。\n");
seedDemoBoard(databasePath);
const store = new LocalProjectDatabase(databasePath);
const coordinator = new GoalProjectApplication(store);
coordinator.goals.commands.createGoal(DEMO_BOARD_ID, {
  goal_id: "AR3-REFERENCE", title: "结果引用迁移验收（测试数据）", outcome: "点击结果文件，读取原始内容",
  why: "确认重组没有改变已有操作", business_logic: "打开文件不改变 Goal 与 Evidence 状态",
  definition_state: "accepted", decomposition_state: "closed_leaf",
  acceptance_criteria: [{ criterion_id: "AR3-REF-C1", statement: "结果文件可以打开", decision_method: "inspection",
    pass_condition: "读到原始中文内容", required_evidence: ["artifact"] }],
}, { actor_id: "fixture-user", idempotency_key: "fixture-goal" });
for (const [key, locator] of [["file", "project://result.txt"], ["opaque", "artifact://opaque-reference-ar3"], ["external", "https://example.com/report"]]) {
  insertHistoricalEvidence(store.db, {
    evidence_id: `fixture-${key}`,
    board_id: DEMO_BOARD_ID,
    goal_id: "AR3-REFERENCE",
    producer_actor_id: "fixture-user",
    criterion_ids: ["AR3-REF-C1"],
    kind: "artifact",
    locator,
    result: "inconclusive",
    locator_workspace_id: "fixture-workspace",
    locator_workspace_root: directory,
  });
}
for (const [artifact_id, version, title] of [
  ["架构迁移核对报告（测试数据）", 1, "原始结果：目标、证据和引用保持不变"],
  ["架构迁移核对报告（测试数据）", 2, "第二版补充了包边界检查"],
  ["导入检查记录（测试数据）", 1, "来源引用不可用时保留原始元数据"],
] as const) {
  coordinator.artifacts.commands.registerVersion({ board_id: DEMO_BOARD_ID, artifact_id, version,
    actor_id: "fixture-user", artifact_type_id: "io.example.migration-report", schema_version: 1,
    producer: { plugin_id: "io.example.report-writer", plugin_version: "1.0.0", binding_signature: "fixture-signature" },
    content: { kind: "inline", payload: { title, sections: ["公开 API", "精确版本引用", "现有功能核对"], synthetic: true } },
    metadata: { source: "本地验收数据，不是真实项目结论" } });
}
const ledger = createContextLedger(store.db, { authorize: () => true });
const scope = { kind: 'personal' as const, id: DEMO_BOARD_ID };
for (const [key, type, version] of [['input', 'goal.input', 1], ['output', 'goal.output', 2]] as const) {
  ledger.commands.put({ actor_id: 'fixture-user', scope }, { key, type, cause: 'Explicit fixture relation',
    source: { module: 'goals', id: 'AR3-REFERENCE', version: null, scope },
    target: { module: 'artifacts', id: '架构迁移核对报告（测试数据）', version, scope } });
}
store.close();
const server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, projectRoot: directory,
  homeDirectory: join(directory, "home"), controlToken: "ar3-fixture-control-token-local-only-0123456789" });
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (typeof address === "object" && address) console.log(JSON.stringify({ url: `http://127.0.0.1:${address.port}/goals/AR3-REFERENCE`, directory }));
});
process.on("SIGINT", () => server.close(() => process.exit(0)));
