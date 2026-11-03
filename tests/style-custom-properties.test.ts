import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AGENT_STUDIO_STYLES } from "@molis-ai/molis-work-plugin-builder";
import {
  renderMolisWorkArrivalStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

// specs/visual-ui-experience VUX-38 (one production definition of each semantic parameter) and VUX-02 (a failure still
// stands out): a rule that reads a custom property nobody declares, with no fallback, silently draws nothing — a failed step
// in the ink of an ordinary one, a gap of 0, a divider that is not there. Every `var(--name)` without a fallback, in the
// three served stylesheets, the studio's sheet and the source of every plugin and client script, must name a property some
// rule, inline style or script declares. Declarations are read from the rendered sheets (where generated names such as
// `--hue-<id>` are written out) and from the source (inline `style="--x:…"` in templates, `setProperty("--x", …)`).

const SOURCE_PATHS = ["apps", "packages", "plugins", "horizontal", "modules", "server"];
const sources = () => execFileSync("git", ["ls-files", "--", ...SOURCE_PATHS, ":!*test*", ":!*/dist/*", ":!*.md"], { encoding: "utf8" })
  .split("\n").filter((file) => /\.(?:ts|mts|css|js|mjs|html)$/.test(file));

function declaredIn(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) names.add(match[1]!);
  for (const match of text.matchAll(/["'`](--[a-zA-Z0-9_-]+)["'`]/g)) names.add(match[1]!);
  return names;
}
/** Each `var(--name)` with nothing after the name: no fallback to fall to. */
function bareReads(text: string): string[] {
  return [...text.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)].map((match) => match[1]!);
}

test("VUX-38 VUX-02 every custom property a style reads without a fallback is declared somewhere", () => {
  const sheets = { workbench: renderMolisWorkWorkbenchStylesheet(), arrival: renderMolisWorkArrivalStylesheet(), settings: renderMolisWorkSettingsStylesheet(), studio: AGENT_STUDIO_STYLES };
  const files = sources();
  assert.ok(files.some((file) => file.endsWith("plugins/native/coding/src/styles.ts")) && files.some((file) => file.endsWith("packages/design-system/src/palette.ts")), "the plugins' sheets and the palette are read");
  const texts: Array<[string, string]> = [...Object.entries(sheets), ...files.map((file) => [file, readFileSync(file, "utf8")] as [string, string])];
  const declared = new Set<string>();
  for (const [, text] of texts) for (const name of declaredIn(text)) declared.add(name);
  const found = new Map<string, Set<string>>();
  let read = 0;
  for (const [where, text] of texts) for (const name of bareReads(text)) {
    read++;
    if (declared.has(name)) continue;
    if (!found.has(name)) found.set(name, new Set());
    found.get(name)!.add(where);
  }
  assert.ok(read > 1000, `the sheets' reads were found (${read})`);
  assert.deepEqual([...found].map(([name, at]) => `${name} — read in ${[...at].join(", ")}, declared nowhere`), []);
});

test("VUX-38 the check reads declarations and bare reads, and leaves a read with a fallback alone", () => {
  assert.deepEqual([...declaredIn(`:root { --a: 1px; } x.style.setProperty("--b", v); <i style="--c:${"2"}">`)], ["--a", "--c", "--b"]);
  assert.deepEqual(bareReads("a { color: var(--a); gap: var( --b ); border: var(--c, 1px); margin: var(--d,var(--e)); }"), ["--a", "--b", "--e"]);
});
