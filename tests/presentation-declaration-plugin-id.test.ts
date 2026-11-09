import assert from "node:assert/strict";
import test from "node:test";
import { definePresentationOverviewAction, definePresentationValuesAction, defineSearchEntriesAction } from "@molis-ai/molis-work-plugin-sdk";
import { validatePresentationDeclaration } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { DECLARATION_PLUGIN_ID } from "./fixtures/declaration-manifest.js";

// SSC-06 (words): a word's key has to be under this plugin's own prefix, and the prefix comes from the Manifest's
// `plugin_id`. A declaration that writes `label`/`note` while the Manifest carries no plugin_id cannot be checked, so it is
// refused with a problem naming where the word is (2026-11-09 audit: it used to pass silently).
const search = defineSearchEntriesAction("notes.search.entries", 1, [{ kind: "note", title: "笔记", surface: "notes" }], "笔记", []);
const values = definePresentationValuesAction("notes.presentation.values", 1, ["note"], "笔记的显示字段", []);
const overview = definePresentationOverviewAction("notes.presentation.overview", 1, "笔记概况", []);
const actions = [search, values, overview];
const presentation = {
  objects: [{ kind: "note", fields: [{ key: "title", role: "title", label: { key: "declaration-rules.note.title" } }], forms: {} }],
  overview: { capability_id: "notes.presentation.overview", version: 1, note: { key: "declaration-rules.overview.note" }, start: [{ capability_id: "notes.presentation.values", version: 1 }] },
};

test("SSC-06 (words): with its plugin_id the declaration is clean, and without one the words are refused rather than skipped", () => {
  assert.deepEqual(validatePresentationDeclaration({ plugin_id: DECLARATION_PLUGIN_ID, actions, presentation }), []);
  assert.deepEqual(validatePresentationDeclaration({ actions, presentation }), [
    "presentation.objects[0].fields[0].label：plugin_id 缺失，无法核对文字前缀",
    "presentation.overview.note：plugin_id 缺失，无法核对文字前缀",
  ]);
});

test("SSC-06 (words): a Manifest without plugin_id but without any word still passes, so the new problem lands only on words", () => {
  assert.deepEqual(validatePresentationDeclaration({ actions: [], presentation: { objects: [] } }), []);
});
