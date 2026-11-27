import test from "node:test";
import { datasetActions, datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { formActions, formManifest } from "@molis-ai/molis-work-plugin-form";
import { pagesActions, pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { pptActions, pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { checkCreativePinAuthority } from "./fixtures/creative-pin-authority.js";

test("W5-01-DATASET-06 BSH-03 cancellation or a stale caller guard during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "dataset", table: "datasets", field: "dataset", manifest: datasetManifest, actions: datasetActions }));

test("W5-01-FORM-01 BSH-03 cancellation or a stale caller guard during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "form", table: "forms", field: "form", manifest: formManifest, actions: formActions }));

test("W5-01-PAGES-06 BSH-03 cancellation or a stale caller guard during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "pages", table: "pages", field: "document", manifest: pagesManifest, actions: pagesActions }));

test("W5-01-PPT-07 BSH-03 cancellation or a stale caller guard during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "ppt", table: "presentations", field: "presentation", manifest: pptManifest, actions: pptActions }));
