import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, subjectContext, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { WORKFLOWS_PROJECT_PLUGIN_ID, type Workflow } from "./model.js";
import type { WorkflowsStore } from "./store.js";

/** Workflows' part in the system search: a flow's title, its steps and the rules written on each handoff. Runs are not indexed. */
export const workflowsSearchActions = {
  entries: defineSearchEntriesAction("workflows.search.entries", [{ kind: "workflow", title: "工作流程", surface: WORKFLOWS_PROJECT_PLUGIN_ID }], "工作流程", ["workflows:read"]),
  subject: defineSubjectContextAction("workflows.subject.read", "workflow", "工作流程", ["workflows:read"]),
};

export function workflowSearchContent(workflow: Workflow): string {
  const steps = workflow.stations.map((station, index) => {
    const link = workflow.links[index];
    const name = station.action ? `动作步骤` : station.plugin;
    return [name, link?.instructions, link?.title_template, link?.body_template, link?.judgment?.title].filter(Boolean).join("\n");
  });
  return steps.filter(Boolean).join("\n\n");
}

export function createWorkflowsSearchHandlers(projectId: string, withStore: <T>(run: (store: WorkflowsStore) => T | Promise<T>) => Promise<T>): ActionHandlerBinding[] {
  const scoped = (caller: ActionCallContext) => { if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请求项目与流程所在项目不一致"); return projectId; };
  return [
    bindSearchEntriesHandler(workflowsSearchActions.entries, caller => withStore(store => store.list(scoped(caller)).map(workflow => ({
      subject: { kind: "workflow", id: workflow.workflow_id }, revision: String(workflow.revision), title: workflow.title, summary: "",
      updated_at: workflow.updated_at, content: "context" as const, open: { surface: WORKFLOWS_PROJECT_PLUGIN_ID, id: workflow.workflow_id } })))),
    { ...workflowsSearchActions.subject, handle: async (caller, input) => {
      const id = (input as { subject_id: string }).subject_id;
      let workflow: Workflow;
      try { workflow = await withStore(store => store.get(id, scoped(caller))); }
      catch (error) {
        if ((error as { code?: string })?.code === "workflows.not_found") throw new ActionError("actions.subject_unavailable", "流程已删除");
        throw error;
      }
      return subjectContext({ subject: { kind: "workflow", id: workflow.workflow_id }, revision: String(workflow.revision), title: workflow.title,
        content: workflowSearchContent(workflow), goal_ids: [], session_id: null, open: { surface: WORKFLOWS_PROJECT_PLUGIN_ID, id: workflow.workflow_id } });
    } },
  ];
}
