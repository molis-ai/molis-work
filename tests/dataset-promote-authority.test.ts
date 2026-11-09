import test from "node:test";
import { datasetActions, datasetManifest } from "@molis-ai/molis-work-plugin-dataset";
import { checkCreativePinAuthority } from "./fixtures/creative-pin-authority.js";

test("W5-01-DATASET-06 BSH-03 cancellation, revocation or provider replacement during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "dataset", table: "datasets", field: "dataset", manifest: datasetManifest, actions: datasetActions }));
