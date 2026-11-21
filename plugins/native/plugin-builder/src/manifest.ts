import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import {agentHostCapabilities as agent} from '@molis-ai/molis-work-contracts/services/agent-host';
import {projectDirectoryActions} from '@molis-ai/molis-work-contracts/modules/projects';
import {builderSync} from './sync-owner.js';
export const BUILDER_PLUGIN_ID='io.molis.work.plugin-builder';
export const BUILDER_PROJECT_PLUGIN_ID='plugin-builder';
export const BUILDER_UI_ID="io.molis.work.plugin-builder.ui.v1";
export const builderManifest:PluginManifest={
 schema_version:/* @version manifest.schema */ 1,host_api_version:/* @version host.api */ 1,plugin_id:BUILDER_PLUGIN_ID,version:/* @version product.release */ "0.1.0",name:'插件创作工作台',name_text: { key: "plugin-builder.directory.name" },summary:'用自然语言设计、构建并使用自己的插件。', summary_text: { key: "plugin-builder.directory.summary" },kind:'app',
 publisher:{publisher_id:'molis',signature:'official-plugin-builder-binding'},entrypoints:[{deployment:'local',entrypoint:'./index.js'}],
 permissions:[{permission:'storage:private',required:true,reason:'保存创作草稿、已发布定义和隔离的试用数据'}],
 capabilities:{provides:[],consumes:[agent.listRuntimes,agent.createSession,agent.readSession,agent.startRun,agent.readRun,agent.controlRun,projectDirectoryActions.get].map(x=>x.capability_id)},
 artifacts:{produces:[],consumes:[]},
 sync:builderSync,
 ui:{ locales: { default: "zh", available: ["zh", "en"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "plugin-builder.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "plugin-builder.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "plugin-builder.help.example-1" }, { key: "plugin-builder.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "plugin-builder.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "plugin-builder.help.advanced-summary" }, body: { key: "plugin-builder.help.advanced" } },
        ],
      }],
    },contributions:[BUILDER_UI_ID],views:[{view_id:'directory',slot:'navigator',title:'插件创作工作台',title_text: { key: "plugin-builder.directory.view-directory" },contribution_id:BUILDER_UI_ID,icon:'wand',hue:'indigo',order:57,rail:'extend'}]},
};
