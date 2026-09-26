import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openServerDatabase, Identity } from '../server/src/index.js';

const launcher=new URL('../apps/server/dist/main.js',import.meta.url).pathname;
function launch(args:string[]){
  const child=spawn(process.execPath,[launcher,...args],{stdio:['ignore','pipe','pipe']});
  let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
  const exited=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code));});
  return {child,exited,output:()=>output,errors:()=>errors};
}
async function command(args:string[]){
  const run=launch(args),timer=setTimeout(()=>run.child.kill('SIGKILL'),45000);
  try {assert.equal(await run.exited,0,run.errors());return JSON.parse(run.output());}
  finally {clearTimeout(timer);}
}
async function listening(server:ReturnType<typeof launch>){
  return new Promise<string>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('standalone did not start: '+server.errors())),45000);
    server.child.stdout.on('data',()=>{const match=server.output().match(/Molis Work Server: (http:\/\/127\.0\.0\.1:\d+)\/continuity/);if(match){clearTimeout(timer);resolve(match[1]!);}});
    server.exited.then(code=>{clearTimeout(timer);reject(Error('standalone exited before listen: '+code+' '+server.errors()));});
  });
}
test('compiled standalone launcher starts headless, restores a real Catalog project and exits with resources closed',{timeout:120000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'continuity-launcher-'));
  let server:ReturnType<typeof launch>|undefined;
  try {
    const config=join(directory,'projects.json'),scope={id:'removed-project',title:'Shared',goal_ids:[],artifacts:[]};
    const startArgs=['serve','--state',join(directory,'server'),'--config',config,'--host-home',join(directory,'original-home'),'--port','0'];
    await writeFile(config,JSON.stringify({projects:[scope]}));
    server=launch(startArgs);let origin=await listening(server);
    assert.match(await (await fetch(origin+'/continuity')).text(),/把工作接过来/);
    assert.equal((await (await fetch(origin+'/continuity/api/session')).json()).member,null);
    assert.equal((await fetch(origin+'/im')).status,200);
    const post=(path:string,body:unknown,cookie='')=>fetch(origin+'/continuity/api'+path,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
    const bootstrap=JSON.parse(await readFile(join(directory,'server','connect.json'),'utf8'));
    const connected=await post('/connect',{code:bootstrap.code,display_name:'Owner',device_label:'Owner device'});
    assert.equal(connected.status,200);const ownerCookie=connected.headers.get('set-cookie')!.split(';')[0]!;
    const ownerId=(await connected.json()).member.id;
    const storage=openServerDatabase(join(directory,'server')),identity=new Identity(storage.db);
    let joinCode:string,unusedCode:string;
    try {joinCode=identity.code('invite',ownerId,{projectId:scope.id,role:'editor'}).code;unusedCode=identity.code('invite',ownerId,{projectId:scope.id,role:'editor'}).code;}
    finally {storage.close();}
    const joined=await post('/connect',{code:joinCode,display_name:'Member',device_label:'Member device'});
    assert.equal(joined.status,200);const memberCookie=joined.headers.get('set-cookie')!.split(';')[0]!;
    server.child.kill('SIGTERM');assert.equal(await server.exited,0,server.errors());server=undefined;
    await writeFile(config,JSON.stringify({projects:[]}));server=launch(startArgs);origin=await listening(server);
    for(const cookie of [ownerCookie,memberCookie]){
      assert.deepEqual((await (await fetch(origin+'/continuity/api/session',{headers:{cookie}})).json()).projects,[]);
      for(const suffix of ['', '/assets','/events'])assert.equal((await fetch(origin+'/continuity/api/projects/'+scope.id+suffix,{headers:{cookie}})).status,403);
      assert.equal((await post('/projects/'+scope.id+'/progress',{command_id:randomUUID(),project_id:scope.id,goal_id:'old-goal',cursor:1,revision:1,summary:'must not write',next_step:'',next_actor:''},cookie)).status,403);
    }
    assert.equal((await post('/connect',{code:unusedCode,display_name:'Old invitation',device_label:'Denied'})).status,401);
    server.child.kill('SIGTERM');assert.equal(await server.exited,0,server.errors());server=undefined;
    await writeFile(config,JSON.stringify({projects:[scope]}));server=launch(startArgs);origin=await listening(server);
    assert.equal((await (await fetch(origin+'/continuity/api/session',{headers:{cookie:ownerCookie}})).json()).projects.length,1);
    assert.deepEqual((await (await fetch(origin+'/continuity/api/session',{headers:{cookie:memberCookie}})).json()).projects,[]);
    server.child.kill('SIGTERM');assert.equal(await server.exited,0,server.errors());server=undefined;
    const bundle={format:'molis-work-assets',version:1,source_project_id:'headless-source',title:'Headless import',goals:[],notes:[],dependencies:[],artifacts:[{
      artifact_id:'headless-artifact',version:1,artifact_type_id:'io.test.document',schema_version:1,owner_actor_id:'source-owner',
      producer:{plugin_id:'io.test.writer',plugin_version:'1.0.0',binding_signature:'original'},content:{kind:'inline',payload:{content:'CLI restored body'}},metadata:{title:'CLI artifact'},scope:'team_project',availability:'available',lifecycle_state:'active',supersedes_version:null,source_supersedes_version:null,
    }]};
    const bundleFile=join(directory,'bundle.json');await writeFile(bundleFile,JSON.stringify(bundle));
    const destination=join(directory,'new-home');
    const restored=await command(['restore','--bundle',bundleFile,'--destination',destination]);assert.equal(restored.restored,1);assert.match(restored.project_id,/^project-onboarding-/);assert.ok(restored.warnings.some((warning:string)=>warning.includes('io.test.writer@1.0.0')));
    const read=await command(['read-assets','--destination',destination,'--project','headless-source']);
    assert.equal(read.artifacts[0].board_id,restored.board_id);assert.equal(read.artifacts[0].payload.content,'CLI restored body');
  } finally {
    if(server){server.child.kill('SIGKILL');await server.exited;}
    await rm(directory,{recursive:true,force:true});
  }
});
