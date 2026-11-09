import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build, type BuildOptions } from "esbuild";

import { UI_FORMAT_VERSIONS, type UiLocalePack, type UiSkinFile, type UiSpecFile } from "@molis-ai/molis-work-contracts/platform/ui";
import * as nodeUi from "@molis-ai/molis-work-plugin-sdk/ui";
import { installTextForTest, t } from "@molis-ai/molis-work-plugin-sdk/ui";

// `/ui` bundled for a browser: FSS-48, FSS-50 and the bundled-copy half of FSS-69 (specs/font-and-skin-system/spec.md §11). A built-in plugin's release
// carries its own copy of the SDK and loads from a `data:` URL, so these run the bundle that way.

const REPOSITORY = fileURLToPath(new URL("..", import.meta.url));
const SDK_UI = "@molis-ai/molis-work-plugin-sdk/ui";

async function bundle(contents: string, options: BuildOptions = {}) {
  const result = await build({
    stdin: { contents, resolveDir: REPOSITORY, loader: "js" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    logLevel: "silent",
    metafile: true,
    ...options,
  });
  // Every file esbuild read is in `metafile.inputs`, shaken out or not; what is in the bundle is what gave it bytes.
  const output = Object.values(result.metafile!.outputs)[0]!;
  return {
    text: result.outputFiles![0]!.text,
    inputs: Object.keys(result.metafile!.inputs),
    bundled: Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path),
  };
}

