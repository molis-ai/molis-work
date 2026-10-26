// W5-15-01 W5-15-02 W5-15-03: the maturity vocabulary (production/experimental/slice/absent) is the only vocabulary the
// SSOT 包成熟度 column and the workspace registry may carry; the retired migration-era words are not accepted anywhere.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PACKAGE_MATURITY, WORKSPACE_PACKAGES, maturityWordError } from "../scripts/workspace-packages.mjs";

const ssot = fs.readFileSync(fileURLToPath(new URL("../docs/SSOT-MATRIX.md", import.meta.url)), "utf8");

test("W5-15-01 the SSOT §2 state table names exactly production, experimental, slice, absent", () => {
  assert.deepEqual(PACKAGE_MATURITY, ["production", "experimental", "slice"]);
  const section = ssot.slice(ssot.indexOf("## 2. 状态词"), ssot.indexOf("## 3. Apps"));
  const words = [...section.matchAll(/^\| `([a-z-]+)` \|/gmu)].map((match) => match[1]);
  assert.deepEqual(words, ["production", "experimental", "slice", "absent"], "the state table is the four-word vocabulary");
  // The retired words may only survive in the retirement note, never as a state table row.
  for (const word of ["legacy-mixed", "contract-only", "partial", "implemented", "retired"]) {
    assert.ok(!words.includes(word), `${word} is retired`);
    assert.ok(!section.includes(`| \`${word}\` |`), `${word} is not a table row`);
  }
});

test("W5-15-03 the registry rejects any maturity word outside the vocabulary, with the package path", () => {
  for (const word of ["production", "experimental", "slice"]) {
    assert.equal(maturityWordError("apps/desktop", word), undefined, word);
  }
  for (const retired of ["absent", "partial", "contract-only", "implemented", undefined, ""]) {
    assert.match(String(maturityWordError("apps/desktop", retired)),
      /^apps\/desktop: package maturity must be one of production\/experimental\/slice, got /u);
  }
  // Every registry entry is already inside the vocabulary, and the re-measured distribution still holds (plan §9, 2026-10-25).
  const counts = {};
  for (const item of WORKSPACE_PACKAGES) {
    assert.ok(PACKAGE_MATURITY.includes(item.maturity), `${item.path}: ${item.maturity}`);
    counts[item.maturity] = (counts[item.maturity] ?? 0) + 1;
  }
  assert.deepEqual(counts, { production: 54, experimental: 2, slice: 14 });
});
