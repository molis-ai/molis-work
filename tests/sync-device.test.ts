import { syncRoundResponse } from './fixtures/sync-round.js';
import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersonalSync} from '@molis-ai/molis-work-module-sync-replication';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';

function fixture(t:TestContext){
  t.mock.timers.enable({apis:['setInterval']});
  const root=mkdtempSync(join(tmpdir(),'sync-device-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const clients:PersonalSync[]=[],paths:string[]=[];let requests=0,online=true;
  const create=(user='alice')=>{
    const space=personalStorageSpace('http://127.0.0.1:8787','work',user),home=join(root,user);
    ensureStorageSpace(home,space);const authority=new AbortController();
    let delay:Promise<void>|null=null;
    const sync=new PersonalSync({home,spaceId:space.spaceId,endpoint:'http://127.0.0.1:8788',registrations:[],authority:{signal:authority.signal,assertCurrent(){authority.signal.throwIfAborted();},accessToken:async()=>'synthetic-only'},fetch:async(input)=>{
      requests++;paths.push(new URL(String(input)).pathname);if(!online)throw new Error('offline');if(delay)await delay;
      if(new URL(String(input)).pathname==='/v1/round')return syncRoundResponse({spaceId:space.spaceId,revision:1,selections:[]},0);
      return Response.json(new URL(String(input)).pathname==='/v1/quota'?{limitBytes:100000000,usedBytes:0}:{spaceId:space.spaceId,revision:1,selections:[]});
    }});
    clients.push(sync);return {sync,authority,home,delay(value:Promise<void>){delay=value;}};
  };
  t.after(()=>clients.forEach(sync=>sync.close()));
  return {create,paths,requests:()=>requests,offline:()=>online=false,online:()=>online=true};
}

test('PCSYNC-02/03/04 a new device is silent; policy save and manual sync never start a timer',async t=>{
  const f=fixture(t),{sync}=f.create();
  assert.deepEqual(sync.status().device,{automatic:null});sync.start();assert.equal(f.requests(),0);
  assert.equal(sync.status().progress.complete,false,'PCSYNC-27 an unconfigured new device never claims complete');
  await sync.save(sync.policy());assert.equal(f.requests(),1);
  t.mock.timers.tick(60000);assert.equal(f.requests(),1,'saving collections does not enable auto sync');
  await sync.run();assert.equal(f.requests(),2);assert.deepEqual(f.paths,['/v1/policy','/v1/round'],'one idle cycle authenticates once and reads its complete round summary');
  t.mock.timers.tick(60000);assert.equal(f.requests(),2,'manual run is one cycle');
  await sync.setDevice(false);sync.start();t.mock.timers.tick(60000);
  assert.equal(f.requests(),2);assert.deepEqual(sync.status().device,{automatic:false});
});

test('PCSYNC-02/05 choices persist independently per account and resume after restart/reconnect',async t=>{
  const f=fixture(t),a=f.create();await a.sync.setDevice(true);await a.sync.run();
  assert.deepEqual(a.sync.status().device,{automatic:true});
  const b=f.create('bob');assert.deepEqual(b.sync.status().device,{automatic:null});
  await b.sync.setDevice(false);assert.deepEqual(a.sync.status().device,{automatic:true});
  a.sync.close();const restarted=f.create();assert.deepEqual(restarted.sync.status().device,{automatic:true});
  const before=f.requests();restarted.sync.start();await restarted.sync.run();assert.equal(f.requests(),before+1);assert.deepEqual(f.paths.slice(before),['/v1/round']);
  f.offline();t.mock.timers.tick(15000);await restarted.sync.run();assert.match(restarted.sync.status().error??'',/offline/);
  f.online();t.mock.timers.tick(15000);await restarted.sync.run();assert.equal(restarted.sync.status().error,null);
  await restarted.sync.setDevice(false);const disabled=f.requests();t.mock.timers.tick(60000);
  assert.equal(f.requests(),disabled);assert.deepEqual(f.create().sync.status().device,{automatic:false});
});

test('PCSYNC-06 disabling cancels a delayed response before applying policy; revocation cannot revive a timer',async t=>{
  const f=fixture(t),a=f.create();let release!:()=>void;
  a.delay(new Promise<void>(resolve=>release=resolve));
  await a.sync.setDevice(true);await Promise.resolve();
  const stopping=a.sync.setDevice(false);release();await stopping;
  assert.equal(a.sync.policy().revision,0,'the delayed response cannot write the policy cache');
  assert.equal(a.sync.status().running,false);assert.deepEqual(a.sync.status().device,{automatic:false});
  const before=f.requests();t.mock.timers.tick(60000);assert.equal(f.requests(),before);
  const b=f.create('bob');await b.sync.setDevice(true);await b.sync.run();b.authority.abort();b.sync.close();
  const revoked=f.requests();t.mock.timers.tick(60000);assert.equal(f.requests(),revoked);
  await assert.rejects(()=>b.sync.setDevice(true));
});

test('PCSYNC-02 a copied or malformed preference is rejected instead of enabling another account',async t=>{
  const f=fixture(t),a=f.create();await a.sync.setDevice(true);await a.sync.run();a.sync.close();
  const b=f.create('bob');b.sync.close();
  writeFileSync(join(b.home,'sync','device.json'),readFileSync(join(a.home,'sync','device.json')));
  assert.throws(()=>f.create('bob'),/本机同步设置无效/);
  writeFileSync(join(a.home,'sync','device.json'),JSON.stringify({version:1,spaceId:'wrong',automatic:true}));
  assert.throws(()=>f.create(),/本机同步设置无效/);
});
