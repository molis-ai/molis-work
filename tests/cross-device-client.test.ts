import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source=readFileSync(new URL('../server/public/client.js',import.meta.url),'utf8');
const projection={project:{id:'a',title:'Private project',role:'owner'},goals:[{goal_id:'goal',title:'Private goal',summary:'Confidential progress',status:'open',can_record:true}],artifacts:[],members:[]};
const response=(body:unknown,status=200)=>({ok:status===200,status,json:async()=>body});
async function client(){
  const elements=new Map<string,any>();
  const localStorage:any={};
  Object.defineProperties(localStorage,{
    getItem:{value:(key:string)=>localStorage[key]??null},
    setItem:{value:(key:string,value:string)=>{localStorage[key]=value;}},
    removeItem:{value:(key:string)=>{delete localStorage[key];}},
  });
  const streams:any[]=[];
  class Events {
    listeners=new Map<string,()=>unknown>();closed=false;
    constructor(){streams.push(this);}
    close(){this.closed=true;}
    addEventListener(name:string,listener:()=>unknown){this.listeners.set(name,listener);}
    fire(name:string){return this.listeners.get(name)?.();}
  }
  const element=(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',innerHTML:'',replaceChildren(){this.textContent='';this.innerHTML='';}});return elements.get(id);};
  let fetcher: (...args:any[])=>unknown=async()=>response({member:null});
  const context=createContext({document:{getElementById:element,addEventListener(){},activeElement:null},window:{addEventListener(){}},location:{search:''},URLSearchParams,EventSource:Events,localStorage,structuredClone,fetch:(...args:any[])=>fetcher(...args)});
  runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  runInContext("session={member:{id:'member',display_name:'Member'},projects:[{id:'a',title:'Project'}],devices:[]}",context);
  return {context,element,localStorage,streams,fetch(fn:typeof fetcher){fetcher=fn;},run:(code:string)=>runInContext(code,context)};
}

test('late project and save responses cannot restore private content after logout or access revocation',async()=>{
  const c=await client();
  let finish!:(value:unknown)=>void;c.fetch(()=>new Promise(resolve=>finish=resolve));
  const loading=c.run("loadProject('a')");c.run('clearPrivate()');finish(response(projection));await loading;
  assert.equal(c.element('workspace').hidden,true);assert.equal(c.element('goals').innerHTML,'');
  c.run("session={member:{id:'member',display_name:'Member'}};savePending([{command_id:'command',project_id:'a'}])");
  const saving=c.run("send({command_id:'command',project_id:'a'})");c.run('clearPrivate()');finish(response({saved:true}));await saving;
  assert.equal(c.element('workspace').hidden,true);assert.equal(c.localStorage['molis-continuity:member'],undefined);
});

test('project switching ignores an earlier response while applying the current response',async()=>{
  const c=await client(),replies=new Map<string,(value:unknown)=>void>();
  c.fetch((url:string)=>new Promise(resolve=>replies.set(url,resolve)));
  const a=c.run("loadProject('a')"),b=c.run("loadProject('b')");
  replies.get('/continuity/api/projects/b')!(response({...projection,project:{...projection.project,id:'b',title:'Current project'}}));await b;
  replies.get('/continuity/api/projects/a')!(response(projection));await a;
  assert.equal(c.element('project-title').textContent,'Current project');assert.equal(c.element('workspace').hidden,false);
});

test('SSE reconnect denial clears private state; an ordinary network failure retains the draft',async()=>{
  const c=await client();c.fetch(async()=>response(projection));await c.run("loadProject('a');");
  c.run("savePending([{command_id:'draft',project_id:'a',summary:'Unsent'}])");
  c.fetch(async()=>{throw Error('offline');});await c.streams[0].fire('error');
  assert.equal(c.element('workspace').hidden,false);assert.match(c.localStorage['molis-continuity:member'],/Unsent/);
  c.fetch(async()=>response({error:'Access revoked'},403));await c.streams[0].fire('error');
  assert.equal(c.element('workspace').hidden,true);assert.equal(c.element('goals').innerHTML,'');assert.equal(c.localStorage['molis-continuity:member'],undefined);assert.equal(c.streams[0].closed,true);
});
