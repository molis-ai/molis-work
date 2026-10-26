import type { ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_DISMISS_BEHAVIOR_ID, INBOX_DONE_BEHAVIOR_ID, SYSTEM_HOME_DOCK_FUNCTION_KEY } from "@molis-ai/molis-work-contracts/modules/functions";

/**
 * Test input for the current Host home.dock seeding contract: the rule and its subject-offer recommendations.
 * This is maintained by hand, not imported from the Host's internal declaration; it does not follow production changes automatically.
 */
export const HOME_DOCK: ActionSceneDefinition = {
  scene_id: "home.dock", version: 1, title: "首页下一步", description: "首页", trigger: "事项到达", scope: "project", subject_kinds: [], permissions: [],
  input_schema: { type: "object" }, result_schema: { type: "object" }, recommendation_source: "subject-offers",
  default_rule: { function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY, name: "首页事项处理建议", instructions: "根据事项原文推荐完成或忽略。", subject_kinds: ["inbox_entry"],
    options: [{ key: INBOX_DONE_BEHAVIOR_ID, description: "做完了" }, { key: INBOX_DISMISS_BEHAVIOR_ID, description: "忽略" }] },
};
