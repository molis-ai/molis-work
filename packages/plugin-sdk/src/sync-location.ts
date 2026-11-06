/** The owner declares its stable tuple and navigation target; a location never grants authority. */
export function syncTupleLocation(surface:string,project:boolean,index:number|undefined=undefined,itemTab=false):(key:string)=>string|null {
 return key=>{
  const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.some(part=>typeof part!=='string'||part.length>500)||project&&parts.length!==3)return null;
  const base=project?'/projects/'+encodeURIComponent(String(parts[0]))+'/':'/',query=new URLSearchParams({openPlugin:surface});
  if(index!==undefined&&typeof parts[index]==='string')query.set(itemTab?'openItem':'openRecord',parts[index]);
  return base+'?'+query;
 };
}
