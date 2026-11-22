import readNativeMarkdown from "./native-markdown.js";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { FEED_PLUGIN_ID } from "./identity.js";

/**
 * The information plan's instruction: one confirmable proposal over this project's Feed and Inbox. It was the Host's
 * (`system:information/information.plan`) until it moved here with its action (BL-b44-information-plan-to-feed); the person's
 * edits were moved with it by the prompt settings' upgrade, and the version goes on from the Host's.
 */
export const FEED_INFORMATION_PLAN = defineInstructionPrompt({
  owner_id: FEED_PLUGIN_ID, prompt_id: "feed.information-plan", version: /* @version prompt.feed.information-plan */ 2, title: "信息处理方案",
  purpose: "根据用户请求，为 Feed 来源起草筛选规则，或为 Inbox 条目填写写作要求；只提出一个待确认的动作", used_by: ["Feed 信息处理方案"],
  ...readNativeMarkdown("prompts", "feed.information-plan", ["en"]),
});

export const FEED_INSTRUCTIONS: readonly InstructionPrompt[] = [FEED_INFORMATION_PLAN];
