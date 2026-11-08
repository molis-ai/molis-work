import assert from "node:assert/strict";
import test from "node:test";
import { stableTimings, mergeWeights } from "../scripts/ci-shard-weights.mjs";

test("CIP-08 Full and product stable samples exclude failures and both retry styles", () => {
  const logs = [
    "[1/8] ok    tests/clean.test.ts  12.4s  5/5 tests",
    "[2/8] pass  tests/product.test.ts  8.7s",
    "[attempt 1 failed] FAIL tests/bail.test.ts 12.0s",
    "[retry 1] ok tests/bail.test.ts 5.0s",
    "[3/8] ok tests/bail.test.ts 5.0s 2/2 tests",
    "[4/8] FAIL tests/later.test.ts 20.0s",
    "[retry 1] ok tests/later.test.ts 3.0s",
    "[5/8] ok tests/skipped.test.ts 0.3s 0/4 tests",
    "[7/8] ok tests/empty.test.ts 1.0s no summary",
    "[8/8] flaky (2 tries) tests/product-retry.test.ts 4s",
    "[6/8] TIMEOUT tests/timeout.test.ts 900.0s",
  ].join("\n");
  assert.deepEqual(stableTimings(logs), { "tests/clean.test.ts": 12, "tests/product.test.ts": 9 });
  assert.deepEqual(stableTimings(logs.split("\n").reverse().join("\n")), stableTimings(logs), "retry exclusion does not depend on line order");
});

test("CIP-08 refreshing weights keeps unobserved existing tests and removes deleted tests", () => {
  assert.deepEqual(mergeWeights({ a: 5, b: 10, deleted: 2 }, { b: 20, c: 30 }, (file: string) => file !== "deleted"), { a: 5, b: 20, c: 30 });
});
