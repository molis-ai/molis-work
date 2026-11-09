import { goalAction } from "./contract/goal-action-definition.js";
import type { GoalsSqliteDatabase } from "./module/repository.js";
import type { GoalPresentationState } from "./tree-order.js";

export interface GoalCapsuleMenu {
  focus: { goal_id: string; title: string; state: GoalPresentationState; count: number; historical: boolean } | null;
}
export const goalCapsuleMenuAction = goalAction<Record<string, never>, GoalCapsuleMenu>("goals.capsule.menu.read", /* @version action.goals.capsule.menu.read */ 1,
  "读取菜单栏工作摘要", "只读取菜单栏需要的目标状态和同组数量，不展开事件正文或整个工作台", "query", { type: "object", additionalProperties: false },
  { type: "object", properties: { focus: { anyOf: [{ type: "null" }, { type: "object", properties: { goal_id: { type: "string" }, title: { type: "string" },
    historical: { type: "boolean" }, state: { type: "string", enum: ["waiting_for_human", "executing", "execution_blocked", "execution_pending", "satisfied", "invalidated", "trashed", "archived"] }, count: { type: "integer", minimum: 1 } }, required: ["goal_id", "title", "state", "count", "historical"], additionalProperties: false }] } }, required: ["focus"], additionalProperties: false });

/** Goals owns this projection. SQL returns one row, never reports, agreements, event payloads or a full state per Goal. */
export function readGoalCapsuleMenu(db: Pick<GoalsSqliteDatabase, "prepare">, projectId: string, now = new Date()): GoalCapsuleMenu {
  const row = db.prepare(`WITH facts AS (
    SELECT g.goal_id, g.title, g.updated_at, b.active_goal_id, o.goal_id IS NULL historical,
      COALESCE((SELECT MAX(recorded_at) FROM goal_event_closures c WHERE c.project_id=g.project_id AND c.goal_id=g.goal_id AND c.completion_applied=1),g.updated_at) completed_at,
      CASE WHEN o.goal_id IS NULL THEN 'execution_pending'
        WHEN w.work_status='completed' THEN 'satisfied' WHEN w.work_status='cancelled' THEN 'invalidated'
        WHEN EXISTS(SELECT 1 FROM goal_event_decision_requests d WHERE d.project_id=g.project_id AND d.goal_id=g.goal_id AND d.status='pending') THEN 'waiting_for_human'
        WHEN EXISTS(SELECT 1 FROM goal_event_concerns c WHERE c.project_id=g.project_id AND c.goal_id=g.goal_id AND c.status='open' AND c.blocks_closure=1) THEN 'execution_blocked'
        WHEN TRIM(COALESCE((SELECT next_step FROM goal_event_progress_summaries p JOIN goal_work_events e ON e.project_id=p.project_id AND e.goal_id=p.goal_id AND e.event_id=p.event_id WHERE p.project_id=g.project_id AND p.goal_id=g.goal_id ORDER BY e.journal_seq DESC LIMIT 1),''))<>'' THEN 'executing'
        ELSE 'execution_pending' END state
    FROM goals g JOIN boards b ON b.project_id=g.project_id
    LEFT JOIN goal_event_state_owners o ON o.project_id=g.project_id AND o.goal_id=g.goal_id
    LEFT JOIN goal_event_work_status w ON w.project_id=g.project_id AND w.goal_id=g.goal_id
    WHERE g.project_id=? AND g.archived_at IS NULL AND g.trashed_at IS NULL
  ), visible AS (
    SELECT goal_id,title,updated_at,active_goal_id,historical,completed_at,state, CASE state WHEN 'waiting_for_human' THEN 0 WHEN 'executing' THEN 1 WHEN 'satisfied' THEN 2
      WHEN 'execution_pending' THEN 3 WHEN 'invalidated' THEN 3 WHEN 'execution_blocked' THEN 4 ELSE 5 END rank
    FROM facts WHERE state<>'satisfied' OR completed_at>?
  ) SELECT goal_id,title,state,historical,CASE WHEN state='satisfied' THEN 1 ELSE COUNT(*) OVER(PARTITION BY state) END count
    FROM visible ORDER BY rank,(state='executing' AND goal_id=active_goal_id) DESC,
      CASE WHEN state='satisfied' THEN completed_at ELSE updated_at END DESC,goal_id LIMIT 1
  `).get(projectId, new Date(now.getTime() - 10_000).toISOString()) as (Omit<NonNullable<GoalCapsuleMenu["focus"]>, "historical"> & { historical: number }) | undefined;
  return { focus: row ? { ...row, historical: Boolean(row.historical) } : null };
}
