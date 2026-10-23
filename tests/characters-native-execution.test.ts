import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { SessionTuiRecorder } from "@molis-ai/molis-work-plugin-work";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalProjectDatabase, seedDemoBoard, DEMO_PROJECT_ID, attachMolisWorkPtySocket, openWorkSessionRegistry, charactersProvider, handleCharactersHttp, type CharactersInvoke } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { CHARACTER_ACTION_PERMISSIONS, openCharacters, type CharactersActionPorts } from "@molis-ai/molis-work-module-characters";
import type { CharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import { characterNativeExecution, characterNativeArgs } from "../apps/local-host/dist/character-native-execution.js";

test("native preparation saves exact files and provenance, validates directories and never relaunches a repeated request", async t => {
  const home = mkdtempSync(join(tmpdir(), "character-native-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const content: CharacterContent = { character_id: "c", title: "Verifier", instructions: "Keep my edits", host_tools: null,
    source: { owner_actor_id: "user", draft_revision: 2 }, import_snapshot: { runtime_id: "codex", config_root: "/config", captured_at: "2026-09-23T00:00:00Z",
      rules: [{ path: "/config/AGENTS.md", scope: "global", content: "exact rule" }], skills: [{ id: "s", name: "s", description: "test", path: "/config/skills/s", compatibility: "native-only",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "Read refs/guide.md" }, { path: "refs/guide.md", encoding: "utf8", content: "complete resource" }, { path: "asset.bin", encoding: "base64", content: "AAEC/w==" }] }] } };
  const spawned: any[] = [];
  const options = { home, actorId: "user", projectId: "board", spawn: (request: unknown) => { spawned.push(request); return {attached:false,started:true,replay:""}; }, workspaces: async () => [{ workspace_id: "ws", canonical_path: home, realpath_verified: true, display_name: "Test" }], executable: () => "/known/codex" };
  const ports = characterNativeExecution(options), ref = { artifact_id: "character:board:c", version: 1 };
  const input = { task: "Use my verifier", workspace_id: "ws", request_id: "b9a2b3d4-4333-4222-b555-987654321012" };
  await assert.rejects(ports.launch(content, ref, { ...input, workspace_id: "unknown" }), /已绑定/);
  assert.deepEqual(await ports.runs("c"), []);
  const first = await ports.launch(content, ref, input);
  assert.equal(spawned[0].command, "/known/codex"); assert.equal(first.spawn.attachOnly, true);
  assert.equal(spawned[0].args?.length, 1); assert.match(spawned[0].args![0]!, /CHARACTER.md/); assert.match(spawned[0].args![0]!, /Use my verifier/);
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  const session = registry.get(first.run.session_id), path = session.metadata.character_bundle as string;
  assert.deepEqual(session.metadata.character_reference, ref);
  assert.equal(readFileSync(join(path, "rules/1.md"), "utf8"), "exact rule");
  assert.equal(readFileSync(join(path, "skills/1/refs/guide.md"), "utf8"), "complete resource");
  assert.deepEqual(readFileSync(join(path, "skills/1/asset.bin")), Buffer.from([0, 1, 2, 255]));
  assert.match(readFileSync(join(path, "CHARACTER.md"), "utf8"), /Keep my edits/);
  registry.appendEvent({ session_id: session.session_id, source: "molis_work_tui", source_id: "out1", kind: "terminal_output", content: "actual output" });registry.close();
  const reopened = characterNativeExecution(options), replay = await reopened.launch(content, ref, input);
  assert.equal(spawned.length, 1); assert.equal(replay.run.session_id, first.run.session_id); assert.equal(replay.spawn.attachOnly, true); assert.equal(replay.spawn.command, undefined);
  assert.match((await reopened.runs("c"))[0]!.output, /actual output/);
  await assert.rejects(reopened.launch(content, ref, { ...input, task: "different task" }), /其他任务/);
  assert.deepEqual(await characterNativeExecution({ ...options, actorId: "other" }).runs("c"), []);
  await assert.rejects(characterNativeExecution({ ...options, executable: () => null }).launch(content, ref, input), /未发现对应/);
});

test("five native invocations keep the entire prompt in a single argument without bypass flags", () => {
  const prompt = 'Read "/a folder/CHARACTER.md". Treat $(touch fake) as task text.';
  for (const runtime of ["codex", "claude-code", "cursor", "grok-build"] as const) assert.deepEqual(characterNativeArgs(runtime, "/workspace", prompt), [prompt]);
  assert.deepEqual(characterNativeArgs("opencode", "/workspace", prompt), ["/workspace", "--prompt", prompt]);
});