const load = (text: string) => import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`);

const SPEC: UiSpecFile = {
  format_version: UI_FORMAT_VERSIONS.spec, id: "molis-interface", revision: 1, baseline_skin: { id: "soft-workbench", revision: 1 }, baseline_font: { id: "system-sans", revision: 1 },
  groups: [{ group: "shell", roles: [{ name: "page", type: "color", varies_by: "theme" }, { name: "nav-bg", type: "color", varies_by: "theme", follows: "page" }, { name: "shadow", type: "shadow", varies_by: "none" }] }],
  font_roles: [],
  components: [],
};
const SKIN: UiSkinFile = {
  format_version: UI_FORMAT_VERSIONS.skin, id: "soft-workbench", revision: 1, spec: { id: "molis-interface", revision: 1 }, name: { literal: "Soft" }, recommended_font: { id: "system-sans", revision: 1 },
  light: { page: "#EEF3F7" }, dark: { page: "#141a20" }, shared: { shadow: { shadow: [{ x: 0, y: 1, blur: 2, spread: -1, color: { rgba: [28, 42, 58, 0.05] } }] } }, terminal: {},
};
const NOW = Date.UTC(2026, 10, 7, 12);
const SAME_INPUT = (ui: typeof nodeUi) => ({
  environment: ui.resolveUiEnvironment({ spec: SPEC, skin: SKIN, locale: { tag: "zh", source: "explicit" } }),
  skin: ui.resolveSkin(SPEC, SKIN),
  css: ui.resolveSkin(SPEC, SKIN).ok ? ui.skinTokenDeclarations((ui.resolveSkin(SPEC, SKIN) as { value: never }).value, { theme: "light" }) : null,
  messages: [
    ui.formatMessage({ plural_arg: "n", forms: { one: "{n} file", other: "{n} files" } }, [{ name: "n", kind: "number", number: 1200, style: "compact" }], "en", { now: NOW }),
    ui.formatMessage("{at} {when} {n} {name}", [
      { name: "at", kind: "date", at: "2026-11-07", style: "weekday-month-day" },
      { name: "when", kind: "date", at: "2026-11-06T12:00:00Z", style: "relative" },
      { name: "n", kind: "number", number: 2026 },
      { name: "name", kind: "text", text: "A&B" },
    ], "zh-CN", { now: NOW }),
  ],
  parsed: ui.parseStrictJson('{"a":1,"a":2}'),
});

test("FSS-48: the same input gives the same JSON in Node and bundled for a browser", async () => {
  const { text } = await bundle(`export * from ${JSON.stringify(SDK_UI)};`);
  const browser = await load(text) as typeof nodeUi;
  assert.deepEqual(JSON.parse(JSON.stringify(SAME_INPUT(browser))), JSON.parse(JSON.stringify(SAME_INPUT(nodeUi))));
  assert.equal(SAME_INPUT(browser).messages[0], "1.2K files", "it did run");
});

test("FSS-39 zoned dates agree in the host and a browser bundle with different process zones", async () => {
  const { text } = await bundle(`export { formatDate } from ${JSON.stringify(SDK_UI)};`);
  const browser = await load(text) as Pick<typeof nodeUi, "formatDate">;
  const at = "2026-03-08T10:00:00Z", time_zone = "America/Los_Angeles";
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const hostText = nodeUi.formatDate(at, "time", "en", { time_zone });
    const hostDefault = nodeUi.formatDate(at, "time", "en");
    process.env.TZ = "Asia/Shanghai";
    assert.notEqual(browser.formatDate(at, "time", "en"), hostDefault, "an unspecified zone follows the environment");
    assert.equal(browser.formatDate(at, "time", "en", { time_zone }), hostText);
    assert.match(hostText, /^3:00\sAM$/u);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("FSS-50: `/ui` bundled for a browser has no Node built-in module", async () => {
  const { inputs } = await bundle(`export * from ${JSON.stringify(SDK_UI)};`);
  assert.ok(inputs.some((input) => input.includes("plugin-sdk/dist/ui/text.js")), "the text tools are in it");
  assert.deepEqual(inputs.filter((input) => input.startsWith("node:") || /^(?:fs|path|crypto|os|module|url|async_hooks)$/u.test(input)), []);
  // A file that imports a built-in would have failed the build above: this one shows that it does.
  await assert.rejects(bundle('import "node:fs";'), /node:fs/u);
});

test("FSS-50: a plugin that only takes renderButton from `/ui` does not grow by one byte", async () => {
  const options = { minify: true } as const;
  const button = fileURLToPath(new URL("../packages/plugin-sdk/dist/ui/button.js", import.meta.url));
  const direct = await bundle(`export { renderButton } from ${JSON.stringify(button)};`, options);
  const throughUi = await bundle(`export { renderButton } from ${JSON.stringify(SDK_UI)};`, options);
  assert.equal(throughUi.text.length, direct.text.length);
  for (const marker of ["molis.work.ui-text", "ui.json_syntax", "text_ref_invalid", "PluralRules"]) assert.ok(!throughUi.text.includes(marker), marker);
  assert.ok(throughUi.bundled.some((input) => input.endsWith("dist/ui/button.js")), "the button itself is measured");
  assert.ok(!throughUi.bundled.some((input) => /dist\/ui\/(?:text|locale-pack|message-format|file-reader|appearance|environment|strict-json|token-values)/u.test(input)), throughUi.bundled.join());
});

test("FSS-69: a copy of the SDK bundled into one module and loaded from data: reads the context this copy installed", async () => {
  const { text } = await bundle(`export { t, say, format } from ${JSON.stringify(SDK_UI)};`);
  const copy = await load(text) as Pick<typeof nodeUi, "t" | "say" | "format">;
  assert.notEqual(copy.t, t, "it is another copy");
  assert.throws(() => copy.t("notes.a"), { code: "ui.text_no_context" }, "nothing installed yet");
  const pack: UiLocalePack = { format_version: UI_FORMAT_VERSIONS.locale, owner: "io.molis.work.example.notes", locale: "en", messages: { "notes.a": "Hello {who}" } };
  const uninstall = installTextForTest({ packs: [pack], locale: "en" });
  try {
    assert.equal(copy.t("notes.a", { who: "A&B" }), "Hello A&amp;B");
    assert.equal(copy.say({ owner: pack.owner, key: "notes.a", args: [{ name: "who", kind: "text", text: "x" }] }), "Hello x");
    assert.equal(copy.format.number(1234), "1,234");
  } finally {
    uninstall();
  }
  assert.throws(() => copy.t("notes.a"), { code: "ui.text_no_context" }, "taken back for every copy");
});
