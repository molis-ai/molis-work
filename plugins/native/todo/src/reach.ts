import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The actions that read or change a todo by what the person may reach across projects (PG-014): the Host gives each of them the list of
 * projects (`readable_project_ids`) to the person's calls, and Todo reads that list instead of judging who is asking. The other actions work
 * in the project the call is made in.
 */
export const TODO_REACHING_ACTIONS: ReadonlySet<string> = new Set([
  "todo.items.list", "todo.items.get", "todo.items.update", "todo.items.status", "todo.items.archive", "todo.items.delete", "todo.items.batch",
  "todo.changes.revert", "todo.items.link", "todo.reminders.due", "todo.reminders.acknowledge", "todo.reminders.window", "todo.placement.move",
  "todo.item.subject.read", "todo.organize.list", "todo.organize.get", "todo.organize.apply", "todo.organize.close",
]);

/** The definition with `project_reach` declared when it is one of those actions. */
export function withProjectReach<D extends ActionDefinition>(definition: D): D {
  return TODO_REACHING_ACTIONS.has(definition.capability_id) ? { ...definition, action: { ...definition.action, project_reach: "person" as const } } : definition;
}
