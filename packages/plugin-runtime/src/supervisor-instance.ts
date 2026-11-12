import type { PluginContribution } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginActiveInstance, PluginContributionSource } from './lifecycle.js';
import { pluginActivationOpen } from './action-scope.js';
/** A passive view of the current activation, sharing the same token used by active lifecycle admission. */
export function currentPluginInstance(input: {
  pluginId:string; enabled():boolean;
  state():{status:string;install_id:string|null}|undefined;
  tokens:Map<string,symbol>; contribution(installId:string, source?: (source: PluginContributionSource) => void):PluginContribution|null|undefined;
}):PluginActiveInstance|undefined {
  if(!input.enabled())return undefined;
  const state=input.state();if(!state||state.status!=='running'||state.install_id===null)return undefined;
  let origin: PluginContributionSource | undefined;
  const installId=state.install_id,contribution=input.contribution(installId, source => { origin = source; });
  if(!contribution||contribution.kind!=='app')return undefined;
  let token=input.tokens.get(input.pluginId);
  if(token===undefined){token=Symbol(input.pluginId);input.tokens.set(input.pluginId,token);}
  const active = () => input.tokens.get(input.pluginId)===token&&input.enabled()
    &&input.contribution(installId)===contribution&&input.state()?.status==='running';
  return {install_id:installId, contribution, active, source: () => origin && active() && pluginActivationOpen(origin.activation) ? origin : undefined};
}
