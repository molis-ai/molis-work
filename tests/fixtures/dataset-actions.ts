import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { datasetManifest, createDatasetActionHandlers, createDatasetContentHandlers, DATASET_ACTION_PERMISSIONS, type DatasetStore, type DatasetActionPorts, type DatasetStores } from "@molis-ai/molis-work-plugin-dataset";

export function datasetTestPorts(store: DatasetStore, projectId: string, options: Partial<Omit<DatasetActionPorts, "read" | "write">> = {}) {
  const stores: DatasetStores = { read: run => run(store), async write(caller, run) { await caller.beforeEffect(); return run(store); } };
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: datasetManifest.plugin_id, title: "Dataset", kind: "plugin", project_id: projectId }, definitions: datasetManifest.actions!,
    handlers: [...createDatasetActionHandlers({ ...stores, modelAvailability: () => options.completeText ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型" }, ...options }),
      ...createDatasetContentHandlers(stores)] });
  return { projectId, actions: bindActionClient(service, () => ({ actor_id: "test", project_id: projectId, audience: "user", permissions: DATASET_ACTION_PERMISSIONS })) };
}
