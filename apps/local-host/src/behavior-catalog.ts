import {
  FEED_OPEN_BEHAVIOR_ID,
  FEED_REAUTH_BEHAVIOR_ID,
  HOME_ASK_BEHAVIOR_ID,
  HOME_CONTINUE_BEHAVIOR_ID,
  INBOX_ADMIT_BEHAVIOR_ID,
  INBOX_DISMISS_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
} from "@molis-ai/molis-work-contracts/modules/functions";
import {
  assembleRegisteredBehaviors,
  type RegisteredBehavior,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { functionsManifest } from "@molis-ai/molis-work-plugin-functions";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { formManifest } from "@molis-ai/molis-work-plugin-form";
import { pptManifest } from "@molis-ai/molis-work-plugin-ppt";

export const SYSTEM_BEHAVIORS: readonly RegisteredBehavior[] = [
  {
    behavior_id: HOME_CONTINUE_BEHAVIOR_ID,
    plugin_id: "system",
    title: "接着做",
    effect: "read",
    subject_kinds: ["inbox_entry", "feed_item", "session", "home_event"],
    source: "system",
  },
  {
    behavior_id: HOME_ASK_BEHAVIOR_ID,
    plugin_id: "system",
    title: "问问怎么回事",
    effect: "read",
    subject_kinds: ["source", "inbox_entry", "home_event"],
    source: "system",
  },
  {
    behavior_id: INBOX_DONE_BEHAVIOR_ID,
    plugin_id: "system",
    title: "做完了",
    effect: "write",
    subject_kinds: ["inbox_entry"],
    source: "system",
  },
  {
    behavior_id: INBOX_DISMISS_BEHAVIOR_ID,
    plugin_id: "system",
    title: "忽略",
    effect: "write",
    subject_kinds: ["inbox_entry"],
    source: "system",
  },
  {
    behavior_id: INBOX_ADMIT_BEHAVIOR_ID,
    plugin_id: "system",
    title: "进入 Inbox",
    effect: "write",
    subject_kinds: ["feed_item"],
    source: "system",
  },
  {
    behavior_id: FEED_REAUTH_BEHAVIOR_ID,
    plugin_id: "system",
    title: "重新授权",
    effect: "write",
    subject_kinds: ["source"],
    source: "system",
  },
  {
    behavior_id: FEED_OPEN_BEHAVIOR_ID,
    plugin_id: "system",
    title: "打开",
    effect: "read",
    subject_kinds: ["feed_item", "source"],
    source: "system",
  },
];

const NATIVE_BEHAVIOR_MANIFESTS = [
  functionsManifest,
  feedManifest,
  inboxManifest,
  formManifest,
  datasetManifest,
  pptManifest,
];

export function nativeBehaviorManifests() {
  return NATIVE_BEHAVIOR_MANIFESTS;
}

export function assembleHostBehaviorCatalog(
  manifests: readonly { plugin_id: string; mcp_exports?: typeof functionsManifest.mcp_exports; behaviors?: typeof feedManifest.behaviors }[] = NATIVE_BEHAVIOR_MANIFESTS,
): RegisteredBehavior[] {
  return assembleRegisteredBehaviors(manifests, SYSTEM_BEHAVIORS);
}

export function hostAllowedBehaviorIds(
  catalog: readonly RegisteredBehavior[] = assembleHostBehaviorCatalog(),
): string[] {
  return catalog.map((row) => row.behavior_id);
}
