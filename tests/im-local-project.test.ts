import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openServerDatabase} from '../server/src/database.js';
import {createLocalImServer} from '../apps/local-host/src/im-server.js';
import {authorizeLocalWebRequest} from '../apps/local-host/src/web-http.js';

test('local project connection requires operator token and catalog identity without granting existing projects to another session',async()=>{
  const home=await mkdtemp(join(tmpdir(),'molis-im-project-'));
  const token='isolated-project-connection-test-token';
  let im=createLocalImServer(home,async id=>id==='actual-project'?{id,title:'Actual project'}:null);
  const mutations=new Map();let origin='';
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url!,origin);
    if(!authorizeLocalWebRequest(req,res,url,token,mutations))return;
    if(!await im.handle(req,res,url,origin)){res.writeHead(404);res.end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const person=async(name:string)=>{
    const session=await fetch(origin+'/im/api/session');const cookie=session.headers.get('set-cookie')!.split(';')[0]!;
    await fetch(origin+'/im/api/session',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify({display_name:name,client_id:randomUUID()})});return cookie;
  };
  const connect=async(cookie:string,project:string,credential?:string)=>fetch(origin+`/projects/${project}/api/im/connect`,{method:'POST',headers:{cookie,origin,'Content-Type':'application/json','x-molis-work-control-token':credential??'','x-molis-work-idempotency-key':randomUUID()},body:'{}'});
  try{
    const alice=await person('Alice'),bob=await person('Bob');
    assert.equal((await connect(alice,'actual-project')).status,403);
    assert.equal((await connect(alice,'forged-project',token)).status,403);
    assert.equal((await connect(alice,'actual-project',token)).status,200);
    assert.equal((await connect(alice,'actual-project',token)).status,200);
    assert.equal((await connect(bob,'actual-project',token)).status,403);
    const roomResponse=await fetch(origin+'/im/api/projects/actual-project/room',{method:'POST',headers:{cookie:alice,origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(roomResponse.status,200);const {room}=await roomResponse.json() as {room:{id:string;project_id:string;member_count:number}};
    assert.equal(room.project_id,'actual-project');assert.equal(room.member_count,1);
    assert.equal((await fetch(origin+'/im/api/rooms/'+room.id,{headers:{cookie:bob}})).status,403);
    const member=await (await fetch(origin+'/im/api/session',{headers:{cookie:alice}})).json() as {member:{id:string}};
    const requestId=randomUUID();
    const send=(cookie:string)=>fetch(origin+'/im/api/rooms/'+room.id+'/messages',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify({client_id:requestId,body:'Keep my identity and receipt'})});
    assert.equal((await send(alice)).status,200);
    // Persisted project authority survives the local host restarting; no in-memory identity map.
    im.stop();im.close();im=createLocalImServer(home,async id=>id==='actual-project'?{id,title:'Actual project'}:null);
    assert.equal((await connect('','actual-project')).status,403);
    assert.equal((await connect('','forged-project',token)).status,403);
    const recovered=await connect('','actual-project',token);
    assert.equal(recovered.status,200);
    const restoredCookie=recovered.headers.get('set-cookie')!.split(';')[0]!;
    assert.deepEqual(await (await fetch(origin+'/im/api/session',{headers:{cookie:restoredCookie}})).json(),member);
    assert.equal((await send(restoredCookie)).status,200);
    const messages=await (await fetch(origin+'/im/api/rooms/'+room.id+'/messages',{headers:{cookie:restoredCookie}})).json() as {messages:unknown[]};
    assert.equal(messages.messages.length,1,'an uncertain submission must not duplicate after session recovery');
    const storage=openServerDatabase(join(home,'server'));
    storage.db.prepare('UPDATE mw_sessions SET expires_at=0 WHERE member_id=?').run(member.member.id);storage.close();
    const expired=await connect(restoredCookie,'actual-project',token);
    assert.equal(expired.status,200);
    const nextCookie=expired.headers.get('set-cookie')!.split(';')[0]!;
    assert.deepEqual(await (await fetch(origin+'/im/api/session',{headers:{cookie:nextCookie}})).json(),member);
    const sameName=await person('Alice');
    assert.equal((await connect(sameName,'actual-project',token)).status,403,'display name does not authorize recovery');
    assert.equal((await fetch(origin+'/im/api/projects/actual-project/room',{method:'POST',headers:{cookie:sameName,origin,'Content-Type':'application/json'},body:'{}'})).status,403);

  }finally{im.stop();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));im.close();await rm(home,{recursive:true,force:true});}
});
