import test from "node:test";
import { formActions, formManifest } from "@molis-ai/molis-work-plugin-form";
import { checkCreativePinAuthority } from "./fixtures/creative-pin-authority.js";

test("W5-01-FORM-01 BSH-03 cancellation, revocation or provider replacement during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "form", table: "forms", field: "form", manifest: formManifest, actions: formActions }));
