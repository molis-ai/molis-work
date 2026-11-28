import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { workBriefActions } from "./actions.js";
import { WORK_BRIEF_DATABASE } from "./database.js";
import { briefArtifactPreview } from "./fix.js";
import { BRIEF_ARTIFACT_SCHEMA_VERSION, BRIEF_ARTIFACT_TYPE_ID, WORK_BRIEF_PLUGIN_ID } from "./identity.js";
import { localizeManifestActions } from "./manifest-action-text.js";
import { workBriefSync } from "./replication.js";
import { WORK_BRIEF_VIEW_ID, workBriefPresentation, workBriefPresentationActions } from "./presentation.js";
import { WORK_BRIEF_UI_CONTRIBUTION_ID } from "./ui.js";

const PROJECT_ACTIONS = [...Object.values(workBriefActions), ...workBriefPresentationActions, briefArtifactPreview];

/**
 * Work Brief: a partition's brief (how each source stands, sentences with what they stand on, what waits for the person, next steps), its
 * versions and revisions. One instance per partition it is enabled in, the personal space as well as each project, each with its own library
 * (`databases.partition`); the partition's own brief keeps a `brief` row in the platform's overview table, which is how the personal space
 * sees every partition's brief (`overview.read@1`). It names no other plugin: sources are whatever the action directory offers the caller (a
 * home overview, an object reader), so a partition without Goals is complete.
 */
export const workBriefManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: WORK_BRIEF_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "Work Brief",
  summary: "项目此刻怎么样、要你处理什么、下一步做什么，每句话都能核对来源。", summary_text: { key: "work-brief.directory.summary" },
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-work-brief-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "work-brief:read", required: true, reason: "读取简报、历史版本与引用依据", reason_text: { key: "work-brief.permission.work-brief-read.reason" } },
    { permission: "work-brief:write", required: true, reason: "保存、刷新、修改和固定简报", reason_text: { key: "work-brief.permission.work-brief-write.reason" } },
    { permission: "storage:private", required: true, reason: "保存简报正文、历史版本、人工修改与下一步处理记录", reason_text: { key: "work-brief.permission.storage-private.reason" } },
    { permission: "actions:delegate", required: true, reason: "按你的权限读取各来源概况与依据，并在你点击下一步时执行对应操作", reason_text: { key: "work-brief.permission.actions-delegate.reason" } },
    { permission: "artifact:write", required: true, reason: "把固定下来的简报版本存为成果", reason_text: { key: "work-brief.permission.artifact-write.reason" } },
    { permission: "artifact:read", required: true, reason: "核对固定简报版本对应的成果", reason_text: { key: "work-brief.permission.artifact-read.reason" } },
  ],
  presentation: workBriefPresentation,
  actions: localizeManifestActions(PROJECT_ACTIONS),
  read_groups: [{ group_id: "work-brief", title: "简报", title_text: { key: "work-brief.read-group.work-brief.title" },
    description: "项目的简报、它的版本与依据", description_text: { key: "work-brief.read-group.work-brief.description" },
    actions: [workBriefActions.list.capability_id, workBriefActions.get.capability_id, "work-brief.subject.read", "work-brief.search.entries"] }],
  databases: { partition: WORK_BRIEF_DATABASE },
  // The partition's own brief, as the personal space's overview shows it across partitions (§6.1).
  overview_projection: { kinds: ["brief"] },
  sync: workBriefSync,
  capabilities: { provides: [], consumes: ["search.references"] },
  artifacts: {
    produces: [{ artifact_type_id: BRIEF_ARTIFACT_TYPE_ID, schema_version: BRIEF_ARTIFACT_SCHEMA_VERSION, title: "简报", title_text: { key: "work-brief.artifacts.type-title" },
      preview: { capability_id: briefArtifactPreview.capability_id, version: briefArtifactPreview.version } }],
    consumes: [],
  },
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "work-brief.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "work-brief.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "work-brief.help.example-1" }, { key: "work-brief.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "work-brief.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "work-brief.help.advanced-summary" }, body: { key: "work-brief.help.advanced" } },
        ],
      }],
    },
    contributions: [WORK_BRIEF_UI_CONTRIBUTION_ID],
    views: [
      // The project's brief: its versions and its editing. The home draws the brief's opening sentences itself (the overview's `lede`).
      { view_id: WORK_BRIEF_VIEW_ID, slot: "navigator", title: "简报", title_text: { key: "work-brief.view.brief" }, contribution_id: WORK_BRIEF_UI_CONTRIBUTION_ID,
        icon: "activity", hue: "indigo", order: 3, accepts_objects: true },
    ],
  },
};
