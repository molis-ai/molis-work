// RAC-2810: the platform Artifact HTTP composition reads Manifest file declarations at its current path.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defineArtifactContinueAction, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { artifactContinuers, continuerReadsFile, artifactProducerSources } from "@molis-ai/molis-work-app-local-host";
import { pagesManifest, PAGES_PLUGIN_ID } from "@molis-ai/molis-work-plugin-pages";
import { IMPORTED_DOCUMENT_TYPE } from "@molis-ai/molis-work-contracts/modules/artifacts";

// ac-artifacts A3, PG-079 (slices/ac-artifacts.md §3.4), moved by contract-design §2.3: the continue action's intake `file` says which imported files a plugin can read, so the
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
  // The files a continuer reads are on its continue action's intake (contract-design §2.3), not on the 成果 type it reads.
  const continueFrom = (plugin_id: string, file?: { extensions: string[] }) => defineArtifactContinueAction(plugin_id + ".continue", 1, "文档", [],
    { item_kind: "document", artifact_types: [{ artifact_type_id: IMPORTED_DOCUMENT_TYPE, schema_version: 1 }], ...(file ? { file } : {}) });
  const source = (plugin_id: string, file?: { extensions: string[] }) => ({ plugin_id, name: plugin_id, surface: plugin_id, actions: [continueFrom(plugin_id, file)],
    artifacts: { produces: [], consumes: [{ artifact_type_id: IMPORTED_DOCUMENT_TYPE, schema_version: 1 }] } });
  const continuers = artifactContinuers([...artifactProducerSources(), source("example.pdf-reader", { extensions: [".pdf"] }), source("example.any")]).get(IMPORTED_DOCUMENT_TYPE)!;
  const listedFor = (filename: string) => continuers.filter(item => continuerReadsFile(item, { filename })).map(item => item.plugin_id).sort();
  assert.deepEqual(listedFor("report.pdf"), ["example.any", "example.pdf-reader"]);
  assert.deepEqual(listedFor("notes.md"), ["example.any", PAGES_PLUGIN_ID].sort());
});

test("RAC-418: the Manifest check refuses a file declaration that cannot work", () => {
  const withFile = (file: unknown) => {
    const manifest = structuredClone(pagesManifest);
    const resume = manifest.actions!.find(item => item.capability_id === "pages.artifacts.continue")!;
    Object.assign(resume.action.intake!.accepts[0]!, { file });
    return manifest;
  };
  parsePluginManifest(withFile({ extensions: [".md"], stored_text: true }));
  for (const bad of [{ extensions: [] }, { extensions: ["md"] }, { extensions: [".MD"] }, { extensions: [".md", ".md"] }, { extensions: [".md"], stored_text: "yes" }, { extensions: [".md"], mime: "x" }, "md", null]) {
    assert.throws(() => parsePluginManifest(withFile(bad)), undefined, JSON.stringify(bad));
  }
  // A 成果 type no longer says who continues from it or which files: a type that still does is refused and told where it goes now.
  for (const field of ["file", "continue"] as const) for (const side of ["consumes", "produces"] as const) {
    const manifest = structuredClone(pagesManifest);
    (manifest.artifacts[side][0]! as Record<string, unknown>)[field] = field === "file" ? { extensions: [".md"] } : { capability_id: "pages.artifacts.continue", version: 1 };
    assert.throws(() => parsePluginManifest(manifest), new RegExp(`不再声明 ${field}：「从这一版继续」写在继续动作的 intake 上`), side + " " + field);
  }
});

test("RAC-419: the Host's 成果库 page names no Pages", () => {
  const source = readFileSync(new URL("../apps/local-host/src/artifact-library-http.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /PAGES_PLUGIN_ID|PAGES_READABLE_FILE|molis-work-plugin-pages/);
});
