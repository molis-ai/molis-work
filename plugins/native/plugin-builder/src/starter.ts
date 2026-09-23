import type {PluginPrivateStorage} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {BuildDocument, Design, RecordValue} from './model.js';
import {RecordStore} from './records.js';
import type {BuilderStore} from './store.js';
import {parseBehavior, parseCandidates, parseDesign, parseNodes} from './validation.js';

const design: Design = {
 id:'inspiration',title:'灵感库',description:'把好想法留在这里。',
 journey:['收集标题、笔记、封面与来源','浏览卡片，搜索内容并按标签筛选','编辑收藏，选择记录后导出 CSV'],
 acceptance:['新增和编辑的灵感在刷新后保留','搜索与标签筛选返回相符记录','预览示例与正式插件数据隔离','可导入 CSV，并导出所选记录'],
 fields:[
  {id:'title',label:'标题',type:'text',required:true},
  {id:'note',label:'笔记',type:'text',required:false},
  {id:'cover',label:'封面链接',type:'url',required:false},
  {id:'tags',label:'标签',type:'tags',required:false},
  {id:'source',label:'来源',type:'text',required:false},
  {id:'url',label:'原文链接',type:'url',required:false},
 ],
 calculations:[],layout:'cards',allowImport:true,allowExport:true,
 presentation:{title:'title',description:'note',image:'cover',tags:'tags',metadata:'source',link:'url',addLabel:'收集灵感'},
};
const samples: Record<string,RecordValue>[] = [
 {title:'空间里的秩序',note:'光线、材质与留白，让日常也变得安静而有力量。',cover:'https://molis.example/plugin-builder/samples/architecture',tags:['设计'],source:'示例来源：空间观察 · 2026-09-22',url:''},
 {title:'少，但更好',note:'真正重要的不是拥有更多，而是只保留必要的部分。',cover:'https://molis.example/plugin-builder/samples/book',tags:['阅读'],source:'示例来源：阅读摘记 · 2026-09-21',url:''},
 {title:'自然的节奏',note:'从一片叶子中，看到时间的秩序与生命的韧性。',cover:'https://molis.example/plugin-builder/samples/nature',tags:['设计'],source:'示例来源：自然手记 · 2026-09-20',url:''},
 {title:'在路上，看见更大的自己',note:'旅行不只是去远方，更是重新看见日常。',cover:'https://molis.example/plugin-builder/samples/lake',tags:['产品'],source:'示例来源：旅行笔记 · 2026-09-19',url:''},
];

/** A user-requested example, saved through the same draft and preview stores as normal builds. */
export function createInspirationStarter(store: BuilderStore, storage: PluginPrivateStorage): BuildDocument {
 const candidates = parseCandidates([
  {...design,id:'inspiration-cards',layout:'cards',rationale:'封面与笔记并排呈现，适合用图片回想灵感。'},
  {...design,id:'inspiration-list',layout:'list',rationale:'连续浏览标题、笔记和来源，适合快速回顾。'},
  {...design,id:'inspiration-table',layout:'table',rationale:'把字段放在同一行，适合集中整理来源与标签。'},
 ]);
 const {rationale:_rationale,...first} = candidates[0]!;
 const selected = parseDesign(first);
 const behavior = parseBehavior({calculations:[],allowImport:true,allowExport:true},selected);
 const nodes = parseNodes([
  {id:'heading',kind:'heading',label:'灵感库'},
  {id:'actions',kind:'actions',label:'导入与导出'},
  {id:'form',kind:'form',label:'收集灵感'},
  {id:'search',kind:'search',label:'搜索灵感'},
  {id:'filter',kind:'filter',label:'按标签筛选'},
  {id:'collection',kind:'collection',label:'灵感收藏'},
 ],selected);
 const draft = store.create('做一个收集灵感的插件，能保存、分类和检索。');
 const records = new RecordStore(storage,`preview:${draft.id}`,selected,behavior);
 for (const sample of samples) records.save(sample);
 return store.update(draft.id,draft.revision,doc=>{
  doc.example='inspiration';doc.title=selected.title;doc.phase='ready';
  doc.candidates=candidates;doc.design=selected;doc.nodes=nodes;doc.behavior=behavior;
  doc.messages.push({role:'assistant',text:'这是内置灵感库示例，没有运行模型。你可以收集、整理和回看，再把它改成自己的工具。'});
 });
}
