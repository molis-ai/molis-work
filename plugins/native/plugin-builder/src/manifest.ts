import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import {agentHostCapabilities as agent} from '@molis-ai/molis-work-contracts/services/agent-host';
import {projectsCapabilities} from '@molis-ai/molis-work-contracts/modules/projects';
import {builderAgentManifest} from './roles.js';
export const BUILDER_PLUGIN_ID='io.molis.work.plugin-builder';
export const BUILDER_PROJECT_PLUGIN_ID='plugin-builder';
export const BUILDER_UI_ID='io.molis.work.plugin-builder.ui.v1';
export const builderManifest:PluginManifest={
 schema_version:2,host_api_version:2,plugin_id:BUILDER_PLUGIN_ID,version:'1.0.0',name:'插件创作工作台',kind:'app',
 publisher:{publisher_id:'molis',signature:'official-plugin-builder-binding'},entrypoints:[{deployment:'local',entrypoint:'./index.js'}],
 permissions:[{permission:'storage:private',required:true,reason:'保存创作草稿、已发布定义和隔离的试用数据'}],
 capabilities:{provides:[],consumes:[agent.listRuntimes,agent.createSession,agent.readSession,agent.startRun,agent.readRun,agent.controlRun,projectsCapabilities.listWorkspaces].map(x=>x.capability_id)},
 artifacts:{produces:[],consumes:[]},agent:builderAgentManifest,
 routes:[
  {route_id:'builder.inspiration-asset',method:'GET',path:'/assets/inspiration-atlas.png'},
  {route_id:'builder.state',method:'GET',path:'/state'},
  {route_id:'builder.create',method:'POST',path:'/builds'},
  {route_id:'builder.read',method:'GET',path:'/builds/:id'},
  {route_id:'builder.action',method:'POST',path:'/builds/:id/action'},
  {route_id:'builder.preview',method:'GET',path:'/builds/:id/records'},
  {route_id:'builder.record',method:'POST',path:'/builds/:id/records'},
 ],
 ui:{contributions:[BUILDER_UI_ID],views:[{view_id:'directory',slot:'navigator',title:'插件创作工作台',contribution_id:BUILDER_UI_ID,icon:'grid',order:57}]},
};
