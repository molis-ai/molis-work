import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('PCSYNC-27 workbench string pooling preserves program semantics without changing public literals',()=>{
  const result=spawnSync(process.execPath,['--test',fileURLToPath(new URL('../apps/workbench/tooling/client-literals.test.mjs',import.meta.url))],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+result.stderr);
});
