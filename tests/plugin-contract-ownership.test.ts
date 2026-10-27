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
