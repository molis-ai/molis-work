import assert from 'node:assert/strict';
import test from 'node:test';
import type { ImMessage } from '../packages/contracts/src/services/im.js';
import { createHistory } from '../packages/im-ui/src/browser/history.js';
import { createDrafts } from '../packages/im-ui/src/browser/drafts.js';
import type { Api, BrowserStorage, TopicDraft } from '../packages/im-ui/src/browser/types.js';
import { createMessageFormat } from '../packages/im-ui/src/message-format.js';

const message = (sequence: number): ImMessage => ({id:String(sequence),sequence,room_id:'room',thread_id:'topic',author:{id:'a',display_name:'Alice'},body:String(sequence),created_at:'2026-09-27T00:00:00Z',quoted_message:null,shared_reply:null});
function historyFixture(size: number) {
  const records=Array.from({length:size},(_,i)=>message(i+1)),requests: string[]=[];
  const api: Api=async<T>(path: string)=>{
    requests.push(path);
    const before=Number(new URL(path,'http://test').searchParams.get('before')||Infinity);
    const available=records.filter(m=>m.sequence<before),messages=available.slice(-50);
    return {messages,has_more:available.length>50,next_before:messages[0]?.sequence??null} as T;
  };
  return {...createHistory(api),requests,records};
}
test('reopening a cached topic bridges every missing page and keeps the end-of-history cursor',async()=>{
  const history=historyFixture(166),initial={messages:[message(1)],has_more:false,next_before:1};
  const result=await history.latest('/topic',initial.messages,initial,()=>true);
  assert.deepEqual(result.messages.map(m=>m.sequence),Array.from({length:166},(_,i)=>i+1));
  assert.equal(result.has_more,false);assert.equal(result.next_before,1);assert.equal(history.requests.length,4);
});
test('catchup keeps an older cached cursor and empty cache uses the fetched page cursor',async()=>{
  const history=historyFixture(220),old={messages:history.records.slice(49,170),has_more:true,next_before:50};
  const result=await history.latest('/topic',old.messages,old,()=>true);
  assert.deepEqual(result.messages.map(m=>m.sequence),Array.from({length:171},(_,i)=>i+50));
  assert.equal(result.next_before,50);assert.equal(result.has_more,true);
  const empty=await history.latest('/topic',[],{messages:[],has_more:false,next_before:null},()=>true);
  assert.equal(empty.has_more,true);assert.equal(empty.next_before,171);
});
test('a late topic acknowledgement clears A only; draft B survives and resumes with its own request ID',async()=>{
  const values=new Map<string,unknown>();
  const storage: BrowserStorage={read:<T>(key:string,fallback:T)=>(values.get(key) as T)??fallback,write:(key,value)=>{values.set(key,value);}};
  const drafts=createDrafts(storage),a:TopicDraft={client_id:'a',title:'Topic A',body:'Submitted A'},b:TopicDraft={client_id:'b',title:'Topic B',body:'Unsent B'};
  storage.write('topic',a);
  let acknowledge!:()=>void;
  const response=new Promise<void>(resolve=>{acknowledge=resolve;}).then(()=>drafts.clearTopic('topic',a.client_id));
  storage.write('topic',b);acknowledge();
  assert.equal(await response,false);assert.deepEqual(storage.read('topic',null),b);
  assert.equal(drafts.clearTopic('topic',b.client_id),true);assert.equal(storage.read('topic',null),null);
});
test('typed format helper preserves formatting without introducing user HTML',()=>{
  const format=createMessageFormat(value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
  assert.equal(format('**重点**\n`x`'),'<strong>重点</strong><br><code>x</code>');
  assert.equal(format('```js\n<script>x</script>```'),'<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>');
});
test('message drafts isolate targets, keep retry IDs, and reject an acknowledgement for an older version',()=>{
  const values=new Map<string,unknown>();
  const storage: BrowserStorage={read:<T>(key:string,fallback:T)=>(values.get(key) as T)??fallback,write:(key,value)=>{values.set(key,structuredClone(value));}};
  const drafts=createDrafts(storage);drafts.load('member-a');
  const first=drafts.edit('room/topic','A');
  assert.equal(drafts.edit('room/topic','A').client_id,first.client_id);
  const next=drafts.edit('room/topic','B');drafts.edit('room','main draft');
  assert.equal(drafts.clearMessage('room/topic',first.client_id),false);
  drafts.load('member-a');assert.deepEqual(drafts.get('room/topic'),next);assert.equal(drafts.get('room')?.body,'main draft');
  drafts.load('member-b');assert.equal(drafts.get('room/topic'),undefined);
});
test('a successful local send cannot conceal the remote messages before it from catchup',async()=>{
  const history=historyFixture(1);
  const initial=await history.latest('/topic',[],null,()=>true);
  history.records.push(...Array.from({length:165},(_,i)=>message(i+2)));
  const withAcknowledgement=history.merge(initial.messages,[message(166)]);
  const result=await history.latest('/topic',withAcknowledgement,initial,()=>true);
  assert.deepEqual(result.messages.map(m=>m.sequence),Array.from({length:166},(_,i)=>i+1));
  assert.equal(result.has_more,false);
});
