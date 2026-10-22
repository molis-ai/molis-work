import {BUILTIN_PLUGIN_CATALOG} from './builtin-plugins.js';
import type {PluginRegistration as BuiltinPluginEntry} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type {PluginSyncCollection} from '@molis-ai/molis-work-contracts/platform/plugin';

/** Bind by declared collection identity, never by its position in a manifest. No declaration grants consent. */
export function builtinSyncBindings(catalog:readonly BuiltinPluginEntry[]=BUILTIN_PLUGIN_CATALOG){
 return catalog.flatMap(entry=>(entry.manifest.sync?.collections??[]).flatMap(collection=>{
  const binding=Object.hasOwn(entry.sync??{},collection.id)?entry.sync![collection.id]:undefined;
  if(!binding)return [];
  const selection=identity(entry,collection),dependencies=collection.requires.map(id=>{
   const required=entry.manifest.sync!.collections.find(c=>c.id===id);if(!required)throw new Error('同步依赖集合未声明');return identity(entry,required);
  });
  return [{entry,collection,binding,selection,dependencies}];
 }));
}
function identity(entry:BuiltinPluginEntry,collection:PluginSyncCollection){return {plugin_id:entry.manifest.plugin_id,publisher_id:entry.manifest.publisher.publisher_id,publisher_signature:entry.manifest.publisher.signature,collection_id:collection.id,schema_version:collection.schema_version};}
