import test from "node:test";
import { pptActions, pptManifest } from "@molis-ai/molis-work-plugin-ppt";
import { checkCreativePinAuthority } from "./fixtures/creative-pin-authority.js";

test("W5-01-PPT-07 BSH-03 cancellation or a stale caller guard during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "ppt", table: "presentations", field: "presentation", manifest: pptManifest, actions: pptActions }));
