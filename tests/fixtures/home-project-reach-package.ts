import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals/contract";
import { newPublisher, signedPackage } from "./sandbox-package.js";

export const REACH_PLUGIN_ID = "io.molis.work.example.projectreach";
export const REACH_GOAL_ID = "PROJECT-REACH-GOAL";

/** Real signed Home package; every project write goes through the Goals action and its production owner. */
export function projectReachPackage(publisher: ReturnType<typeof newPublisher>, options: {
  version?: string; pluginId?: string; extraCapability?: string; broken?: boolean;
} = {}): PluginPackageBundle {
  return signedPackage(publisher, (files, manifest) => {
    manifest.runtime = { scope: "home" }; manifest.name = "项目进展助手"; manifest.ui.views![0]!.title = manifest.name;
    if (options.version && options.version !== "1.0.0") manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0", "1.1.0", "1.2.0"].filter(version => version < options.version!) };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(item => item.id === "notes.add")!.effects.storage = ["read", "write"];
    const writeInput = { type: "object", additionalProperties: false, required: ["goal_id", "based_on_cursor", "summary", "idempotency_key"], properties: {
      goal_id: { type: "string" }, based_on_cursor: { type: "integer" }, summary: { type: "string" }, idempotency_key: { type: "string" },
      project_id: { type: "string" }, subject: { type: "string" },
    } };
    contract.operations.push(
      { id: "reach.read", kind: "query", input: { type: "object", additionalProperties: false, properties: { goal_id: { type: "string" } }, required: ["goal_id"] },
        output: { type: "object", additionalProperties: false, properties: { cursor: { type: "integer" }, summary: { type: "string" }, title: { type: "string" } }, required: ["cursor", "summary", "title"] },
        errors: [], effects: { capabilities: [goalPluginActions.state.capability_id] }, examples: [{ input: { goal_id: REACH_GOAL_ID }, output: { cursor: 1, summary: "", title: "目标" } }] },
      { id: "reach.write", kind: "command", input: writeInput, output: { type: "object", additionalProperties: false, properties: { replayed: { type: "boolean" }, event_id: { type: "string" } }, required: ["replayed", "event_id"] }, errors: [], effects: { capabilities: [goalPluginActions.progress.capability_id] },
        examples: [{ input: { goal_id: REACH_GOAL_ID, based_on_cursor: 1, summary: "进展", idempotency_key: "example" }, output: { replayed: false, event_id: "event" } }] },
      { id: "reach.submit", kind: "command", input: { type: "object", additionalProperties: false, properties: { text: { type: "string" } }, required: ["text"] },
        output: { type: "boolean" }, errors: [], effects: { capabilities: [goalPluginActions.state.capability_id, goalPluginActions.progress.capability_id] },
        examples: [{ input: { text: "进展" }, output: true }] },
    );
    if (options.extraCapability) contract.operations.push({ id: "reach.extra", kind: "command", input: { type: "object", properties: {}, required: [], additionalProperties: false }, output: { type: "boolean" },
      errors: [], effects: { capabilities: [options.extraCapability] }, examples: [{ input: {}, output: true }] });
    contract.pages[0]!.regions[0]!.operationIds.push("reach.read", "reach.write", "reach.submit", ...(options.extraCapability ? ["reach.extra"] : []));
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    const ui = JSON.parse(files[SANDBOX_PACKAGE_FILES.interface]!);
    for (const rows of [ui.parts, ui.nodes]) {
      const editor = rows.find((item: { id: string }) => item.id === "editor");
      editor.submit.operationId = "reach.submit"; editor.props.submitLabel = "记录项目进展";
    }
    files[SANDBOX_PACKAGE_FILES.interface] = JSON.stringify(ui);
    files[SANDBOX_PACKAGE_FILES.entrypoint] += `
operations['reach.read'] = async (input, sdk) => { const state = await sdk.capability.call(${JSON.stringify(goalPluginActions.state.capability_id)}, input); return {cursor:state.goal_event_cursor,summary:state.progress_summary?.summary ?? '',title:state.intent.title}; };
operations['reach.write'] = async (input, sdk) => { const result = await sdk.capability.call(${JSON.stringify(goalPluginActions.progress.capability_id)}, {goal_id:input.goal_id,based_on_cursor:input.based_on_cursor,summary:input.summary,idempotency_key:input.idempotency_key}); return {replayed:result.replayed,event_id:result.event_id}; };
operations['reach.submit'] = async (input, sdk) => {
  const state = await sdk.capability.call(${JSON.stringify(goalPluginActions.state.capability_id)}, {goal_id:${JSON.stringify(REACH_GOAL_ID)}});
  await sdk.capability.call(${JSON.stringify(goalPluginActions.progress.capability_id)}, {goal_id:${JSON.stringify(REACH_GOAL_ID)}, based_on_cursor:state.goal_event_cursor, summary:input.text, idempotency_key:input.text});
  return true;
};
`;
    if (options.extraCapability) files[SANDBOX_PACKAGE_FILES.entrypoint] += "operations['reach.extra'] = async () => true;\n";
    if (options.broken) files[SANDBOX_PACKAGE_FILES.entrypoint] = "throw new Error('project reach fixture startup refused');";
  }, { pluginId: options.pluginId ?? REACH_PLUGIN_ID, version: options.version });
}
