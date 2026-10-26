import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as shelf from "@molis-ai/molis-work-module-shelf/contract";
import { imagesManifest, IMAGES_SHELF_ADMIT } from "@molis-ai/molis-work-plugin-images";
import * as images from "@molis-ai/molis-work-plugin-images/contract";
import * as dataset from "@molis-ai/molis-work-plugin-dataset/contract";
import * as form from "@molis-ai/molis-work-plugin-form/contract";
import * as jelly from "@molis-ai/molis-work-plugin-jelly/contract";
import * as lingguang from "@molis-ai/molis-work-plugin-lingguang/contract";
import * as pages from "@molis-ai/molis-work-plugin-pages/contract";
import * as ppt from "@molis-ai/molis-work-plugin-ppt/contract";
import * as todo from "@molis-ai/molis-work-plugin-todo/contract";

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

test("RAC-820: Form, Lingguang, PPT and Dataset each expose their own public contract (PG-111)", () => {
  assert.deepEqual({ ...form }, {
    FORM_PLUGIN_ID: "io.molis.work.form",
    FORM_PROJECT_PLUGIN_ID: "form",
    FORM_ARTIFACT_TYPE_ID: "io.molis.work.form.questionnaire",
    FORM_ARTIFACT_SCHEMA_VERSION: 1,
  });
  assert.deepEqual({ ...lingguang }, {
    LINGGUANG_PLUGIN_ID: "io.molis.work.lingguang",
    LINGGUANG_PROJECT_PLUGIN_ID: "lingguang",
    LINGGUANG_BODY_LIMIT: 200_000,
  });
  assert.deepEqual({ ...ppt }, {
    PPT_PLUGIN_ID: "io.molis.work.ppt",
    PPT_PROJECT_PLUGIN_ID: "ppt",
    PPT_SUBJECT_KIND: "presentation",
    PPT_ARTIFACT_TYPE_ID: "io.molis.work.ppt.deck",
    PPT_ARTIFACT_SCHEMA_VERSION: 1,
  });
  assert.deepEqual({ ...dataset }, {
    DATASET_PLUGIN_ID: "io.molis.work.dataset",
    DATASET_PROJECT_PLUGIN_ID: "dataset",
    DATASET_ARTIFACT_TYPE_ID: "io.molis.work.dataset.table",
    DATASET_ARTIFACT_SCHEMA_VERSION: 1,
  });
});

test("RAC-821: the platform no longer exports the Form, Lingguang, PPT or Dataset contracts", async () => {
  for (const name of ["form", "lingguang", "ppt", "dataset"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("RAC-823: Todo and Pages each expose their own public contract (PG-111)", () => {
  assert.deepEqual({ ...todo }, {
    TODO_PLUGIN_ID: "io.molis.work.todo",
    TODO_PROJECT_PLUGIN_ID: "todo",
    TODO_ORGANIZE_MATERIAL_CHARS: 60_000,
    TODO_SUBJECT_KIND: "todo_item",
    TODO_STATUSES: ["open", "doing", "waiting", "done", "cancelled"],
    TODO_REMINDER_STALE_HOURS: 48,
  });
  assert.deepEqual({ ...pages }, {
    PAGES_PLUGIN_ID: "io.molis.work.pages",
    PAGES_PROJECT_PLUGIN_ID: "pages",
    PAGES_ARTIFACT_TYPE_ID: "io.molis.work.pages.document",
    PAGES_ARTIFACT_SCHEMA_VERSION: 1,
  });
});

test("RAC-824: the platform no longer exports the Todo or Pages contracts", async () => {
  for (const name of ["todo", "pages"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("RAC-825: the onboarding journey, Inbox and the continuity demo call Todo and Pages by action id and name neither plugin's contract nor package", () => {
  const root = join(import.meta.dirname, "..");
  const files = [
    ...readdirSync(join(root, "apps/local-host/src")).filter(name => name.startsWith("context-onboarding")).map(name => `apps/local-host/src/${name}`),
    ...readdirSync(join(root, "plugins/native/inbox/src")).filter(name => name.endsWith(".ts")).map(name => `plugins/native/inbox/src/${name}`),
    "server/tooling/continuity-demo.mts",
  ];
  assert.ok(files.length > 6, "the scan found the files it is about");
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /molis-work-plugin-(todo|pages)\b|molis-work-contracts\/modules\/(todo|pages)\b/, `${file} imports a Todo or Pages package or contract`);
  }
});

test("RAC-852: Shelf's module owns its contract, the definition of shelf.items.admit included (PG-095, BL-618)", () => {
  assert.deepEqual(Object.keys({ ...shelf }), ["SHELF_ADMIT_ACTION"], "only the definition is a value; the rest of the contract is types");
  assert.equal(shelf.SHELF_ADMIT_ACTION.capability_id, "shelf.items.admit");
  assert.equal(shelf.SHELF_ADMIT_ACTION.version, 2);
  assert.deepEqual(shelf.SHELF_ADMIT_ACTION.action.permissions, ["shelf:read", "shelf:write", "materials:read"]);
});

test("RAC-853: the platform no longer exports the Shelf contract", async () => {
  await assert.rejects(import("@molis-ai/molis-work-contracts/modules/shelf"), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
});

test("RAC-854: Images' own declaration of Shelf's action matches Shelf's definition in every field the Host reads or Images sends", () => {
  const theirs = shelf.SHELF_ADMIT_ACTION, mine = IMAGES_SHELF_ADMIT;
  assert.deepEqual([mine.capability_id, mine.version, mine.operation, mine.action.scope, mine.action.scheduling], [theirs.capability_id, theirs.version, theirs.operation, theirs.action.scope, theirs.action.scheduling]);
  assert.deepEqual([...mine.action.permissions].toSorted(), [...theirs.action.permissions].toSorted(), "the call would be refused for a permission Images did not ask the person for");
  const sent = mine.action.input_schema as { properties: Record<string, { type: string }>; required: string[] };
  const accepted = theirs.action.input_schema as { properties: Record<string, { type: string }> };
  for (const [field, shape] of Object.entries(sent.properties)) assert.equal(accepted.properties[field]?.type, shape.type, `Shelf does not take ${field} the way Images sends it`);
  const asked = imagesManifest.permissions.filter(entry => entry.reason === "将选中的图片保存到 Shelf");
  assert.deepEqual(asked.map(entry => entry.permission).toSorted(), [...theirs.action.permissions].toSorted(), "Images' manifest asks the person for exactly those");
  assert.ok(asked.every(entry => entry.required === false), "saving to Shelf is optional for Images");
  assert.ok(imagesManifest.capabilities.consumes.includes(theirs.capability_id), "it declares the capability it consumes");
});

test("RAC-855: Images imports nothing of Shelf: no Shelf package, contract or definition", () => {
  const root = join(import.meta.dirname, "..", "plugins/native/images");
  const files = readdirSync(join(root, "src"), { recursive: true }).map(String).filter(name => name.endsWith(".ts"));
  assert.ok(files.length > 10, "the scan found the files it is about");
  for (const file of files) {
    const source = readFileSync(join(root, "src", file), "utf8");
    assert.doesNotMatch(source, /molis-work-(module|plugin)-shelf|molis-work-contracts\/modules\/shelf|SHELF_ADMIT_ACTION/, `${file} reaches Shelf`);
  }
  assert.doesNotMatch(readFileSync(join(root, "package.json"), "utf8"), /molis-work-(module|plugin)-shelf/, "and does not depend on it");
});
