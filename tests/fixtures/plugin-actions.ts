import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions, type KnowledgeReadRequest, type KnowledgeReadResponse } from "@molis-ai/molis-work-contracts/services/knowledge";

/** Standalone owner fixtures explicitly share one Kernel, just as the application Host does. */
const services = new WeakMap<object, Map<string, ActionService>>();
export function pluginActions(owner: object, project_id: string) {
  let projects = services.get(owner);
  if (!projects) { projects = new Map(); services.set(owner, projects); }
  let service = projects.get(project_id);
  if (!service) { service = new ActionService(); projects.set(project_id, service); }
  return { registry: service, client: service, project_id };
}

/**
 * The project's knowledge as `knowledge.read` answers it, for a plugin test without the knowledge service (whose reads, refusals
 * and receipts are tested in tests/knowledge-*.test.ts). `read` gives a piece's title and text, or null for one that is not there.
 */
export function fakeKnowledgeReader(actions: ReturnType<typeof pluginActions>, read: (subject: ActionSubject) => { title: string; text: string; revision: string } | null) {
  if (readers.has(actions.registry)) return actions;
  readers.add(actions.registry);
  actions.registry.registerProvider({ provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "项目资料", kind: "system" }, definitions: [knowledgeActions.read],
    handlers: [{ ...knowledgeActions.read, handle: (_caller, input) => {
      const asked = input as KnowledgeReadRequest, piece = read(asked.subject);
      if (!piece) throw new ActionError("knowledge.unreadable", "这份资料现在读不到");
      const text = piece.text.slice(0, asked.max_chars ?? 6_000);
      return { subject: asked.subject, ref: null, revision: piece.revision, title: piece.title, layer: "original", text, start: 0, end: text.length, start_line: 1, end_line: 1, total_lines: 1,
        remaining: piece.text.length - text.length, owner_truncated: false, round_chars_left: null } satisfies KnowledgeReadResponse;
    } }] });
  return actions;
}
const readers = new WeakSet<object>();

/**
 * Goals' public directory as `goals.list` answers it, for a plugin test without the Goals plugin (the real one is tested with the
 * Goals suites). `titles` maps a Goal id to its title; the answer lists them in that order, `pageSize` to a page.
 */
export function fakeGoalDirectory(actions: ReturnType<typeof pluginActions>, titles: () => Readonly<Record<string, string>>, pageSize = 100, seen?: ActionCallContext[]) {
  if (directories.has(actions.registry)) return actions;
  directories.add(actions.registry);
  actions.registry.registerProvider({ provider: { provider_id: "goals-fixture", title: "目标", kind: "system" }, definitions: [goalPluginActions.list],
    handlers: [{ ...goalPluginActions.list, handle: (caller, input) => {
      seen?.push(caller);
      const asked = input as { after_cursor?: string; limit?: number }, rows = Object.entries(titles()), start = asked.after_cursor ? Number(asked.after_cursor) : 0;
      const size = Math.min(asked.limit ?? pageSize, pageSize), page = rows.slice(start, start + size);
      return { goals: page.map(([goal_id, title]) => ({ goal_id, title, work_status: "open", completion_effect: false, can_record: true, next_hint: "", unmet_requirement_count: 0,
        pending_decision_count: 0, blocking_concern_count: 0, updated_at: "2026-09-19T14:00:00Z" })), next_cursor: start + size < rows.length ? String(start + size) : null, observed_event_cursor: 0 };
    } }] });
  return actions;
}
const directories = new WeakSet<object>();
