import { t, type MwSubtaskConversationLabels } from "@molis-ai/molis-work-plugin-sdk/ui";
export function subtaskConversationLabels(): MwSubtaskConversationLabels {
  const say = (key: string) => t.text(`workbench.subtask-conversation.${key}`);
  return { back: say("back"), close: say("close"), loading: say("loading"), readFailed: say("read-failed"), retry: say("retry"),
    latest: say("latest"), messages: say("messages"), children: say("children"), unread: say("unread"), working: say("working"),
    actionFailed: say("action-failed"), unknown: say("unknown"), check: say("check") };
}
