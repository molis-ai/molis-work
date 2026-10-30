import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { issueActionHandlers, issuesActions } from "./actions.js";
import type { IssueCapture, IssueDraft } from "./capture.js";
import { issuesManifest } from "./manifest.js";
import { IssueStore, type IssueCreate, type IssueDelete, type IssueList, type IssueUpdate } from "./store.js";
import type { IssueNamingInput } from "./naming.js";
import { issuesUiContribution } from "./ui.js";
import { issuesSkills } from "./skills.js";
import { ISSUES_INSTRUCTIONS } from "./prompts.js";

export function createIssuesPlugin(): PluginDefinition {
  return { manifest: issuesManifest, instructions: ISSUES_INSTRUCTIONS, methods: issuesSkills, async start(context) {
    if (!context.actor_id || !context.services?.database) throw new Error("Issue 需要个人 Home 与插件数据库服务");
    const store = new IssueStore(context.services.database, context.actor_id);
    return { kind: "app", actions: issueActionHandlers(store, context.services.model), views: [issuesUiContribution], routes: [
      bindPluginActionRoute(context, issuesActions.prepare, request => request.body as IssueDraft),
      bindPluginActionRoute(context, issuesActions.cancel, request => request.body as { draft_id: string }),
      bindPluginActionRoute(context, issuesActions.nameDraft, request => request.body as { draft_id: string }),
      bindPluginActionRoute(context, issuesActions.suggestName, request => request.body as IssueNamingInput),
      bindPluginActionRoute(context, issuesActions.capture, request => request.body as IssueCapture),
      bindPluginActionRoute(context, issuesActions.discard, request => request.body as IssueDelete),
      bindPluginActionRoute(context, issuesActions.list, request => ({
        ...(request.query.type ? { type: request.query.type as IssueList["type"] } : {}),
        ...(request.query.limit ? { limit: Number(request.query.limit) } : {}),
        ...(request.query.cursor ? { cursor: JSON.parse(request.query.cursor) as IssueList["cursor"] } : {}),
      })),
      bindPluginActionRoute(context, issuesActions.read, request => ({ id: request.query.id ?? "" })),
      bindPluginActionRoute(context, issuesActions.create, request => request.body as IssueCreate),
      bindPluginActionRoute(context, issuesActions.update, request => request.body as IssueUpdate),
      bindPluginActionRoute(context, issuesActions.delete, request => request.body as IssueDelete),
    ] };
  } };
}
