import { ActionService, assertActionInput } from "@molis-ai/molis-work-kernel";
import { ActionError, bindActionClient, type ActionAvailability, type ActionClient, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createWorkflowContentPorts, createWorkflowsActionHandlers, ownWorkflowsStores, workflowsManifest, type WorkflowsActionPorts, type WorkflowsStore } from "@molis-ai/molis-work-plugin-workflows";

/** What the Runtime plugin gives the handlers that a test replaces: the text model and its answer. */
export interface WorkflowsPortOptions {
  readonly textModel?: ActionAvailability;
  readonly complete?: WorkflowsActionPorts["complete"];
  readonly changed?: () => void;
}

const asWorkflow = (caller: ActionExecutionContext): ActionExecutionContext => ({ ...caller, audience: "workflow" });

/**
 * The ports the Workflows plugin builds from the Runtime's services, over a store a test opened and an action service it registered the
 * other plugins on: every nested call is the original caller's, under the workflow audience, which is what the delegation service does.
 */
export function workflowsTestPorts(store: WorkflowsStore, service: ActionClient, options: WorkflowsPortOptions = {}): WorkflowsActionPorts {
  return { ...ownWorkflowsStores(run => run(store)),
    content: caller => createWorkflowContentPorts(bindActionClient(service, () => asWorkflow(caller))),
    actions: caller => ({ discover: async () => service.discover(asWorkflow(caller)), invoke: (reference, input) => service.invoke(asWorkflow(caller), reference, input),
      check: async (reference, input) => {
        const view = (await service.discover(asWorkflow(caller))).find(row => row.capability_id === reference.capability_id && row.version === reference.version);
        if (!view) throw new ActionError("actions.dependency_missing", "这项动作不可用");
        assertActionInput(view.action.input_schema, input);
      } }),
    textModel: () => options.textModel ?? { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" },
    ...(options.complete ? { complete: options.complete } : {}), ...(options.changed ? { changed: options.changed } : {}) };
}

/** A fresh action service with the Workflows actions registered over `store`, for a project. */
export function workflowsTestService(store: WorkflowsStore, projectId: string, options: WorkflowsPortOptions = {}) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: workflowsManifest.plugin_id, title: workflowsManifest.name, kind: "plugin", project_id: projectId },
    definitions: workflowsManifest.actions!, handlers: createWorkflowsActionHandlers(projectId, workflowsTestPorts(store, service, options)) });
  return service;
}
