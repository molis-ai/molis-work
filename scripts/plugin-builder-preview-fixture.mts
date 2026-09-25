/**
 * Preview-only stand-ins for Prologue and Jev. They return fixed outputs so the builder's real
 * workflow, storage and rendering can be exercised locally; they never contact a model, and the
 * model list labels them as fixtures so nothing on screen can be mistaken for a real run.
 */
import {agentHostCapabilities as agent} from '@molis-ai/molis-work-contracts/services/agent-host';
import {projectSettingsCapabilities} from '@molis-ai/molis-work-contracts/modules/projects';
import type {ChoiceQuestion} from '@molis-ai/molis-work-plugin-builder';

const fields=[
 {id:'title',label:'标题',type:'text',required:true},{id:'note',label:'笔记',type:'text',required:false},
 {id:'cover',label:'封面链接',type:'url',required:false},{id:'tags',label:'标签',type:'tags',required:false},
 {id:'source',label:'来源',type:'text',required:false},{id:'url',label:'原文链接',type:'url',required:false},
];
const base={title:'灵感库',description:'把好想法留在这里。',journey:['随手收集标题、笔记与封面','按标签筛选、搜索回看','选中后导出 CSV'],acceptance:['新增和编辑的灵感在刷新后保留','搜索与标签筛选返回相符记录','可导出所选记录'],fields,calculations:[],allowImport:true,allowExport:true};
const cover=(name:string)=>`https://molis.example/plugin-builder/samples/${name}`;
const samples=[
 {title:'空间里的秩序',note:'光线、材质与留白，让日常也变得安静而有力量。',cover:cover('architecture'),tags:['设计','空间'],source:'空间观察',url:''},
 {title:'少，但更好',note:'真正重要的不是拥有更多，而是只保留必要的部分。',cover:cover('book'),tags:['阅读'],source:'阅读摘记',url:''},
 {title:'自然的节奏',note:'从一片叶子中，看到时间的秩序与生命的韧性。',cover:cover('nature'),tags:['自然'],source:'自然手记',url:''},
 {title:'在路上，看见更大的自己',note:'旅行不只是去远方，更是重新看见日常。',cover:cover('lake'),tags:['旅行'],source:'旅行笔记',url:''},
];
const presentation={title:'title',description:'note',image:'cover',tags:'tags',metadata:'source',link:'url',addLabel:'收集灵感'};
const outputs:Record<string,(task:Record<string,unknown>)=>string>={
 design:task=>task.mode==='revise'?JSON.stringify({summary:'按你的意思调整了这一处，其余已经成立的部分保持不变。',design:{...(task.currentDesign as object),description:'把好想法留在这里，随时找回。',layout:'list'}}):JSON.stringify({summary:'好的，我来帮你设计一个专注于收集、整理和回看灵感的插件。它会让你随时记录好想法，并以清晰的方式管理与查找。',candidates:[
  {...base,id:'inspiration-list',layout:'list',presentation,rationale:'连续阅读标题、笔记与来源，适合每天快速回顾。',samples},
  {...base,id:'inspiration-table',layout:'table',presentation,rationale:'字段并排成行，适合集中整理来源与标签。',samples},
  {...base,id:'inspiration-cards',layout:'cards',presentation,rationale:'封面与笔记一起呈现，用图片唤起灵感。',samples},
 ]}),
 behavior:()=>JSON.stringify({calculations:[],allowImport:true,allowExport:true}),
};
const readsToFinish:Record<string,number>={design:4,behavior:7};
export class PreviewFixtureRuntime {
 private sessions=0;private readonly runs=new Map<string,{role:string;reads:number;task:Record<string,unknown>}>();
 constructor(private readonly directory:string){}
 async invoke<Input,Output>(definition:{capability_id:string},args:Input):Promise<Output>{
  const input=args as unknown as unknown[];
  if(definition.capability_id===projectSettingsCapabilities.workspaces.capability_id)return [{workspace_id:'preview',display_name:'本地预览工作区',canonical_path:this.directory,realpath_verified:true}] as Output;
  if(definition.capability_id===agent.listRuntimes.capability_id)return [{runtime_id:'prologue'}] as Output;
  if(definition.capability_id===agent.createSession.capability_id)return {runtime_id:'prologue',session_id:`preview-session-${++this.sessions}`} as Output;
  if(definition.capability_id===agent.startRun.capability_id){const request=input[1] as {role_id:string;task:string;session:{session_id:string}};const id=`preview-run-${this.runs.size+1}`;this.runs.set(id,{role:request.role_id,reads:0,task:JSON.parse(request.task)});return {ref:{run_id:id,session_id:request.session.session_id}} as Output;}
  if(definition.capability_id===agent.readRun.capability_id){const ref=input[1] as {run_id:string};const run=this.runs.get(ref.run_id)!;run.reads+=1;const done=run.reads>=(readsToFinish[run.role]??3);return {ref,phase:done?'completed':'running',turns:done?[{kind:'assistant',text:outputs[run.role]!(run.task)}]:[]} as Output;}
  if(definition.capability_id===agent.controlRun.capability_id)return undefined as Output;
  throw new Error(`预览替身不支持 ${definition.capability_id}`);
 }
}
/** A fixed chooser in Jev's seat. Its model name says so; it prefers the journey order below. */
const ORDER=['heading','form','search','filter','collection','actions','summary','finish'];
let asked=0;const miss=Number(process.argv[process.argv.indexOf('--fixture-jev-miss')+1]||0);
/** `--fixture-jev-miss N` makes the Nth answer fall outside the candidates, to show the hand-over to the user. */
export async function previewChoose(question:ChoiceQuestion){
 await new Promise(done=>setTimeout(done,700));
 if(++asked===miss)return {choice:'banner',model:'fixture-jev（预览替身）',elapsedMs:700,confidence:null};
 const keys=question.candidates.map(c=>c.key);
 return {choice:ORDER.find(k=>keys.includes(k))??keys[0]!,model:'fixture-jev（预览替身）',elapsedMs:700,confidence:null};
}
