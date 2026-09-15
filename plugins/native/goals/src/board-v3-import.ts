import type { GoalEventFactsApi, GoalsCommandApi, GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { LegacyV3ImportInput, V3ImportReport } from "./board-import-contract.js";

export interface LegacyV3ImportPorts {
  immediate<T>(operation: () => T): T;
  query: Pick<GoalsQueryApi, "getBoard">;
  initializeBoard: GoalsCommandApi["initializeBoard"];
  commands: Pick<GoalsCommandApi, "createGoal" | "addRelation" | "importLegacyCoverage" | "completeLegacyBoardImport">;
  adoptOwner: GoalEventFactsApi["adoptOwner"];
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "") || "legacy";
}

export function importLegacyV3Board(
  ports: LegacyV3ImportPorts,
  legacy: LegacyV3ImportInput,
  input: {
    target_board_id: string;
    actor_id: string;
    idempotency_key: string;
  },
): V3ImportReport {
  if (legacy.schema_version !== "3.0") {
    throw new Error(`只支持 V3 JSON，收到 schema_version=${legacy.schema_version}`);
  }
  const existing = ports.query.getBoard(input.target_board_id);
  if (existing) throw new Error(`目标 Board 已存在，不会覆盖: ${input.target_board_id}`);

  return ports.immediate(() => {
    ports.initializeBoard({
      board_id: input.target_board_id,
      title: legacy.meta.title || legacy.meta.source.seed,
      actor_id: input.actor_id,
      idempotency_key: `${input.idempotency_key}:board`,
    });
    const idMap: Record<string, string> = {};
    for (const legacyGoal of legacy.goals) {
      idMap[legacyGoal.id] = `${safeId(input.target_board_id)}:v3:${safeId(legacyGoal.id)}`;
    }
    for (const legacyGoal of legacy.goals) {
      const migratedId = idMap[legacyGoal.id];
      ports.commands.createGoal(
        input.target_board_id,
        {
          goal_id: migratedId,
          title: legacyGoal.one_liner,
          outcome: legacyGoal.one_liner,
          why: "从 Clarification Agent V3 迁入，保留原目标树",
          business_logic: "",
          in_scope: legacyGoal.covers,
          constraints: legacy.root_goal.constraints,
          required_inputs: legacyGoal.inputs,
          promised_outputs: legacyGoal.outputs,
          definition_state: "draft",
          decomposition_state: "abstract",
          acceptance_criteria: [],
        },
        {
          actor_id: input.actor_id,
          idempotency_key: `${input.idempotency_key}:goal:${legacyGoal.id}`,
          reason: "从 V3 导入可安全保留的 Goal 结构",
        },
      );
      ports.adoptOwner({
        board_id: input.target_board_id,
        goal_id: migratedId,
        actor_id: input.actor_id,
        source: "migration",
        outcome: legacyGoal.one_liner,
      });
    }
    for (const legacyGoal of legacy.goals) {
      if (!legacyGoal.parent || !idMap[legacyGoal.parent]) continue;
      ports.commands.addRelation(
        input.target_board_id,
        {
          from_goal_id: idMap[legacyGoal.id],
          to_goal_id: idMap[legacyGoal.parent],
          type: "part_of",
          reason: "保留 V3 Goal 树关系",
        },
        {
          actor_id: input.actor_id,
          idempotency_key: `${input.idempotency_key}:relation:${legacyGoal.id}`,
        },
      );
    }
    const now = new Date().toISOString();
    ports.commands.importLegacyCoverage(input.target_board_id, legacy.coverage_ledger.map(item => {
      const disposition = item.status === "out" ? "out" : item.status === "later" ? "deferred" : item.owner_goal ? "covered" : "unresolved";
      return {
        requirement_id: `${safeId(input.target_board_id)}:v3:${safeId(item.id)}`,
        statement: item.requirement, disposition,
        owner_goal_id: item.owner_goal ? idMap[item.owner_goal] ?? null : null,
        reason: item.reason ?? "从 V3 coverage ledger 导入",
        revisit_condition: item.entry_condition ?? item.revisit_at ?? null,
        blocking: disposition === "unresolved", created_at: now, updated_at: now,
      };
    }));
    const activeGoalId = legacy.goals[0] ? idMap[legacy.goals[0].id] : null;
    const cursor = ports.commands.completeLegacyBoardImport({
      board_id: input.target_board_id, active_goal_id: activeGoalId, actor_id: input.actor_id, at: now,
      legacy_goal_id: legacy.goal_id, legacy_schema_version: legacy.schema_version,
    });
    return {
      board_id: input.target_board_id,
      migrated: [
        "Goal 名称与父子树",
        "inputs / outputs",
        "root constraints",
        "coverage ledger disposition",
        "V3 source identity",
      ],
      regenerate: [
        "每个 Goal 的非技术业务逻辑",
        "当前约定与可判定要求",
        "依赖、Impact Surface、Risk 与 Policy",
        "未关闭的澄清说明",
      ],
      goal_id_map: idMap,
      observed_event_cursor: cursor,
    };
  });
}
