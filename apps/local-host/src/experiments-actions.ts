import { bindActionClient, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { EXPERIMENTS_ACTIONS, createExperimentsActionHandlers, experimentsManifest } from "@molis-ai/molis-work-plugin-experiments";
import { functionAuthoringActions } from "@molis-ai/molis-work-module-functions";
import { experimentConnectionStatus, experimentDefaults } from "./experiments-executor.js";
import { openExperiments } from "./experiments-native-plugin-http.js";
import { bindTypeSafeConnection, selectedTypeSafeConnection } from "./typesafe-connection.js";
import { listConnectorConnectionViews } from "./web-connector-connections.js";

/** Experiments are personal to the Home; judgment functions are read through the system service, not its store. */
export function experimentsActionProvider(home: string, homeActions: ActionClient): ActionProviderRegistration {
  return {
    provider: { provider_id: experimentsManifest.plugin_id, plugin_id: experimentsManifest.plugin_id, title: experimentsManifest.name, kind: "plugin" },
    definitions: EXPERIMENTS_ACTIONS,
    handlers: createExperimentsActionHandlers({
      service: () => openExperiments(home),
      models: () => {
        const saved = openExperiments(home).participants();
        const participants = [...saved, ...experimentDefaults().filter(item => !saved.some(model => model.id === item.id))];
        const selected = selectedTypeSafeConnection(home, "experiments")?.connection_id;
        return { participants, saved_ids: saved.map(model => model.id), status: experimentConnectionStatus(participants, home),
          connections: listConnectorConnectionViews(home, "typesafe"), ...(selected ? { selected_connection_id: selected } : {}) };
      },
      selectConnection: connectionId => bindTypeSafeConnection(home, "experiments", connectionId),
      choiceFunctions: async caller => (await bindActionClient(homeActions, () => caller).invoke(functionAuthoringActions.list, {})).functions
        .filter(record => record.primitive === "choice")
        .map(record => ({ id: record.id, name: record.name, function_key: record.function_key, version: record.version, model: record.model,
          instructions: record.instructions, criteria: record.criteria, config_hash: record.config_hash })),
    }),
  };
}
