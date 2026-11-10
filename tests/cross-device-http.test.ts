import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, createImDomain, startServer } from "@molis-ai/molis-work-server";

test("different server databases keep independent cookies; IM SSE checks membership and server shutdown closes streams",async()=>{
  const directory=await mkdtemp(join(tmpdir(),'continuity-http-'));
  const create=async(name:string)=>{
    const storage=openServerDatabase(join(directory,name)),identity=new Identity(storage.db),events=new ServerEvents(storage.db);
    const service=new ContinuityService(storage.db,identity,events,()=>{throw Error('This HTTP test must not invoke business actions');});
    const server=await startServer({identity,events,continuity:service,im:createImDomain({db:storage.db,identity,events}),port:0});
    return {...server,storage,identity};
  };
  const a=await create('a'),b=await create('b');
  async function connect(server:typeof a,name:string){
    const member=server.identity.createMember(name),code=server.identity.code('bootstrap',member.id);
    const response=await fetch(server.origin+'/continuity/api/connect',{method:'POST',headers:{origin:server.origin,'content-type':'application/json'},body:JSON.stringify({code:code.code,display_name:name,device_label:name})});
    assert.equal(response.status,200);return {member,cookie:response.headers.get('set-cookie')!.split(';')[0]!};
  }
  try {
    const one=await connect(a,'one'),two=await connect(b,'two'),outsider=await connect(a,'outsider');
    assert.notEqual(one.cookie.split('=')[0],two.cookie.split('=')[0]);
    const both=one.cookie+'; '+two.cookie;
    for(const [server,expected] of [[a,one.member.id],[b,two.member.id]] as const){
      const response=await fetch(server.origin+'/continuity/api/session',{headers:{cookie:both}});assert.equal((await response.json()).member.id,expected);
    }
    // D0017: bad URI encoding is an input refusal, never a retryable Host failure.
    for (const path of ["/continuity/api/projects/%ZZ", "/im/api/rooms/%ZZ/events"]) {
      const bad = await fetch(a.origin + path, { headers: { cookie: one.cookie } });
      assert.equal(bad.status, 400); assert.equal((await bad.json()).code, "im.invalid_path");
    }
    const named=await fetch(a.origin+'/im/api/rooms',{method:'POST',headers:{origin:a.origin,cookie:one.cookie,'content-type':'application/json'},body:JSON.stringify({client_id:randomUUID(),title:'SSE room'})});
    assert.equal(named.status,200);const room=(await named.json()).room;
    const denied=await fetch(a.origin+`/im/api/rooms/${room.id}/events`,{headers:{cookie:outsider.cookie}});
    assert.equal(denied.status,403);assert.equal((await denied.json()).code,'im.forbidden');
    const response=await fetch(a.origin+`/im/api/rooms/${room.id}/events`,{headers:{cookie:one.cookie}});
    assert.equal(response.status,200);const reader=response.body!.getReader();const first=await reader.read();
    assert.match(new TextDecoder().decode(first.value),/event: ready/);
    const second=await fetch(a.origin+`/im/api/rooms/${room.id}/events?after=0`,{headers:{cookie:one.cookie},signal:AbortSignal.timeout(5000)});
    // SSE events may be in separate HTTP chunks; replay must arrive, but not necessarily with `ready`.
    const secondReader=second.body!.getReader(),decoder=new TextDecoder();let replay='';
    while(!replay.includes('event: change')){const chunk=await secondReader.read();assert.equal(chunk.done,false,'stream closed before replay');replay+=decoder.decode(chunk.value,{stream:true});assert.ok(replay.length<65536,'bounded SSE replay');}
    assert.match(replay,/event: change/);
    // D0027: one trusted member shares eight slots across tabs; another member has an independent budget.
    const extra: Response[] = [];
    for (let n = 2; n < 8; n++) { const stream = await fetch(a.origin+`/im/api/rooms/${room.id}/events`,{headers:{cookie:one.cookie}}); assert.equal(stream.status,200); extra.push(stream); }
    const ninth = await fetch(a.origin+`/im/api/rooms/${room.id}/events`,{headers:{cookie:one.cookie}});
    assert.equal(ninth.status,429); assert.equal((await ninth.json()).code,"im.stream_limit");
    const ownRoomResponse = await fetch(a.origin+"/im/api/rooms",{method:"POST",headers:{origin:a.origin,cookie:outsider.cookie,"content-type":"application/json"},body:JSON.stringify({client_id:randomUUID(),title:"Other member"})});
    const ownRoom = (await ownRoomResponse.json()).room;
    const independent = await fetch(a.origin+`/im/api/rooms/${ownRoom.id}/events`,{headers:{cookie:outsider.cookie}}); assert.equal(independent.status,200);
    await extra.pop()!.body!.cancel();
    let resumedStream: Response | undefined;
    for (let n=0;n<50;n++) { const attempt=await fetch(a.origin+`/im/api/rooms/${room.id}/events`,{headers:{cookie:one.cookie}}); if(attempt.status===200){resumedStream=attempt;break;} await attempt.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,10)); }
    assert.ok(resumedStream,"closing a stream releases its member's slot");
    await a.close();await reader.cancel().catch(()=>{});await secondReader.cancel().catch(()=>{});
    await Promise.all([...extra,independent,resumedStream].map(stream=>stream.body?.cancel().catch(()=>{})));
    const suffix=(a.storage.db.prepare('SELECT cookie_suffix FROM mw_server_identity').get() as {cookie_suffix:string}).cookie_suffix;
    a.storage.close();const reopened=openServerDatabase(join(directory,'a'));
    assert.equal((reopened.db.prepare('SELECT cookie_suffix FROM mw_server_identity').get() as {cookie_suffix:string}).cookie_suffix,suffix);reopened.close();
    await assert.rejects(startServer({identity:b.identity,events:new ServerEvents(b.storage.db),continuity:new ContinuityService(b.storage.db,b.identity,new ServerEvents(b.storage.db),()=>{throw Error();}),hostname:'0.0.0.0',port:0}),/HTTPS/);
  } finally {
    if(a.server.listening)await a.close();if(a.storage.db.open)a.storage.close();await b.close();b.storage.close();await rm(directory,{recursive:true,force:true});
  }
});

