import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { LocalProjectDatabase } from "../apps/local-host/src/project-database.js";
import { GoalProjectApplication } from "../apps/local-host/src/goal-project-application.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, startServer, memberClientId, CONTINUITY_ACTIONS } from "../server/src/index.js";
import type { ActionFactory } from "../server/src/index.js";
import { restoreWorkAssets, readRestoredAssets } from "../apps/server/src/assets.js";

class Client {
  cookie="";
  constructor(readonly origin:()=>string) {}
  async request(path:string,input?:unknown,extra?:Record<string,string>) {
    const response=await fetch(this.origin()+path,{method:input===undefined?"GET":"POST",headers:{cookie:this.cookie,...(input===undefined?{}:{origin:this.origin(),"content-type":"application/json"}),...extra},body:input===undefined?undefined:JSON.stringify(input)});
    if(response.headers.has("set-cookie"))this.cookie=response.headers.get("set-cookie")!.split(";")[0]!;
    const value=await response.json();return {status:response.status,value};
  }
  async get(path:string) {const r=await this.request('/continuity/api'+path);assert.equal(r.status,200,JSON.stringify(r.value));return r.value;}
  async post(path:string,input:unknown) {const r=await this.request('/continuity/api'+path,input);assert.equal(r.status,200,JSON.stringify(r.value));return r.value;}
}

