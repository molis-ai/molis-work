import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createCogniaActionHandlers } from "./actions.js";
import type { CogniaAiPorts } from "./ai.js";
import { scanCogniaDirectory } from "./directory.js";
import { cogniaManifest } from "./manifest.js";
import { cogniaRoutes } from "./plugin-routes.js";
import { COGNIA_EVIDENCE, COGNIA_INSTRUCTIONS } from "./prompts.js";
import { CogniaStore, type CogniaStores } from "./store.js";
import { cogniaUiContribution } from "./ui.js";

/** The person's one knowledge library, regardless of the project displaying it. */
export function createCogniaPlugin(): PluginDefinition {
  return { manifest: cogniaManifest, instructions: COGNIA_INSTRUCTIONS, async start(context) {
    for (const permission of cogniaManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, actions = context.services?.actions;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供知识库");
    if (!actions) throw new ActionError("actions.unredeemed", "宿主未提供动作服务");
    const stores: CogniaStores = {
      read: run => run(new CogniaStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters),
        run: () => { throw new ActionError("actions.execution_failed", "知识库的读取不写入"); } })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new CogniaStore(transaction))),
    };
    const model = (): CogniaAiPorts => {
      const service = context.services?.model, state = service?.availability();
      return state?.available ? { runtimeLabel: state.runtime_label,
        completeText: async (prompt, request) => (await service!.complete(prompt, { signal: request?.signal, system: COGNIA_EVIDENCE, timeout_ms: 180_000 })).text,
      } : { unavailableReason: state && !state.available ? state.reason : "请先在「模型设置」里连接文字模型" };
    };
    return { kind: "app", views: [cogniaUiContribution], routes: cogniaRoutes(context),
      actions: createCogniaActionHandlers({ ...stores, model, ai: caller => ({ ...model(), signal: caller.signal }), actions,
        scan: (grantId, path, signal) => scanCogniaDirectory(context.services?.directory, grantId, path, signal) }) };
  } };
}
