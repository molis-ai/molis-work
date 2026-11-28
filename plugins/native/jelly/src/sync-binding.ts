import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PartitionSyncContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { armJellyWindow } from "./overview.js";
import { jellyCollection } from "./replication.js";
export function syncBindings(context: PartitionSyncContext): PluginSyncBinding[] {
  const scope = context.sync;
  if (!scope) return [];
  const service = context.services?.sync;
  if (!service) throw new ActionError("actions.unredeemed", "个人空间同步服务未提供");
  const replica = service.collection("entries", jellyCollection);
  const refresh = () => {
    if (context.services?.database) armJellyWindow(context.services.database, context.services.due);
  };
  return [
    {
      collection_id: "entries",
      replica: {
        ...replica,
        receive(event, options) {
          replica.receive(event, options);
          refresh();
        },
        resolve(key, choice, revision, state) {
          replica.resolve(key, choice, revision, state);
          refresh();
        },
        ...(replica.retryWaiting
          ? {
              retryWaiting() {
                replica.retryWaiting!();
                refresh();
              },
            }
          : {}),
        ...(replica.restoreRecovery
          ? {
              restoreRecovery(id: string, choice: "local" | "remote", revision: number) {
                replica.restoreRecovery!(id, choice, revision);
                refresh();
              },
            }
          : {}),
      },
      content: createSyncJsonContent({ spaceId: scope.spaceId, authorize: () => scope.assertActive() }),
      locate: syncTupleLocation("jelly", false, undefined, false),
    },
  ];
}
