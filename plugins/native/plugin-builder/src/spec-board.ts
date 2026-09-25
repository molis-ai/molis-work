import type {Design,UiNode} from './model.js';
/**
 * The spec board: the only UI parts a build may use, with the conditions under which each is legal.
 * A selector (Jev, a rule, or the user) picks among the legal candidates; it never invents a part.
 */
export interface PartSpec {
 kind:UiNode['kind'];
 name:string;
 purpose:string;
 required:boolean;
 /** Required for this particular design even though not always, e.g. totals must be visible when calculations exist. */
 requiredWhen?(design:Design):boolean;
 /** Why the part cannot be used for this design, or null when it can. */
 unavailable(design:Design):string|null;
 label(design:Design):string;
}
export const FINISH='finish';
export const SPEC_BOARD:readonly PartSpec[]=[
 {kind:'heading',name:'标题区',purpose:'说明这个插件是什么，放在最上方',required:true,unavailable:()=>null,label:d=>d.title},
 {kind:'form',name:'录入入口',purpose:'打开表单，新增或编辑一条记录',required:true,unavailable:()=>null,label:d=>d.presentation?.addLabel||'添加记录'},
 {kind:'collection',name:'记录集合',purpose:'按主线设计的布局展示全部记录，可选择多项',required:true,unavailable:()=>null,label:d=>({cards:'卡片集合',list:'记录列表',table:'记录表格'})[d.layout]},
 {kind:'search',name:'搜索框',purpose:'按文字快速找到记录',required:false,unavailable:()=>null,label:d=>`搜索${d.title}`},
 {kind:'filter',name:'标签筛选',purpose:'按标签切换查看范围',required:false,unavailable:d=>d.fields.some(f=>f.type==='tags')?null:'设计里没有标签字段',label:()=>'按标签筛选'},
 {kind:'summary',name:'汇总',purpose:'显示记录数与数字合计',required:false,requiredWhen:d=>d.calculations.length>0,unavailable:d=>d.fields.some(f=>f.type==='number')||d.calculations.length?null:'设计里没有数字或计算字段',label:()=>'数据汇总'},
 {kind:'actions',name:'导入导出',purpose:'CSV 导入与导出所选记录',required:true,unavailable:()=>null,label:d=>d.allowImport&&d.allowExport?'导入与导出':d.allowExport?'导出':'导入'},
];
export interface PartCandidate {key:string;description:string}
export const isRequired=(spec:PartSpec,design:Design)=>spec.required||Boolean(spec.requiredWhen?.(design));
/** Legal next parts. The heading anchors the page, so it is the only legal first part. */
export function partCandidates(design:Design,placed:readonly UiNode[]):PartCandidate[]{
 const kinds=new Set(placed.map(n=>n.kind));
 if(!kinds.has('heading'))return [{key:'heading',description:describe(SPEC_BOARD[0]!)}];
 const open=SPEC_BOARD.filter(spec=>!kinds.has(spec.kind)&&spec.unavailable(design)===null);
 const candidates:PartCandidate[]=open.map(spec=>({key:spec.kind,description:describe(spec)}));
 if(open.every(spec=>!isRequired(spec,design)))candidates.push({key:FINISH,description:'完成：主线旅程需要的零件都已放入'});
 return candidates;
}
export function partNode(design:Design,kind:string):UiNode{
 const spec=SPEC_BOARD.find(item=>item.kind===kind);if(!spec)throw new Error(`规格板里没有「${kind}」零件`);
 const reason=spec.unavailable(design);if(reason)throw new Error(`${spec.name}不能用于这个设计：${reason}`);
 return {id:spec.kind,kind:spec.kind,label:spec.label(design)};
}
/** Rule selection, recorded as such: required parts first in spec-board order, then optional ones. */
export function ruleChoice(candidates:readonly PartCandidate[],design:Design):string{
 const keys=candidates.map(c=>c.key);
 const next:string|undefined=SPEC_BOARD.find(spec=>isRequired(spec,design)&&keys.includes(spec.kind))?.kind??SPEC_BOARD.find(spec=>keys.includes(spec.kind))?.kind;
 return next??FINISH;
}
export const partName=(kind:string)=>kind===FINISH?'完成装配':SPEC_BOARD.find(spec=>spec.kind===kind)?.name??kind;
function describe(spec:PartSpec){return `${spec.name}：${spec.purpose}`;}
/** The state Jev sees: the shared design and what is already on the page, never the records. */
export function selectionState(design:Design,placed:readonly UiNode[]){
 return JSON.stringify({plugin:{title:design.title,description:design.description,journey:design.journey,layout:design.layout,fields:design.fields.map(f=>({label:f.label,type:f.type})),calculations:design.calculations.map(c=>c.label),import:design.allowImport,export:design.allowExport},placed:placed.map(n=>partName(n.kind))});
}
