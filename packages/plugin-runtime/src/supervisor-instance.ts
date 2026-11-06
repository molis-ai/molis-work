import type { PluginContribution } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginActiveInstance } from './lifecycle.js';
/** A passive view of the current activation, sharing the same token used by active lifecycle admission. */
export function currentPluginInstance(input: {
  pluginId:string; enabled():boolean;
  state():{status:string;install_id:string|null}|undefined;
  tokens:Map<string,symbol>; contribution(installId:string):PluginContribution|null|undefined;
}):PluginActiveInstance|undefined {
  if(!input.enabled())return undefined;
  const state=input.state();if(!state||state.status!=='running'||state.install_id===null)return undefined;
  const installId=state.install_id,contribution=input.contribution(installId);
  if(!contribution||contribution.kind!=='app')return undefined;
  let token=input.tokens.get(input.pluginId);
  if(token===undefined){token=Symbol(input.pluginId);input.tokens.set(input.pluginId,token);}
  return {install_id:installId,contribution,active:()=>input.tokens.get(input.pluginId)===token&&input.enabled()
    &&input.contribution(installId)===contribution&&input.state()?.status==='running'};
}
