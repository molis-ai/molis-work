import type {GoalProjectApplication} from '../goal-project-application.js';
import type {MolisWorkProjectRuntime} from '../project-host.js';
import type {LocalHostProjectReference} from '@molis-ai/molis-work-contracts/platform/app-host';
import {EVENT_METHODS,InteractionObserver} from './observer.js';
/** Keep the synchronous Web application API and original exception semantics; use the already-owned runtime. */
export function observedWebGoalEvents(runtime:MolisWorkProjectRuntime,reference:LocalHostProjectReference):GoalProjectApplication['goalEvents']{
 const target=runtime.coordinator.goalEvents;
 return new Proxy(target,{get(object,key){
  const value=Reflect.get(object,key);if(typeof value!=='function')return value;
  const suffix=EVENT_METHODS[key as keyof typeof EVENT_METHODS];if(!suffix)return value.bind(object);
  return(...args:unknown[])=>{
   runtime.interactionObserver??=new InteractionObserver(runtime.store,runtime.coordinator,reference.board_id,reference.project_id);
   const input=typeof args[0]==='string'?{board_id:args[0],goal_id:args[1],event_id:args[2]}:args[0];
   const ticket=runtime.interactionObserver.before({capability_id:`io.molis.work.goals.events.${suffix}`,version:1,operation:['listGoals','readState','listEvents','listLatestEvents','listLatestTimeline','readEvent'].includes(String(key))?'query':'command'},input,'web.goal-events.v1');
   let result:unknown;try{result=value.apply(object,args);}catch(error){runtime.interactionObserver.after(ticket,error,true);throw error;}
   runtime.interactionObserver.after(ticket,result,false);return result;
  };
 }});
}
