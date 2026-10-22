import assert from 'node:assert/strict';
import test, {type TestContext} from 'node:test';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLazyFileSecretStore, createLocalPayloadProtection } from '@molis-ai/molis-work-storage';
import {spawn} from 'node:child_process';

const keyRef='system:test:sync-protection';
function fixture(t:TestContext){
  const home=mkdtempSync(join(tmpdir(),'sync-protection-key-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const secrets=createLazyFileSecretStore(home);let used=false;
  const make=(scope='personal:alice:work',store=secrets)=>createLocalPayloadProtection({
    secrets:store,keyRef,scope,authorize(){},hasProtectedData:()=>used,
  });
  return {home,secrets,make,markUsed:()=>{used=true;}};
}

test('S-57 PCSYNC-23 the actual Home-bound provider opens without initialization and persists one pinned key for independent handles',t=>{
  const f=fixture(t),first=f.make();
  assert.throws(()=>first.open(Buffer.from('not initialized'),'asset'),{code:'storage.local_payload_key_unavailable'});
  assert.equal(existsSync(join(f.home,'feed','secrets.json')),false,'read-only failure never creates a credential backend');
  const bytes=randomBytes(4*1024*1024),sealed=first.seal(bytes,'asset');f.markUsed();
  const second=f.make('personal:alice:work',createLazyFileSecretStore(f.home));
  assert.deepEqual(Buffer.from(second.open(sealed,'asset')),bytes);
  assert.deepEqual(Buffer.from(first.open(second.seal(bytes,'asset'),'asset')),bytes);
  const file=readFileSync(join(f.home,'feed','secrets.json'));
  assert.equal(file.includes(Buffer.from(f.secrets.get(keyRef)!)),false,'the provider reuses the existing sealed SecretStore');
  assert.equal(JSON.parse(file.toString()).version,2);
});

for(const fault of ['missing','invalid','replaced','identity-missing','all-missing'] as const){
  test(`S-57 PCSYNC-12 ${fault} protection key refuses reads and writes without generating a replacement`,t=>{
    const f=fixture(t),provider=f.make(),body=Buffer.from('private content'),sealed=provider.seal(body,'asset');
    f.markUsed();const key=f.secrets.get(keyRef)!,identity=f.secrets.get(keyRef+':identity')!;
    if(fault==='missing'||fault==='all-missing')f.secrets.delete(keyRef);
    if(fault==='invalid')f.secrets.put(keyRef,'not-valid-base64-key');
    if(fault==='replaced')f.secrets.put(keyRef,randomBytes(32).toString('base64'));
    if(fault==='identity-missing'||fault==='all-missing')f.secrets.delete(keyRef+':identity');
    const file=join(f.home,'feed','secrets.json'),before=readFileSync(file);
    assert.throws(()=>provider.open(sealed,'asset'),{code:'storage.local_payload_key_unavailable'});
    assert.throws(()=>provider.seal(body,'another-asset'),{code:'storage.local_payload_key_unavailable'});
    assert.deepEqual(readFileSync(file),before);
    // Restoring the original key is explicit maintenance, never a read fallback.
    f.secrets.put(keyRef,key);f.secrets.put(keyRef+':identity',identity);
    assert.deepEqual(Buffer.from(f.make().open(sealed,'asset')),body);
  });
}

test('S-57 PCSYNC-01 the actual provider binds scope and purpose and rejects tampered ciphertext',t=>{
  const f=fixture(t),provider=f.make(),sealed=provider.seal(Buffer.from('private text'),'outbox:asset');f.markUsed();
  assert.throws(()=>f.make('personal:bob:work').open(sealed,'outbox:asset'),{code:'storage.local_payload_invalid'});
  assert.throws(()=>provider.open(sealed,'recovery:asset'),{code:'storage.local_payload_invalid'});
  const modified=Buffer.from(sealed);modified[modified.length-2]^=1;
  assert.throws(()=>provider.open(modified,'outbox:asset'),{code:'storage.local_payload_invalid'});
});

test('S-57 PCSYNC-06 revocation while pinning a key returns no protected body and a later authorized retry uses the same key',t=>{
  const f=fixture(t);let active=true,once=true;
  const provider=createLocalPayloadProtection({keyRef,scope:'personal:alice:work',hasProtectedData:()=>false,
    authorize(){if(!active)throw new Error('REVOKED');},secrets:{get:ref=>f.secrets.get(ref),
      createIfAbsent(ref,value){const result=f.secrets.createIfAbsent(ref,value);if(once){once=false;active=false;}return result;}},
  });
  assert.throws(()=>provider.seal(Buffer.from('private'),'asset'),/REVOKED/);
  const key=f.secrets.get(keyRef);assert.ok(key);active=true;
  const sealed=provider.seal(Buffer.from('private'),'asset');
  assert.equal(f.secrets.get(keyRef),key);assert.equal(Buffer.from(provider.open(sealed,'asset')).toString(),'private');
});

test('S-57 PCSYNC-23 separate processes racing first initialization pin the same actual SecretStore key',async t=>{
  const f=fixture(t),entry=import.meta.resolve('@molis-ai/molis-work-storage');
  const workers=Array.from({length:2},(_,i)=>{
    const script=`import {createLazyFileSecretStore,createLocalPayloadProtection} from ${JSON.stringify(entry)};
      const p=createLocalPayloadProtection({secrets:createLazyFileSecretStore(${JSON.stringify(f.home)}),keyRef:${JSON.stringify(keyRef)},scope:'personal:alice:work',authorize(){},hasProtectedData:()=>false});
      process.stdout.write('ready\\n');process.stdin.once('data',()=>{try{process.stdout.write(Buffer.from(p.seal(Buffer.from('worker-${i}'),'asset')).toString('base64')+'\\n');process.exitCode=0;}catch{process.exitCode=1;}process.stdin.destroy();});`;
    const child=spawn(process.execPath,['--input-type=module','--eval',script],{stdio:['pipe','pipe','pipe']});
    t.after(()=>{if(child.exitCode===null)child.kill();});
    let stdout='',stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
    const ready=new Promise<void>((resolve,reject)=>{
      child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.startsWith('ready\n'))resolve();});
      child.on('error',reject);child.on('exit',code=>{if(!stdout.startsWith('ready\n'))reject(new Error('worker did not initialize: '+code));});
    });
    const finished=new Promise<Buffer>((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>{
      if(code!==0||stderr.includes('Error:'))reject(new Error('isolated key worker failed: '+code));
      else resolve(Buffer.from(stdout.trim().split('\n')[1]??'','base64'));
    });});
    return {child,ready,finished};
  });
  const completion=Promise.all(workers.map(w=>w.finished));
  await Promise.all(workers.map(w=>w.ready));for(const worker of workers)worker.child.stdin.end('seal');
  const sealed=await completion;f.markUsed();
  for(const [i,value] of sealed.entries())assert.equal(Buffer.from(f.make().open(value,'asset')).toString(),'worker-'+i);
});

test('S-57 PCSYNC-12 the retained key fingerprint prevents regeneration even after all protected payloads were released',t=>{
  const f=fixture(t),provider=f.make();provider.seal(Buffer.from('completed'),'asset');
  // hasProtectedData remains false, representing a cache already released after receipt.
  f.secrets.delete(keyRef);const path=join(f.home,'feed','secrets.json'),before=readFileSync(path);
  assert.throws(()=>provider.seal(Buffer.from('new'),'asset'),{code:'storage.local_payload_key_unavailable'});
  assert.deepEqual(readFileSync(path),before);assert.equal(f.secrets.get(keyRef),null);
});
