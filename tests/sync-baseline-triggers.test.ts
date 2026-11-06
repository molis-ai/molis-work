import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openBaselineHomeSqlite, homeSqlitePath, ensureStorageSpace } from '@molis-ai/molis-work-storage';

test('a missing current-baseline journal trigger is refused read-only without repairing the original', t => {
  const home=mkdtempSync(join(tmpdir(),'sync-trigger-baseline-'));t.after(()=>rmSync(home,{recursive:true,force:true}));ensureStorageSpace(home);
  const baseline={version:1,schema:'CREATE TABLE business(id TEXT);CREATE TABLE changes(id TEXT);CREATE TRIGGER business_mark AFTER INSERT ON business BEGIN INSERT INTO changes VALUES(NEW.id);END;'};
  const db=openBaselineHomeSqlite(home,'test',baseline);db.close();
  const filename=homeSqlitePath(home,'test'),modified=new DatabaseSync(filename);modified.exec('DROP TRIGGER business_mark;PRAGMA wal_checkpoint(TRUNCATE)');modified.close();
  const before=readFileSync(filename),files=readdirSync(home);
  assert.throws(()=>openBaselineHomeSqlite(home,'test',baseline),{code:'storage.schema_structure_mismatch'});
  assert.deepEqual(readFileSync(filename),before);assert.deepEqual(readdirSync(home),files);
});
