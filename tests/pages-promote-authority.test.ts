import test from "node:test";
import { pagesActions, pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { checkCreativePinAuthority } from "./fixtures/creative-pin-authority.js";

test("W5-01-PAGES-06 BSH-03 cancellation, revocation or provider replacement during the real pin rolls back both owners", t =>
  checkCreativePinAuthority(t, { slug: "pages", table: "pages", field: "document", manifest: pagesManifest, actions: pagesActions }));
