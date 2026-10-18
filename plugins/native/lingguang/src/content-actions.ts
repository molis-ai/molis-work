import { bindWorkflowContentHandlers, defineWorkflowContentActions, workflowDeliveryKey, ActionError, type ActionDefinition, type ActionExecutionContext, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangActions } from "./actions.js";

export const lingguangContentActions = defineWorkflowContentActions({ id: "lingguang", title: "灵光", icon: "idea", create: true, subject_kind: "lingguang_spark",
  read_permissions: ["lingguang:read"], write_permissions: ["lingguang:write"] });

/** The content protocol translates to the same business actions as HTTP and MCP. */
export function createLingguangContentHandlers(actions: BoundActionClient) {
  const invoke = async <I, O>(definition: ActionDefinition<I, O>, input: I, caller: ActionExecutionContext): Promise<O> => {
    const authority = caller.retainAuthority?.([definition]);
    if (!authority) throw new ActionError("actions.unredeemed", "宿主未提供内容交接授权检查");
    await authority();
    return actions.invoke(definition, input, { ...caller,
      beforeEffect: async () => { await caller.beforeEffect(); await authority(); },
      assert_authority_current: () => { caller.assert_authority_current?.(); authority.assertCurrent(); },
    });
  };
  const ref = (spark: { id: string; title: string }) => ({ plugin: "lingguang", item_id: spark.id, title: spark.title });
  return bindWorkflowContentHandlers(lingguangContentActions, {
    list: async caller => (await invoke(lingguangActions.list, {}, caller)).sparks
      .map(spark => ({ item_id: spark.id, title: spark.title, caption: "灵光", at: spark.updated_at })),
    read: async ({ item_id }, caller) => {
      const { spark } = await invoke(lingguangActions.get, { id: item_id }, caller);
      return { title: spark.title, body: spark.body, source: "灵光", feed_item_id: null };
    },
    create: async ({ title }, caller) => ref((await invoke(lingguangActions.create, { title, body: "" }, caller)).spark),
    // One delivery is one spark: a retried handoff returns the spark it created the first time.
    receive: async ({ payload, context }, caller) => ref((await invoke(lingguangActions.create, { title: payload.title, body: payload.body, request_id: workflowDeliveryKey(context) }, caller)).spark),
  });
}
