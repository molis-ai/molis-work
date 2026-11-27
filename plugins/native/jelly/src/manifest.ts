import { jellySync } from "./replication.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { JELLY_PLUGIN_ID } from "./contract.js";
import { JELLY_UI_CONTRIBUTION_ID } from "./ui.js";
import { JELLY_ACTIONS, JELLY_ACTION_PERMISSIONS } from "./actions.js";
import { localizeAction, localizePermission } from "./action-text.js";
import { JELLY_DATABASE } from "./database.js";
export const jellyManifest: PluginManifest = {
  summary: "日历和随手记，按天安排。", summary_text: { key: "jelly.directory.summary" },
  schema_version: /* @version manifest.schema */ 1, host_api_version: /* @version host.api */ 1, plugin_id: JELLY_PLUGIN_ID, version: /* @version product.release */ "0.1.0", name: "Jelly", kind: "native",
  publisher: { publisher_id: "molis", signature: "official-jelly-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机日程、分类和随手记" },
    ...JELLY_ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按每项能力的授权读写个人日程和随手记" })),
  ].map(localizePermission),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
  actions: [...JELLY_ACTIONS].map(localizeAction),
  // What another plugin's background task may be let read, one switch per group (specs/proactive-assistant/schedule-task-reads.md §3.2).
  // 日历 is the person's 日程 without the notes; 随手记 (full text, search) is a switch of its own.
  read_groups: [
    {
      group_id: "calendar",
      title: "日历",
      title_text: { key: "jelly.read-group.calendar.title" },
      description: "日程与分类",
      description_text: { key: "jelly.read-group.calendar.description" },
      actions: ["jelly.calendar.list", "jelly.item.get", "jelly.item.subject.read"],
    },
    {
      group_id: "notes",
      title: "随手记",
      title_text: { key: "jelly.read-group.notes.title" },
      description: "随手记全文与搜索",
      description_text: { key: "jelly.read-group.notes.description" },
      actions: ["jelly.note.list", "jelly.note.get", "jelly.note.subject.read", "jelly.content.list", "jelly.content.read"],
    },
  ],
  // Each partition's own calendar and notes (specs/unified-partition-plugins §4.2, batch 108); its open entries are the overview's events.
  databases: { partition: JELLY_DATABASE },
  overview_projection: { kinds: ["event"] },
  sync: jellySync,
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "jelly.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "jelly.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "jelly.help.example-1" }, { key: "jelly.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "jelly.help.scope" } },
        ],
      }],
    }, contributions: [JELLY_UI_CONTRIBUTION_ID], views: [{ view_id: "jelly", slot: "navigator", title: "Jelly", contribution_id: JELLY_UI_CONTRIBUTION_ID, icon: "calendar", hue: "mint", order: 35, group: "personal" }] },
};
