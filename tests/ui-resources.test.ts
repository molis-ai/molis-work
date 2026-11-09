import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BASELINE_REGISTRY, INTER_VARIABLE_ASSET_PATH, interVariableFontFilePath, NOTO_SANS_SC_ASSET_PATH, notoSansScFontFilePath } from "@molis-ai/molis-work-design-system";
import { inspectLocaleSet, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";

// The one table of what ships with the product (specs/font-and-skin-system/a-section-contract.md §1.3, §3.6). What a row says of a file, and that nothing ships without a row.

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE_DIRECTORIES: Readonly<Record<string, string>> = { "@molis-ai/molis-work-design-system": "packages/design-system", "@molis-ai/molis-work-app-workbench": "apps/workbench" };
const NOT_REGISTERED = new Set(["packages/design-system/fonts/README.md", "packages/design-system/resources/registry.json"]);
const directoryOf = (name: string) => PACKAGE_DIRECTORIES[name] ?? assert.fail(`登记表的包 ${name} 不认识，在 PACKAGE_DIRECTORIES 加上它`);
const RESOURCES = BASELINE_REGISTRY.resources;
const FOLIO_ASSET_IDS = ["font.folio-nunito-latin", ...[400, 500, 600, 700].flatMap(weight =>
  [`font.folio-rounded-${weight}-common`, `font.folio-rounded-${weight}-tail`])];

function filesBelow(directory: string): string[] {
  return readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesBelow(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]));
}

test("FSS-58 every row's file or directory is there", () => {
  assert.ok(RESOURCES.length >= 5);
  for (const row of RESOURCES) {
    const file = path.join(ROOT, directoryOf(row.package), row.path);
    assert.ok(existsSync(file), `${row.id}: ${row.path}`);
    assert.equal(statSync(file).isDirectory(), row.kind === "locale", `${row.id}: a locale row is a language directory, any other a file`);
  }
});

test("FSS-58 a third party's binary matches the digest in its row and has its licence", () => {
  const binaries = RESOURCES.filter((row) => row.kind === "font" || row.kind === "asset");
  assert.deepEqual(binaries.map((row) => row.id).sort(), ["font.inter-latin-variable", "font.noto-sans-sc-400", ...FOLIO_ASSET_IDS].sort());
  for (const row of binaries) {
    if (row.kind !== "font" && row.kind !== "asset") continue;
    const directory = directoryOf(row.package);
    assert.equal(createHash("sha256").update(readFileSync(path.join(ROOT, directory, row.path))).digest("hex"), row.sha256, `${row.path} was replaced: if on purpose, update its sha256`);
    assert.ok(row.license.spdx && row.license.source, row.id);
    if (row.license.notice_path !== undefined) assert.ok(existsSync(path.join(ROOT, directory, row.license.notice_path)), row.license.notice_path);
  }
});

test("FSS-58 nothing sits under resources/ or fonts/ without a row", () => {
  for (const directory of new Set(RESOURCES.map((row) => directoryOf(row.package)))) {
    const registered = RESOURCES.filter((row) => directoryOf(row.package) === directory).flatMap(row => [
      `${directory}/${row.path}`,
      ...((row.kind === "font" || row.kind === "asset") && row.license.notice_path ? [`${directory}/${row.license.notice_path}`] : []),
    ]);
    for (const file of ["resources", "fonts"].flatMap((name) => (existsSync(path.join(ROOT, directory, name)) ? filesBelow(`${directory}/${name}`) : []))) {
      if (NOT_REGISTERED.has(file)) continue;
      assert.ok(registered.some((entry) => file === entry || file.startsWith(`${entry}/`)), `${file} ships without a row in resources/registry.json`);
    }
  }
});

test("FSS-58 the package's files cover every row, so a release carries them", () => {
  for (const row of RESOURCES) {
    const { files } = JSON.parse(readFileSync(path.join(ROOT, directoryOf(row.package), "package.json"), "utf8")) as { files: string[] };
    assert.ok(files.includes(row.path.split("/")[0]!), `${row.package} 的 files 没有 ${row.path}`);
  }
});

test("FSS-58 a row's route is the literal Local Host serves, which the page-asset gate reads", () => {
  const webAssets = readFileSync(path.join(ROOT, "apps/local-host/src/web-assets.ts"), "utf8");
  const routes = RESOURCES.flatMap((row) => row.route ?? []);
  const folioRoutes = FOLIO_ASSET_IDS.map(id => `/assets/${id.slice("font.".length)}.woff2`);
  assert.deepEqual([...routes].sort(), [INTER_VARIABLE_ASSET_PATH, NOTO_SANS_SC_ASSET_PATH, ...folioRoutes].sort());
  for (const route of routes) assert.ok(webAssets.includes(`case "${route}":`), route);
});

test("FSS-58 the two font rows keep Local Host off the path the release does not have", () => {
  assert.doesNotMatch(readFileSync(path.join(ROOT, "apps/local-host/src/web-assets.ts"), "utf8"), /\.\.\/packages\//u);
  // The files on disk come from the rows' path as the routes come from their route: typeface.ts writes neither (#1976 review ② item 5).
  const fileOf = (id: string) => path.join(ROOT, directoryOf(RESOURCES.find((row) => row.id === id)!.package), RESOURCES.find((row) => row.id === id)!.path);
  assert.equal(interVariableFontFilePath(), fileOf("font.inter-latin-variable"));
  assert.equal(notoSansScFontFilePath(), fileOf("font.noto-sans-sc-400"));
  assert.doesNotMatch(readFileSync(path.join(ROOT, "packages/design-system/src/typeface.ts"), "utf8"), /\.woff2/u);
});

test("FSS-58 a language directory's files parse, are the row's owner's, and agree with each other", () => {
  const rows = RESOURCES.filter((row) => row.kind === "locale");
  assert.deepEqual(rows.map((row) => row.owner), ["workbench"]);
  for (const row of rows) {
    const directory = path.join(ROOT, directoryOf(row.package), row.path);
    const packs = readdirSync(directory).sort().map((name) => {
      const parsed = parseLocalePack(readFileSync(path.join(directory, name), "utf8"), { file: name });
      assert.ok(parsed.ok, `${row.id} ${name}: ${JSON.stringify(parsed.ok ? null : parsed.problems)}`);
      assert.equal(parsed.value.owner, row.owner, `${row.id} ${name}: the owner is the row's`);
      assert.equal(`${parsed.value.locale}.json`, name, `${row.id} ${name}: the file is named for its language`);
      return parsed.value;
    });
    assert.deepEqual(packs.map((pack) => pack.locale), ["en", "zh"]);
    // The platform's default language is the first of the Web's (`WEB_LOCALES[0]`, zh); every other language has the same keys and arguments.
    assert.deepEqual(inspectLocaleSet(packs, { default: "zh", directory: row.path }), [], row.id);
  }
});
