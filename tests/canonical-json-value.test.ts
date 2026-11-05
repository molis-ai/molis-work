import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { canonicalJsonText, canonicalJsonValue } from "@molis-ai/molis-work-plugin-sdk";
import { servicesImContract } from "@molis-ai/molis-work-contracts/services/im";
import { servicesMemoryContract } from "@molis-ai/molis-work-contracts/services/memory";
import { buildSync } from "esbuild";

test("CLN-06 canonical JSON keeps existing request comparison and fingerprint inputs", () => {
  const input = Object.freeze({ z: Object.freeze([{ b: 2, a: 1 }, undefined, null]), a: { z: undefined, c: false, b: "" } });
  assert.equal(JSON.stringify(canonicalJsonValue(input)), '{"a":{"b":"","c":false},"z":[{"a":1,"b":2},null,null]}');
  assert.equal(JSON.stringify(input), '{"z":[{"b":2,"a":1},null,null],"a":{"c":false,"b":""}}');
  assert.equal(JSON.stringify(canonicalJsonValue({ z: 1, a: { x: 2, b: 3 } })), JSON.stringify(canonicalJsonValue({ a: { b: 3, x: 2 }, z: 1 })));
  assert.notEqual(JSON.stringify(canonicalJsonValue([1, 2])), JSON.stringify(canonicalJsonValue([2, 1])));
  assert.deepEqual(canonicalJsonValue({ b: undefined, a: [undefined, null] }), { a: [undefined, null], b: undefined });
});

test("N4 canonical JSON text sorts nested numeric and Unicode keys by raw UTF-16 units", () => {
  const value = { "é": 1, "e\u0301": 2, e: 3, "\ue000": 4, "😀": 5, "2": 6, "10": [{ z: 1, "2": 2, "10": 3 }] };
  const expected = '{"10":[{"10":3,"2":2,"z":1}],"2":6,"e":3,"é":2,"é":1,"😀":5,"":4}';
  assert.equal(canonicalJsonText(value), expected);
  assert.notEqual(canonicalJsonText([1, 2]), canonicalJsonText([2, 1]));
  assert.equal(canonicalJsonText({ value: "\ud800", number: -0, infinity: Infinity }), '{"infinity":null,"number":0,"value":"\\ud800"}');
  assert.equal(canonicalJsonText({ "é": 1 }), '{"é":1}');
  assert.notEqual(canonicalJsonText({ "é": 1 }), canonicalJsonText({ "e\u0301": 1 }), "Unicode normalization is not part of the byte protocol");
});

test("N4 canonical text retains each existing non-JSON serialization boundary", () => {
  const input = { missing: undefined, fn: () => 1, symbol: Symbol("value"), array: [undefined, , null], date: new Date("2026-01-01T00:00:00Z") };
  assert.equal(canonicalJsonText(input), '{"array":[null,null,null],"date":{}}');
  assert.equal(canonicalJsonText(input, "null"), '{"array":[null,,null],"date":{},"fn":null,"missing":null,"symbol":null}');
  assert.equal(canonicalJsonText(input, "literal"), '{"array":[,,null],"date":{},"fn":undefined,"missing":undefined,"symbol":undefined}');
  assert.equal(canonicalJsonText(undefined), undefined);
  assert.equal(canonicalJsonText(undefined, "null"), "null");
  assert.equal(canonicalJsonText(undefined, "literal"), undefined);
  assert.equal(canonicalJsonText({ toJSON() { return { "2": 2, "10": 1 }; } }), '{"10":1,"2":2}');
  assert.equal(canonicalJsonText({ toJSON() { return "changed"; } }, "null"), '{"toJSON":null}');
  for (const mode of ["omit", "null", "literal"] as const) assert.throws(() => canonicalJsonText(1n, mode), TypeError);
});

test("N4 SDK byte output remains identical in fresh en-US and zh-CN processes", () => {
  const script = `import { canonicalJsonText } from '@molis-ai/molis-work-plugin-sdk'; process.stdout.write(JSON.stringify({ locale: Intl.DateTimeFormat().resolvedOptions().locale, text: canonicalJsonText({é:1,e:2,'2':3,'10':{'😀':4,'\\ue000':5}}) }));`;
  const results = ["en_US.UTF-8", "zh_CN.UTF-8"].map(locale => {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], { encoding: "utf8", env: { ...process.env, LANG: locale, LC_ALL: locale } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout) as { locale: string; text: string };
  });
  assert.deepEqual(results.map(result => result.locale), ["en-US", "zh-CN"]);
  assert.deepEqual(results.map(result => result.text), [
    '{"10":{"😀":4,"":5},"2":3,"e":2,"é":1}',
    '{"10":{"😀":4,"":5},"2":3,"e":2,"é":1}',
  ]);
});

test("N30 IM and Memory descriptors publish the current first-version identities", () => {
  assert.equal(servicesImContract.contractId, "io.molis.work.service.im.v1");
  assert.equal(servicesImContract.schemaVersion, 1);
  assert.equal(servicesMemoryContract.contractId, "io.molis.work.service.memory.v1");
  assert.equal(servicesMemoryContract.schemaVersion, 1);
});

test("N4 browser entry bundles the shared canonicalizer without Node dependencies and executes its bytes", () => {
  const bundle = buildSync({ stdin: { contents: `import { canonicalJsonText } from '@molis-ai/molis-work-plugin-sdk/browser'; scope.result = canonicalJsonText({'2':2,'10':{'é':1,e:2}});`, resolveDir: process.cwd() },
    bundle: true, platform: "browser", format: "iife", write: false });
  const scope: { result?: string } = {};
  new Function("scope", bundle.outputFiles[0]!.text)(scope);
  assert.equal(scope.result, '{"10":{"e":2,"é":1},"2":2}');
});
