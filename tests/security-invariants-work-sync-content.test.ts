import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {mkdtempSync,rmSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openWorkSessionRegistry,createSessionReplicationSupport} from '@molis-ai/molis-work-app-local-host';
import {purgeSessionsProject,withWorkSessionReplica,sessionSyncReferenceDeclaration,hasSessionSyncProtectedData,createSessionContentStore,type WorkSessionReplicationOptions} from '@molis-ai/molis-work-module-private-work-context';
import {createContextLedger,createContextHistoryReplication} from '@molis-ai/molis-work-module-context-ledger';
import {ensureStorageSpace,personalStorageSpace,createLazyFileSecretStore,createLocalPayloadProtection} from '@molis-ai/molis-work-storage';
import {createSyncConflictState} from '@molis-ai/molis-work-plugin-sdk';
import type {SyncMutation} from '@molis-ai/molis-work-contracts/platform/sync-transport';

function fixture(t:TestContext){
  const root=mkdtempSync(join(tmpdir(),'private-work-sync-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const space=personalStorageSpace('https://auth.example.test','work','alice');
  const homes=['a','b'].map(id=>join(root,id));for(const home of homes)ensureStorageSpace(home,space);
  let active=true,revokeOnReplace=false;
  const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const options=homes.map((home):WorkSessionReplicationOptions=>{
    const replication=createSessionReplicationSupport();
    return {home,spaceId:space.spaceId,replication,authorize,conflictState:createSyncConflictState,
      protection:createLocalPayloadProtection({secrets:createLazyFileSecretStore(home),keyRef:'system:test:work-sync-body',scope:space.spaceId,authorize,hasProtectedData:()=>hasSessionSyncProtectedData(home,replication)}),
      createLedger:(db,fresh)=>createContextLedger(db,{initializeSchema:fresh,authorize:()=>{authorize();return true;}}),
      createReferences(db){const refs=createContextHistoryReplication(db,{...sessionSyncReferenceDeclaration,authorize});
        return {...refs,replace(source,history){refs.replace(source,history);if(revokeOnReplace)active=false;}};},
    };
  });
  const replica=<T>(index:number,run:Parameters<typeof withWorkSessionReplica<T>>[1])=>withWorkSessionReplica(options[index]!,run);
  const receive=(index:number,mutation:SyncMutation,revision=1)=>replica(index,r=>r.receive({...mutation,revision}));
  const open=(index:number)=>openWorkSessionRegistry({homeDirectory:homes[index]});
  return {homes,space,options,replica,receive,open,armRevocation:()=>{revokeOnReplace=true;},reauthorize:()=>{active=true;}};
}

test('S-49 PCSYNC-23 actual Work owner preserves large private history, reencrypts on target and never resumes imported Handoffs',async t=>{
  const f=fixture(t),a=await f.open(0);t.after(()=>a.close());
  const marker='PRIVATE-WORK-PLAINTEXT-MARKER-',body=marker.repeat(12000);
  const source=a.createSession({runtime_id:'synthetic-runtime',native_runtime_session_id:'source-native-handle',surface_id:'source-native-surface',actor_id:'person',user_confirmed:true,
    project_id:'project',current_goal_id:'old-goal',workspace_path:'/synthetic/source-only-workspace',metadata:{work_context_id:'private-device-context'},title:'Observed work'});
  a.updateAssociations({session_id:source.session_id,current_goal_id:'goal',actor_id:'person',user_confirmed:true});
  a.appendEvent({session_id:source.session_id,source:'molis_work',kind:'user_message',source_id:'saved-user-input',content:body,metadata:{tool:'synthetic-read',goal_id:'goal',state:null,panel_id:'source-native-surface'}});
  const drafts=Array.from({length:2},()=>a.createHandoffDraft({source_session_id:source.session_id,source_project_id:'project',source_goal_id:'goal',source_goal_version:7,target_runtime_id:'destination',target_project_id:'project',target_workspace_id:'source-workspace-grant',target_workspace_path:'/synthetic/source-only-workspace',content:body,actor_id:'person'}));
  a.markHandoffSending(drafts[1]!.package_id);
  const mutation=f.replica(0,r=>r.next())!;assert.ok(Buffer.byteLength(JSON.stringify(mutation.value))>1024*1024);
  assert.doesNotMatch(JSON.stringify(mutation),/source-native-handle|source-native-surface|source-workspace-grant|source-only-workspace|private-device-context/);
  f.receive(1,mutation);f.replica(0,r=>r.acknowledge(mutation.key,mutation.operationId,1));
  const b=await f.open(1);t.after(()=>b.close());const restored=b.get(source.session_id);
  assert.equal(restored.title,'Observed work');assert.equal(restored.native_runtime_session_id,null);assert.equal(restored.surface_id,null);assert.equal(restored.correlation_token,null);assert.equal(restored.workspace_path,null);assert.deepEqual(restored.metadata,{});
  assert.deepEqual(b.goalHistory(source.session_id),a.goalHistory(source.session_id));assert.equal(b.events(source.session_id)[0]!.content,body);
  assert.deepEqual(b.events(source.session_id)[0]!.metadata,{tool:'synthetic-read',goal_id:'goal',state:null});
  assert.equal(b.getHandoff(drafts[1]!.package_id).state,'sending');assert.equal(b.getHandoff(drafts[0]!.package_id).content,body);assert.equal(b.latestPendingHandoff(source.session_id),null);
  assert.throws(()=>b.markHandoffSending(drafts[0]!.package_id),{code:'work.session.handoff_invalid_state'});
  assert.equal(f.replica(1,r=>r.next()),null,'restoration causes no journal echo');
  assert.equal(readFileSync(join(f.homes[0]!,'sessions','content','content.key')).equals(readFileSync(join(f.homes[1]!,'sessions','content','content.key'))),false,'target uses its own per-Home content key');
  for(const home of f.homes)for(const entry of readdirSync(join(home,'sessions'),{recursive:true,encoding:'utf8'})){
    const path=join(home,'sessions',entry);if(statSync(path).isFile())assert.equal(readFileSync(path).includes(Buffer.from(marker)),false,'no business blob, technical SQLite or WAL stores plaintext');
  }
});

test('S-49 PCSYNC-01 wrong-space content and foreign Session event IDs are isolated without overwriting either owner',async t=>{
  const f=fixture(t),a=await f.open(0),b=await f.open(1);t.after(()=>{a.close();b.close();});
  const source=a.createSession({runtime_id:'synthetic',actor_id:'person',user_confirmed:true});
  a.appendEvent({session_id:source.session_id,source:'molis_work',kind:'user_message',source_id:'text',content:'retained body'});
  const mutation=f.replica(0,r=>r.next())!,foreign=structuredClone(mutation);Object.assign(foreign.value as object,{spaceId:'other-person'});
  f.receive(1,foreign);assert.equal(b.list().length,0);assert.equal(f.replica(1,r=>r.conflicts()).length,1);
  assert.equal(f.replica(0,r=>r.counts()).pending,1);
  const fresh=f.options[1]!,other=b.createSession({runtime_id:'synthetic',actor_id:'person',user_confirmed:true});
  const event=b.appendEvent({session_id:other.session_id,source:'molis_work',kind:'user_message',source_id:'local',content:'local text'});
  // The earlier failed foreign branch remains isolated. A distinct asset key probes the stable event-ID collision.
  const payload=structuredClone(mutation.value) as {spaceId:string;session:{session_id:string};events:{event_id:string;session_id:string}[]};
  payload.session.session_id='session-collision-probe';payload.events[0]!.session_id='session-collision-probe';payload.events[0]!.event_id=event.event_id;
  withWorkSessionReplica(fresh,r=>r.receive({operationId:'foreign-event',key:'session-collision-probe',base:0,revision:2,value:payload}));
  assert.equal(b.list().length,1);assert.equal(b.events(other.session_id)[0]!.content,'local text');
  assert.equal(f.replica(1,r=>r.conflicts()).length,2);
});

test('S-49 PCSYNC-06 late revocation rolls back the complete Session and references after restoring starts',async t=>{
  const f=fixture(t),a=await f.open(0);t.after(()=>a.close());
  const source=a.createSession({runtime_id:'synthetic',actor_id:'person',user_confirmed:true,project_id:'project',current_goal_id:'goal'});
  a.appendEvent({session_id:source.session_id,source:'molis_work',kind:'user_message',source_id:'saved',content:'retained'});
  const mutation=f.replica(0,r=>r.next())!;f.armRevocation();assert.throws(()=>f.receive(1,mutation),/REVOKED/);f.reauthorize();
  const b=await f.open(1);t.after(()=>b.close());assert.deepEqual(b.list(),[]);assert.deepEqual(f.replica(1,r=>r.counts()),{pending:0,conflicts:0});
});

test('S-49 PCSYNC-23 active target native work refuses a restored history even during explicit conflict adoption',async t=>{
  const f=fixture(t),a=await f.open(0);t.after(()=>a.close());
  const source=a.createSession({runtime_id:'synthetic',native_runtime_session_id:'source-bound-native',actor_id:'person',user_confirmed:true});
  a.appendEvent({session_id:source.session_id,source:'molis_work',kind:'user_message',source_id:'first',content:'before'});
  const first=f.replica(0,r=>r.next())!;f.receive(1,first);f.replica(0,r=>r.acknowledge(first.key,first.operationId,1));
  const b=await f.open(1);t.after(()=>b.close());b.updateAssociations({session_id:source.session_id,current_goal_id:'target-choice',actor_id:'person',user_confirmed:true});
  a.appendEvent({session_id:source.session_id,source:'molis_work',kind:'user_message',source_id:'second',content:'local-after'});
  const next=f.replica(1,r=>r.next())!;f.receive(0,next,2);const comparison=f.replica(0,r=>r.inspectConflict!(next.key))!;
  assert.throws(()=>f.replica(0,r=>r.resolve(next.key,'remote',2,comparison.state)),{code:'work.session.sync_busy'});
  assert.deepEqual(a.events(source.session_id).map(event=>event.content),['before','local-after']);
  assert.equal(a.get(source.session_id).native_runtime_session_id,'source-bound-native');
  assert.deepEqual(f.replica(0,r=>r.inspectConflict!(next.key)),comparison,'rejected adoption retains both full branches and confirmation state');
  // This imported identity has no native correlation or surface and therefore cannot acquire a runtime by a guessed ID.
  assert.throws(()=>b.linkNativeRuntimeSession({session_id:source.session_id,runtime_id:'synthetic',native_runtime_session_id:'guessed-handle',actor_id:'person'}),{code:'work.session.correlation_invalid'});
  assert.equal(b.events(source.session_id).length,1);assert.ok(comparison.state);assert.equal(comparison.local!==null,true);
});

test('S-49 PCSYNC-12 an unavailable source original is never frozen as the UI null placeholder and remains retryable',async t=>{
  const f=fixture(t),a=await f.open(0);t.after(()=>a.close());
  const source=a.createSession({runtime_id:'synthetic',actor_id:'person',user_confirmed:true});
  a.appendEvent({session_id:source.session_id,source:'molis_work',kind:'user_message',source_id:'saved',content:'source original must survive'});
  const directory=join(f.homes[0]!,'sessions','content'),blobs=readdirSync(join(directory,'blobs'),{recursive:true,encoding:'utf8'}).filter(name=>name.endsWith('.blob'));
  assert.equal(blobs.length,1);rmSync(join(directory,'blobs',blobs[0]!));
  assert.equal(a.events(source.session_id)[0]!.content_available,false,'the UI may report unavailability, but this is not a portable empty body');
  assert.throws(()=>f.replica(0,r=>r.next()),/原正文暂不可读/);assert.deepEqual(f.replica(0,r=>r.counts()),{pending:1,conflicts:0});
  createSessionContentStore(directory).write('source original must survive');const retried=f.replica(0,r=>r.next())!;
  assert.equal((retried.value as {events:{content:string}[]}).events[0]!.content,'source original must survive');
});


test('S-49 PCSYNC-20 Work project scope follows ownership and retains unsettled deleted and frozen identities',async t=>{
 const f=fixture(t),a=await f.open(0);t.after(()=>a.close());
 const session=a.createSession({runtime_id:'synthetic',actor_id:'person',user_confirmed:true,project_id:'a',current_goal_id:'goal-a'});
 a.createHandoffDraft({source_session_id:session.session_id,source_project_id:'a',source_goal_id:'goal-a',source_goal_version:1,target_runtime_id:'destination',target_project_id:'destination-project',content:'handoff',actor_id:'person'});
 assert.match(f.replica(0,r=>r.locate!(session.session_id))!,/^\/projects\/a\//);
 const frozen=f.replica(0,r=>r.next())!;
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('a')),true);
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('destination-project')),false,'handoff target is not session ownership');
 a.updateAssociations({session_id:session.session_id,project_id:'b',current_goal_id:null,actor_id:'person',user_confirmed:true});
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('a')),true);
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('b')),true);
 purgeSessionsProject(f.homes[0]!,'b',db=>createContextLedger(db,{initializeSchema:false,authorize:()=>true}));
 assert.equal(a.list().length,0);
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('b')),true,'deleted session uses last owner edge through the public Ledger');
 f.replica(0,r=>r.acknowledge(frozen.key,frozen.operationId,1));
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('a')),false,'historical former owner must not block after ACK');
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('b')),true);
 const deletion=f.replica(0,r=>r.next())!;assert.equal(deletion.value,null);
 f.replica(0,r=>r.acknowledge(deletion.key,deletion.operationId,2));
 assert.equal(f.replica(0,r=>r.hasProjectChanges!('b')),false);
});
