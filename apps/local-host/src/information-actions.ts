import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { bindActionClient, retainActionAuthority, type ActionClient, type ActionDefinition, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedQueryActions, FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import { inboxActions, INBOX_PLUGIN_ID } from "@molis-ai/molis-work-plugin-inbox";
import { hostCompleteText, textModelAvailability, textModelRequired, type HostCompleteText } from "./host-complete-text.js";
import { planInformationWork } from "./information-planner.js";

export const INFORMATION_PROVIDER_ID = "system.information";

const text = { type: "string" };
const fields = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export const informationActions = {
  plan: { capability_id: "information.plan", version: 1, operation: "query", action: {
    title: "起草信息处理方案", description: "根据当前项目的 Feed 与 Inbox 提出筛选或写作方案；不会执行方案中的操作",
    kind: "query", scope: "project", scheduling: "concurrent", execution: { cost: "metered" }, audiences: ["user"], permissions: ["feed:read", "inbox:read", "model:invoke"], subject_kinds: [],
    required_actions: [{ capability_id: feedQueryActions.snapshot.capability_id, version: 1, provider_id: FEED_PLUGIN_ID }, { capability_id: inboxActions.list.capability_id, version: 1, provider_id: INBOX_PLUGIN_ID }],
    input_schema: { type: "object", properties: { prompt: { type: "string", minLength: 1, maxLength: 4000 }, selected_item_id: { type: "string", maxLength: 200 } }, required: ["prompt"], additionalProperties: false },
    output_schema: fields({ message: text, action: { anyOf: [{ type: "null" },
      fields({ kind: { const: "configure_filter" }, source_id: text, sample_item_id: text, name: text, instructions: text }),
      fields({ kind: { const: "draft_pages" }, entry_ids: { type: "array", items: text }, title: text, instructions: text }),
    ] }, context: fields({ project_id: text, items: { type: "integer", minimum: 0 }, inbox: { type: "integer", minimum: 0 } }) }),
  } } satisfies ActionDefinition<{ prompt: string; selected_item_id?: string }, Awaited<ReturnType<typeof planInformationWork>>>,
};

export function informationActionProvider(home: string, projectId: string, client: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return { provider: { provider_id: INFORMATION_PROVIDER_ID, kind: "system", title: "信息助手", project_id: projectId },
    definitions: [informationActions.plan], handlers: [{ ...informationActions.plan,
      availability: () => textModelAvailability(model),
      handle: async (caller, input) => {
        const complete = model();
        if (!complete) throw textModelRequired();
        const nested = retainActionAuthority(caller, { ...informationActions.plan, provider_id: INFORMATION_PROVIDER_ID });
        const actions = bindActionClient(client, () => nested);
        const snapshot = await actions.invoke(feedQueryActions.snapshot, {});
        const { entries } = await actions.invoke(inboxActions.list, {});
        return planInformationWork({ ...snapshot, inbox_entries: [...entries] }, projectId, input as { prompt: string }, complete,
          { signal: caller.signal, beforeDispatch: caller.beforeEffect }, prompt => resolveModelPrompt(home, prompt, "system.information"));
      },
    }] };
}
