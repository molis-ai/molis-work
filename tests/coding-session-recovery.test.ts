import assert from "node:assert/strict";
import test from "node:test";
import type { PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { CODING_PROJECT_DATABASE, CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { codingFixtureRoutes as codingRoutes } from "./fixtures/coding-surface.js";
import { noEffect } from "./fixtures/coding-sessions.js";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";

test("one unreadable runtime history does not hide other sessions or lose its draft", async () => {
  const db = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["board"]);
  const sessions = new CodingSessionStore(db);
  const at = "2026-09-20T00:00:00Z";
  for (const id of ["broken", "safe"]) await sessions.create(noEffect, { project_id: "board", session_id: id, title: id, runtime_id: "prologue", at });
  await sessions.setRuntimeSession(noEffect, "board", "broken", "sdk-broken", at);
  await sessions.setState(noEffect, "board", "broken", "done", at);
  const drafts = new Map([["draft:broken", "不要丢掉未提交的要求"]]);
  // The Agent Host's actions answer an empty list here, but the broken session's history cannot be read.
  const answer = { invoke: async (definition: { capability_id: string }) => {
    if (definition.capability_id === agent.readSession.capability_id) throw new Error("SESSION_HISTORY_UNAVAILABLE");
    return [];
  } };
  const context = { project_id: "board", plugin_id: "io.molis.work.coding", services: {
    storage: { get: (key: string) => drafts.get(key) }, actions: answer,
  } } as unknown as PluginStartContext;
  const routes = codingRoutes(context, sessions);
  const call = async (id: string, params = {}) => {
    const route = routes.find(route => route.route_id === id)!;
    return await route.handle({ params } as PluginRouteRequest);
  };
  try {
    const state = await call("coding.state");
    assert.equal(state.status, 200);
    const rows = (state.body as { sessions: Array<{session_id:string;state:string}> }).sessions;
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.session_id === "broken")?.state, "reconcile-required");
    assert.equal(rows.find(row => row.session_id === "safe")?.state, "idle");
    const read = await call("coding.read-session", { sessionId: "broken" });
    assert.equal(read.status, 200);
    assert.equal((read.body as {draft:string}).draft, drafts.get("draft:broken"));
    assert.equal((read.body as {recovery_required:boolean}).recovery_required, true);
    assert.equal(sessions.get("board", "broken").runtime_session_id, "sdk-broken");
    assert.equal(sessions.get("board", "broken").updated_at, at);
  } finally { db.close(); }
});

test("command receipt route binds the selected app session and exact runtime run before reading", async () => {
  const db = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["board"]);
  const sessions = new CodingSessionStore(db);
  await sessions.create(noEffect, { project_id: "board", session_id: "app-session", title: "检查", runtime_id: "prologue", at: "2026-09-20T00:00:00Z" });
  await sessions.setRuntimeSession(noEffect, "board", "app-session", "sdk-session", "2026-09-20T00:00:00Z");
  const reads: unknown[] = [];
  const context = codingContext({ agent: { invoke: async (definition: { capability_id: string }, args: unknown[]) => {
    if (definition.capability_id === agent.readSession.capability_id) return { runs: [{ session_id: "sdk-session", run_id: "owned" }] };
    if (definition.capability_id === agent.readCommandOutput.capability_id) { reads.push(args); return { exit_code: 7, stdout: "saved", stderr: "check failed" }; }
    throw new Error("unexpected capability");
  } } });
  const route = codingRoutes(context, sessions).find(route => route.route_id === "coding.command-output")!;
  try {
    const call = (runId: string) => route.handle({ params: { sessionId: "app-session", runId, callId: "call" } } as PluginRouteRequest);
    assert.equal((await call("other")).status, 400); assert.equal(reads.length, 0);
    const result = await call("owned");assert.equal(result.status, 200);assert.equal((result.body as {exit_code:number}).exit_code, 7);
    assert.deepEqual(reads, [[{runtime_id:"prologue",session_id:"sdk-session"},{run_id:"owned",call_id:"call"}]]);
  } finally { db.close(); }
});

/**
 * A Coding context in project `board` with the services a test gives; the rest of the context is not read by these routes.
 * The Agent Host's actions answer through the test's `agent` fake, after the route's write fence.
 */
const codingContext=({agent:host,...services}:{agent:{invoke:(definition:{capability_id:string},args:unknown[])=>Promise<unknown>}}&Record<string,unknown>)=>({project_id:'board',plugin_id:'io.molis.work.coding',
  services:{actions:{invoke:async(definition:{capability_id:string},input:unknown[],control?:{beforeEffect():Promise<void>})=>{await control?.beforeEffect();return host.invoke(definition,input);}},...services}}) as unknown as PluginStartContext;

