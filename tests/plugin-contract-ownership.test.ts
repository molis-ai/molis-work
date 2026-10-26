import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import * as coding from "@molis-ai/molis-work-plugin-coding/contract";
import { imagesManifest } from "@molis-ai/molis-work-plugin-images";
import { shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import * as shelf from "@molis-ai/molis-work-module-shelf/contract";
import * as images from "@molis-ai/molis-work-plugin-images/contract";
import * as jelly from "@molis-ai/molis-work-plugin-jelly/contract";

test("RAC-620: Images exposes its own public contract", () => {
  assert.deepEqual({ ...images }, {
    IMAGES_PLUGIN_ID: "io.molis.work.images",
    IMAGES_PROJECT_PLUGIN_ID: "images",
  });
});

test("RAC-621: Jelly exposes its own public contract", () => {
  assert.deepEqual({ ...jelly }, {
    JELLY_PLUGIN_ID: "io.molis.work.jelly",
    JELLY_PROJECT_PLUGIN_ID: "jelly",
  });
});

test("RAC-622: the platform no longer exports Images or Jelly contracts", async () => {
  for (const name of ["images", "jelly"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("RAC-870: Coding exposes its result-document action from its own public contract", () => {
  assert.deepEqual([coding.codingResultDocument.capability_id, coding.codingResultDocument.version, coding.codingResultDocument.operation],
    ["coding.results.document", 1, "query"]);
  assert.ok(codingManifest.actions?.some(row => Object.is(row, coding.codingResultDocument)));
});

test("RAC-871: the Shelf module exposes its contract from its own public entry", () => {
  assert.deepEqual([shelf.SHELF_ADMIT_ACTION.capability_id, shelf.SHELF_ADMIT_ACTION.version, shelf.SHELF_ADMIT_ACTION.operation],
    ["shelf.items.admit", 2, "command"]);
});

test("RAC-872: the platform no longer exports the Coding or Shelf contracts", async () => {
  for (const name of ["coding", "shelf"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
});

test("RAC-873: Shelf and Images ask for the other plugin's action by id and import neither provider", () => {
  assert.deepEqual(shelfManifest.capabilities.consumes, ["coding.results.document"]);
  assert.deepEqual(imagesManifest.capabilities.consumes, ["shelf.items.admit"]);
  const sources = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sources(join(root, entry.name)) : entry.name.endsWith(".ts") ? [readFileSync(join(root, entry.name), "utf8")] : []);
  const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
  assert.ok(sources(join(repository, "plugins/native/shelf/src")).every(text => !text.includes("molis-work-plugin-coding")), "Shelf does not import Coding");
  assert.ok(sources(join(repository, "plugins/native/images/src")).every(text => !text.includes("molis-work-module-shelf") && !text.includes("molis-work-plugin-shelf")), "Images does not import Shelf");
});