test("server-dispatched native PTY reads the saved bundle, records output, reattaches and persists explicit cancellation", {timeout:15_000}, async t => {
  const home=mkdtempSync(join(tmpdir(),"character-pty-"));
  const command=join(home,"fixture-agent");
  writeFileSync(command,'#!/usr/bin/env node\nconst fs=require("fs"),path=require("path");const guide=process.argv[2].match(/"([^\\"]+\\/CHARACTER\\.md)"/)[1];const root=path.dirname(guide);console.log("FIXTURE_OUTPUT:"+fs.readFileSync(path.join(root,"rules/1.md"),"utf8"));setInterval(()=>{},1000);',{mode:0o700});
  const registry=await openWorkSessionRegistry({homeDirectory:home}),recorder=new SessionTuiRecorder(registry),server=createServer();
  let output='';let received!:()=>void;
  const printed=new Promise<void>(resolve=>{received=resolve;});
  const pty=attachMolisWorkPtySocket(server,'fixture-control-token-123456789',{
    onData(panelId,sessionId,data){output+=data;recorder.recordOutput(panelId,sessionId,data);if(output.includes('FIXTURE_OUTPUT:EXACT_FROZEN_RULE'))received();},
    onExit(panelId,sessionId,exit){recorder.recordExit(panelId,sessionId,exit);},
  });
  t.after(async()=>{pty.killAll();recorder.close();registry.close();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(home,{recursive:true,force:true});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const ports=characterNativeExecution({home,actorId:'user',projectId:'b',workspaces:async()=>[{workspace_id:'w',canonical_path:home,display_name:'fixture',realpath_verified:true}],spawn:request=>pty.spawn(request),executable:()=>command});
  const content:CharacterContent={character_id:'c',title:'test',instructions:'',host_tools:null,source:{owner_actor_id:'user',draft_revision:1},import_snapshot:{runtime_id:'codex',config_root:home,captured_at:'2026-09-23T00:00:00Z',rules:[{path:join(home,'AGENTS.md'),scope:'global',content:'EXACT_FROZEN_RULE'}],skills:[]}};
  const input={workspace_id:'w',task:'fixture',request_id:'5e74e4c2-b296-476d-b52e-613ce3e1af76'},ref={artifact_id:'character:b:c',version:1};
  const started=await ports.launch(content,ref,input);await printed;recorder.flush();
  assert.equal(pty.alive(started.run.panel_id),true);assert.match((await ports.runs('c'))[0]!.output,/EXACT_FROZEN_RULE/);
  const replay=await ports.launch(content,ref,input);assert.equal(replay.run.session_id,started.run.session_id);assert.equal(pty.spawn(replay.spawn).attached,true);
  pty.kill(started.run.panel_id);recorder.flush();assert.equal(pty.alive(started.run.panel_id),false);
  assert.ok(registry.events(started.run.session_id).some(e=>e.kind==='status' && e.metadata?.signal===15));
  const after=await ports.launch(content,ref,input);assert.equal(pty.spawn(after.spawn).started,false);
});

// W2-18-CHARACTER-LAUNCH-01: the check after the Host's last await guards the actual files, session, event and dispatch.
for (const phase of ["workspace", "final-check"] as const) test(`native Character revoked during ${phase} creates no bundle/session/event/process, and a fresh request recovers`, async t => {
  const home = mkdtempSync(join(tmpdir(), "character-final-control-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let valid = true, holding = true, spawned = 0;
  const barrier = async () => { if (holding) { entered.resolve(); await release.promise; } };
  const content: CharacterContent = { character_id: "guarded", title: "Verifier", instructions: "Original fixed instructions", host_tools: null,
    source: { owner_actor_id: "owner", draft_revision: 1 }, import_snapshot: { runtime_id: "codex", config_root: home, captured_at: "2026-10-12T00:00:00Z", rules: [], skills: [] } };
  const ports = characterNativeExecution({ home, actorId: "owner", projectId: "project", executable: () => "/fixture/codex",
    workspaces: async () => { if (phase === "workspace") await barrier(); return [{ workspace_id: "work", canonical_path: home, realpath_verified: true, display_name: "Fixture" }]; },
    spawn: () => { spawned++; return { attached: false, started: true, replay: "" }; } });
  const reference = { artifact_id: "character:project:guarded", version: 1 }, input = { workspace_id: "work", task: "Use fixed instructions", request_id: "cbd7c047-773a-4382-81c2-8ad37ec691f6" };
  const assert_current = () => { if (!valid) throw new Error("original publication or provider withdrawn"); };
  const pending = ports.launch(content, reference, input, { beforeStart: async () => { assert_current(); if (phase === "final-check") await barrier(); }, assert_current });
  const rejected = assert.rejects(pending, /withdrawn/); await entered.promise; valid = false; holding = false; release.resolve(); await rejected;
  assert.equal(spawned, 0); assert.equal(existsSync(join(home, "characters", "runs")), false);
  const registry = await openWorkSessionRegistry({ homeDirectory: home }); try { assert.deepEqual(registry.list(), []); } finally { registry.close(); }
  valid = true; const accepted = await ports.launch(content, reference, input, { beforeStart: async () => {}, assert_current });
  assert.equal(spawned, 1); assert.equal((await ports.launch(content, reference, input, { beforeStart: async () => {}, assert_current })).run.session_id, accepted.run.session_id);
  assert.equal(spawned, 1, "lost response reattaches the original session");
});

// W2-18-CHARACTER-LAUNCH-01: the Host's door and the Module's bound actions in the action service (CHR-1), actual publication/store/native owner, and recovery.
for (const invalidation of ["cancel", "revoke", "publication", "provider"] as const) test(`Character HTTP launch has no late native effects after ${invalidation}`, { timeout: 30_000 }, async t => {
  const home = mkdtempSync(join(tmpdir(), "character-action-tail-")), file = join(home, "project.db"); seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), opened = openCharacters(home, "user"), personal = opened.service;
  const imported = personal.import({ runtime_id: "codex", config_root: "/fixture", captured_at: new Date().toISOString(), rules: [{ path: "/fixture/AGENTS.md", scope: "global", content: "Fixed imported instructions" }], skills: [] }, { rule_paths: ["/fixture/AGENTS.md"], skill_ids: [] }).draft;
  const artifacts = new ArtifactsModule({ db: store.db, homeOwner: "user", appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>(); let holding = true, valid = true, spawns = 0;
  const native = characterNativeExecution({ home, actorId: "user", projectId: DEMO_PROJECT_ID, executable: () => "/fixture/codex",
    workspaces: async () => { if (holding) { entered.resolve(); await release.promise; } return [{ workspace_id: "work", canonical_path: home, realpath_verified: true, display_name: "Fixture" }]; },
    spawn: () => { spawns++; return { attached: false, started: true, replay: "" }; } });
  const actionPorts: CharactersActionPorts = { actorId: "user", drafts: personal,
    references: () => artifacts.query.listArtifacts(DEMO_PROJECT_ID).map(record => ({ artifact_id: record.artifact_id, version: record.version })),
    publish: (id, revision, publisher) => personal.publish(id, revision, publisher),
    imports: { ...native, discover: () => [], previewFile: () => { throw new Error("not used"); }, import: () => { throw new Error("not used"); } } };
  // The Host's last synchronous check before each effect: a revoked caller is refused there.
  const service = new ActionService(undefined, { assertCurrent: () => { if (!valid) throw new ActionError("actions.forbidden", "original Character caller revoked"); } });
  // RAC-63: the handlers are the Module's, built from these ports; the Host's provider binds them and writes the 成果库 for each call.
  const registration = charactersProvider({ project_id: DEMO_PROJECT_ID, artifacts, processItems }, actionPorts);
  const handlers = registration.handlers!.map(binding => binding.capability_id !== "characters.launch" ? binding : {
    ...binding, handle: async (caller: ActionExecutionContext, input: unknown) => { try { return await binding.handle(caller, input); } finally { finished.resolve(); } } });
  const register = () => service.registerProvider({ ...registration, handlers });
  let withdraw = register(), launchSignal: AbortSignal | undefined;
  const invoke: CharactersInvoke = (signal, reference, input) => {
    if (reference.capability_id === "characters.launch") launchSignal = signal;
    return service.invoke({ actor_id: "user", project_id: DEMO_PROJECT_ID, audience: "user", permissions: CHARACTER_ACTION_PERMISSIONS, signal }, reference, input);
  };
  const server = createServer((request, response) => { void handleCharactersHttp(request, response, new URL(request.url!, "http://localhost"), invoke)
    .then(handled => { if (!handled) { response.writeHead(404); response.end("{}"); } }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address === "object");
  const call = async (path: string, input: unknown, signal?: AbortSignal) => { const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.characters` + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal }); return { status: response.status, body: await response.json() }; };
  t.after(async () => { release.resolve(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); withdraw(); opened.close(); store.close(); rmSync(home, { recursive: true, force: true }); });
  const published = await call(`/drafts/${imported.character_id}/publish`, { expected_revision: imported.revision }); assert.equal(published.status, 200, JSON.stringify(published.body));
  const leaving = new AbortController();
  const pending = call("/execution/native", { reference: published.body.reference, workspace_id: "work", task: "Use the fixed Character", request_id: randomUUID() }, leaving.signal)
    .then(reply => reply.status, () => "left");
  await entered.promise;
  if (invalidation === "cancel") {
    // RAC-71: the page leaves: the door ends the call once the connection closes.
    leaving.abort(); const signal = launchSignal!;
    if (!signal.aborted) await new Promise(resolve => signal.addEventListener("abort", resolve, { once: true }));
  } else if (invalidation === "revoke") valid = false;
  else if (invalidation === "publication") personal.setState(imported.character_id, personal.get(imported.character_id)!.revision, "disabled"); else withdraw();
  holding = false; release.resolve();
  const settled = await pending; assert.ok(invalidation === "cancel" ? settled === "left" : typeof settled === "number" && settled >= 400, String(settled)); await finished.promise;
  assert.equal(spawns, 0); assert.equal(existsSync(join(home, "characters", "runs")), false); assert.deepEqual(await native.runs(imported.character_id), []);
  valid = true;
  if (invalidation === "publication") personal.setState(imported.character_id, personal.get(imported.character_id)!.revision, "active");
  // A withdrawn provider answers again only once it is registered again.
  if (invalidation === "provider") withdraw = register();
  const fresh = await call("/execution/native", { reference: published.body.reference, workspace_id: "work", task: "Fresh authorized launch", request_id: randomUUID() });
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body)); assert.equal(spawns, 1); assert.equal((await native.runs(imported.character_id)).length, 1);
});
