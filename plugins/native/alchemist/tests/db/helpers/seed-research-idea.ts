import type { SqliteDatabase } from "../../../src/studio/server/db/open-database.js";

export function seedResearchIdea(database: SqliteDatabase): void {
  const now = "2026-07-31T10:00:00.000Z";
  database
    .prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
    .run("workspace-local", "炼金术士", now);
  database
    .prepare("INSERT INTO workspace_actors (id, workspace_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("actor-local", "workspace-local", "local_user", "本地创始人", now);
  database
    .prepare(
      `INSERT INTO directions
       (id, workspace_id, title, description, source_kind, source_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'user_input', '{}', 'active', ?, ?)`,
    )
    .run("direction-01", "workspace-local", "验证 AI Idea", "更便宜地验证 AI Idea", now, now);
  database
    .prepare(
      `INSERT INTO exploration_runs
       (id, direction_id, status, runtime_label, understanding_json, error_code, created_at, updated_at)
       VALUES (?, ?, 'completed', '演示运行时', '{}', NULL, ?, ?)`,
    )
    .run("exploration-01", "direction-01", now, now);
  database
    .prepare(
      `INSERT INTO idea_cards
       (id, exploration_run_id, direction_id, status, title, highlight, target_user, scenario, problem,
        mechanism, value_proposition, why_it_may_work, assumptions_json, unknowns_json, mvp_json,
        discarded_at, kept_at, kept_idea_id, created_at, position)
       VALUES (?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', ?, NULL, NULL, NULL, ?, 0)`,
    )
    .run(
      "card-01",
      "exploration-01",
      "direction-01",
      "反证实验",
      "先找最便宜的反证",
      "独立创始人",
      "准备验证产品方向时",
      "开发前缺少证据",
      "排列反证实验",
      "更早发现错误",
      "能节省开发投入",
      JSON.stringify({ inScope: ["假设清单"], outOfScope: ["自动投放"] }),
      now,
    );
  database
    .prepare(
      `INSERT INTO ideas (id, direction_id, lifecycle, current_version, created_at, updated_at)
       VALUES (?, ?, 'exploring', 1, ?, ?)`,
    )
    .run("idea-01", "direction-01", now, now);
  database
    .prepare("UPDATE idea_cards SET status = 'kept', kept_at = ?, kept_idea_id = ? WHERE id = ?")
    .run(now, "idea-01", "card-01");
  database
    .prepare(
      `INSERT INTO idea_versions
       (id, idea_id, version, parent_version, actor_id, reason, created_at,
        source_card_id, source_exploration_run_id, content_json)
       VALUES (?, ?, 1, NULL, ?, 'kept_idea_card', ?, ?, ?, ?)`,
    )
    .run(
      "idea-version-01",
      "idea-01",
      "actor-local",
      now,
      "card-01",
      "exploration-01",
      JSON.stringify({
        title: "反证实验",
        highlight: "先找最便宜的反证",
        targetUser: "独立创始人",
        scenario: "准备验证产品方向时",
        coreProblem: "开发前缺少证据",
        coreMechanism: "排列反证实验",
        valueProposition: "更早发现错误",
        whyItMayWork: "能节省开发投入",
        assumptions: [],
        unknowns: [],
        mvp: { inScope: ["假设清单"], outOfScope: ["自动投放"] },
      }),
    );
}
