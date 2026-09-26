import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { openServerDatabase, Identity, ServerEvents, ContinuityService, createImDomain, startServer } from "../server/src/index.js";

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
    const named=await fetch(a.origin+'/im/api/rooms',{method:'POST',headers:{origin:a.origin,cookie:one.cookie,'content-type':'application/json'},body:JSON.stringify({client_id:randomUUID(),title:'SSE room'})});
    assert.equal(named.status,200);const room=(await named.json()).room;
    const denied=await fetch(a.origin+`/im/api/rooms/${room.id}/events`,{headers:{cookie:outsider.cookie}});
    assert.equal(denied.status,403);assert.equal((await denied.json()).code,'im.forbidden');
    const response=await fetch(a.origin+`/im/api/rooms/${room.id}/events`,{headers:{cookie:one.cookie}});
    assert.equal(response.status,200);const reader=response.body!.getReader();const first=await reader.read();
    assert.match(new TextDecoder().decode(first.value),/event: ready/);
    const second=await fetch(a.origin+`/im/api/rooms/${room.id}/events?after=0`,{headers:{cookie:one.cookie}});
    const secondReader=second.body!.getReader();assert.match(new TextDecoder().decode((await secondReader.read()).value),/event: change/);
    await a.close();await reader.cancel().catch(()=>{});await secondReader.cancel().catch(()=>{});
    const suffix=(a.storage.db.prepare('SELECT cookie_suffix FROM mw_server_identity').get() as {cookie_suffix:string}).cookie_suffix;
    a.storage.close();const reopened=openServerDatabase(join(directory,'a'));
    assert.equal((reopened.db.prepare('SELECT cookie_suffix FROM mw_server_identity').get() as {cookie_suffix:string}).cookie_suffix,suffix);reopened.close();
    await assert.rejects(startServer({identity:b.identity,events:new ServerEvents(b.storage.db),continuity:new ContinuityService(b.storage.db,b.identity,new ServerEvents(b.storage.db),()=>{throw Error();}),hostname:'0.0.0.0',port:0}),/HTTPS/);
  } finally {
    if(a.server.listening)await a.close();if(a.storage.db.open)a.storage.close();await b.close();b.storage.close();await rm(directory,{recursive:true,force:true});
  }
});
