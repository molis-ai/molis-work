import { changeMcpClientCredential } from "@molis-ai/molis-work-app-local-host";
import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer,type Server} from 'node:http';
import {mkdtempSync,readFileSync,rmSync,existsSync,unlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createDesktopWebHost} from '@molis-ai/molis-work-app-desktop';
import {ACCOUNT_CONNECT_PATH,connectResidentAccount,createMcpResidentStarter,NATIVE_SESSION_FILE,NATIVE_SESSION_HEADER,LocalActionGatewayClient} from '@molis-ai/molis-work-app-local-host';

const listen=async(server:Server)=>{await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a==='object');return 'http://127.0.0.1:'+a.port;};
const close=(server:Server)=>new Promise<void>(resolve=>server.close(()=>resolve()));
const run=promisify(execFile);

// ASR-02/03/06: shipped process entrypoints attach through the installation's existing native proof, never a disk account selector.
test('ASR-02/03/06 shipped stdio and CLI explicitly connect current A/B/A while old process credentials remain refused',async()=>{
 const home=mkdtempSync(join(tmpdir(),'account-process-'));
 let user='alice',state='',authOrigin='';
 const auth=createServer(async(request,response)=>{
  let raw='';for await(const chunk of request)raw+=chunk;response.setHeader('content-type','application/json');
  if(request.url==='/api/v1/auth/transactions'){state=JSON.parse(raw).state;response.end(JSON.stringify({data:{loginUrl:authOrigin+'/login'}}));}
  else if(request.url==='/oauth2/token')response.end(JSON.stringify({access_token:'synthetic-'+user,refresh_token:'synthetic-refresh',expires_in:3600}));
  else if(request.url==='/api/v1/users/me'){const name=String(request.headers.authorization).replace('Bearer synthetic-','');response.end(JSON.stringify({data:{userId:name,displayName:name,emails:[],applicationId:'work',clientId:'web-test'}}));}
  else response.end('{}');
 });
 authOrigin=await listen(auth);
 const env={MOLIS_WORK_AUTH_ORIGIN:authOrigin,MOLIS_WORK_AUTH_CLIENT_ID:'web-test',MOLIS_WORK_CLOUD_ORIGIN:authOrigin,MOLIS_WORK_SECRET_BACKEND:'file'};
 const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const server=createDesktopWebHost({ptyClientFilePath:()=>'/unused-for-process-test'})({homeDirectory:home}),origin=await listen(server);
 const rootToken=readFileSync(join(home,'config','web-control-token'),'utf8').trim(),proof=readFileSync(join(home,NATIVE_SESSION_FILE),'utf8');
 let cookie='',token=rootToken,sequence=0;
 const request=async(path:string,body?:unknown)=>{
  const response=await fetch(origin+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'process-'+(++sequence)},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
  const set=response.headers.get('set-cookie');if(set?.startsWith('molis-work-session='))cookie=set.split(';')[0]!;return response;
 };
 const json=async(path:string,body?:unknown)=>{const response=await request(path,body),value=await response.json();assert.ok(response.status<400,JSON.stringify({path,status:response.status,value}));return value;};
 const login=async(name:string)=>{
  const current=await json('/api/personal/status?page=process-page');let prepared='';
  if(current.identity){const start=await json('/api/personal/prepare?action=start&page=process-page&intent=switch',{});assert.equal((await json('/api/personal/prepare?action=ack&page=process-page&id='+start.id,{})).ready,true);prepared='&page=process-page&preparation='+start.id;}
  user=name;await json('/api/personal/'+(current.identity?'switch':'login')+'?returnTo=%2F'+prepared,{});assert.equal((await request('/account/callback?code=synthetic&state='+state)).status,303);token=(await json('/api/personal/status')).viewToken;
 };
 changeMcpClientCredential(home,"runtime:codex","connect");changeMcpClientCredential(home,"runtime:account-process-test","connect");
 const peers:Client[]=[];
 const processEnv=()=>({...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),MOLIS_WORK_HOME:home,MOLIS_WORK_RUNTIME_ID:'codex',MOLIS_WORK_WEB_URL:origin,CODEX_THREAD_ID:'account-process-context'});
 const stdio=async()=>{
  const client=new Client({name:'account-process-test',version:'1'}),transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx',fileURLToPath(new URL('../apps/desktop/launchers/mcp/server.ts',import.meta.url))],env:processEnv(),stderr:'pipe'});
  let stderr='';transport.stderr?.on('data',chunk=>{stderr+=String(chunk);});peers.push(client);await client.connect(transport).catch(error=>{throw new Error(String(error)+' '+stderr);});return client;
 };
 const projects=async(client:Client)=>{const result=await client.callTool({name:'molis_work_v1_context_list_projects',arguments:{}});assert.notEqual(result.isError,true,JSON.stringify(result));const text=(result.content as Array<{type:string;text?:string}>).find(part=>part.type==='text')?.text;assert.ok(text);return JSON.parse(text).projects as Array<{project_id:string;display_name:string}>;};
 const cli=(args:string[])=>run(process.execPath,['--import','tsx',fileURLToPath(new URL('../apps/desktop/launchers/cli/main.ts',import.meta.url)),...args],{env:processEnv()});
 const snapshot=async(project:{project_id:string;database_path:string})=>{const result=await cli(['v1','snapshot','--db',project.database_path,'--json',JSON.stringify({project_id:project.project_id})]);assert.equal(JSON.parse(result.stdout).board.project_id,project.project_id);return result;};
 const starter=createMcpResidentStarter();
 try{
  await assert.rejects(cli(['demo','create','--confirm','--json']),'an unlogged default installation never falls back to anonymous demo writes');
  assert.equal(existsSync(join(home,'projects','catalog.db')),false,'login-only installation has no root business catalog');
  const external=join(home+'-external','project.db');
  await cli(['v1','init','--db',external,'--json',JSON.stringify({project_id:'external',idempotency_key:'explicit-standalone'})]);
  await snapshot({project_id:'external',database_path:external});
  const unlogged=await fetch(origin+ACCOUNT_CONNECT_PATH,{method:'POST',headers:{Origin:origin,[NATIVE_SESSION_HEADER]:proof,'x-molis-work-control-token':rootToken,'x-molis-work-idempotency-key':'unlogged-native-connect'},body:'{}'});assert.equal(unlogged.status,401);
  await login('alice');
  for(const native of [undefined,'forged-native-proof']){
   const refused=await fetch(origin+ACCOUNT_CONNECT_PATH,{method:'POST',headers:{Cookie:cookie,Origin:origin,'content-type':'application/json','x-molis-work-control-token':rootToken,'x-molis-work-idempotency-key':'no-native-'+(++sequence),...(native?{[NATIVE_SESSION_HEADER]:native}:{})},body:'{}'});
   assert.equal(refused.status,403,'a browser root CSRF token and current cookie do not grant OS account switching authority');assert.doesNotMatch(await refused.text(),/homeDirectory|controlToken/);
  }
  const foreign=await fetch(origin+ACCOUNT_CONNECT_PATH,{method:'POST',headers:{Origin:'https://foreign.invalid',[NATIVE_SESSION_HEADER]:proof,'x-molis-work-control-token':rootToken,'x-molis-work-idempotency-key':'foreign-native-origin'},body:'{}'});assert.equal(foreign.status,403);
  const a=(await json('/api/settings/projects',{display_name:'Alice process project',user_confirmed:true})).project;await request('/projects/'+a.project_id);
  const attached=await connectResidentAccount(home,origin);assert.equal(attached.controlToken,token);assert.ok(attached.homeDirectory.startsWith(join(home,'spaces')));
  await starter.ensure(attached.homeDirectory,origin,new AbortController().signal);
  const caller={actor_id:'runtime:account-process-test',project_id:null,audience:'mcp' as const,permissions:[]};
  const oldGateway=new LocalActionGatewayClient({url:origin,homeDirectory:attached.homeDirectory,credentialHomeDirectory:home,clientId:caller.actor_id,projectId:null});await oldGateway.discover(caller);
  const oldA=await stdio();assert.ok((await projects(oldA)).some(project=>project.project_id===a.project_id));await snapshot(a);
  await login('bob');const b=(await json('/api/settings/projects',{display_name:'Bob process project',user_confirmed:true})).project;await request('/projects/'+b.project_id);
  assert.equal((await oldA.callTool({name:'molis_work_v1_context_list_projects',arguments:{}})).isError,true);
  const currentB=await stdio(),bProjects=await projects(currentB);assert.ok(bProjects.some(project=>project.project_id===b.project_id));assert.ok(!bProjects.some(project=>project.project_id===a.project_id));
  await assert.rejects(snapshot(a));await snapshot(b);
  await login('alice');
  await assert.rejects(oldGateway.discover(caller),{code:'host.request_refused'},'the old direct client never rereads the renewed A token');
  assert.equal((await oldA.callTool({name:'molis_work_v1_context_list_projects',arguments:{}})).isError,true,'the old shipped process cannot reattach when A returns');
  assert.equal((await currentB.callTool({name:'molis_work_v1_context_list_projects',arguments:{}})).isError,true);
  const currentA=await stdio(),aProjects=await projects(currentA);assert.ok(aProjects.some(project=>project.project_id===a.project_id));assert.ok(!aProjects.some(project=>project.project_id===b.project_id));await snapshot(a);
  await close(auth);const offline=await json('/api/personal/status');assert.equal(offline.offline,true);assert.equal(offline.identity.userId,'alice');
  const offlineA=await stdio();assert.ok((await projects(offlineA)).some(project=>project.project_id===a.project_id));await snapshot(a);
  for(const missing of [[NATIVE_SESSION_FILE],['config/web-control-token'],[NATIVE_SESSION_FILE,'config/web-control-token']]){
   for(const file of missing)unlinkSync(join(home,file));
   try{await assert.rejects(snapshot(a),'a missing installation credential must not select anonymous business');await assert.rejects(cli(['demo','create','--confirm','--json']));assert.equal(existsSync(join(home,'projects','catalog.db')),false);}
   finally{writeFileSync(join(home,NATIVE_SESSION_FILE),proof,{mode:0o600});writeFileSync(join(home,'config','web-control-token'),rootToken+'\n',{mode:0o600});}
  }
 }finally{
  starter.close();for(const peer of peers)await peer.close();await close(server);if(auth.listening)await close(auth);for(const[key,value]of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;rmSync(home,{recursive:true,force:true});rmSync(home+"-external",{recursive:true,force:true});
 }
});
