import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import {poolClientLiterals} from './client-literals.mjs';

test('pooling preserves directives, literal values, object keys, defaults and nested closures',()=>{
  const literal='repeated selector with Unicode 🙂 and quotes "';
  const quoted=JSON.stringify(literal);
  const script=`(()=>{'use strict';const padding=${JSON.stringify('x'.repeat(16000))};const _molisTextPool0=1;let result=[];for(let i=0;i<2;i++){result.push(${quoted});result.push(${quoted});}const object={${quoted}:1};function nested(value=${quoted}){return [${quoted},value,object[${quoted}]];}result.push(nested(),(function(){return this;})()===undefined,padding.length,_molisTextPool0);return result;})()`;
  const pooled=poolClientLiterals(script);
  assert.ok(pooled.includes('_molisTextPool1='));assert.ok(pooled.includes(`{${quoted}:1}`));
  assert.equal(JSON.stringify(vm.runInNewContext(pooled)),JSON.stringify(vm.runInNewContext(script)));
  assert.equal(poolClientLiterals(`(()=>{return ${quoted};})()`),`(()=>{return ${quoted};})()`,'small scopes stay untouched');
});

test('byte-based pooling preserves adjacent in and return tokens', () => {
  const padding = 'x'.repeat(10000);
  const source = `globalThis.result=(()=>{
    const padding=${JSON.stringify(padding)};
    function read(){return"message";}
    return ["message"in {message:1},"message"in {},read(),padding.length];
  })()`;
  const pooled = poolClientLiterals(source, { byBytes: true });
  assert.notEqual(pooled, source, 'the short repeated string is pooled');
  const expected = JSON.stringify([true, false, 'message', padding.length]);
  const result = script => vm.runInNewContext(script + ';\nJSON.stringify(globalThis.result)');
  for (const script of [source, pooled]) {
    assert.equal(result(script), expected);
    assert.equal(result(transformSync(script, { target: 'es2022', minify: true, charset: 'utf8' }).code), expected);
  }
});
