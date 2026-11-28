import { fakeActionClient } from "@molis-ai/molis-work-test-kit";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { MolisWorkLocalHost, molisWorkHostProjectReference, hostContinuityActions } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { installProducers } from "./fixtures/installed-producers.js";
import { openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { WORK_PROGRESS_CONTINUITY_PROTOCOL, ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, startServer, memberClientId } from "@molis-ai/molis-work-server";
import type { ActionFactory } from "@molis-ai/molis-work-server";
import { restoreWorkAssets, readRestoredAssets } from "@molis-ai/molis-work-app-local-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

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
  let host=new MolisWorkLocalHost({homeDirectory:directory,completeText:null});
  const projectId='shared-project',goalId='PHONE-GOAL';
  const dbPath=join(directory,'project.sqlite');
  const db=new LocalProjectDatabase(dbPath),app=new GoalProjectApplication(db);
  app.initializeBoard({project_id:projectId,actor_id:'desktop',idempotency_key:'init'});
  app.goalEvents.createIntent({project_id:projectId,actor_id:'desktop',idempotency_key:'seed-goal',goal_id:goalId,title:'完成真实接续',outcome:'手机记录后桌面继续'});
  app.goalEvents.createIntent({project_id:projectId,actor_id:'desktop',idempotency_key:'private-goal',goal_id:'PRIVATE',title:'私人目标不得出现在共享响应'});
  installProducers(db.db,{plugin_id:'io.test.writer',artifact_types:['io.test.document']});
  openProjectVersionStores(db).artifacts.commands.registerVersion({...pinnedArtifact('操作说明'),project_id:projectId,artifact_id:'shared-artifact',version:2,actor_id:'desktop',artifact_type_id:'io.test.document',schema_version:1,
    producer:{plugin_id:'io.test.writer',plugin_version:'1.0.0',binding_signature:'original'},content:{kind:'inline',payload:{content:'实际固定成果正文'}},metadata:{title:'操作说明',source_path:'/private/home/never-export'},scope:'team_project',team_share_authorized:true});
  db.close();
  const ref=molisWorkHostProjectReference({projectId,databasePath:dbPath});
  let drop=false,hold:Promise<void>|null=null,entered:()=>void=()=>{};
  const factory:ActionFactory=({projectId,memberId,validate,signal})=>{
    const client=host.actionClient(ref);
    return {caller:{actor_id:memberClientId(memberId),project_id:projectId,audience:'user',actor_kind:'user',permissions:['goals:read','goals:write','artifacts:read'],allowed_actions:hostContinuityActions(),validate_authority:validate,signal},client:fakeActionClient({discover:c=>client.discover(c),invoke:async(c,a,i)=>{
      if(hold && a.capability_id==='goals.progress.record'){entered();await hold;}
      const result=await client.invoke(c,a,i);
      if(drop && a.capability_id==='goals.progress.record'){drop=false;throw Object.assign(new Error('response lost after commit'),{code:'actions.delivery_unknown'});}
      return result;
    }})};
  };
  let storage=openServerDatabase(join(directory,'server'));
  let identity=new Identity(storage.db),events=new ServerEvents(storage.db),service=new ContinuityService(storage.db,identity,events,factory);
  const owner=identity.createMember('桌面用户');
  service.registerProject({id:projectId,title:'设备接续',item_ids:[goalId],artifacts:[{artifact_id:'shared-artifact',version:2}]},owner.id);
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
    assert.equal(first.items.length,1);assert.equal(first.items[0].title,'完成真实接续');
    assert.match(first.artifacts[0].content,/实际固定成果正文/);assert.doesNotMatch(JSON.stringify(first),/PRIVATE|never-export|database_path/);
    const command={command_id:randomUUID(),project_id:projectId,item_id:goalId,cursor:first.items[0].cursor,summary:'手机已核对成果',next_step:'桌面继续验证',next_actor:'桌面用户'};
    drop=true;
    assert.equal((await phone.request('/continuity/api'+path+'/progress',command)).status,503);
    const committed=await desktop.get(path);assert.equal(committed.items[0].summary,command.summary);
    const committedCursor=committed.items[0].cursor;
    await running.close();storage.close();await host.close();
    host=new MolisWorkLocalHost({homeDirectory:directory,completeText:null});
    storage=openServerDatabase(join(directory,'server'));identity=new Identity(storage.db);events=new ServerEvents(storage.db);service=new ContinuityService(storage.db,identity,events,factory);
    running=await startServer({identity,events,continuity:service,port:0});
    const replay=await phone.post(path+'/progress',command);assert.equal(replay.replayed,true);
    assert.equal((await desktop.get(path)).items[0].cursor,committedCursor,'restart and lost response must not duplicate a Goal event');
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,summary:'different'})).status,409);
    const concurrent={...command,command_id:randomUUID(),cursor:committedCursor,summary:'并发重试只记一次'};
    const results=await Promise.all([phone.post(path+'/progress',concurrent),phone.post(path+'/progress',concurrent)]);
    assert.equal(results[0].event_id,results[1].event_id);
    assert.equal((storage.db.prepare("SELECT COUNT(*) AS n FROM mw_events WHERE kind='progress'").get() as { n: number }).n,2);
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID()})).status,409);
    const invitation=await desktop.post(path+'/invite',{role:'editor'});
    await member.post('/connect',{code:invitation.code,display_name:'第二位成员',device_label:'团队设备'});
    const shared=await member.get(path);assert.equal(shared.project.role,'editor');assert.equal(shared.members.length,2);
    await member.post(path+'/progress',{...command,command_id:randomUUID(),cursor:shared.items[0].cursor,summary:'团队成员已接手',next_actor:'第二位成员'});
    assert.equal((await phone.get(path)).items[0].next_actor,'第二位成员');
    const readInvite=await desktop.post(path+'/invite',{role:'viewer'});
    await viewer.post('/connect',{code:readInvite.code,display_name:'只读成员',device_label:'只读设备'});
    assert.equal((await viewer.get(path)).project.role,'viewer');
    assert.equal((await viewer.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID()})).status,403);
    assert.equal((await member.request('/continuity/api'+path+'/invite',{role:'owner'})).status,400);
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID(),item_id:'PRIVATE'})).status,403);
    assert.equal((await phone.request('/continuity/api'+path+'/progress',{...command,actor_id:'forged'})).status,400);
    assert.equal((await phone.request('/continuity/api/pair',{}, {origin:'https://evil.example'})).status,403);
    const deviceRows=await desktop.get('/session');const phoneId=deviceRows.devices.find((d:any)=>d.label==='手机').id;
    assert.equal((await member.request('/continuity/api/devices/revoke',{device_id:phoneId})).status,403);
    assert.equal((await phone.get('/session')).member.id,owner.id);
    const beforeHold=await member.get(path), memberId=(await member.get('/session')).member.id;
    let release!:()=>void;hold=new Promise<void>(resolve=>release=resolve);
    const reached=new Promise<void>(resolve=>entered=resolve);
    const pending=member.request('/continuity/api'+path+'/progress',{...command,command_id:randomUUID(),cursor:beforeHold.items[0].cursor,summary:'不应在撤回后写入'});
    await Promise.race([reached,new Promise((_,reject)=>setTimeout(()=>reject(new Error("write never reached hold")),10000))]);
    await desktop.post(path+'/revoke',{member_id:memberId});release();
    assert.equal((await pending).status,403);hold=null;
    assert.equal((await desktop.get(path)).items[0].cursor,beforeHold.items[0].cursor,'revocation must stop a write waiting before dispatch');
    assert.equal((await member.request('/continuity/api'+path)).status,403);
    await desktop.post('/devices/revoke',{device_id:phoneId});
    assert.equal((await phone.get('/session')).member,null);
    assert.equal((await phone.request('/continuity/api'+path)).status,401);
    const bundle=await desktop.get(path+'/assets');assert.doesNotMatch(JSON.stringify(bundle),/never-export|database_path/);
    // D0002-04: exporting a shared version grants no authority to share it in a destination Home.
    await assert.rejects(()=>restoreWorkAssets(bundle,join(directory,'refused-team-device')),{code:'actions.forbidden'});
    assert.ok(!(await readdir(directory)).includes('refused-team-device'));
    // A separate, explicitly personal input exercises permitted local restore; production never rewrites a team's scope.
    const personalBundle={...bundle,artifacts:bundle.artifacts.map((asset:typeof bundle.artifacts[number])=>({...asset,scope:'personal'}))};
    const unadopted=await mkdtemp(join(directory,'unadopted-'));
    await writeFile(join(unadopted,'retained.txt'),'retained');
    await assert.rejects(()=>restoreWorkAssets(personalBundle,unadopted),{code:'memory.unavailable'});
    assert.deepEqual(await readdir(unadopted),['retained.txt'],'refused Home has no recovery identity or catalog writes');
    assert.equal(await readFile(join(unadopted,'retained.txt'),'utf8'),'retained');
    const restored=await restoreWorkAssets(personalBundle,join(directory,'new-device'));
    assert.equal(restored.restored,1);assert.ok(restored.warnings.some(w=>w.includes('io.test.writer')));
    const moved=await readRestoredAssets(join(directory,'new-device'),projectId);
    assert.equal(moved.artifacts[0]?.artifact_id,'shared-artifact');assert.equal(moved.artifacts[0]?.version,2);
    assert.deepEqual(moved.artifacts[0]?.payload,{content:'实际固定成果正文'});
    await restoreWorkAssets(personalBundle,join(directory,'new-device'));assert.equal((await readRestoredAssets(join(directory,'new-device'),projectId)).artifacts.length,1);
    const tampered=structuredClone(personalBundle);tampered.artifacts[0].content.payload={content:'tampered'};
    await assert.rejects(()=>restoreWorkAssets(tampered,join(directory,'bad-device')),/摘要|内容/);
    const foreign=structuredClone(personalBundle);foreign.artifacts[0].content={kind:'reference',content_ref:'../../private-home',digest:'x',size_bytes:3,available:true};
    await assert.rejects(()=>restoreWorkAssets(foreign,join(directory,'bad-reference')),/引用/);
  } finally {await running.close();storage.close();await host.close();await rm(directory,{recursive:true,force:true});}
});