test("answer route preserves the original run and questionnaire, rejects foreign runs and malformed selections",async()=>{
  const db = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["board"]);
  const sessions=new CodingSessionStore(db),at='2026-09-20T00:00:00Z';
  await sessions.create(noEffect, {project_id:'board',session_id:'app',title:'问卷',runtime_id:'prologue',at});await sessions.setRuntimeSession(noEffect, 'board','app','sdk',at);
  let phase='awaiting-input';const delivered:unknown[]=[];
  const context=codingContext({agent:{invoke:async(definition:{capability_id:string},args:unknown[])=>{
    if(definition.capability_id===agent.readSession.capability_id)return {runs:[{session_id:'sdk',run_id:'owned'}]};
    if(definition.capability_id===agent.readRun.capability_id)return {phase,awaiting_input:[]};
    if(definition.capability_id===agent.controlRun.capability_id){delivered.push(args);return;}
    throw new Error('unexpected capability');
  }}});
  const route=codingRoutes(context,sessions).find(item=>item.route_id==='coding.control-run')!;
  const call=(body:unknown)=>route.handle({params:{sessionId:'app'},body} as PluginRouteRequest);
  const answer={kind:'answer',run_id:'owned',pending_id:'original',pending_revision:7,answers:[{question:1,indexes:[2,4],other:'保留原文'}]};
  try {
    // A run of another session is not found here, which also says nothing of whether it exists elsewhere (AC-08, #708).
    const refused=async(body:unknown)=>{const {status,body:reply}=await call(body);return [status,(reply as {code?:string}).code];};
    assert.deepEqual(await refused({...answer,run_id:'foreign'}),[404,'coding.run_not_found']);
    assert.equal((await call({...answer,pending_revision:0})).status,400);
    assert.equal((await call({...answer,answers:[{question:1,indexes:['invented']}]})).status,400);
    assert.equal(delivered.length,0);
    assert.equal((await call(answer)).status,200);
    assert.deepEqual(delivered,[[{runtime_id:'prologue',session_id:'sdk'},{session_id:'sdk',run_id:'owned'},
      {kind:'answer',pending_id:'original',pending_revision:7,answers:answer.answers}]]);
    const verbatim='  星河购物车 <保留原文>\n';
    assert.equal((await call({...answer,answers:undefined,text:verbatim})).status,200);
    assert.deepEqual(delivered[1],[{runtime_id:'prologue',session_id:'sdk'},{session_id:'sdk',run_id:'owned'},
      {kind:'answer',pending_id:'original',pending_revision:7,text:verbatim}]);
    assert.equal((await call({...answer,answers:undefined,text:' \n '})).status,400);
    phase='stopped';assert.deepEqual(await refused(answer),[409,'coding.round_ended'],'an answer to an ended round');assert.equal(delivered.length,2);
  }finally{db.close();}
});

// BL-156 (specs/ai-interaction-experience §15.9): an answer to a round parked at a restart ends that round; Coding opens the
// next one the way the parked round started, and says when it could not. A busy session is read once and tried once more.
test("AC-07 an answer to a round parked at a restart opens the next round, or says why not; busy, one look and one more try",async()=>{
  const db = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["board"]);
  const sessions=new CodingSessionStore(db),at='2026-10-17T00:00:00Z';
  await sessions.create(noEffect, {project_id:'board',session_id:'app',title:'问卷',runtime_id:'prologue',at});await sessions.setRuntimeSession(noEffect, 'board','app','sdk',at);
  const saved=new Map<string,string>(),calls:string[]=[];let busy=0;
  const context=codingContext({storage:{get:(key:string)=>saved.get(key)??null,set:(key:string,value:string)=>{saved.set(key,value);},delete:(key:string)=>{saved.delete(key);}},
    agent:{invoke:async(definition:{capability_id:string})=>{
      calls.push(definition.capability_id);
      if(definition.capability_id===agent.readSession.capability_id)return {runs:[{session_id:'sdk',run_id:'parked'}]};
      if(definition.capability_id===agent.readRun.capability_id)return {phase:'reconcile-required',awaiting_input:[{pending_id:'asked',pending_revision:1,parked:true}]};
      if(definition.capability_id===agent.controlRun.capability_id||definition.capability_id===agent.inspectRecovery.capability_id)return {runs:[],blockers:[]};
      // The first thing a round reads; a session still being recovered refuses it the way the Agent Host does.
      if(definition.capability_id===projectSettingsCapabilities.workspaces.capability_id){if(busy-->0)throw Object.assign(new Error('这个会话正在恢复，请稍后再试'),{code:'agent.session_busy'});return [];}
      throw new Error('unexpected capability '+definition.capability_id);
  }}});
  const route=codingRoutes(context,sessions).find(item=>item.route_id==='coding.control-run')!;
  const call=async()=>(await route.handle({params:{sessionId:'app'},body:{kind:'answer',run_id:'parked',pending_id:'asked',pending_revision:1,answers:[{question:0,value:45}]}} as PluginRouteRequest)).body as {next_round?:{started:boolean;reason?:string};message:string};
  try {
    const unknown=await call();
    assert.deepEqual(unknown.next_round,{started:false,reason:'读不到这一轮是怎样开始的'},'without how the parked round started, no round is guessed');
    assert.equal(unknown.message,'已回答、下一轮没能开始：读不到这一轮是怎样开始的。回答留在排队里，点「从断点继续」再开始。');
    saved.set('last-start:app',JSON.stringify({intent:'discuss',provider_id:'p',model_id:'m',workspace_id:'w',actor_id:'web-user',origin_task:'约复盘会'}));
    busy=2;calls.length=0;
    const refused=await call();
    assert.equal(calls.filter(id=>id===projectSettingsCapabilities.workspaces.capability_id).length,2,'busy: the round is tried once more, not in a loop');
    assert.equal(calls.filter(id=>id===agent.inspectRecovery.capability_id).length,1,'after one look at the session');
    assert.equal(refused.next_round?.started,false);
    assert.equal(refused.next_round?.reason,'这个会话正在恢复，请稍后再试');
    busy=1;calls.length=0;
    const later=await call();
    assert.equal(later.next_round?.reason,'请先为这个项目选择已授权的工作区目录','busy once, the second try is a real start, refused here for its own reason');
    assert.equal(calls.filter(id=>id===agent.controlRun.capability_id).length,1,'the answer itself was handed over once');
  }finally{db.close();}
});

