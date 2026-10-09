import assert from "node:assert/strict";
import test from "node:test";
import { transformSync } from "esbuild";
import { PAGES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-pages";
import { LINGGUANG_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-lingguang";
import { SCHEDULE_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-schedule";
import { pluginWorkbenchClientAsset } from "@molis-ai/molis-work-app-workbench";

// The page asset budget only shrinks. These three plugins keep their explanations as comments in the source and are sent without
// the whole-line ones; this holds what is sent to the same program as what was written (comments, spacing and quoting aside).

const sources: Record<string, string> = { pages: PAGES_CLIENT_FACTORY_SCRIPT, lingguang: LINGGUANG_CLIENT_FACTORY_SCRIPT, schedule: SCHEDULE_CLIENT_FACTORY_SCRIPT };
const program = (script: string) => transformSync(`const factory = ${script};`, { loader: "js", minify: true }).code;

for (const [id, source] of Object.entries(sources)) {
  test(`${id}: the asset sent is the script written, without its whole-line comments`, () => {
    const asset = pluginWorkbenchClientAsset(id)!;
    const marker = `globalThis.molisWorkbenchPluginFactories[${JSON.stringify(id)}] = `;
    assert.ok(asset.startsWith("globalThis.molisWorkbenchPluginFactories ||= {}; ") && asset.endsWith(";"));
    const sent = asset.slice(asset.indexOf(marker) + marker.length, -1);
    assert.equal(program(sent), program(source), "the same program");
    assert.doesNotMatch(sent, /^[ \t]*\/\//m, "no whole-line comment is sent");
    assert.ok(Buffer.byteLength(sent) < Buffer.byteLength(source), "and it is smaller for it");
    assert.match(source, /^[ \t]*\/\//m, "the source still carries its explanations");
  });
}
