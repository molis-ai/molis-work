import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { artifactContinuers, continuerReadsFile, artifactProducerSources } from "@molis-ai/molis-work-app-local-host";
import { pagesManifest, PAGES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-pages";
import { IMPORTED_DOCUMENT_TYPE } from "@molis-ai/molis-work-contracts/modules/artifacts";

// ac-artifacts A3, PG-079 (slices/ac-artifacts.md §3.4): `artifacts.consumes[].file` says which imported files a plugin can read, so the
// Host lists plugins for "continue from this version" without importing Pages. RAC-418 the list is the one Pages had, and another
// plugin can declare its own; RAC-419 the Host source names no Pages.

/** What the Host asked before the declaration existed: Pages for the files its pattern reads, and for a stored original when it kept text. */
const OLD_PATTERN = /\.(?:md|markdown|txt|html?|csv|docx|zip)$/iu;
const oldReads = (file: { filename: string; stored?: unknown; text?: string }) => file.stored ? Boolean(file.text?.trim()) : OLD_PATTERN.test(file.filename);

const pagesContinuer = () => artifactContinuers().get(IMPORTED_DOCUMENT_TYPE)!.find(item => item.plugin_id === PAGES_PLUGIN_ID)!;

test("RAC-418: Pages' continue list is the same, extension by extension, as before the declaration", () => {
  const continuer = pagesContinuer();
  assert.ok(continuer.file, "the Manifest declares it");
  const names = ["a.md", "a.MARKDOWN", "a.txt", "a.html", "a.HTM", "a.csv", "a.docx", "a.zip", "a.pdf", "a.png", "a.mdx", "md", "a.md.exe", "a.tar.gz", ".zip"];
  for (const filename of names) assert.equal(continuerReadsFile(continuer, { filename }), oldReads({ filename }), filename);
  for (const file of [{ filename: "big.pdf", stored: { sha256: "x" }, text: "extracted" }, { filename: "big.docx", stored: { sha256: "x" }, text: "  " }, { filename: "big.docx", stored: { sha256: "x" } }]) {
    assert.equal(continuerReadsFile(continuer, file), oldReads(file), JSON.stringify(file));
  }
});

test("RAC-418: a plugin that declares .pdf appears for a PDF import and not for a Markdown one; one with no declaration takes every file", () => {
  const pages = artifactProducerSources().find(source => source.plugin_id === PAGES_PLUGIN_ID)!;
  const action = pages.actions.find(item => item.capability_id === "pages.artifacts.continue")!;
  const reader = { plugin_id: "example.pdf-reader", name: "PDF reader", surface: "pdf", actions: [action],
    artifacts: { produces: [], consumes: [{ artifact_type_id: IMPORTED_DOCUMENT_TYPE, schema_version: 1, continue: { capability_id: action.capability_id, version: action.version }, file: { extensions: [".pdf"] } }] } };
  const anyFile = { ...reader, plugin_id: "example.any", artifacts: { produces: [], consumes: [{ ...reader.artifacts.consumes[0]!, file: undefined }] } };
  const continuers = artifactContinuers([...artifactProducerSources(), reader, anyFile]).get(IMPORTED_DOCUMENT_TYPE)!;
  const listedFor = (filename: string) => continuers.filter(item => continuerReadsFile(item, { filename })).map(item => item.plugin_id).sort();
  assert.deepEqual(listedFor("report.pdf"), ["example.any", "example.pdf-reader"]);
  assert.deepEqual(listedFor("notes.md"), ["example.any", PAGES_PLUGIN_ID].sort());
});

test("RAC-418: the Manifest check refuses a file declaration that cannot work", () => {
  const withFile = (file: unknown, extra: Record<string, unknown> = {}) => {
    const manifest = structuredClone(pagesManifest);
    const consumed = manifest.artifacts.consumes[0]! as Record<string, unknown>;
    consumed.file = file;
    Object.assign(consumed, extra);
    return manifest;
  };
  parsePluginManifest(withFile({ extensions: [".md"], stored_text: true }));
  for (const bad of [{ extensions: [] }, { extensions: ["md"] }, { extensions: [".MD"] }, { extensions: [".md", ".md"] }, { extensions: [".md"], stored_text: "yes" }, { extensions: [".md"], mime: "x" }, "md", null]) {
    assert.throws(() => parsePluginManifest(withFile(bad)), undefined, JSON.stringify(bad));
  }
  assert.throws(() => parsePluginManifest(withFile({ extensions: [".md"] }, { continue: undefined })), /继续动作/);
  const produced = structuredClone(pagesManifest);
  (produced.artifacts.produces[0]! as Record<string, unknown>).file = { extensions: [".md"] };
  assert.throws(() => parsePluginManifest(produced), /file 只能写在读取的类型/);
});

test("RAC-419: the Host's 成果库 page names no Pages", () => {
  const source = readFileSync(new URL("../apps/local-host/src/artifact-native-plugin-http.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /PAGES_PLUGIN_ID|PAGES_READABLE_FILE|molis-work-plugin-pages/);
});
