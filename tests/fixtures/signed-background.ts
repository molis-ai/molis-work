import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { TestContext } from 'node:test';
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from '@molis-ai/molis-work-contracts/platform/actions';
import { SANDBOX_PACKAGE_FILES, type PluginDefinition } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxOperationContract, SandboxPluginContract, SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { effectsFromContract, sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
import { homeSqlitePath } from '@molis-ai/molis-work-storage';
import { fixture, operate, operationsOf } from './home-sandbox.js';
import { newPublisher, signedPackage } from './sandbox-package.js';
import { serveTestHost } from './test-home.js';

export const BACKGROUND_ID = 'io.molis.work.example.background398';
export const BACKGROUND_PERMISSIONS = ['storage:private', 'home-database:read', 'home-database:write', 'owner-files:read', 'owner-files:write', 'connections:use', 'materials:read', 'fixture:write'];
const state: SandboxSchema = { type: 'string', enum: ['pending', 'accepted', 'running', 'done', 'failed', '待核对', 'missing'] };
const object = (properties: Record<string, SandboxSchema>, required = Object.keys(properties)): SandboxSchema => ({ type: 'object', properties, required, additionalProperties: false });
const text: SandboxSchema = { type: 'string' }, jobInput = object({ job_id: text });
const jobOutput = object({ job_id: text, state, last_state: text, execution_id: text, cancelled: { type: 'boolean' } });
const example = { job_id: 'example', state: 'pending', last_state: 'pending', execution_id: '', cancelled: false };
const metadata = { status: 'job.status', id: 'job_id', input: 'job_id', state: 'state', done: ['done'], failed: ['failed'] };
const schema = `CREATE TABLE jobs(job_id TEXT PRIMARY KEY, state TEXT NOT NULL, execution_id TEXT NOT NULL DEFAULT '', pid INTEGER); CREATE TABLE parents(id INTEGER PRIMARY KEY); CREATE TABLE results(id TEXT PRIMARY KEY, text TEXT NOT NULL, parent INTEGER REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED);`;

const BODY = `const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function row(sdk, id, confirmed = false, cancelled = false) {
  const [r] = await sdk.homeDatabase.all('SELECT * FROM jobs WHERE job_id=?', [id]);
  if (!r) return {job_id:id,state:'missing',last_state:'missing',execution_id:'',cancelled};
  return {job_id:id,state:confirmed || ['done','failed'].includes(r.state) ? r.state : '待核对',last_state:r.state,execution_id:r.execution_id,cancelled};
}
export const operations = {
  'notes.list': async (_input,sdk) => [{id:String(process.pid),text:JSON.stringify(await sdk.homeDatabase.all('SELECT * FROM jobs ORDER BY job_id'))}],
  'notes.add': async (input,sdk) => {
    const cmd=JSON.parse(input.text);
    await sdk.homeDatabase.transaction([{sql:'INSERT INTO jobs(job_id,state) VALUES (?,?)',parameters:[cmd.job_id,'pending']}]);
    if(cmd.mode==='pending') return row(sdk,cmd.job_id,true);
    const execution_id=await sdk.background.start(cmd.target ?? 'job.work',cmd.bad_input ?? {job_id:cmd.job_id,mode:cmd.mode ?? 'fast'});
    // BG-2: acceptance is one atomic conditional update, never a read followed by an unconditional accepted write.
    await sdk.homeDatabase.transaction([{sql:"UPDATE jobs SET state=CASE WHEN state='pending' THEN 'accepted' ELSE state END, execution_id=? WHERE job_id=?",parameters:[execution_id,cmd.job_id]}]);
    return row(sdk,cmd.job_id,true);
  },
  'job.status': async (input,sdk) => row(sdk,input.job_id),
  'job.cancel': async (input,sdk) => row(sdk,input.job_id,false,await sdk.background.cancel(input.execution_id)),
  'job.cancel.other': async (input,sdk) => row(sdk,input.job_id,false,await sdk.background.cancel(input.execution_id)),
  'job.release': async (input,sdk) => {await sdk.storage.set('release:'+input.job_id,true);return true},
  'job.inspect': async (_input,sdk) => JSON.stringify({jobs:await sdk.homeDatabase.all('SELECT * FROM jobs ORDER BY job_id'),results:await sdk.homeDatabase.all('SELECT * FROM results ORDER BY id'),pid:process.pid}),
  'job.query-start': async (input,sdk) => {try {await sdk.background.start('job.work',{job_id:input.job_id,mode:'fast'});return 'unexpected'} catch(error) {return error.code}},
  'job.query-cancel': async (input,sdk) => {try {return String(await sdk.background.cancel(input.execution_id))} catch(error) {return error.code}},
  'job.work': async (input,sdk) => {
    await sdk.homeDatabase.transaction([{sql:"UPDATE jobs SET state='running',pid=? WHERE job_id=?",parameters:[process.pid,input.job_id]}]);
    if(input.mode==='forge') throw Object.assign(new Error('untrusted worker outcome'),{outcome:'unknown'});
    if(input.mode==='hold') while(await sdk.storage.get('release:'+input.job_id)===null) await wait(100);
    if(input.mode==='dependency') await sdk.capability.call('fixture.bgwait',input.job_id);
    const statements=[{sql:'INSERT INTO results(id,text) VALUES (?,?)',parameters:[input.job_id+':a','first']}];
    statements.push(input.mode==='commit-fail' ? {sql:'INSERT INTO results(id,text,parent) VALUES (?,?,42)',parameters:[input.job_id+':b','second']} : {sql:'INSERT INTO results(id,text) VALUES (?,?)',parameters:[input.job_id+':b','second']});
    await sdk.homeDatabase.transaction(statements);
    await sdk.ownerFiles.write([{op:'write',path:'data/'+input.job_id+'.txt',data_base64:'ZG9uZQ==',mode:'create'}]);
    if(input.mode==='https') await sdk.connections.request('github',{url:'https://api.github.com/user',method:'GET'});
    if(input.mode==='materials') {const material=await sdk.materials.readDocuments([{file_name:'result.txt',data_base64:'QmFja2dyb3VuZCBtYXRlcmlhbCB3b3Jrcy4='}]);await sdk.homeDatabase.transaction([{sql:'INSERT INTO results(id,text) VALUES (?,?)',parameters:[input.job_id+':material',JSON.stringify(material)]}]);}
    await sdk.homeDatabase.transaction([{sql:"UPDATE jobs SET state='done' WHERE job_id=?",parameters:[input.job_id]}]);
    return true;
  },
};`;

export function signedBackgroundPackage(publisher = newPublisher(), options: { dependency?: boolean; version?: string; id?: string } = {}) {
  return signedPackage(publisher, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const read = contract.operations[0]!, launch = contract.operations[1]!;
    read.effects = { homeDatabase: ['read'] };
    launch.output = jobOutput; launch.examples = [{ input: { text: '{"job_id":"example"}' }, output: example }];
    launch.effects = { homeDatabase: ['read', 'write'], background: ['job.work'] }; launch.background_job = metadata;
    const op = (id: string, kind: 'command' | 'query', input: SandboxSchema, output: SandboxSchema, effects: SandboxOperationContract['effects'], sample: unknown): SandboxOperationContract =>
      ({ id, kind, input, output, effects, errors: [], examples: [sample as SandboxOperationContract['examples'][number]] });
    contract.operations.push(
      op('job.status','query',jobInput,jobOutput,{homeDatabase:['read']},{input:{job_id:'example'},output:example}),
      ...['job.cancel','job.cancel.other'].map(id => ({...op(id,'command',object({job_id:text,execution_id:text}),jobOutput,
        {homeDatabase:['read'],background:['job.work'],...(id.endsWith('other') && options.dependency ? {capabilities:['fixture.bgwait']} : {})},
        {input:{job_id:'example',execution_id:'handle'},output:example}),background_job:metadata})),
      op('job.release','command',jobInput,{type:'boolean'},{storage:['write']},{input:{job_id:'example'},output:true}),
      op('job.inspect','query',object({}),text,{homeDatabase:['read']},{input:{},output:'{}'}),
      op('job.query-start','query',jobInput,text,{}, {input:{job_id:'example'},output:'sandbox.not_authorized'}),
      op('job.query-cancel','query',object({execution_id:text}),text,{}, {input:{execution_id:'handle'},output:'sandbox.not_authorized'}),
      op('job.work','command',object({job_id:text,mode:text}),{type:'boolean'}, {storage:['read'],homeDatabase:['read','write'],ownerFiles:['write'],connections:['github'],materials:['read'],
        ...(options.dependency ? {capabilities:['fixture.bgwait']} : {})}, {input:{job_id:'example',mode:'fast'},output:true}),
    );
    Object.assign(manifest, sandboxPluginManifest({ pluginId: manifest.plugin_id, version: manifest.version, name: manifest.name, publisher: manifest.publisher, presentation: false,
      runtime: {scope:'home'}, upgradesFrom:['1.0.0'], effects:effectsFromContract(contract),contract, homeDatabase:{version:1,schema},ownerFiles:[{name:'data',kind:'directory'}],
      connections:{slots:[{slot_id:'github',service_id:'github',reason:'读取已绑定的测试账号'}]} }));
    files[SANDBOX_PACKAGE_FILES.contract]=JSON.stringify(contract); files[SANDBOX_PACKAGE_FILES.entrypoint]=BODY;
  }, {pluginId:options.id ?? BACKGROUND_ID,version:options.version});
}

