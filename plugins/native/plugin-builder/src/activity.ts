import type {BuildDocument,BuildSnapshot,BuildStep,UiNode} from './model.js';
/** Visible agent work. Every status here follows a real document change; nothing is timed or replayed. */
const MAX_STEPS=120;
const OPERATION_OF:Record<UiNode['kind'],BuildStep['operation']|undefined>={heading:undefined,form:'save',search:'search',filter:'filter',collection:'read',actions:'export',summary:'calculate'};
const CONNECT_LABEL:Record<NonNullable<BuildStep['operation']>,string>={read:'读取记录',save:'接通保存',search:'接通搜索',filter:'接通标签筛选',export:'接通导入导出',calculate:'接通汇总计算'};
export function recordStep(doc:BuildDocument,input:Omit<BuildStep,'at'>):BuildStep{
 const steps=doc.steps??=[];const at=new Date().toISOString();const existing=steps.find(s=>s.id===input.id);
 if(existing){Object.assign(existing,input,{at});return existing;}
 const step={...input,at};steps.push(step);
 while(steps.length>MAX_STEPS){const index=steps.findIndex(s=>s.status!=='queued'&&s.status!=='active'&&s.status!=='waiting');steps.splice(index<0?0:index,1);}
 return step;
}
export function settleStep(doc:BuildDocument,id:string,status:BuildStep['status'],detail?:string){
 const step=doc.steps?.find(s=>s.id===id);if(!step)return;step.status=status;step.at=new Date().toISOString();if(detail!==undefined)step.detail=detail;
}
/** Ends every open step of a stage, e.g. when a run is stopped or replaced. */
export function cancelOpenSteps(doc:BuildDocument,agents:BuildStep['agent'][],detail:string){
 for(const step of doc.steps??[])if(agents.includes(step.agent)&&['queued','active'].includes(step.status)){step.status='cancelled';step.detail=detail;step.at=new Date().toISOString();}
}
export function resolveDecisions(doc:BuildDocument,label:string){
 for(const step of doc.steps??[])if(step.action==='decide'&&step.status==='waiting'){step.status='done';step.label=label;step.at=new Date().toISOString();}
}
export const needsConnection=(node:UiNode)=>OPERATION_OF[node.kind]!==undefined;
/** Reading first so content can appear, then saving, then the rest in the order a user reaches them. */
const WIRING_ORDER:UiNode['kind'][]=['collection','form','search','filter','summary','actions'];
const byWiringOrder=(nodes:UiNode[])=>[...nodes].sort((a,b)=>WIRING_ORDER.indexOf(a.kind)-WIRING_ORDER.indexOf(b.kind));
/** Legacy drafts predate per-part wiring: there, a behavior meant every placed part was wired. */
export function connectedIds(doc:Pick<BuildDocument,'connected'|'behavior'|'nodes'>):Set<string>{
 if(!doc.behavior)return new Set();return new Set(doc.connected??doc.nodes.map(n=>n.id));
}
export function operationLive(doc:Pick<BuildDocument,'connected'|'behavior'|'nodes'>,operation:NonNullable<BuildStep['operation']>){
 const ids=connectedIds(doc);return doc.nodes.some(n=>OPERATION_OF[n.kind]===operation&&ids.has(n.id));
}
export function queueConnections(doc:BuildDocument){
 const ids=connectedIds(doc);
 for(const node of byWiringOrder([...doc.nodes,...doc.pendingNodes]))if(needsConnection(node)&&!ids.has(node.id)){const operation=OPERATION_OF[node.kind]!;recordStep(doc,{id:`connect:${node.id}`,agent:'behavior',action:'connect',label:CONNECT_LABEL[operation],target:node.id,operation,status:'queued'});}
}
/** One real placement of a part saved by an earlier build: it enters the shared document and is rendered from it. */
export function placeNext(doc:BuildDocument):UiNode|undefined{
 const node=doc.pendingNodes.shift();if(!node)return;doc.nodes.push(node);recordStep(doc,{id:`place:${node.id}`,agent:'ui',action:'place',label:`放入${node.label}`,target:node.id,status:'done'});return node;
}
/** One real wiring: the part's operation becomes callable (the record routes check this list). */
export function connectNext(doc:BuildDocument):UiNode|undefined{
 if(!doc.behavior)return;const ids=connectedIds(doc);const node=byWiringOrder(doc.nodes).find(n=>needsConnection(n)&&!ids.has(n.id));if(!node)return;
 doc.connected=[...ids,node.id];settleStep(doc,`connect:${node.id}`,'done');return node;
}
export function fullyWired(doc:BuildDocument){const ids=connectedIds(doc);return Boolean(doc.behavior)&&!doc.pendingNodes.length&&doc.nodes.every(n=>!needsConnection(n)||ids.has(n.id));}
export function snapshot(doc:BuildDocument):BuildSnapshot{return structuredClone({design:doc.design,nodes:doc.nodes,behavior:doc.behavior,connected:doc.behavior?[...connectedIds(doc)]:[]});}
