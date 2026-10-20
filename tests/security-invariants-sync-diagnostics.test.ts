import assert from "node:assert/strict";
import test from "node:test";
import {createSyncItemFixture as fixture} from "./fixtures/sync-items.js";

test('S-39 PCSYNC-14/26 malformed JSON diagnostics never copy asset snippets into failure or conflict reasons',async t=>{
 const f=fixture(t);f.repair();f.edit('broken','unique original');f.setSyntax(true);await f.client.run();
 assert.equal(f.db.prepare('SELECT value FROM items WHERE key=?').get('broken')?.value,'unique original');assert.equal(f.replica.counts().pending,1);assert.doesNotMatch(JSON.stringify(f.client.status()),/PRIVATE_DIAGNOSTIC/);
 const incoming=fixture(t);incoming.repair();incoming.setSyntax(true);incoming.replica.receive({operationId:'remote:1',key:'broken',base:0,revision:1,value:'PRIVATE_DIAGNOSTIC_SENTINEL'});
 assert.equal(incoming.db.prepare('SELECT value FROM items WHERE key=?').get('broken'),undefined);assert.equal(incoming.replica.counts().conflicts,1);assert.doesNotMatch(JSON.stringify(incoming.replica.conflicts()),/PRIVATE_DIAGNOSTIC/);
 const download=fixture(t);download.repair();download.setSyntax(true);download.events.push({operationId:'remote:1',key:'broken',base:0,revision:1,value:'PRIVATE_DIAGNOSTIC_SENTINEL'});await download.client.run();assert.equal(download.client.status().collections[0]!.failures.length,1);assert.doesNotMatch(JSON.stringify(download.client.status()),/PRIVATE_DIAGNOSTIC/);
});
