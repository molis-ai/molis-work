import { V_HOST_API, V_MANIFEST_SCHEMA, V_PACKAGE_PLUGINS_NATIVE_PLUGIN_BUILDER_MANIFEST_BUILDERMANIFEST } from "./versions.generated.js";
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import {agentHostCapabilities as agent} from '@molis-ai/molis-work-contracts/services/agent-host';
import {projectSettingsCapabilities} from '@molis-ai/molis-work-contracts/modules/projects';
import {builderSync} from './sync-owner.js';
export const BUILDER_PLUGIN_ID='io.molis.work.plugin-builder';
export const BUILDER_PROJECT_PLUGIN_ID='plugin-builder';
export const BUILDER_UI_ID=/* @version contract.io.molis.work.plugin-builder.ui "io.molis.work.plugin-builder.ui.v{version}" */ "io.molis.work.plugin-builder.ui.v1";
export const builderManifest:PluginManifest={
 schema_version:V_MANIFEST_SCHEMA,host_api_version:V_HOST_API,plugin_id:BUILDER_PLUGIN_ID,version:V_PACKAGE_PLUGINS_NATIVE_PLUGIN_BUILDER_MANIFEST_BUILDERMANIFEST,name:'插件创作工作台',name_en:'Plugin Studio',summary:'用自然语言设计、构建并使用自己的插件。',kind:'app',
 publisher:{publisher_id:'molis',signature:'official-plugin-builder-binding'},entrypoints:[{deployment:'local',entrypoint:'./index.js'}],
 permissions:[{permission:'storage:private',required:true,reason:'保存创作草稿、已发布定义和隔离的试用数据'}],
 capabilities:{provides:[],consumes:[agent.listRuntimes,agent.createSession,agent.readSession,agent.startRun,agent.readRun,agent.controlRun,projectSettingsCapabilities.workspaces].map(x=>x.capability_id)},
 artifacts:{produces:[],consumes:[]},
 sync:builderSync,
 ui:{contributions:[BUILDER_UI_ID],views:[{view_id:'directory',slot:'navigator',title:'插件创作工作台',title_en:'Plugin Studio',contribution_id:BUILDER_UI_ID,icon:'wand',hue:'indigo',order:57,rail:'extend'}]},
};
