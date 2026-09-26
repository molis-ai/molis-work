import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog as withCatalog } from "../apps/desktop/src/project-catalog.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { createDesktopWebHost } from "../apps/desktop/src/web-host.js";
const createMolisWorkWebServer=createDesktopWebHost({ptyClientFilePath:()=>""});
import { configureMemberActions } from "../apps/server/src/admin-grants.js";
import { gatewayFactory } from "../apps/server/src/gateway.js";
import { CONTINUITY_ACTIONS } from "../server/src/continuity/actions.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";

test("local administrator grants through the protected owner API and gateway keeps member actors separate",{timeout:120000},async()=>{
  const home=await mkdtemp(join(tmpdir(),'continuity-gateway-'));
  const project=await withCatalog({homeDirectory:home},c=>c.createProject({display_name:'Shared gateway',actor_id:'user'}));
  const host=new MolisWorkLocalHost({homeDirectory:home,completeText:null});
  const ref=molisWorkHostProjectReference({projectId:project.project_id,boardId:project.board_id,databasePath:project.database_path});
  const local=host.actionClient(ref),owner={actor_id:'owner',project_id:project.project_id,audience:'user' as const,permissions:['goals:read','goals:write']};
  await local.invoke(owner,goalsActions.create,{goal_id:'gateway-goal',title:'跨进程记录',idempotency_key:'seed'});
  const web=createMolisWorkWebServer({homeDirectory:home,localHost:host});
  await new Promise<void>(resolve=>web.listen(0,'127.0.0.1',resolve));
  const address=web.address();assert.ok(address && typeof address==='object');const url=`http://127.0.0.1:${address.port}`;
  const factory=gatewayFactory({url,homeDirectory:home});
  const first=factory({projectId:project.project_id,memberId:'member-a',validate:()=>{},signal:new AbortController().signal});
  const second=factory({projectId:project.project_id,memberId:'member-b',validate:()=>{},signal:new AbortController().signal});
  const admin={hostUrl:url,controlTokenFile:join(home,'config/web-control-token'),projectId:project.project_id};
  const action=(id:string)=>CONTINUITY_ACTIONS.find(a=>a.capability_id===id)!;
  try {
    assert.equal((await first.client.discover(first.caller)).some(a=>a.capability_id==='goals.progress.record'),false);
    await configureMemberActions({...admin,memberId:'member-a',role:'editor'});
    await configureMemberActions({...admin,memberId:'member-b',role:'viewer'});
    assert.ok((await first.client.discover(first.caller)).some(a=>a.capability_id==='goals.progress.record'));
    assert.equal((await second.client.discover(second.caller)).some(a=>a.capability_id==='goals.progress.record'),false);
    const state=await first.client.invoke(first.caller,action('goals.state.read'),{goal_id:'gateway-goal'}) as {goal_event_cursor:number};
    const input={goal_id:'gateway-goal',idempotency_key:randomUUID(),based_on_cursor:state.goal_event_cursor,expected_goal_cursor:state.goal_event_cursor,summary:'真实Gateway跨进程进展'};
    const saved=await first.client.invoke(first.caller,action('goals.progress.record'),input) as {event_id:string;progress_summary:{actor_id:string}};
    assert.equal(saved.progress_summary.actor_id,'runtime:cross-device:member-a');
    const receipt=await first.client.invoke(first.caller,action('goals.progress.receipt'),{goal_id:input.goal_id,idempotency_key:input.idempotency_key}) as {event_id:string};
    assert.equal(receipt.event_id,saved.event_id);
    assert.equal(await second.client.invoke(second.caller,action('goals.progress.receipt'),{goal_id:input.goal_id,idempotency_key:input.idempotency_key}),null);
    await assert.rejects(second.client.invoke(second.caller,action('goals.progress.record'),{...input,idempotency_key:randomUUID()}));
    await configureMemberActions({...admin,memberId:'member-a',role:'revoked'});
    await assert.rejects(first.client.invoke(first.caller,action('goals.progress.record'),{...input,idempotency_key:randomUUID()}));
  } finally {await new Promise<void>(resolve=>{web.closeAllConnections();web.close(()=>resolve());});await host.close();await rm(home,{recursive:true,force:true});}
});
