import assert from "node:assert/strict";
import test from "node:test";
import { developerMode } from "@molis-ai/molis-work-app-local-host";

// Developer mode only opens the component board (`/__ui/catalog`, D0292); the user decided (2026-10-09) that the Host's start
// variable is the only way to turn it on. The plugin list is the same in either mode.

test("developer mode is a Host switch, off unless MOLIS_WORK_DEVELOPER_MODE is exactly 1", () => {
  assert.equal(developerMode({}), false);
  for (const value of ["", "0", "true", "yes", " 1", "01"]) assert.equal(developerMode({ MOLIS_WORK_DEVELOPER_MODE: value }), false, JSON.stringify(value));
  assert.equal(developerMode({ MOLIS_WORK_DEVELOPER_MODE: "1" }), true);
});
