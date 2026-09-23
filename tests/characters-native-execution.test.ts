import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { SessionTuiRecorder } from "@molis-ai/molis-work-plugin-work";
import { attachMolisWorkPtySocket } from "../apps/local-host/src/pty-socket.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import { characterNativeExecution, characterNativeArgs } from "../apps/local-host/src/character-native-execution.ts";
import { openWorkSessionRegistry } from "../apps/local-host/src/session-registry.ts";

test("native preparation saves exact files and provenance, validates directories and never relaunches a repeated request", async t => {
  const home = mkdtempSync(join(tmpdir(), "character-native-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const content: CharacterContent = { character_id: "c", title: "Verifier", instructions: "Keep my edits", host_tools: null,
    source: { owner_actor_id: "user", draft_revision: 2 }, import_snapshot: { runtime_id: "codex", config_root: "/config", captured_at: "2026-09-23T00:00:00Z",
      rules: [{ path: "/config/AGENTS.md", scope: "global", content: "exact rule" }], skills: [{ id: "s", name: "s", description: "test", path: "/config/skills/s", compatibility: "native-only",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "Read refs/guide.md" }, { path: "refs/guide.md", encoding: "utf8", content: "complete resource" }, { path: "asset.bin", encoding: "base64", content: "AAEC/w==" }] }] } };
  const spawned: any[] = [];
  const options = { home, actorId: "user", boardId: "board", spawn: (request: unknown) => { spawned.push(request); return {attached:false,started:true,replay:""}; }, workspaces: async () => [{ workspace_id: "ws", canonical_path: home, realpath_verified: true, display_name: "Test" }], executable: () => "/known/codex" };
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
  const ports=characterNativeExecution({home,actorId:'user',boardId:'b',workspaces:async()=>[{workspace_id:'w',canonical_path:home,display_name:'fixture',realpath_verified:true}],spawn:request=>pty.spawn(request),executable:()=>command});
  const content:CharacterContent={character_id:'c',title:'test',instructions:'',host_tools:null,source:{owner_actor_id:'user',draft_revision:1},import_snapshot:{runtime_id:'codex',config_root:home,captured_at:'2026-09-23T00:00:00Z',rules:[{path:join(home,'AGENTS.md'),scope:'global',content:'EXACT_FROZEN_RULE'}],skills:[]}};
  const input={workspace_id:'w',task:'fixture',request_id:'5e74e4c2-b296-476d-b52e-613ce3e1af76'},ref={artifact_id:'character:b:c',version:1};
  const started=await ports.launch(content,ref,input);await printed;recorder.flush();
  assert.equal(pty.alive(started.run.panel_id),true);assert.match((await ports.runs('c'))[0]!.output,/EXACT_FROZEN_RULE/);
  const replay=await ports.launch(content,ref,input);assert.equal(replay.run.session_id,started.run.session_id);assert.equal(pty.spawn(replay.spawn).attached,true);
  pty.kill(started.run.panel_id);recorder.flush();assert.equal(pty.alive(started.run.panel_id),false);
  assert.ok(registry.events(started.run.session_id).some(e=>e.kind==='status' && e.metadata?.signal===15));
  const after=await ports.launch(content,ref,input);assert.equal(pty.spawn(after.spawn).started,false);
});
