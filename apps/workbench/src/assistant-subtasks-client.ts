import { readFileSync } from "node:fs";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { AGENT_REVIEW_CLIENT_FACTORY_SCRIPT } from "./scripts/client/agent-review.js";

/** The lazy native float receives the same Host review and lifetime factories as other Host surfaces. */
export const assistantSubtasksClient = (bundle: string) => `${bundle}\nmolisAssistantSubtasks.installAssistantSubtasks({
  mountPluginClient: (${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})(), reviews: (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT})
});`;

let client: string | undefined;
export function renderMolisWorkAssistantSubtasksClientScript(): string {
  return client ??= readFileSync(new URL("./assistant-subtasks-bundle.js", import.meta.url), "utf8");
}
