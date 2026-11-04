import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isShelfFailure } from "@molis-ai/molis-work-module-shelf";
import { openTestShelfStore } from "./shelf-direct-actions.js";

test("RAC-2376 RAC-2377 W1-18-SHELF-FORMAT-01 current Shelf data reopens, while wrong version and retired item shapes stay untouched", async () => {
  const home = mkdtempSync(join(tmpdir(), "shelf-current-format-"));
  try {
    const store = openTestShelfStore(home, { disabled: true });
    const item = await store.admitText("Current copy", "current");
    const filename = join(home, "shelf", "catalog.json"), current = readFileSync(filename, "utf8");
    assert.equal(JSON.parse(current).version, 1);
    assert.equal(openTestShelfStore(home, { disabled: true }).readFile(item.item_id).bytes.toString("utf8"), "Current copy");
    const changedVersion = JSON.parse(current); changedVersion.version = 99;
    const missingArray = JSON.parse(current); delete missingArray.items[0].source_item_ids;
    const missingVerdict = JSON.parse(current); delete missingVerdict.items[0].status;
    const missingChildren = JSON.parse(current); delete missingChildren.items[0].children;
    const missingJobArray = JSON.parse(current);
    missingJobArray.jobs = [{ job_id: "retained-job", item_id: item.item_id, option_id: null, runtime: "", status: "succeeded" }];
    for (const input of [changedVersion, missingArray, missingVerdict, missingChildren, missingJobArray]) {
      const bytes = JSON.stringify(input); writeFileSync(filename, bytes);
      const reopened = openTestShelfStore(home, { disabled: true });
      await assert.rejects(() => reopened.snapshot(), error => isShelfFailure(error) && error.code === "shelf.invalid_file");
      assert.throws(() => reopened.settings(), error => isShelfFailure(error) && error.code === "shelf.invalid_file");
      assert.equal(readFileSync(filename, "utf8"), bytes, "refusal cannot stamp a version or rewrite the file");
    }
    writeFileSync(filename, current);
    assert.equal((await openTestShelfStore(home, { disabled: true }).snapshot()).materials[0]?.item_id, item.item_id);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
