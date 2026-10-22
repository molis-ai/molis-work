import { SEARCH_ITEM_TAB_SURFACES } from './search-navigation.js';
export type {BuiltinSyncBinding} from '@molis-ai/molis-work-contracts/platform/plugin-registration';

/** Trusted binding declares its own tuple identity; transport never guesses a plugin's key. */
export function syncTupleLocation(surface:string,project:boolean,index?:number):(key:string)=>string|null {
 return key=>{
  const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.some(part=>typeof part!=='string'||part.length>500)||project&&parts.length!==3)return null;
  const base=project?'/projects/'+encodeURIComponent(String(parts[0]))+'/':'/',query=new URLSearchParams({openPlugin:surface});
  if(index!==undefined&&typeof parts[index]==='string'){query.set((SEARCH_ITEM_TAB_SURFACES as readonly string[]).includes(surface)?'openItem':'openRecord',parts[index]);}
  return base+'?'+query;
 };
}
