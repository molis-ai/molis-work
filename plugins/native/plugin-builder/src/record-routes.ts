import type {PluginRouteRequest} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {RecordStore} from './records.js';
export function bodyObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请求内容格式不正确');return value as Record<string,unknown>;}
export function requiredText(value:unknown,label:string,max=12000){if(typeof value!=='string'||!value.trim()||value.length>max)throw new Error(`${label}不能为空且不能超过 ${max} 字`);return value.trim();}
export function revisionOf(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<1)throw new Error('缺少有效版本，请刷新后重试');return Number(value);}
export function recordsResponse(records:RecordStore,request:PluginRouteRequest){
 if(request.method==='GET')return {rows:records.list({search:request.query.search,tag:request.query.tag}),summary:records.summary()};
 const body=bodyObject(request.body);
 switch(body.action){
  case 'save':return {record:records.save(bodyObject(body.values),body.id===undefined?undefined:requiredText(body.id,'记录'),body.id===undefined?undefined:revisionOf(body.revision))};
  case 'remove':records.remove(requiredText(body.id,'记录'),revisionOf(body.revision));return {ok:true};
  case 'import':return {rows:records.importCsv(requiredText(body.csv,'CSV',2_000_000))};
  case 'export':{
   if(body.ids!==undefined&&(!Array.isArray(body.ids)||body.ids.some(id=>typeof id!=='string')))throw new Error('导出选择格式不正确');
   return {csv:records.exportCsv(body.ids as string[]|undefined)};
  }
  default:throw new Error('未知数据操作');
 }
}
