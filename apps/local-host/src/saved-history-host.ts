import {resolve} from 'node:path';
import type {PrologueSavedHistoryPort} from '@molis-ai/molis-work-service-agent-host';
import {ActionError} from '@molis-ai/molis-work-contracts/platform/actions';
const readers=new Map<string,PrologueSavedHistoryPort>();
export function bindSavedHistory(home:string,port:PrologueSavedHistoryPort):()=>void {
 const key=resolve(home);if(readers.has(key)&&readers.get(key)!==port)throw new ActionError('actions.home_mismatch','会话历史已有 Home owner');readers.set(key,port);return ()=>{if(readers.get(key)===port)readers.delete(key);};
}
export function savedHistoryFor(home:string):PrologueSavedHistoryPort {const value=readers.get(resolve(home));if(!value)throw new ActionError('actions.plugin_unavailable','会话历史服务尚未装配');return value;}
