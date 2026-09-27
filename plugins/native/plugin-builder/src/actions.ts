import type {ActionAudience,ActionDefinition,ActionSchema} from '@molis-ai/molis-work-contracts/platform/actions';

const id={type:'string',minLength:1,maxLength:200};
const revision={type:'integer',minimum:0};
const result:ActionSchema={type:'object'};
/** Drafts, briefs and edits only accept fields the workflow itself validates; the contract names the identity it acts on. */
const open=(properties:Record<string,unknown>,required:readonly string[]):ActionSchema=>({type:'object',properties,required});
/** Reading and starting drafts can be offered to authorized helpers; building, publishing and removing are the person's own steps. */
const SHARED:readonly ActionAudience[]=['user','agent','mcp'];
const LOCAL:readonly ActionAudience[]=['user'];
function define(name:string,title:string,description:string,operation:'query'|'command',input:ActionSchema,audiences:readonly ActionAudience[]):ActionDefinition<Record<string,unknown>,unknown>{
 return {capability_id:`builder.builds.${name}`,version:1,operation,action:{title,description,kind:operation==='query'?'query':'operation',scope:'project',audiences,
  permissions:['storage:private'],subject_kinds:['plugin_build'],input_schema:input,output_schema:result}};
}
/** Edits made while shaping a draft: they change the draft only and keep a history the person can undo. */
export const BUILDER_EDIT_ACTIONS=['part','design','choose','resume','revise','message','layout','node','undo'] as const;
/** The Plugin Builder's business surface; the Runtime instance redeems these and the old routes only forward to them. */
export const builderActions={
 list:define('list','插件草稿','读取本项目的插件草稿、构建进度与可用配置','query',{type:'object',properties:{},additionalProperties:false},SHARED),
 create:define('create','新建插件草稿','按一句需求新建草稿，或从示例开始；不会调用模型','command',open({brief:{type:'string',maxLength:20_000},starter:{enum:['inspiration']}},[]),SHARED),
 read:define('read','读取插件草稿','读取一份草稿及其已发布版本','query',open({id},['id']),SHARED),
 advance:define('advance','继续构建','让构建进入下一步；需要模型和工作区时按所选配置执行','command',open({id},['id']),LOCAL),
 pause:define('pause','暂停构建','暂停正在进行的构建，草稿保留','command',open({id},['id']),LOCAL),
 stop:define('stop','停止构建','停止正在进行的构建，草稿保留','command',open({id},['id']),LOCAL),
 edit:define('edit','修改插件草稿','按读取时的修订号修改草稿：选择方案、补充需求、调整布局或零件、撤销等','command',
  open({id,action:{enum:[...BUILDER_EDIT_ACTIONS]},revision},['id','action']),LOCAL),
 publish:define('publish','发布插件','把草稿发布为本项目可安装的插件版本；可声明与旧版本数据直接兼容或升级时校验','command',
  open({id,revision,compatibility:{enum:['compatible','validate']}},['id','revision']),LOCAL),
 upgrade:define('upgrade','升级已安装插件','把本项目已安装的插件升级到草稿的指定发布版本','command',open({id,revision,version:revision},['id','revision','version']),LOCAL),
 remove:define('remove','删除插件草稿','按读取时的修订号删除草稿；已发布版本保留','command',open({id,revision},['id','revision']),LOCAL),
};
export const BUILDER_ACTIONS:readonly ActionDefinition[]=Object.values(builderActions);
