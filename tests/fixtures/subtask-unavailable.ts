import { createAgentSubtaskSource, createSubtaskConversation } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import type { AgentSubagentConversation } from "@molis-ai/molis-work-contracts/services/agent-host";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { COMPOSER_AI_LABELS } from "./composer-labels.js";

const subtaskWord = (key: string) => t.text("workbench.subtask-conversation." + key);

/** Only the already-projected owner response is a fixture; source, translation and component are production code. */
export async function mountUnavailable() {
  const root = document.createElement("div"); root.id = "unavailable-subtask";
  root.style.cssText = "position:fixed;inset:20px 20px auto auto;width:360px;height:600px;z-index:1000;background:var(--surface)";
  document.body.append(root);
  const run = { session_id: "child", run_id: "original" };
  const conversation: AgentSubagentConversation = {
    child: { subagent_id: "old", parent_run: { session_id: "parent", run_id: "parent-run" }, child_run: run, role_id: "reader", role_version: 1, execution: "read-only", task: "", continuation_task: { status: "unavailable" }, state: "completed", result: "Retained child result", workspace_path: null },
    phase: "completed", questions: [], approvals: [], input_unavailable: subtaskWord("notice.task-unavailable"),
    messages: [
      { turn_id: "opening", kind: "notice", notice: "task-unavailable", text: "", at: null, run },
      { turn_id: "reply", kind: "assistant", text: "Retained child result", at: null, run },
      { turn_id: "person", kind: "user", text: "Retained personal input", at: null, run },
    ],
  };
  const source = createAgentSubtaskSource({
    text: subtaskWord, labels: COMPOSER_AI_LABELS,
    drafts: { read: async () => null, write: async () => {}, compareAndSwap: async () => true },
    read: async () => ({ conversation, parent: { target: "parent", title: "Parent" } }), command: async () => { throw new Error("no command expected"); }, check: async () => ({ state: "unknown" }),
  });
  const handle = createSubtaskConversation(root, { source, labels: { back: "Back", close: "Close", loading: "Loading", readFailed: "Cannot read", retry: "Retry", latest: "Latest", messages: "Messages", children: "Children", unread: "Unread", working: "Working", actionFailed: "Action failed", unknown: "Unknown", check: "Check" } });
  await handle.open("old");
  return { destroy() { handle.destroy(); root.remove(); } };
}
