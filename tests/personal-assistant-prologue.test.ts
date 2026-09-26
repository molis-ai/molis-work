import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// A delegated worktree may read the shared owner's built Host without copying or editing its source.
const { AgentHost, createPrologueNodeAdapter }: typeof import("@molis-ai/molis-work-service-agent-host") = process.env.MOLIS_ASSISTANT_AGENT_HOST_ROOT
  ? await import(pathToFileURL(join(process.env.MOLIS_ASSISTANT_AGENT_HOST_ROOT, "horizontal/agent-host/dist/index.js")).href)
  : await import("@molis-ai/molis-work-service-agent-host");
import { createPersonalAssistantPrologue, PERSONAL_ASSISTANT_AGENT, PERSONAL_ASSISTANT_PROMPTS } from "../apps/local-host/src/personal-assistant-prologue.js";
import { assistantFixture, assistantCaller as caller } from "./personal-assistant-fixture.js";

function response(text: string) {
  const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({type,...value})}\n\n`);
  emit("message_start", {message:{id:"fixture",type:"message",role:"assistant",model:"fixture",content:[],stop_reason:null,usage:{input_tokens:40,output_tokens:0}}});
  emit("content_block_start", {index:0,content_block:{type:"text",text:""}}); emit("content_block_delta", {index:0,delta:{type:"text_delta",text}});emit("content_block_stop",{index:0});
  emit("message_delta",{delta:{stop_reason:"end_turn",stop_sequence:null},usage:{output_tokens:30}});emit("message_stop",{});
  return new Response(events.join(""),{headers:{"content-type":"text/event-stream"}});
}
function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>(ready => { resolve = ready; });
  return { promise, resolve };
}
test("assistant uses actual Prologue SDK through AgentHost without a workspace, freezes Character and has no execution tools", {timeout:120000}, async t => {
  const home=await mkdtemp(join(tmpdir(),"assistant-prologue-")),f=assistantFixture();
  const requests: any[]=[];
  t.mock.method(globalThis,"fetch",async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(typeof init.body==="string"?init.body:new TextDecoder().decode(init.body as Uint8Array));requests.push(body);
    return response(JSON.stringify({outcome:"suggested",category:"requirement_change",title:"补充导出说明",reason:"新资料提出 CSV，原计划只有 PDF。",offer_key:"A1",evidence:[{material_key:"S1",quote:"九月发布需要新增 CSV 导出。"},{material_key:"S3",quote:"九月发布包含 PDF 导出，先完成可编辑的说明草稿。"}]}));});
  const adapter=await createPrologueNodeAdapter({app:{appId:"io.molis.work.assistant-test",appVersion:"1.0.0"},storageRoot:join(home,"sdk"),modelConfiguration:async()=>({protocol:"anthropic-compatible",endpoint:"https://1.1.1.1/v1/messages",model:"fixture",credential_ref:"fixture"}),resolveCredential:()=>"fixture-only"});
  const host=new AgentHost();host.register(adapter);
  const owner={board_id:"assistant-board",actor_id:caller.actor_id,plugin_id:"personal-assistant",install_id:"assistant"};
  const character={character_id:"molis",reference:{artifact_id:"character:assistant-board:molis",version:1},title:"清晰的 Molis",instructions:"直接讲依据，不堆术语。",host_tools:null,source:{owner_actor_id:caller.actor_id,draft_revision:1},board_id:owner.board_id,content_digest:"test-character",producer:{plugin_id:"io.molis.work.characters",plugin_version:"1",binding_signature:"official-characters-binding"},published_at:"2026-09-26T00:00:00Z"};
  try {
    const authority={authorizedDirectories:[],manifest:PERSONAL_ASSISTANT_AGENT,prompts:PERSONAL_ASSISTANT_PROMPTS,resolveCharacter:()=>character};
    const session=await host.createSession("prologue",{...owner,workspace:"none",role_id:"personal-assistant",title:"无工作区助理验证"},authority);
    assert.equal((await adapter.readSession(session)).workspace,"none");
    const start=host.start.bind(host);
    t.mock.method(host,"start",async(...args:Parameters<typeof host.start>)=>{
      assert.equal(args[1].workspace,"none");assert.equal(args[1].directory,undefined);
      const handle=await start(...args);assert.equal(handle.frozen.workspace,"none");assert.equal(handle.frozen.directory,undefined);return handle;
    });
    f.ports.analysis=createPersonalAssistantPrologue({host,prepare:async()=>({scope:{...owner,workspace:"none",session},authority})});
    f.service.preferences(caller,0,{...f.store.preferences(),character:character.reference});
    const result=await f.service.evaluate(caller,f.input);
    assert.equal(result.outcome,"suggested",result.message);assert.equal(result.suggestions[0]!.character_title,"清晰的 Molis");assert.equal(f.writes,0);
    assert.ok(requests.length>0);const sent=JSON.stringify(requests[0]);assert.match(sent,/直接讲依据/);assert.match(sent,/九月发布需要新增 CSV/);assert.match(sent,/PDF 导出/);
    assert.ok(!requests[0].tools?.length,"analysis must never receive mutation tools");
    const completed=await f.service.execute(caller,result.suggestions[0]!.id,1);assert.equal(completed.status,"completed");assert.equal(f.writes,1);
  } finally {await adapter.close();f.close();await rm(home,{recursive:true,force:true});}
});

test("assistant revocation during prepare, Node credentials or final SDK dispatch sends no model request", { timeout: 120000 }, async t => {
  for (const stage of ["prepare", "credential", "dispatch"] as const) {
    for (const change of (stage === "dispatch" ? ["source"] as const : ["source", "material", "preferences", "model-permission"] as const)) {
      await t.test(`${stage}: ${change}`, async t => {
        const home = await mkdtemp(join(tmpdir(), "assistant-dispatch-"));
        const f = assistantFixture();
        let modelAllowed = true, permissionChecks = 0;
        const context = { ...caller, validate_permissions: (permissions: readonly string[]) => {
          if (permissions.includes("model:invoke")) { permissionChecks++; if (!modelAllowed) throw new Error("live model permission revoked"); }
        } };
        const entered = barrier(), release = barrier();
        let held = false, originalChecks = 0, dispatchChecks = 0, requests = 0, starts = 0;
        const pause = async (at: typeof stage) => {
          if (stage === at && !held) { held = true; entered.resolve(); await release.promise; }
        };
        t.mock.method(globalThis, "fetch", async () => { requests++; return response('{"outcome":"nothing_to_do"}'); });
        const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-guard-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
          modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
          resolveCredential: async () => { await pause("credential"); return "fixture-only"; } });
        let pending: ReturnType<typeof f.service.evaluate> | undefined;
        try {
          const host = new AgentHost(); host.register(adapter);
          const start = host.start.bind(host);
          t.mock.method(host, "start", (...args: Parameters<typeof host.start>) => { starts++; return start(...args); });
          const owner = { board_id: "assistant-board", actor_id: context.actor_id, plugin_id: "personal-assistant", install_id: "assistant" };
          const authority = { authorizedDirectories: [], manifest: PERSONAL_ASSISTANT_AGENT, prompts: PERSONAL_ASSISTANT_PROMPTS,
            beforeStart: () => { originalChecks++; },
            beforeDispatch: async () => { dispatchChecks++; await pause("dispatch"); } };
          f.ports.analysis = createPersonalAssistantPrologue({ host, prepare: async () => {
            await pause("prepare");
            return { scope: { ...owner, workspace: "none", session: await host.createSession("prologue", { ...owner, workspace: "none", role_id: "personal-assistant", title: "分派授权交错" }, authority) }, authority };
          } });
          pending = f.service.evaluate(context, f.input);
          await Promise.race([entered.promise, pending.then(() => { throw new Error("analysis finished before the preparation barrier"); })]);
          if (stage === "credential") assert.ok(originalChecks > 0, "revocation must occur after an earlier authority check");
          if (change === "source") f.disconnect();
          else if (change === "material") f.context.get("goal")!.revision = "changed-during-preparation";
          else if (change === "preferences") f.service.preferences(context, 0, { ...f.store.preferences(), enabled: false });
          else modelAllowed = false;
          release.resolve();
          const result = await pending;
          assert.equal(requests, 0, "revoked body must never reach the actual model transport");
          assert.equal(result.outcome, "needs_review");
          assert.equal(result.suggestions.length, 0);
          if (stage === "prepare") assert.equal(starts, 0, "prepare revocation must be denied before handing material to Host");
          if (stage === "dispatch") assert.ok(dispatchChecks > 0, "the original live dispatch guard must reach the SDK boundary");
          if (change === "model-permission") {
            assert.ok(context.permissions.includes("model:invoke"), "the initial permission snapshot stays unchanged after revocation");
            assert.ok(permissionChecks > 1, "the live permission owner must be checked again after asynchronous preparation");
          }
          assert.ok(originalChecks > 0, "the caller's original beforeStart guard must be retained");
          assert.equal(f.writes, 0);
        } finally {
          release.resolve(); await pending?.catch(() => {});
          try { await adapter.close(); } finally { f.close(); await rm(home, { recursive: true, force: true }); }
        }
      });
    }
  }
});

test("assistant keeps an original beforeStart denial and never falls back to unguarded analysis", { timeout: 120000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "assistant-original-guard-")), f = assistantFixture();
  let requests = 0, originalChecks = 0, startAllowed = true;
  t.mock.method(globalThis, "fetch", async () => { requests++; return response('{"outcome":"nothing_to_do"}'); });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-original-guard", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  try {
    const host = new AgentHost(); host.register(adapter);
    const owner = { board_id: "assistant-board", actor_id: caller.actor_id, plugin_id: "personal-assistant", install_id: "assistant" };
    const authority = { authorizedDirectories: [], manifest: PERSONAL_ASSISTANT_AGENT, prompts: PERSONAL_ASSISTANT_PROMPTS,
      beforeStart: () => { originalChecks++; if (!startAllowed) throw new Error("original invocation revoked"); } };
    const session = await host.createSession("prologue", { ...owner, workspace: "none", role_id: "personal-assistant", title: "原授权拒绝" }, authority);
    startAllowed = false;
    f.ports.analysis = createPersonalAssistantPrologue({ host, prepare: async () => ({
      scope: { ...owner, workspace: "none", session }, authority,
    }) });
    assert.equal((await f.service.evaluate(caller, f.input)).outcome, "needs_review");
    assert.ok(originalChecks > 0); assert.equal(requests, 0); assert.equal(f.writes, 0);
  } finally { try { await adapter.close(); } finally { f.close(); await rm(home, { recursive: true, force: true }); } }
});
