import type { createCgsRuntimePlugin } from "@molis-ai/molis-work-plugin-cgs";
import { createCgsWorkMaterials, createCgsWorkModel, cgsWorkFiles, cgsPackageRoot } from "@molis-ai/molis-work-plugin-cgs/native";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectPluginPorts } from "./project-plugins.js";
import { pluginAgentServiceFor, pluginHomeFor } from "./home-side.js";
import { bindRegisteredAgentPrompts } from "./agent-definitions/registered-agent-prompts.js";
import { openConfiguredModels, selectConfiguredTextModel } from "./configured-models.js";
import { createMaterialExtractor } from "./material-extraction.js";
import { readMaterialDocuments } from "./material-documents.js";
import { readMaterialWebsite } from "./material-web.js";

function selectionFor(home: string) {
  const opened = openConfiguredModels(home);
  try {
    const selected = opened && selectConfiguredTextModel(home, opened.store);
    return selected ? { provider_id: selected.provider.provider_id, model_id: selected.model.model_id } : undefined;
  } finally { opened?.storage.close(); }
}

/** Trusted assembly only: identity and services come from this project's Home. */
export function creationPluginPorts(ports: ProjectPluginPorts): NonNullable<Parameters<typeof createCgsRuntimePlugin>[0]> {
  const home = ports.homeDirectory;
  return {
    files: cgsWorkFiles,
    materialsFor: (caller: ActionExecutionContext) => createCgsWorkMaterials({
      extract: createMaterialExtractor({ beforeEffect: () => caller.beforeEffect() }),
      documents: readMaterialDocuments, website: readMaterialWebsite,
    }, caller),
    ...(home ? { modelFor: async (context: PluginStartContext) => {
      const service = pluginAgentServiceFor(home);
      if (!service) throw new ActionError("actions.unavailable", "本项目的 Home Agent 服务尚未接通");
      return createCgsWorkModel({ actions: ports.actions, service, bindHostAgentPrompts: bindRegisteredAgentPrompts,
        homeDirectory: home, root: cgsPackageRoot, selection: () => selectionFor(home),
        owner: { actorId: context.actor_id, projectId: context.project_id, installId: () => context.install_id },
        availability: () => pluginHomeFor(home).completeText() !== null && selectionFor(home)
          ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先在 Work 配置文字模型；已有稿件仍可读写。" },
      });
    } } : {}),
  };
}
