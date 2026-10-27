/** The one file of the workbench's Goals renderers that names the Goals package; the others take what they need from here. */
export {
  buildDecisionGroups,
  buildGoalsNavigationItems,
  countGoalDecisions,
  createGoalStateExplainer,
  GOAL_DISPLAY_STATUSES,
  GOALS_PLUGIN_ID,
  partOfChildViews,
  sortGoalTreeItems,
  type GoalsDocumentView as WebGoalView,
} from "@molis-ai/molis-work-plugin-goals";
export { DEFAULT_GOAL_POLICY, composePlanningMethodPacks } from "@molis-ai/molis-work-plugin-goals/module";
