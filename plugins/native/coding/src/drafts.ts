import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities, type AgentDraftTextRequest, type AgentDraftTextResult } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingActionControl, type CodingBeforeWrite } from "./route-entry.js";

/**
 * One of Coding's two explicit drafts (the commit message, the digest of earlier rounds): the platform's draft action, reached
 * like every action Coding consumes, under the caller's fence. It needs `model:invoke`; with that turned off the plugin's
 * action client refuses it before the Host is asked (`plugin.grant_denied`) and only these two drafts stop (PG-035).
 */
export function codingDraft(context: PluginStartContext, input: AgentDraftTextRequest, beforeWrite: CodingBeforeWrite): Promise<AgentDraftTextResult> {
  if (!context.services?.actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
  return context.services.actions.invoke(agentHostCapabilities.draftText, input, codingActionControl(beforeWrite));
}
