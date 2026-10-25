import assert from "node:assert/strict";
import test from "node:test";
import * as images from "@molis-ai/molis-work-plugin-images/contract";
import * as dataset from "@molis-ai/molis-work-plugin-dataset/contract";
import * as form from "@molis-ai/molis-work-plugin-form/contract";
import * as jelly from "@molis-ai/molis-work-plugin-jelly/contract";
import * as lingguang from "@molis-ai/molis-work-plugin-lingguang/contract";
import * as ppt from "@molis-ai/molis-work-plugin-ppt/contract";

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
