import assert from "node:assert/strict";
import test from "node:test";
import { transformSync } from "esbuild";
import { SCHEDULE_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-schedule";
import { LINGGUANG_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-lingguang";
import { pluginWorkbenchClientAsset } from "@molis-ai/molis-work-app-workbench";

// RAC-159-SERVED: cover the plugins registered with clientServed: true.
// Schedule keeps explanations and indentation in its source; clientServed removes whole-line comments and indentation.
// Lingguang already reads an esbuild bundle, so serving it must preserve its bytes as well as its program.

const sources = [
  { id: "schedule", source: SCHEDULE_CLIENT_FACTORY_SCRIPT, bundled: false },
  { id: "lingguang", source: LINGGUANG_CLIENT_FACTORY_SCRIPT, bundled: true },
];
// Identifier minification chooses names using character frequencies, which can change after a trivia-only pass.
// Preserve names so this compares the actual program, including its bindings, rather than the minifier's choices.
const program = (script: string) => transformSync(`const factory = ${script};`, { loader: "js", minifySyntax: true, minifyWhitespace: true }).code;

for (const { id, source, bundled } of sources) {
  test(`${id}: the asset sent is the script written, without its whole-line comments and indentation`, () => {
    const asset = pluginWorkbenchClientAsset(id)!;
    const marker = `globalThis.molisWorkbenchPluginFactories[${JSON.stringify(id)}] = `;
    assert.ok(asset.startsWith("globalThis.molisWorkbenchPluginFactories ||= {}; ") && asset.endsWith(";"));
    const sent = asset.slice(asset.indexOf(marker) + marker.length, -1);
    assert.equal(program(sent), program(source), "the same program");
    assert.doesNotMatch(sent, /^[ \t]*\/\//m, "no whole-line comment is sent");
    assert.doesNotMatch(sent, /^[ \t]*\/\*/m, "and no block comment that starts a line");
    assert.doesNotMatch(sent, /^[ \t]/m, "and no line starts with indentation");
    if (bundled) {
      assert.equal(sent, source, "the already minified bundle is served byte for byte");
    } else {
      assert.ok(Buffer.byteLength(sent) < Buffer.byteLength(source), "and it is smaller for it");
      assert.match(source, /^[ \t]*\/\//m, "the source still carries its explanations");
    }
  });
}
