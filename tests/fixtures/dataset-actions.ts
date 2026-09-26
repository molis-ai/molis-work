import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { datasetManifest, createDatasetActionHandlers, DATASET_ACTION_PERMISSIONS, type DatasetStore, type DatasetActionPorts } from "@molis-ai/molis-work-plugin-dataset";

export function datasetTestPorts(store: DatasetStore, projectId: string, options: Partial<Omit<DatasetActionPorts, "withStore">> = {}) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: datasetManifest.plugin_id, title: "Dataset", kind: "plugin", project_id: projectId }, definitions: datasetManifest.actions!,
    handlers: createDatasetActionHandlers({ withStore: run => run(store), modelAvailability: () => options.completeText ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型" }, ...options }) });
  return { projectId, actions: bindActionClient(service, () => ({ actor_id: "test", project_id: projectId, audience: "user", permissions: DATASET_ACTION_PERMISSIONS })) };
}
