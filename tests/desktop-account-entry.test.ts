import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {renderPersonalAccountEntry} from '@molis-ai/molis-work-app-workbench';
import {withPageText} from './fixtures/page-text.js';

async function openEntry(desktop:boolean, state:Record<string,unknown>, browserState:Record<string,unknown>={identity:null}, failAttach=false) {
  const html=withPageText('zh',[],()=>renderPersonalAccountEntry('test-page-token',desktop));
  const script=html.slice(html.lastIndexOf('(() => {'),html.lastIndexOf('</script>'));
  const calls:string[]=[], destinations:string[]=[],status={},retry={hidden:true};
  let finish!:()=>void;
  const done=new Promise<void>(resolve=>{finish=resolve;});
  const request=Object.assign(async(path:string)=>{
    calls.push(path);
    if(path==='/api/personal/status')return state;
    if(path==='/api/personal/status?browser=1')return browserState;
    if(path.startsWith('/api/personal/native-attach')){
      if(failAttach)throw Error('expired ticket');
      return {attached:true};
    }
    return {loginUrl:'http://localhost/?accountLogin=test'};
  },{show:()=>finish()});
  runInNewContext(script,{
    document:{body:{dataset:{nativeDesktop:String(desktop)}},querySelector:(selector:string)=>selector.includes('status')?status:retry},
    molisWorkRequest:request,navigator:{},URL,
    location:{origin:'http://localhost',replace:(url:string)=>{destinations.push(url);finish();}},
  });
  await done;
  return {calls,destinations,retry};
}

test('desktop entry attaches the native session before opening the workbench, without starting a second login',async()=>{
  const result=await openEntry(true,{identity:{userId:'alice'},ready:true,browserSessionTicket:'one/use'});
  assert.deepEqual(result.calls,['/api/personal/status','/api/personal/status?browser=1','/api/personal/native-attach?ticket=one%2Fuse'],
    'the entry compares the WebView browser session before spending the one-use ticket');
  assert.deepEqual(result.destinations,['/?desktop=1']);
});
test('desktop entry with the same browser session skips the attachment but still opens the workbench',async()=>{
  const result=await openEntry(true,{identity:{userId:'alice',applicationId:'work'},ready:true,browserSessionTicket:'one/use'},
    {identity:{userId:'alice',applicationId:'work'}});
  assert.deepEqual(result.calls,['/api/personal/status','/api/personal/status?browser=1']);
  assert.deepEqual(result.destinations,['/?desktop=1']);
});
test('anonymous desktop entry opens login; ordinary browser entry never requests native attachment',async()=>{
  for(const desktop of [true,false]){
    const result=await openEntry(desktop,{identity:null});
    assert.deepEqual(result.calls,desktop?['/api/personal/status','/api/personal/login']:['/api/personal/login']);
    assert.match(result.destinations[0],/accountLogin=test/);
  }
});
test('failed native attachment stays retryable and never starts another account operation',async()=>{
  const result=await openEntry(true,{identity:{userId:'alice'},ready:true,browserSessionTicket:'expired'},{identity:null},true);
  assert.equal(result.calls.includes('/api/personal/login'),false);
  assert.deepEqual(result.destinations,[]);
  assert.equal(result.retry.hidden,false);
});
