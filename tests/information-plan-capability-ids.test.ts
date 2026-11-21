import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { feedInformationPlanAction, feedManifest } from "@molis-ai/molis-work-plugin-feed";

// BL-b44-information-plan-to-feed (was T-014 RAC-1181): the information plan is Feed's own action. It reads Inbox by capability id, never by
// importing Inbox's package, and the Host no longer provides a plan of its own that names Feed's and Inbox's actions.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("BL-b44-information-plan-to-feed: Feed declares the plan and reads Inbox by capability id; the Host has no information provider", () => {
  assert.ok(feedManifest.actions?.some(definition => definition.capability_id === feedInformationPlanAction.capability_id), "the plan is in Feed's Manifest");
  assert.deepEqual(feedInformationPlanAction.action.required_actions.map(reference => reference.capability_id), ["inbox.list"]);
  assert.equal(feedInformationPlanAction.action.scheduling, "concurrent", "it waits for the model, so it commits nothing before beforeEffect()");
  const plan = readFileSync(join(ROOT, "plugins/native/feed/src/information-plan.ts"), "utf8");
  assert.doesNotMatch(plan, /molis-work-plugin-inbox/, "Feed names Inbox's action, not its package");
  for (const path of ["apps/local-host/src/project-host.ts", "apps/local-host/src/local-owner-permissions.ts", "apps/local-host/src/agent-definitions/builtin-instructions.ts"]) {
    assert.doesNotMatch(readFileSync(join(ROOT, path), "utf8"), /system[.:]information|information\.plan/, `${path} no longer provides the plan or its instruction`);
  }
});
