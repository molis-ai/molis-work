import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pluginSyncAuthority,withPluginSyncAuthority} from '@molis-ai/molis-work-app-local-host';

const home='/tmp/sync-authority-lifetime';
const identity={plugin_id:'example.plugin',publisher_id:'example',publisher_signature:'verified',collection_id:'items',schema_version:1};
function fixture(){
  const context={spaceId:'personal:test',authorize(){},project(){return {title:'Project'};},canUploadProject:()=>true,hasArtifact:()=>false};
  const authority={home,context,assertCollection(value:typeof identity){assert.deepEqual(value,identity);}};
  return {authority,current:()=>pluginSyncAuthority(home,identity)};
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};}
const forbidden=(run:()=>unknown)=>assert.throws(run,{code:'actions.forbidden'});

test('sync authority expires for inherited microtasks and timers after synchronous return or throw',async()=>{
  for(const throws of [false,true]){
    const f=fixture();const delayed:Promise<void>[]=[];
    const invoke=()=>withPluginSyncAuthority(f.authority,()=>{
      const retained=f.current();retained.authorize();
      for(const schedule of [queueMicrotask,(run:()=>void)=>setTimeout(run,0)]){
        delayed.push(new Promise<void>((resolve,reject)=>schedule(()=>{
          try{forbidden(f.current);forbidden(()=>retained.authorize());resolve();}catch(error){reject(error);}
        })));
      }
      if(throws)throw new Error('callback failed');
      return 'result';
    });
    if(throws)assert.throws(invoke,/callback failed/);else assert.equal(invoke(),'result');
    await Promise.all(delayed);
  }
});

test('same authority object gets independent nested and concurrent operation lifetimes',async()=>{
  const f=fixture();
  withPluginSyncAuthority(f.authority,()=>{
    const outer=f.current();let inner!:ReturnType<typeof f.current>;
    withPluginSyncAuthority(f.authority,()=>{inner=f.current();inner.authorize();forbidden(()=>outer.authorize());});
    outer.authorize();forbidden(()=>inner.authorize());
  });
  const releases=[deferred(),deferred()];const checks:Array<()=>void>=[];
  const operations=releases.map((release,index)=>withPluginSyncAuthority(f.authority,async()=>{
    const retained=f.current();checks[index]=()=>retained.authorize();
    await release.promise;retained.authorize();f.current().authorize();
  }));
  releases[0].resolve();await operations[0];
  withPluginSyncAuthority(f.authority,()=>forbidden(checks[0]));
  releases[1].resolve();await operations[1];
});

test('async authority stays valid across await and expires for detached work after resolve or rejection',async()=>{
  for(const rejects of [false,true]){
    const f=fixture(),release=deferred(),detached=deferred();let late!:Promise<void>;
    const result=withPluginSyncAuthority(f.authority,async()=>{
      const retained=f.current();
      late=detached.promise.then(()=>{forbidden(f.current);forbidden(()=>retained.authorize());});
      await release.promise;f.current().authorize();retained.authorize();
      if(rejects)throw new Error('async failed');return 42;
    });
    release.resolve();if(rejects)await assert.rejects(result,/async failed/);else assert.equal(await result,42);
    detached.resolve();await late;
  }
});

test('thenable resolution, rejection and throwing then getters end their operation authority',async()=>{
  for(const mode of ['resolve','reject','getter'] as const){
    const f=fixture(),detached=deferred();let late!:Promise<void>;
    const invoke=()=>withPluginSyncAuthority(f.authority,()=>{
      const retained=f.current();
      late=detached.promise.then(()=>{forbidden(f.current);forbidden(()=>retained.authorize());});
      if(mode==='getter')return Object.defineProperty({},'then',{get(){throw new Error('getter failed');}});
      return {then(resolve:(value:number)=>void,reject:(error:Error)=>void){
        f.current().authorize();retained.authorize();
        queueMicrotask(()=>{retained.authorize();if(mode==='reject')reject(new Error('thenable failed'));else resolve(7);});
      }};
    });
    if(mode==='getter')assert.throws(invoke,/getter failed/);
    else if(mode==='reject')await assert.rejects(Promise.resolve(invoke()),/thenable failed/);
    else assert.equal(await invoke(),7);
    detached.resolve();await late;
  }
});

test('retained context lookup capabilities expire without calling the underlying owner after scope',()=>{
  const f=fixture();let reads=0;
  const authority={...f.authority,context:{...f.authority.context,
    project(){reads++;return {title:'Private'};},canUploadProject(){reads++;return true;},
    hasArtifact(){reads++;return true;},hasReference(){reads++;return true;},
  }};
  let calls:Array<()=>unknown>=[];
  withPluginSyncAuthority(authority,()=>{
    const context=f.current();
    calls=[()=>context.project('p'),()=>context.canUploadProject('p'),()=>context.hasArtifact('p','a',1),()=>context.hasReference!('p',{owner:'goals',assetId:'g'})];
    calls.forEach(call=>call());assert.equal(reads,4);
  });
  for(const call of calls){forbidden(call);assert.equal(reads,4,'an expired capability must not invoke its owner');}
  withPluginSyncAuthority(authority,()=>calls.forEach(forbidden));
});

test('context lookup results are refused if the owner revokes authority during the lookup',()=>{
  for(const method of ['project','canUploadProject','hasArtifact','hasReference'] as const){
    const f=fixture();let active=true;
    const revoke=()=>{active=false;return true;};
    const authority={...f.authority,context:{...f.authority.context,
      authorize(){if(!active)throw new Error('REVOKED');},project(){active=false;return {title:'Private'};},
      canUploadProject:revoke,hasArtifact:revoke,hasReference:revoke,
    }};
    withPluginSyncAuthority(authority,()=>{
      const context=f.current();
      const calls={project:()=>context.project('p'),canUploadProject:()=>context.canUploadProject('p'),hasArtifact:()=>context.hasArtifact('p','a',1),hasReference:()=>context.hasReference!('p',{owner:'goals',assetId:'g'})};
      assert.throws(calls[method],/REVOKED/);
    });
  }
});
