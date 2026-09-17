import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createMolisWorkLocalHost} from '@molis-ai/molis-work-app-local-host';
import {handleCasebookHttp} from '../apps/local-host/dist/casebook/http.js';
import {MolisWorkCasebookClient,createCasebookUserActionSigner,createCasebookUserActionVerifier,PURPOSE} from '../apps/local-host/src/casebook/client.js';
import {loadCasebookConfiguration} from '../apps/local-host/src/casebook/config.js';

test('owner catalog connection discovers new projects without opening or granting any project',async t=>{
 const host=createMolisWorkLocalHost(),token=randomBytes(32).toString('hex');
 const secret=randomBytes(32).toString('hex'),proof={secret,audience:'local-owner'};
 const options={grants:[],catalogConnections:[{token,actor_ref:'member-one'}],verifyUserAction:createCasebookUserActionVerifier(proof)};
 const projects=[{project_id:'p1',display_name:'项目一'},{project_id:'p2',display_name:'项目二'}];
 const paths:string[]=[];
 const resolve=async(path:string):Promise<any>=>{paths.push(path);return path==='/'?{kind:'catalog_index',projects}:{kind:'project_not_found'};};
 const server=createServer((req,res)=>{void handleCasebookHttp(req,res,new URL(req.url!,'http://127.0.0.1'),options,host,resolve);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await host.close();});
 const address=server.address();assert.ok(address&&typeof address!=='string');const baseUrl=`http://127.0.0.1:${address.port}`;
 const client=new MolisWorkCasebookClient({baseUrl,token});
 assert.deepEqual((await client.listProjects()).projects,[{project_ref:'p1',project_name:'项目一'},{project_ref:'p2',project_name:'项目二'}]);
 assert.deepEqual(paths,['/']);assert.equal(host.status().projects.length,0);
 projects.push({project_id:'p3',display_name:'后来创建'});
 assert.equal((await client.listProjects()).projects.length,3);
 const wrong=new MolisWorkCasebookClient({baseUrl,token:'wrong'.repeat(10)});
 await assert.rejects(wrong.listProjects(),{code:'not_authorized'});
 // A valid action proof for someone else cannot use the owner's connection or resolve a project.
 const request={project_ref:'p1',actor_ref:'different-member',purpose:PURPOSE,action:'join' as const,user_confirmed:true as const,idempotency_key:'wrong-member'};
 const scoped=new MolisWorkCasebookClient({baseUrl,token,projectRef:'p1'});
 const before=paths.length;
 await assert.rejects(scoped.setInteractionAuthorization({...request,user_action_ref:createCasebookUserActionSigner(proof)(request)}),{code:'not_authorized'});
 assert.equal(paths.length,before);
});

test('catalog connection startup is opt-in, owner-specific and rejects reused control or proof secrets',()=>{
 const home=mkdtempSync(join(tmpdir(),'casebook-catalog-config-')),file=join(home,'casebook.json');
 try{
  const token='c'.repeat(48),secret='s'.repeat(48);
  const config={version:1,grants:[],catalogConnections:[{token,actor_ref:'271728817'}],proof:{secret,audience:'owner'}};
  writeFileSync(file,JSON.stringify(config),{mode:0o600});
  assert.deepEqual(loadCasebookConfiguration(home,file)?.catalogConnections,[{token,actor_ref:'271728817'}]);
  for(const invalid of [{...config,proof:undefined},{...config,catalogConnections:[{token,actor_ref:''}]},{...config,catalogConnections:[{token:secret,actor_ref:'271728817'}]}]){
   writeFileSync(file,JSON.stringify(invalid));assert.throws(()=>loadCasebookConfiguration(home,file),{code:'invalid_casebook_configuration'});
  }
  writeFileSync(file,JSON.stringify(config));assert.throws(()=>loadCasebookConfiguration(home,file,[token]),{code:'invalid_casebook_configuration'});
 }finally{rmSync(home,{recursive:true,force:true});}
});

test('a discovered real catalog project still needs a signed project consent before facts can be read',async t=>{
 const {openMolisWorkProjectCatalog}=await import('@molis-ai/molis-work-app-desktop');
 const home=mkdtempSync(join(tmpdir(),'casebook-catalog-enroll-'));
 const catalog=await openMolisWorkProjectCatalog({homeDirectory:home});
 const p=await catalog.createProject({display_name:'开发用项目',actor_id:'fixture'});catalog.close();
 const host=createMolisWorkLocalHost(),token=randomBytes(32).toString('hex');
 const proof={secret:randomBytes(32).toString('hex'),audience:'development'},sign=createCasebookUserActionSigner(proof);
 const options={grants:[],catalogConnections:[{token,actor_ref:'member'}],verifyUserAction:createCasebookUserActionVerifier(proof)};
 const resolve=async(path:string):Promise<any>=>path==='/'?{kind:'catalog_index',projects:[{project_id:p.project_id,display_name:p.display_name}]}:
  path===`/projects/${p.project_id}/`?{kind:'board',options:{databasePath:p.database_path,boardId:p.board_id,project:{project_id:p.project_id,display_name:p.display_name}}}:{kind:'project_not_found'};
 const server=createServer((req,res)=>{void handleCasebookHttp(req,res,new URL(req.url!,'http://127.0.0.1'),options,host,resolve);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await host.close();rmSync(home,{recursive:true,force:true});});
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const client=new MolisWorkCasebookClient({baseUrl:`http://127.0.0.1:${address.port}`,token,projectRef:p.project_id});
 await client.listProjects();assert.equal(host.status().projects.length,0);
 const auth=await client.readInteractionAuthorization({project_ref:p.project_id,purpose:PURPOSE});assert.equal(auth.state,'not_joined');
 await assert.rejects(client.readInteractionFacts({project_ref:p.project_id,schema_version:'2.0.0',authorization_epoch:'not-a-grant',after_cursor:0,limit:100}),{code:'not_authorized'});
 const request={project_ref:p.project_id,actor_ref:'member',purpose:PURPOSE,action:'join' as const,user_confirmed:true as const,idempotency_key:'join-one'};
 const joined=await client.setInteractionAuthorization({...request,user_action_ref:sign(request)});assert.equal(joined.state,'active');
 const read={project_ref:p.project_id,schema_version:'2.0.0' as const,authorization_epoch:joined.authorization_epoch!,after_cursor:0,limit:100};
 assert.deepEqual((await client.readInteractionFacts(read)).facts,[]);
 const pause={...request,action:'pause' as const,idempotency_key:'pause-one'};await client.setInteractionAuthorization({...pause,user_action_ref:sign(pause)});
 await assert.rejects(client.readInteractionFacts(read),{code:'not_authorized'});
});