test("PEQ-09 Continuity discovers any plugin implementing WORK_PROGRESS_CONTINUITY_PROTOCOL and works for artifacts-only projects without Goals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-continuity-role-"));
  const storage = openServerDatabase(join(directory, "server"));
  const identity = new Identity(storage.db), events = new ServerEvents(storage.db);
  const owner = identity.createMember("Owner");
  const bootstrap = identity.code("bootstrap", owner.id).code;
  const session = identity.connect({ code: bootstrap, display_name: "Owner", device_label: "test" }, { headers: {} } as never, { setHeader() {} } as never, false);
  const pluginId = "io.thirdparty.milestones";
  const receipts = new Map<string, { event_id: string; replayed: boolean }>();
  let cursor = 3, summary = "初始状态";

  const makeView = (capability_id: string, kind: "query" | "operation", role: keyof typeof WORK_PROGRESS_CONTINUITY_PROTOCOL, options?: { providerId?: string; available?: boolean }): ActionView => {
    const ownerId = options?.providerId ?? pluginId;
    return {
      capability_id, version: 1,
      provider: { provider_id: ownerId, plugin_id: ownerId, kind: "plugin", title: ownerId === pluginId ? "Milestones" : "Disabled Provider" },
      action: {
        title: capability_id, description: capability_id, kind, scope: "project",
        audiences: ["user", "mcp"], permissions: [], input_schema: { type: "object" }, output_schema: { type: "object" },
        ...WORK_PROGRESS_CONTINUITY_PROTOCOL[role],
      },
      availability: options?.available === false ? { available: false, code: "actions.plugin_disabled", reason: "Plugin disabled" } : { available: true },
    };
  };

  let exposeProvider = false;
  let includeUnavailableFirst = false;
  const service = new ContinuityService(storage.db, identity, events, ({ projectId, memberId, validate, signal }) => ({
    caller: { actor_id: memberClientId(memberId), project_id: projectId, audience: "mcp", permissions: [], validate_authority: validate, signal },
    client: fakeActionClient({
      discover: async () => [
        ...(includeUnavailableFirst ? [
          makeView("disabled.states.read", "query", "states.read", { providerId: "io.disabled.tracker", available: false }),
          makeView("disabled.progress.record", "operation", "progress.record", { providerId: "io.disabled.tracker", available: false }),
          makeView("disabled.progress.receipt", "query", "progress.receipt", { providerId: "io.disabled.tracker", available: false }),
        ] : []),
        ...(exposeProvider ? [
          makeView("milestones.states.read", "query", "states.read"),
          makeView("milestones.progress.record", "operation", "progress.record"),
          makeView("milestones.progress.receipt", "query", "progress.receipt"),
        ] : []),
      ],
      invoke: async (_caller, action, raw) => {
        const input = raw as Record<string, unknown>;
        if (action.capability_id === "milestones.states.read") {
          return (input.goal_ids as string[]).map(id => ({
            goal_id: id,
            state: {
              intent: { title: "第三方里程碑" }, agreement: { outcome: "无需 Goals 即可跨设备接续" },
              work_status: "in_progress", goal_event_cursor: cursor, can_record: true,
              progress_summary: { summary, next_step: "继续", next_actor: "Owner", recorded_at: "2026-11-22T00:00:00.000Z" },
            },
          }));
        }
        if (action.capability_id === "milestones.progress.receipt") {
          return receipts.get(String(input.idempotency_key)) ?? null;
        }
        if (action.capability_id === "milestones.progress.record") {
          if (input.expected_goal_cursor !== cursor) throw new ActionError("milestones.stale_cursor", "stale", { kind: "conflict" });
          cursor += 1;
          summary = String(input.summary);
          const receipt = { event_id: `ev-${cursor}`, replayed: false };
          receipts.set(String(input.idempotency_key), receipt);
          return receipt;
        }
        throw new Error(`unexpected action ${action.capability_id}`);
      },
    }),
  }));

  try {
    // 1. Project without Goals / without any work-progress provider works cleanly for artifacts-only continuity.
    service.registerProject({ id: "no-goals", title: "纯成果项目", item_ids: [], artifacts: [] }, owner.id);
    const emptyRead = await service.read(session, "no-goals");
    assert.deepEqual(emptyRead.items, []);
    const emptyAssets = await service.assets(session, "no-goals");
    assert.deepEqual(emptyAssets.sections, []);

    // 2. Requesting progress items when no provider (or only a disabled provider) implements WORK_PROGRESS_CONTINUITY_PROTOCOL returns explicit unavailable.
    includeUnavailableFirst = true;
    service.registerProject({ id: "missing-provider", title: "缺进展插件", item_ids: ["M-1"], artifacts: [] }, owner.id);
    await assert.rejects(() => service.read(session, "missing-provider"), { code: "im.continuity.progress_unavailable" });

    // 3. A third-party plugin implementing WORK_PROGRESS_CONTINUITY_PROTOCOL works identically to Goals even when an unavailable provider precedes it in discovery.
    exposeProvider = true;
    service.registerProject({ id: "third-party", title: "第三方进展接续", item_ids: ["M-1"], artifacts: [] }, owner.id);
    const read = await service.read(session, "third-party");
    assert.equal(read.items.length, 1);
    assert.equal(read.items[0]!.title, "第三方里程碑");
    const saved = await service.progress(session, {
      command_id: randomUUID(), project_id: "third-party", item_id: "M-1", cursor: 3,
      summary: "第三方插件已记录进展", next_step: "验收", next_actor: "Owner",
    });
    assert.equal(saved.saved, true);
    assert.equal(saved.event_id, "ev-4");
    await assert.rejects(() => service.progress(session, {
      command_id: randomUUID(), project_id: "third-party", item_id: "M-1", cursor: 3,
      summary: "过期游标", next_step: "", next_actor: "",
    }), (error: unknown) => Boolean(error && typeof error === "object" && "status" in error && error.status === 409));
    const bundle = await service.assets(session, "third-party");
    assert.equal(bundle.sections.length, 1);
    assert.equal(bundle.sections[0]!.plugin_id, pluginId);
    assert.equal(bundle.sections[0]!.section_id, "work_progress");
  } finally {
    storage.close();
    await rm(directory, { recursive: true, force: true });
  }
});
