import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { canonicalJsonText, canonicalJsonValue } from "@molis-ai/molis-work-plugin-sdk";
import { servicesImContract } from "@molis-ai/molis-work-contracts/services/im";
import { servicesMemoryContract } from "@molis-ai/molis-work-contracts/services/memory";
import { previewProjectCopy } from "@molis-ai/molis-work-service-placement";
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

test("the copy preview's fingerprint and saved bytes stay what they were before it took its text from canonicalJsonText, integer-shaped keys included", () => {
  const value = { "2": 1, "10": 2, a: 3, nested: [{ "é": 1, e: 2, "😀": null, "\ue000": true }] };
  const { view } = previewProjectCopy({ sourceSpaceId: "space", projectIds: ["project"], authorize() {}, sources: [{ ownerId: "owner",
    owner: { kinds: ["owner:thing"], snapshot: () => [{ key: "thing", value }], references: () => [], read: () => null } }] });
  // Taken from the handwritten serializer this replaced, run over the same input.
  assert.equal(view.fingerprint, "cad3f5ad5c37c2e22fafdd812eab5536234fa83d5b42a74ff4d26aee8b8b1742");
  assert.equal(view.savedBytes, 69);
});

test("N30 IM and Memory descriptors publish the current first-version identities", () => {
  assert.equal(servicesImContract.contractId, "io.molis.work.service.im.v1");
  assert.equal(servicesImContract.schemaVersion, 1);
  assert.equal(servicesMemoryContract.contractId, "io.molis.work.service.memory.v1");
  assert.equal(servicesMemoryContract.schemaVersion, 1);
});

test("B2 R2-04 native JSON read comparison bundles for browsers and preserves toJSON and unsupported values", () => {
  const bundle = buildSync({ stdin: { contents: `import { jsonComparisonText } from '@molis-ai/molis-work-plugin-sdk/browser'; scope.compare = jsonComparisonText;`, resolveDir: process.cwd() },
    bundle: true, platform: "browser", format: "iife", write: false });
  const scope: { compare?: (value: unknown) => string | undefined } = {};
  new Function("scope", bundle.outputFiles[0]!.text)(scope);
  assert.ok(scope.compare);
  const compare = scope.compare;
  const input = { date: new Date("2026-01-01T00:00:00Z"), "2": 2, "10": 10, nested: { z: 1, a: 2 }, missing: undefined,
    array: [, undefined, () => 1, Symbol("value")], custom: { toJSON() { return { z: 3, a: 4 }; } } };
  assert.equal(compare(input), '{"2":2,"10":10,"array":[null,null,null,null],"custom":{"a":4,"z":3},"date":"2026-01-01T00:00:00.000Z","nested":{"a":2,"z":1}}');
  assert.equal(compare(undefined), undefined);
  assert.throws(() => compare(1n), TypeError);
});
