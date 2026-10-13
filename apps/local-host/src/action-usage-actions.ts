import { ActionError, ACTION_REFERENCE_SCHEMA, ACTION_USAGE_SCHEMA, ACTION_USAGES_INPUT_SCHEMA, ACTION_USAGES_INPUT_TYPE, ACTION_USAGES_OUTPUT_TYPE, defineActionUsagesAction, referencesAction,
  type ActionCallContext, type ActionClient, type ActionDefinition, type ActionHandlerBinding, type ActionProviderRegistration, type ActionReference, type ActionUsage, type ActionUsagesInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { readMcpToolPreference } from "./mcp-settings-store.js";

export interface ReportedActionUsage extends ActionUsage { source: ActionReference; reporter: string }
export interface ActionUsagesResult { usages: ReportedActionUsage[]; issues: string[] }

const readDefinition: ActionDefinition<ActionUsagesInput, ActionUsagesResult> = { capability_id: "actions.usages.read", version: 1, operation: "query", action: {
  title: "能力的使用位置", description: "汇总各插件保存的、引用这个能力的位置（流程步骤、角色范围、对外授权等）；只读，不调用该能力。", kind: "query", scope: "home", scheduling: "concurrent",
  audiences: ["user", "agent", "mcp"], permissions: [], subject_kinds: [], input_schema: ACTION_USAGES_INPUT_SCHEMA,
  output_schema: { type: "object", properties: { usages: { type: "array", items: { ...ACTION_USAGE_SCHEMA, properties: { ...ACTION_USAGE_SCHEMA.properties, source: ACTION_REFERENCE_SCHEMA, reporter: { type: "string" } },
    required: [...ACTION_USAGE_SCHEMA.required, "source", "reporter"] } }, issues: { type: "array", items: { type: "string" } } }, required: ["usages", "issues"], additionalProperties: false } } };

/**
 * Reporters are found by their contract type in the caller's own directory (its project, or Home). Owners the caller
 * may not read are not in that directory; one that is listed but refuses this caller is named in `issues`.
 * Registered once at Home, so every project sees the same query.
 */
export function actionUsagesProvider(clientFor: (caller: ActionCallContext) => ActionClient, homeDirectory?: string): ActionProviderRegistration {
  const read = readDefinition;
  const grants = defineActionUsagesAction("mcp.grants.usages", "对外接入的授权", [], "home");
  // Which clients may call what is the owner's own configuration; other clients never read it.
  const grantReporter: ActionDefinition<ActionUsagesInput, { usages: ActionUsage[] }> = { ...grants, action: { ...grants.action, audiences: ["user"] } };
  const handlers: ActionHandlerBinding[] = [{ ...read, handle: async (caller, value) => {
    const input = value as ActionUsagesInput;
    const client = clientFor(caller);
    const directory = await client.discover(caller);
    const reporters = directory.filter(view => view.action.input_type === ACTION_USAGES_INPUT_TYPE && view.action.output_type === ACTION_USAGES_OUTPUT_TYPE);
    const usages: ReportedActionUsage[] = [], issues: string[] = [];
    for (const reporter of reporters) {
      if (!reporter.availability.available) { issues.push(`${reporter.provider.title}：${reporter.availability.reason}`); continue; }
      const source = { capability_id: reporter.capability_id, version: reporter.version, provider_id: reporter.provider.provider_id };
      try {
        const result = await client.invoke(caller, source, { action: input.action }) as { usages: ActionUsage[] };
        const ids = new Set<string>();
        for (const usage of result.usages) {
          if (ids.has(usage.usage_id)) throw new ActionError("actions.usage_invalid", "插件返回了重复的使用位置");
          ids.add(usage.usage_id);
        }
        usages.push(...result.usages.map(usage => ({ ...usage, source, reporter: reporter.provider.title })));
      } catch (error) {
        issues.push(`${reporter.provider.title}：${error instanceof ActionError ? error.message : "暂时无法读取使用位置"}`);
      }
    }
    return { usages, issues };
  } }];
  if (homeDirectory) handlers.push({ ...grantReporter, handle: async (caller, value) => {
    const input = value as ActionUsagesInput;
    const saved = (await readMcpToolPreference(homeDirectory)).action_grants;
    return { usages: saved.filter(grant => grant.project_id === caller.project_id && referencesAction(grant, input.action)).map(grant => ({
      usage_id: JSON.stringify([grant.client_id, grant.project_id]), title: grant.client_id === "agent:prologue" ? "内置 Agent（Prologue）" : `MCP 客户端「${grant.client_id}」`,
      detail: grant.enabled ? "已授权按这个版本调用" : "授权已关闭", enabled: grant.enabled,
      href: `/capabilities/access?${new URLSearchParams({ client: grant.client_id, ...(grant.project_id ? { project: grant.project_id } : {}) })}` })) };
  } });
  return {
    provider: { provider_id: "system.action-usages", title: "能力", kind: "system" },
    definitions: homeDirectory ? [read, grantReporter] : [read], handlers,
  };
}
export const actionUsageActions = { read: readDefinition };
