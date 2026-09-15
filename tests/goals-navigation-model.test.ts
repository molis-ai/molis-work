import assert from "node:assert/strict";
import test from "node:test";
import { buildGoalsNavigationItems, type GoalsNavigationItem } from "@molis-ai/molis-work-plugin-goals";

test("Goal browser projection keeps supplied child order and display state while omitting unrelated facts", () => {
  const parent = { goal: { goal_id: "parent", title: "Parent </script>", decomposition_state: "closed_compound" as const,
    private_input: "do not send to navigation" }, status: "execution_pending" as const, display_status: "waiting" as const,
    status_label: "等候", action_summary: "Children first", main_action_label: "Read children", runs: ["private-run"] };
  const child: GoalsNavigationItem = { goal: { goal_id: "archived", title: 'Child "title"', decomposition_state: "closed_leaf" },
    status: "archived", display_status: "completed", status_label: "归档", action_summary: "Kept history", main_action_label: "Restore" };
  const second: GoalsNavigationItem = { ...child, goal: { ...child.goal, goal_id: "second" }, status: "replaced" };
  const original = structuredClone(parent);
  const result = buildGoalsNavigationItems([parent], id => { assert.equal(id, "parent"); return [second, child]; }, () => "<svg>status owner</svg>");
  assert.deepEqual(result, [{ goal: { goal_id: "parent", title: "Parent </script>" }, status: "waiting", status_label: "等候",
    status_meaning: "Children first", status_icon: "<svg>status owner</svg>", is_waiting_parent: true, is_compound_parent: true,
    children: [
      { goal: { goal_id: "second", title: 'Child "title"' }, status: "completed", status_label: "归档", status_meaning: "Kept history", next_action: "Restore" },
      { goal: { goal_id: "archived", title: 'Child "title"' }, status: "archived", status_label: "归档", status_meaning: "Kept history", next_action: "Restore" },
    ] }]);
  assert.deepEqual(parent, original);
  assert.doesNotMatch(JSON.stringify(result), /private_input|private-run|decomposition_state/);
  const leaf = buildGoalsNavigationItems([{ ...parent, goal: { ...parent.goal, decomposition_state: "abstract" }, display_status: "continue" }], () => [], () => "")[0]!;
  assert.equal(leaf.is_waiting_parent, false);
  assert.equal(leaf.is_compound_parent, false);
  assert.deepEqual(leaf.children, []);
  const eventParent = buildGoalsNavigationItems([{
    goal: { goal_id: "parent-event", title: "Event parent", decomposition_state: "closed_compound" },
    status: "executing", display_status: "in_progress", status_label: "正在推进",
    action_summary: "整合工作", main_action_label: "记录进展", event_work: true,
  }], () => [], () => "")[0]!;
  assert.equal(eventParent.is_compound_parent, false);
});
