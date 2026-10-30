import { ActionError, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createJellyActionHandlers } from "./actions.js";
import { jellyErrors } from "./error.js";
import { jellyManifest } from "./manifest.js";
import { jellyRoutes } from "./plugin-routes.js";
import { createJellyServiceHandlers } from "./service-actions.js";
import { JellyStore, type JellyStores } from "./store.js";
import { jellyUiContribution } from "./ui.js";
import { JELLY_INSTRUCTIONS } from "./prompts.js";

const unavailable = (): ActionAvailability => ({ available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" });

/** One Home Runtime instance owns every Jelly action, view, and HTTP route. */
export function createJellyPlugin(): PluginDefinition {
  return { manifest: jellyManifest, instructions: JELLY_INSTRUCTIONS, async start(context) {
    for (const permission of jellyManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, model = context.services?.model, configuration = model?.configuration;
    if (!database || !configuration) throw new ActionError("actions.unredeemed", "宿主未提供 Jelly 库或模型设置服务");
    const stores: JellyStores = {
      read: run => run(new JellyStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "Jelly 的读取不写入"); },
        savepoint: () => { throw new ActionError("actions.execution_failed", "Jelly 的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new JellyStore(transaction))),
    };
    const settings = async <T>(run: () => Promise<T>) => {
      try { return await run(); }
      catch (error) {
        if (error instanceof ActionError && error.code === "host.model_configuration_invalid") throw jellyErrors.invalid(error.message, error.details);
        throw error;
      }
    };
    return { kind: "app", views: [jellyUiContribution], routes: jellyRoutes(context), actions: [
      ...createJellyActionHandlers({ ...stores,
        modelAvailability: () => { try { return model?.availability(configuration.selection()) ?? unavailable(); } catch { return unavailable(); } },
        ai: caller => ({ onProgress: progress => caller.on_progress?.(progress), completeJson: async (prompt, options) => {
          try { return (await model!.complete(prompt, { selection: configuration.selection(), signal: options?.signal, output: "json" })).value; }
          catch (error) {
            if (error instanceof ActionError && error.code === "plugin.model_output_invalid") throw jellyErrors.ai_invalid("模型没有返回有效计划，原文未修改，请重试或手工拆解");
            throw error;
          }
        } }),
      }),
      ...createJellyServiceHandlers({ modelSettings: () => settings(() => configuration.read()), saveModelSettings: input => settings(() => configuration.save(input)) }),
    ] };
  } };
}
