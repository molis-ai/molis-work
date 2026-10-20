import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {createContextLedger,createContextHistoryReplication} from '@molis-ai/molis-work-module-context-ledger';
import type {ObjectRef,ContextEdge} from '@molis-ai/molis-work-contracts/modules/context-ledger';

const scope={kind:'personal',id:'private-work-context'} as const;
const source=(id='session'):ObjectRef=>({module:'private-work-context',id,version:null,scope});
const target=(id:string):ObjectRef=>({module:'goals',id,project_id:'project',version:null,scope});
const relations={'work.goal':{targetModule:'goals'}} as const;
function fixture(){
  const db=new Database(':memory:'),ledger=createContextLedger(db,{authorize:()=>true});
  const ports=(authorize=()=>{})=>createContextHistoryReplication(db,{scope,sourceModule:'private-work-context',relations,authorize});
  const put=(key:string,id:string,from=source())=>ledger.commands.put({actor_id:'person',scope},{key,type:'work.goal',source:from,target:target(id),cause:'work.goal_associated',recorded_at:'2026-10-18T00:00:00.000Z'});
  return {db,ledger,ports,put};
}

test('S-47 PCSYNC-23 the reference owner restores complete typed history without replaying normal binding commands',()=>{
  const a=fixture(),b=fixture();try{
    a.put('first','one');a.ledger.commands.remove({actor_id:'person',scope},'first','removed','2026-10-18T00:01:00.000Z');a.put('second','two');
    const original=a.ports().read(source());assert.equal(original.length,3);
    b.ports().replace(source(),original);assert.deepEqual(b.ports().read(source()),original);
    assert.equal(b.ledger.query.get({actor_id:'person',scope},'second')!.target.id,'two');
    assert.equal(b.ledger.query.get({actor_id:'person',scope},'first'),null);
    b.put('local','three');b.ports().replace(source(),original);
    assert.deepEqual(b.ports().read(source()),original,'a selected remote branch replaces only this source, without rebasing its historical revisions');
  }finally{a.db.close();b.db.close();}
});

test('S-47 PCSYNC-01 foreign scope, unknown fields, broken history and undeclared machine-local relations are refused unchanged',()=>{
  const f=fixture();try{
    f.put('existing','kept');const before=f.ports().read(source());
    const changes=[(e:ContextEdge)=>{e.source.scope={kind:'personal',id:'other'};},
      (e:ContextEdge)=>{e.target.scope={kind:'team_project',id:scope.id};},
      (e:ContextEdge)=>{e.type='work.workspace';},(e:ContextEdge)=>{e.revision=2;},
      (e:ContextEdge)=>{Object.assign(e,{machine_path:'/synthetic/local-only'});},
      (e:ContextEdge)=>{e.source=source('another');}];
    for(const change of changes){const edge=structuredClone(before[0]!);change(edge);assert.throws(()=>f.ports().replace(source(),[edge]));assert.deepEqual(f.ports().read(source()),before);}
    assert.throws(()=>f.ports().replace({...source(),scope:{kind:'personal',id:'other'}},[]));
    assert.deepEqual(f.ports().read(source()),before);
  }finally{f.db.close();}
});

test('S-47 PCSYNC-01 a replicated edge key cannot capture another source or another relation',()=>{
  const f=fixture(),other=fixture();try{
    f.put('shared','original',source('other'));other.put('shared','incoming');
    const rows=other.ports().read(source());assert.throws(()=>f.ports().replace(source(),rows),{code:'context_ledger.key_conflict'});
    assert.equal(f.ledger.query.get({actor_id:'person',scope},'shared')!.source.id,'other');
    assert.deepEqual(f.ports().read(source()),[]);
  }finally{f.db.close();other.db.close();}
});

test('S-47 PCSYNC-06 revocation inside a history replacement rolls back every reference and preserves the prior branch',()=>{
  const f=fixture(),other=fixture();try{
    f.put('old','kept');other.put('new','incoming');const before=f.ports().read(source());let active=true;
    f.db.function('revoke_test_authority',()=>{active=false;return 1;});
    f.db.exec('CREATE TRIGGER revoke_on_new_reference AFTER INSERT ON context_edges BEGIN SELECT revoke_test_authority(); END;');
    const port=f.ports(()=>{if(!active)throw new Error('REVOKED');});
    assert.throws(()=>port.replace(source(),other.ports().read(source())),/REVOKED/);active=true;
    assert.deepEqual(f.ports().read(source()),before);
  }finally{f.db.close();other.db.close();}
});
