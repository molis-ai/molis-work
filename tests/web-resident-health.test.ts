import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createMcpResidentStarter} from '@molis-ai/molis-work-app-local-host';
import {serveTestHost} from './fixtures/test-home.js';

test('the public space listener proves a ready resident after catalog startup and stops proving it on close',async t=>{
  const home=await mkdtemp(join(tmpdir(),'web-resident-health-'));
  const starter=createMcpResidentStarter();
  const served=await serveTestHost(null,{home});
  t.after(async()=>{starter.close();await served.close();await rm(home,{recursive:true,force:true});});
  await served.createProject('Health readiness');
  const response=await fetch(served.origin+'/health?challenge='+randomBytes(32).toString('base64url'));
  assert.equal(response.status,200,'an embedded surface must use its public listener readiness');
  const health=await response.json() as {status:string;desktop_tui:boolean};
  assert.equal(health.status,'ok');assert.equal(health.desktop_tui,true);
  assert.ok(response.headers.get('x-molis-work-proof'),'readiness still carries this Home’s health proof');
  // The real resident startup path verifies probeMcpResident’s challenge, signature and payload.
  await starter.ensure(home,served.origin,AbortSignal.timeout(5000));
  await served.close();
  await assert.rejects(starter.ensure(home,served.origin,AbortSignal.timeout(5000)),{code:'mcp.startup_entry_missing'},'a closed public listener cannot be reused as a ready resident');
});
