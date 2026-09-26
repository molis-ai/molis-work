import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { formManifest, createFormActionHandlers, FORM_ACTION_PERMISSIONS, type FormStore, type FormActionPorts } from "@molis-ai/molis-work-plugin-form";

export function formTestPorts(store: FormStore, projectId: string, options: Partial<Omit<FormActionPorts, "withStore">> = {}) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: formManifest.plugin_id, title: "Form", kind: "plugin", project_id: projectId }, definitions: formManifest.actions!,
    handlers: createFormActionHandlers({ withStore: run => run(store), modelAvailability: () => options.completeText ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型" }, ...options }) });
  return { projectId, actions: bindActionClient(service, () => ({ actor_id: "test", project_id: projectId, audience: "user", permissions: FORM_ACTION_PERMISSIONS })) };
}
