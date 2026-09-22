import {
  FEED_CAPTURE_SCENE_ID,
  FEED_ARCHIVE_BEHAVIOR_ID,
  FEED_OPEN_BEHAVIOR_ID,
  FEED_PROMOTE_BEHAVIOR_ID,
  FEED_REAUTH_BEHAVIOR_ID,
  FEED_SAVE_BEHAVIOR_ID,
  HOME_ASK_BEHAVIOR_ID,
  HOME_CONTINUE_BEHAVIOR_ID,
  HOME_DOCK_ACTION_IDS,
  HOME_DOCK_SCENE_ID,
  INBOX_ADMIT_BEHAVIOR_ID,
  INBOX_DISMISS_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  INBOX_NEXT_SCENE_ID,
  assembleFunctionAuthoringCatalog,
  defaultFeedCaptureBehaviorIds,
  sceneBehaviorIds,
  offeredHomeDockBehaviorIds,
} from "@molis-ai/molis-work-contracts/modules/functions";
import {
  assembleRegisteredBehaviors,
  type PluginManifest,
  type RegisteredBehavior,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { githubIntegrationManifest } from "@molis-ai/molis-work-integration-github";
import { CATALOG_CONNECTORS, catalogIntegrationManifest } from "@molis-ai/molis-work-integration-catalog";
import { feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { functionsManifest } from "@molis-ai/molis-work-plugin-functions";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { formManifest } from "@molis-ai/molis-work-plugin-form";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { connectorCredentialStatus } from "./connector-credentials.js";

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
  {
    behavior_id: FEED_SAVE_BEHAVIOR_ID,
    plugin_id: "system",
    title: "保存为资料",
    effect: "write",
    subject_kinds: ["feed_item"],
    source: "system",
  },
  {
    behavior_id: FEED_PROMOTE_BEHAVIOR_ID,
    plugin_id: "system",
    title: "升格为 Goal",
    effect: "write",
    subject_kinds: ["feed_item"],
    source: "system",
  },
  {
    behavior_id: FEED_ARCHIVE_BEHAVIOR_ID,
    plugin_id: "system",
    title: "忽略",
    effect: "write",
    subject_kinds: ["feed_item"],
    source: "system",
  },
];

const NATIVE_BEHAVIOR_MANIFESTS = [
  functionsManifest,
  pagesManifest,
  feedManifest,
  inboxManifest,
  formManifest,
  datasetManifest,
  pptManifest,
];

export function nativeBehaviorManifests() {
  return NATIVE_BEHAVIOR_MANIFESTS;
}

export function connectedIntegrationManifests(): PluginManifest[] {
  const manifests: PluginManifest[] = connectorCredentialStatus("github").bound ? [githubIntegrationManifest] : [];
  for (const spec of CATALOG_CONNECTORS) {
    if (connectorCredentialStatus(spec.id).bound) manifests.push(catalogIntegrationManifest(spec.id));
  }
  return manifests;
}

export function liveBehaviorManifests() {
  return [...NATIVE_BEHAVIOR_MANIFESTS, ...connectedIntegrationManifests()];
}

export function assembleHostBehaviorCatalog(
  manifests: readonly { plugin_id: string; name?: string; mcp_exports?: typeof functionsManifest.mcp_exports; behaviors?: typeof feedManifest.behaviors | typeof githubIntegrationManifest.behaviors }[] = NATIVE_BEHAVIOR_MANIFESTS,
): RegisteredBehavior[] {
  return assembleRegisteredBehaviors(manifests, SYSTEM_BEHAVIORS);
}

export function liveHostBehaviorCatalog(): RegisteredBehavior[] {
  return assembleHostBehaviorCatalog(liveBehaviorManifests());
}

export function liveHostAllowedBehaviorIds(): string[] {
  return hostAllowedBehaviorIds(liveHostBehaviorCatalog());
}

export function liveHostFunctionAuthoringCatalog() {
  return hostFunctionAuthoringCatalog(liveHostBehaviorCatalog(), liveBehaviorManifests());
}

export function hostAllowedBehaviorIds(
  catalog: readonly RegisteredBehavior[] = assembleHostBehaviorCatalog(),
): string[] {
  return catalog.map((row) => row.behavior_id);
}

export function hostHomeDockBehaviors(
  catalog: readonly RegisteredBehavior[] = assembleHostBehaviorCatalog(),
) {
  return catalog
    .filter((row) => HOME_DOCK_ACTION_IDS.includes(row.behavior_id))
    .map((row) => ({
      behavior_id: row.behavior_id,
      title: row.title,
      subject_kinds: row.subject_kinds,
    }));
}

export function hostOfferedBehaviorsForScene(
  sceneId: string,
  subjects: readonly string[],
  catalog: readonly RegisteredBehavior[] = assembleHostBehaviorCatalog(),
): string[] {
  if (sceneId === INBOX_NEXT_SCENE_ID) return sceneBehaviorIds(sceneId);
  if (sceneId === FEED_CAPTURE_SCENE_ID) return defaultFeedCaptureBehaviorIds(true);
  if (sceneId === HOME_DOCK_SCENE_ID) return offeredHomeDockBehaviorIds(catalog, subjects);
  return hostAllowedBehaviorIds(catalog);
}

export function hostFunctionAuthoringCatalog(
  catalog: readonly RegisteredBehavior[] = assembleHostBehaviorCatalog(),
  manifests: readonly { plugin_id: string; name?: string; judgment_subjects?: readonly { subject_kind: string; title: string }[] }[] = NATIVE_BEHAVIOR_MANIFESTS,
) {
  return assembleFunctionAuthoringCatalog({
    behaviors: catalog,
    plugin_titles: Object.fromEntries(manifests.map((row) => [row.plugin_id, row.name ?? row.plugin_id])),
    extra_subjects: manifests.flatMap((row) => row.judgment_subjects ?? []),
  });
}
