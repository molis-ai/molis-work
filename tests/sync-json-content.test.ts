import assert from 'node:assert/strict';
import test from 'node:test';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {createIssueSyncContent} from '@molis-ai/molis-work-plugin-issues';
import {createPagesSyncContent} from '@molis-ai/molis-work-plugin-pages';

test('PCSYNC-11/13 public JSON content helper preserves exact business values and binds each manifest to its asset',async()=>{
 const codec=createSyncJsonContent({spaceId:'alice',authorize(){}}),value={record:{text:'中文🙂'.repeat(220000)}};
 const encoded=codec.encode('asset',value);assert.ok(encoded.blobs.length>1);assert.ok(Buffer.byteLength(JSON.stringify(encoded.value))<4096);
 const read=async(ref:{digest:string;size:number})=>{const source=encoded.blobs.find(b=>b.digest===ref.digest&&b.size===ref.size);assert.ok(source);return source.bytes;};
 assert.deepEqual(await codec.decode('asset',encoded.value,read),value);
 await assert.rejects(()=>codec.decode('other',encoded.value,async()=>{assert.fail('foreign manifest must be rejected before reads');}));
 await assert.rejects(()=>codec.decode('asset',encoded.value,async()=>Buffer.from('bad')));
});
test('PCSYNC-11/13 Issue and Pages owners project image bytes, not base64 strings, and restore exact fields',async()=>{
 const png=Buffer.alloc(600000,31),uri='data:image/png;base64,'+png.toString('base64');
 const cases=[{codec:createIssueSyncContent({spaceId:'alice',authorize(){}}),value:{spaceId:'alice',record:{images_json:JSON.stringify([{name:'image.png',data_url:uri}])}}},{codec:createPagesSyncContent({spaceId:'alice',authorize(){}}),value:{project:{id:'project',title:'Pages'},record:{body:{type:'doc',content:[{type:'image',attrs:{src:uri}}]}}}}];
 for(const {codec,value} of cases){
  const encoded=codec.encode('asset',value);assert.ok(encoded.blobs.some(blob=>Buffer.from(blob.bytes).equals(png)));
  assert.ok(encoded.blobs.every(blob=>!Buffer.from(blob.bytes).includes(png.toString('base64'))));
  const restored=await codec.decode('asset',encoded.value,async ref=>encoded.blobs.find(blob=>blob.digest===ref.digest)!.bytes);assert.deepEqual(restored,value);
 }
});

test('F-cf2-05 small 0-blob payloads preserve project() output, invoke restore(), and safely round-trip user sync_content keys', async () => {
  const projectedCodec = createSyncJsonContent({
    spaceId: 'alice',
    authorize() {},
    project: (_key, value) => ({ projected: true, original: value }),
  });
  const smallProjected = projectedCodec.encode('small', { text: 'hi' });
  assert.deepEqual(smallProjected.blobs, []);
  assert.deepEqual(smallProjected.value, { projected: true, original: { text: 'hi' } });

  let restoredCalled = 0;
  const roundTripCodec = createSyncJsonContent({
    spaceId: 'alice',
    authorize() {},
    project: (_key, value) => ({ wrapped: value }),
    restore: async (_key, value) => {
      restoredCalled += 1;
      return (value as { wrapped: unknown }).wrapped;
    },
  });
  const encodedSmall = roundTripCodec.encode('zero-blob', { items: [{ bytes: '' }] });
  assert.deepEqual(encodedSmall.blobs, []);
  assert.deepEqual(
    await roundTripCodec.decode('zero-blob', encodedSmall.value, async () => { throw new Error('unexpected blob read'); }),
    { items: [{ bytes: '' }] },
  );
  assert.equal(restoredCalled, 1);

  const plainCodec = createSyncJsonContent({ spaceId: 'alice', authorize() {} });
  const userPayload = { sync_content: 'business-field', other: 42 };
  const encodedUser = plainCodec.encode('user-key', userPayload);
  assert.deepEqual(
    await plainCodec.decode('user-key', encodedUser.value, async () => { throw new Error('unexpected blob read'); }),
    userPayload,
  );
});
