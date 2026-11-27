import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
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
    // R-07: structured ActionError instances keep their HTTP status instead of collapsing to 503.
    failure=new ActionError("actions.conflict","state moved",{kind:"conflict"});
    const conflict=await fetch(server.origin+"/im/api/session");
    assert.equal(conflict.status,409);
    assert.equal((await conflict.json()).code,"actions.conflict");
  } finally {await server.close();storage.close();await rm(directory,{recursive:true,force:true});}
});

test("Q-modules-server-02 (A5): GET /im/api/session rate-limits anonymous issuance, purges expired anonymous sessions, and connect revokes active continuity requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "continuity-q02-"));
  let clock = Date.now();
  const storage = openServerDatabase(join(directory, "server"));
  const identity = new Identity(storage.db, () => clock);
  const events = new ServerEvents(storage.db);
  let abortedByRevoke = false;
  let releaseHold!: () => void;
  const hold = new Promise<void>(resolve => { releaseHold = resolve; });
  let entered!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const continuity = new ContinuityService(storage.db, identity, events, ({ signal }) => ({
    caller: { actor_id: "runtime:test", project_id: "p1", audience: "user", permissions: [], signal },
    client: {
      discover: async () => {
        entered();
        await new Promise<void>((resolve, reject) => {
          signal?.addEventListener("abort", () => { abortedByRevoke = true; reject(signal.reason); }, { once: true });
          void hold.then(resolve);
        });
        return [];
      },
      invoke: async () => ({}),
    } as never,
  }));
  const server = await startServer({ identity, events, continuity, im: createImDomain({ db: storage.db, identity, events }), port: 0 });
  try {
    // 1. Anonymous session issuance rate limit: 30 allowed per IP/min, 31st gets 429 without DB write, existing cookie still works.
    let keptCookie = "";
    for (let i = 0; i < 30; i += 1) {
      const res = await fetch(server.origin + "/im/api/session");
      assert.equal(res.status, 200, `anonymous session ${i}`);
      if (i === 0) keptCookie = res.headers.get("set-cookie")!.split(";")[0]!;
    }
    const beforeLimit = (storage.db.prepare("SELECT COUNT(*) AS n FROM mw_sessions WHERE member_id IS NULL").get() as { n: number }).n;
    assert.equal(beforeLimit, 30);
    const throttled = await fetch(server.origin + "/im/api/session");
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("retry-after"), "60");
    assert.equal((await throttled.json()).code, "im.server.rate_limited");
    assert.equal((storage.db.prepare("SELECT COUNT(*) AS n FROM mw_sessions WHERE member_id IS NULL").get() as { n: number }).n, 30);
    assert.equal((await fetch(server.origin + "/im/api/session", { headers: { cookie: keptCookie } })).status, 200, "existing cookie bypasses anonymous creation limit");

    // 2. Advancing clock beyond 30-day TTL lets lazy purge remove expired anonymous sessions on the next issuance.
    clock += 31 * 24 * 3600 * 1000;
    const afterExpiry = await fetch(server.origin + "/im/api/session");
    assert.equal(afterExpiry.status, 200);
    assert.equal((storage.db.prepare("SELECT COUNT(*) AS n FROM mw_sessions WHERE member_id IS NULL").get() as { n: number }).n, 1, "expired anonymous sessions were purged");

    // 3. Reconnecting with an existing session revokes existing.id and aborts in-flight continuity requests immediately.
    const owner = identity.createMember("Owner");
    continuity.registerProject({ id: "p1", title: "P1", goal_ids: ["g1"], artifacts: [] }, owner.id);
    const firstCode = identity.code("bootstrap", owner.id).code;
    const firstRes = await fetch(server.origin + "/continuity/api/connect", {
      method: "POST",
      headers: { origin: server.origin, "content-type": "application/json" },
      body: JSON.stringify({ code: firstCode, display_name: "Owner", device_label: "D1" }),
    });
    assert.equal(firstRes.status, 200);
    const firstCookie = firstRes.headers.get("set-cookie")!.split(";")[0]!;
    const inFlight = fetch(server.origin + "/continuity/api/projects/p1", { headers: { cookie: firstCookie } });
    await reached;
    const secondCode = identity.code("bootstrap", owner.id).code;
    const secondRes = await fetch(server.origin + "/continuity/api/connect", {
      method: "POST",
      headers: { origin: server.origin, cookie: firstCookie, "content-type": "application/json" },
      body: JSON.stringify({ code: secondCode, display_name: "Owner", device_label: "D2" }),
    });
    assert.equal(secondRes.status, 200);
    const revokedRes = await inFlight;
    assert.equal(abortedByRevoke, true, "connect must trigger continuity.deviceRevoked for the replaced session");
    assert.equal(revokedRes.status, 401);
  } finally {
    releaseHold();
    await server.close();
    storage.close();
    await rm(directory, { recursive: true, force: true });
  }
});