test("AC-07 the round after a parked answer is started by the one who answered, not by who started the parked round",async()=>{
  const db = memoryPluginDatabase(CODING_PROJECT_DATABASE.schema, ["board"]);
  const sessions=new CodingSessionStore(db),at='2026-10-18T00:00:00Z';
  await sessions.create(noEffect, {project_id:'board',session_id:'app',title:'问卷',runtime_id:'prologue',at});await sessions.setRuntimeSession(noEffect, 'board','app','sdk',at);
  // The parked round was started by someone else; what is saved of it names them.
  const saved=new Map([['last-start:app',JSON.stringify({intent:'discuss',provider_id:'p',model_id:'m',workspace_id:'w',actor_id:'who-started',origin_task:'约复盘会'})]]);
  const started:Array<{actor_id?:string}>=[];
  const view={phase:'reconcile-required',awaiting_input:[{pending_id:'asked',pending_revision:1,parked:true}],frozen:{history:'session',text_materials:[]},usage:{}};
  const context=codingContext({storage:{get:(key:string)=>saved.get(key)??null,set:(key:string,value:string)=>{saved.set(key,value);},delete:(key:string)=>{saved.delete(key);}},
    agent:{invoke:async(definition:{capability_id:string},args:unknown[])=>{
      if(definition.capability_id===agent.readSession.capability_id)return {runs:[{session_id:'sdk',run_id:'parked'}]};
      if(definition.capability_id===agent.readRun.capability_id)return view;
      if(definition.capability_id===agent.controlRun.capability_id)return;
      if(definition.capability_id===projectSettingsCapabilities.workspaces.capability_id)return [{workspace_id:'w',canonical_path:'/tmp/parked-answer',realpath_verified:true}];
      if(definition.capability_id===agent.availableRoles.capability_id)return [{role_id:'reader',available:true}];
      if(definition.capability_id===agent.listActions.capability_id)return [];
      // The start itself: what it was asked as is all this needs, so it stops here.
      if(definition.capability_id===agent.startRun.capability_id){started.push((args as [string,{actor_id?:string}])[1]);throw new Error('不再往下');}
      throw new Error('unexpected capability '+definition.capability_id);
  }}});
  (context as {actor_id?:string}).actor_id='who-answered';
  const route=codingRoutes(context,sessions,[{provider_id:'p',model_id:'m',label:'M'}]).find(item=>item.route_id==='coding.control-run')!;
  try {
    const answered=await route.handle({params:{sessionId:'app'},body:{kind:'answer',run_id:'parked',pending_id:'asked',pending_revision:1,answers:[{question:0,value:45}]}} as PluginRouteRequest);
    assert.equal(started.length,1,`the next round was asked for: ${JSON.stringify(answered.body)}`);
    // Who starts it is the answering call's caller, as the Host knows it (R8 batch 3): the input names no one, least of all who started the parked round.
    assert.equal(started[0]!.actor_id,undefined,'the start names no actor of its own');
    assert.doesNotMatch(JSON.stringify(started[0]),/who-started/,'nothing of the parked round\'s starter is carried over');
  }finally{db.close();}
});
