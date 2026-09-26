import { bindActionClient, bindWorkflowContentHandlers, defineWorkflowContentActions, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangActions } from "./actions.js";

export const lingguangContentActions = defineWorkflowContentActions({ id: "lingguang", title: "灵光", icon: "idea", create: true,
  read_permissions: ["lingguang:read"], write_permissions: ["lingguang:write"] });

/** The content protocol translates to the same business actions as HTTP and MCP. */
export function createLingguangContentHandlers(actions: ActionClient) {
  const ref = (spark: { id: string; title: string }) => ({ plugin: "lingguang", item_id: spark.id, title: spark.title });
  return bindWorkflowContentHandlers(lingguangContentActions, {
    list: async caller => (await bindActionClient(actions, () => caller).invoke(lingguangActions.list, {})).sparks
      .map(spark => ({ item_id: spark.id, title: spark.title, caption: "灵光", at: spark.updated_at })),
    read: async ({ item_id }, caller) => {
      const { spark } = await bindActionClient(actions, () => caller).invoke(lingguangActions.get, { id: item_id });
      return { title: spark.title, body: spark.body, source: "灵光", feed_item_id: null };
    },
    create: async ({ title }, caller) => ref((await bindActionClient(actions, () => caller).invoke(lingguangActions.create, { title, body: "" })).spark),
    receive: async ({ payload }, caller) => ref((await bindActionClient(actions, () => caller).invoke(lingguangActions.create, { title: payload.title, body: payload.body })).spark),
  });
}