test("real Goal/Artifact actions survive phone retry, two members, revocation, restart and asset relocation", {timeout:120000}, async()=>{
  const directory=await mkdtemp(join(tmpdir(),'molis-continuity-'));
  const projectId='shared-project',boardId='shared-board',goalId='PHONE-GOAL';
  const dbPath=join(directory,'project.sqlite');
  const db=new LocalProjectDatabase(dbPath),app=new GoalProjectApplication(db);
  app.initializeBoard({board_id:boardId,title:'接续验证',actor_id:'desktop',idempotency_key:'init'});
  app.goalEvents.createIntent({board_id:boardId,actor_id:'desktop',idempotency_key:'seed-goal',goal_id:goalId,title:'完成真实接续',outcome:'手机记录后桌面继续'});
  app.goalEvents.createIntent({board_id:boardId,actor_id:'desktop',idempotency_key:'private-goal',goal_id:'PRIVATE',title:'私人目标不得出现在共享响应'});
  app.artifacts.commands.registerVersion({board_id:boardId,artifact_id:'shared-artifact',version:2,actor_id:'desktop',artifact_type_id:'io.test.document',schema_version:1,
    producer:{plugin_id:'io.test.writer',plugin_version:'1.0.0',binding_signature:'original'},content:{kind:'inline',payload:{content:'实际固定成果正文'}},metadata:{title:'操作说明',source_path:'/private/home/never-export'},scope:'team_project',team_share_authorized:true});
  db.close();
  const ref=molisWorkHostProjectReference({projectId,boardId,databasePath:dbPath});
  let host=new MolisWorkLocalHost({homeDirectory:directory,completeText:null});
  let drop=false,hold:Promise<void>|null=null,entered:()=>void=()=>{};
  const factory:ActionFactory=({projectId,memberId,validate,signal})=>{
    const client=host.actionClient(ref);
    return {caller:{actor_id:memberClientId(memberId),project_id:projectId,audience:'user',actor_kind:'user',permissions:['goals:read','goals:write','artifacts:read'],allowed_actions:CONTINUITY_ACTIONS,validate_authority:validate,signal},client:{discover:c=>client.discover(c),invoke:async(c,a,i)=>{
      if(hold && a.capability_id==='goals.progress.record'){entered();await hold;}
      const result=await client.invoke(c,a,i);
      if(drop && a.capability_id==='goals.progress.record'){drop=false;throw Object.assign(new Error('response lost after commit'),{code:'actions.delivery_unknown'});}
      return result;
    }}};
  };
  let storage=openServerDatabase(join(directory,'server'));
  let identity=new Identity(storage.db),events=new ServerEvents(storage.db),service=new ContinuityService(storage.db,identity,events,factory);
  const owner=identity.createMember('桌面用户');
  service.registerProject({id:projectId,title:'设备接续',goal_ids:[goalId],artifacts:[{artifact_id:'shared-artifact',version:2}]},owner.id);
  let running=await startServer({identity,events,continuity:service,port:0});
  const desktop=new Client(()=>running.origin),phone=new Client(()=>running.origin),member=new Client(()=>running.origin),viewer=new Client(()=>running.origin);
  const path=`/projects/${projectId}`;
  try {
    assert.equal((await desktop.get('/session')).member,null);
    const bootstrap=identity.code('bootstrap',owner.id).code;
    await desktop.post('/connect',{code:bootstrap,display_name:'桌面用户',device_label:'桌面'});
    const pair=await desktop.post('/pair',{});
    await phone.post('/connect',{code:pair.code,display_name:'同一用户',device_label:'手机'});
    assert.equal((await phone.get('/session')).member.id,owner.id);
    assert.equal((await member.request('/continuity/api/connect',{code:pair.code,display_name:'冒用',device_label:'第三台'})).status,401);
    const first=await phone.get(path);
    assert.equal(first.goals.length,1);assert.equal(first.goals[0].title,'完成真实接续');
    assert.match(first.artifacts[0].content,/实际固定成果正文/);assert.doesNotMatch(JSON.stringify(first),/PRIVATE|never-export|database_path/);
    const command={command_id:randomUUID(),project_id:projectId,goal_id:goalId,cursor:first.goals[0].cursor,revision:first.goals[0].revision,summary:'手机已核对成果',next_step:'桌面继续验证',next_actor:'桌面用户'};
    drop=true;
    assert.equal((await phone.request('/continuity/api'+path+'/progress',command)).status,503);
    const committed=await desktop.get(path);assert.equal(committed.goals[0].summary,command.summary);
    const committedCursor=committed.goals[0].cursor;
    await running.close();storage.close();await host.close();
    host=new MolisWorkLocalHost({homeDirectory:directory,completeText:null});
    storage=openServerDatabase(join(directory,'server'));identity=new Identity(storage.db);events=new ServerEvents(storage.db);service=new ContinuityService(storage.db,identity,events,factory);
    running=await startServer({identity,events,continuity:service,port:0});
    const replay=await phone.post(path+'/progress',command);assert.equal(replay.replayed,true);
    assert.equal((await desktop.get(path)).goals[0].cursor,committedCursor,'restart and lost response must not duplicate a Goal event');
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,summary:'different'})).status,409);
    const concurrent={...command,command_id:randomUUID(),cursor:committedCursor,summary:'并发重试只记一次'};
    const results=await Promise.all([phone.post(path+'/progress',concurrent),phone.post(path+'/progress',concurrent)]);
    assert.equal(results[0].event_id,results[1].event_id);
    assert.equal(storage.db.prepare("SELECT COUNT(*) AS n FROM mw_events WHERE kind='progress'").get().n,2);
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID()})).status,409);
    const invitation=await desktop.post(path+'/invite',{role:'editor'});
    await member.post('/connect',{code:invitation.code,display_name:'第二位成员',device_label:'团队设备'});
    const shared=await member.get(path);assert.equal(shared.project.role,'editor');assert.equal(shared.members.length,2);
    await member.post(path+'/progress',{...command,command_id:randomUUID(),cursor:shared.goals[0].cursor,summary:'团队成员已接手',next_actor:'第二位成员'});
    assert.equal((await phone.get(path)).goals[0].next_actor,'第二位成员');
    const readInvite=await desktop.post(path+'/invite',{role:'viewer'});
    await viewer.post('/connect',{code:readInvite.code,display_name:'只读成员',device_label:'只读设备'});
    assert.equal((await viewer.get(path)).project.role,'viewer');
    assert.equal((await viewer.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID()})).status,403);
    assert.equal((await member.request('/continuity/api'+path+'/invite',{role:'owner'})).status,400);
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID(),goal_id:'PRIVATE'})).status,403);
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,actor_id:'forged'})).status,400);
    assert.equal((await phone.request('/continuity/api/pair',{}, {origin:'https://evil.example'})).status,403);
    const deviceRows=await desktop.get('/session');const phoneId=deviceRows.devices.find((d:any)=>d.label==='手机').id;
    assert.equal((await member.request('/continuity/api/devices/revoke',{device_id:phoneId})).status,403);
    assert.equal((await phone.get('/session')).member.id,owner.id);
    const beforeHold=await member.get(path), memberId=(await member.get('/session')).member.id;
    let release!:()=>void;hold=new Promise<void>(resolve=>release=resolve);
    const reached=new Promise<void>(resolve=>entered=resolve);
    const pending=member.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID(),cursor:beforeHold.goals[0].cursor,summary:'不应在撤回后写入'});
    await Promise.race([reached,new Promise((_,reject)=>setTimeout(()=>reject(new Error("write never reached hold")),10000))]);
    await desktop.post(path+'/revoke',{member_id:memberId});release();
    assert.equal((await pending).status,403);hold=null;
    assert.equal((await desktop.get(path)).goals[0].cursor,beforeHold.goals[0].cursor,'revocation must stop a write waiting before dispatch');
    assert.equal((await member.request('/continuity/api'+path)).status,403);
    await desktop.post('/devices/revoke',{device_id:phoneId});
    assert.equal((await phone.get('/session')).member,null);
    assert.equal((await phone.request('/continuity/api'+path)).status,401);
    const bundle=await desktop.get(path+'/assets');assert.doesNotMatch(JSON.stringify(bundle),/never-export|database_path/);
    const restored=await restoreWorkAssets(bundle,join(directory,'new-device'));
    assert.equal(restored.restored,1);assert.ok(restored.warnings.some(w=>w.includes('io.test.writer')));
    const moved=await readRestoredAssets(join(directory,'new-device'),projectId);
    assert.equal(moved.artifacts[0]?.artifact_id,'shared-artifact');assert.equal(moved.artifacts[0]?.version,2);
    assert.deepEqual(moved.artifacts[0]?.payload,{content:'实际固定成果正文'});
    await restoreWorkAssets(bundle,join(directory,'new-device'));assert.equal((await readRestoredAssets(join(directory,'new-device'),projectId)).artifacts.length,1);
    const tampered=structuredClone(bundle);tampered.artifacts[0].content.payload={content:'tampered'};
    await assert.rejects(()=>restoreWorkAssets(tampered,join(directory,'bad-device')),/摘要|内容/);
    const foreign=structuredClone(bundle);foreign.artifacts[0].content={kind:'reference',content_ref:'../../private-home',digest:'x',size_bytes:3,available:true};
    await assert.rejects(()=>restoreWorkAssets(foreign,join(directory,'bad-reference')),/引用/);
  } finally {await running.close();storage.close();await host.close();await rm(directory,{recursive:true,force:true});}
});
