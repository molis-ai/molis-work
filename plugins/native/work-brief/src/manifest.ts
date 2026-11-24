import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { workBriefActions, workBriefPersonalActions } from "./actions.js";
import { WORK_BRIEF_DATABASE } from "./database.js";
import { briefArtifactPreview } from "./fix.js";
import { BRIEF_ARTIFACT_SCHEMA_VERSION, BRIEF_ARTIFACT_TYPE_ID, WORK_BRIEF_PLUGIN_ID } from "./identity.js";
import { workBriefSync } from "./replication.js";
import { WORK_BRIEF_VIEW_ID, workBriefPresentation, workBriefPresentationActions } from "./presentation.js";
import { WORK_BRIEF_UI_CONTRIBUTION_ID } from "./ui.js";

const PROJECT_ACTIONS = [...Object.values(workBriefActions), ...workBriefPresentationActions, briefArtifactPreview];
const HOME_ACTIONS = Object.values(workBriefPersonalActions);

/**
 * Work Brief: a project's brief (how each source stands, sentences with what they stand on, what waits for the person, next steps),
 * its versions and revisions, and a personal brief across the person's projects. One plugin in two halves of this one Manifest: each
 * project's half owns the project briefs and the page; the Home half owns the personal brief. It names no other plugin: sources are
 * whatever the action directory offers the caller (a home overview, an object reader), so a project without Goals is complete.
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
    { permission: "work-brief:read", required: true, reason: "读取简报、它的版本与依据" },
    { permission: "work-brief:write", required: true, reason: "保存、刷新、修改和固定简报" },
    { permission: "storage:private", required: true, reason: "简报的正文、版本、人工修改与下一步的处置" },
    { permission: "actions:delegate", required: true, reason: "以当前调用者的身份读各来源的概况与每条依据，并在本人点下一步时执行那个动作" },
    { permission: "artifact:write", required: true, reason: "把固定的版本发成成果" },
    { permission: "artifact:read", required: true, reason: "核对固定版本对应的成果" },
    { permission: "projects:reach", required: false, reason: "在个人简报里汇总你各个项目的简报里要你处理的事；不给时个人简报只有个人范围的事项" },
  ],
  presentation: workBriefPresentation,
  // Runs in the Home, and also as each project's instance (the registration says so). Each instance redeems only the actions it owns.
  runtime: { scope: "home" },
  actions: [...PROJECT_ACTIONS, ...HOME_ACTIONS],
  read_groups: [{ group_id: "work-brief", title: "简报", description: "项目的简报、它的版本与依据",
    actions: [workBriefActions.list.capability_id, workBriefActions.get.capability_id, "work-brief.subject.read", "work-brief.search.entries"] }],
  databases: { home: WORK_BRIEF_DATABASE },
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