test("D0017 unknown HTTP failures expose only a correlated code and preserve expected access refusals", async t => {
  const directory=await mkdtemp(join(tmpdir(),"continuity-http-error-"));
  const storage=openServerDatabase(join(directory,"server")), identity=new Identity(storage.db), events=new ServerEvents(storage.db);
  const continuity=new ContinuityService(storage.db,identity,events,()=>{throw Error("not used");});
  let failure: unknown=Object.assign(new Error("private credential and /local/path"),{code:"invalid\ncredential"});
  const diagnostic:string[]=[];
  t.mock.method(process.stderr,"write",(chunk:unknown)=>{diagnostic.push(String(chunk));return true;});
  const server=await startServer({identity,events,continuity,port:0,im:{async handleImRequest(){throw failure;},assertRoomMember(){}}});
  try {
    const response=await fetch(server.origin+"/im/api/session");
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.code,"im.server.unavailable");assert.match(body.request_id,/^[0-9a-f-]{36}$/);
    const line=diagnostic.find(line=>line.includes('"event":"server.request_failed"'));
    assert.ok(line);assert.deepEqual(JSON.parse(line),{event:"server.request_failed",request_id:body.request_id,code:body.code});
    assert.doesNotMatch(JSON.stringify(body)+line,/private credential|local\/path|invalid\\ncredential/);
    diagnostic.length=0;failure=Object.assign(new Error("private access diagnostic"),{code:"im.forbidden"});
    const denied=await fetch(server.origin+"/im/api/session");assert.equal(denied.status,403);
    assert.deepEqual(await denied.json(),{code:"im.forbidden",error:"你没有这个群的访问权限"});
    assert.equal(diagnostic.some(line=>line.includes("server.request_failed")),false);
  } finally {await server.close();storage.close();await rm(directory,{recursive:true,force:true});}
});