export async function backgroundRig(t: TestContext, options: { dependencies?: PluginDefinition[] } = {}) {
  const h = await fixture(t,{pluginFixtures:options.dependencies ? {home:options.dependencies}:undefined});
  let served = await serveTestHost(null,{home:h.home,host:h.host}); t.after(()=>served.close());
  const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({actor_id:LOCAL_PERSON_ACTOR_ID,project_id:null,audience:'user',permissions:BACKGROUND_PERMISSIONS,...extra});
  const record = () => h.host.homePlugins!.installation(BACKGROUND_ID)!;
  const control = (action: string, keep_data?: boolean) => served.web.post('/api/settings/plugin-permissions/'+action,{plugin_id:BACKGROUND_ID,...(keep_data===undefined?{}:{keep_data})});
  const set = (permission: string,granted: boolean) => served.web.post('/api/settings/plugin-permissions/set',{install_id:record().install_id,permission,granted});
  const approve = async () => {
    const rows = await served.web.post<{plugins:Array<{plugin_id:string;permissions:Array<{permission:string;required:boolean;requested:boolean}>}>}>('/api/settings/plugin-permissions/list',{});
    for(const row of rows.plugins.find(plugin=>plugin.plugin_id===BACKGROUND_ID)!.permissions) if(!row.required&&row.requested) await set(row.permission,true);
  };
  const call = async (id: string,input: unknown,who=caller()) => {const client=h.homeClient();return operate(client,who,await operationsOf(client,who,BACKGROUND_ID),id,input)};
  const dbPath = () => homeSqlitePath(h.home,'sbxdb-'+createHash('sha256').update(BACKGROUND_ID).digest('hex').slice(0,32));
  const read = (sql: string,parameters: string[]=[]) => {const db=new DatabaseSync(dbPath(),{readOnly:true});try{return db.prepare(sql).all(...parameters)}finally{db.close()}};
  const until = async (check:()=>boolean|Promise<boolean>) => {const deadline=Date.now()+15000;while(!await check()){assert.ok(Date.now()<deadline,'background condition completed');await new Promise(resolve=>setTimeout(resolve,40))}};
  return {h,caller,record,control,set,approve,call,read,until,dbPath,project:(name:string)=>served.createProject(name),
    launch:(job_id:string,mode='fast',who=caller(),extra={})=>call('notes.add',{text:JSON.stringify({job_id,mode,...extra})},who),
    status:(job_id:string)=>call('job.status',{job_id}) as Promise<{job_id:string;state:string;last_state:string;execution_id:string;cancelled:boolean}>,
    async reopen(){await served.close();await h.reopen();served=await serveTestHost(null,{home:h.home,host:h.host})}};
}
