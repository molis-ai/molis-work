import assert from "node:assert/strict";
import test from "node:test";
import { transformSync } from "esbuild";
import { SCHEDULE_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-schedule";
import { pluginWorkbenchClientAsset } from "@molis-ai/molis-work-app-workbench";

// The page asset budget only shrinks. This plugin keeps its explanations as comments and its layout as indentation in
// the source and is sent without the comments that fill whole lines (`//` and `/* */`) and without the indentation; this holds what
// is sent to the same program as what was written (comments, spacing and quoting aside).

const sources: Record<string, string> = { schedule: SCHEDULE_CLIENT_FACTORY_SCRIPT };
// Identifier minification chooses names using character frequencies, which can change after a trivia-only pass.
// Preserve names so this compares the actual program, including its bindings, rather than the minifier's choices.
const program = (script: string) => transformSync(`const factory = ${script};`, { loader: "js", minifySyntax: true, minifyWhitespace: true }).code;

for (const [id, source] of Object.entries(sources)) {
  test(`${id}: the asset sent is the script written, without its whole-line comments and indentation`, () => {
    const asset = pluginWorkbenchClientAsset(id)!;
    const marker = `globalThis.molisWorkbenchPluginFactories[${JSON.stringify(id)}] = `;
    assert.ok(asset.startsWith("globalThis.molisWorkbenchPluginFactories ||= {}; ") && asset.endsWith(";"));
    const sent = asset.slice(asset.indexOf(marker) + marker.length, -1);
    assert.equal(program(sent), program(source), "the same program");
    assert.doesNotMatch(sent, /^[ \t]*\/\//m, "no whole-line comment is sent");
    assert.doesNotMatch(sent, /^[ \t]*\/\*/m, "and no block comment that starts a line");
    assert.doesNotMatch(sent, /^[ \t]/m, "and no line starts with indentation");
    assert.ok(Buffer.byteLength(sent) < Buffer.byteLength(source), "and it is smaller for it");
    assert.match(source, /^[ \t]*\/\//m, "the source still carries its explanations");
  });
}
