import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BASELINE_REGISTRY, INTER_VARIABLE_ASSET_PATH, interVariableFontFilePath, NOTO_SANS_SC_ASSET_PATH, notoSansScFontFilePath } from "@molis-ai/molis-work-design-system";
import { inspectLocaleSet, parseLocalePack, parseUiLanguageCatalog } from "@molis-ai/molis-work-plugin-sdk/ui";

// The one table of what ships with the product (specs/font-and-skin-system/a-section-contract.md §1.3, §3.6). What a row says of a file, and that nothing ships without a row.

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE_DIRECTORIES: Readonly<Record<string, string>> = { "@molis-ai/molis-work-design-system": "packages/design-system", "@molis-ai/molis-work-app-workbench": "apps/workbench", "@molis-ai/molis-work-im-ui": "packages/im-ui" };
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
      ...(row.kind === "locale" && row.owner === "workbench" ? [`${directory}/${path.dirname(row.path)}/languages.json`] : []),
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
  assert.deepEqual(rows.map((row) => row.owner), ["workbench", "im-ui"]);
  const catalog = parseUiLanguageCatalog(readFileSync(path.join(ROOT, "apps/workbench/resources/languages.json"), "utf8"));
  assert.ok(catalog.ok);
  for (const row of rows) {
    const directory = path.join(ROOT, directoryOf(row.package), row.path);
    const packs = readdirSync(directory).sort().map((name) => {
      const parsed = parseLocalePack(readFileSync(path.join(directory, name), "utf8"), { file: name });
      assert.ok(parsed.ok, `${row.id} ${name}: ${JSON.stringify(parsed.ok ? null : parsed.problems)}`);
      assert.equal(parsed.value.owner, row.owner, `${row.id} ${name}: the owner is the row's`);
      assert.equal(`${parsed.value.locale}.json`, name, `${row.id} ${name}: the file is named for its language`);
      return parsed.value;
    });
    if (row.owner === "workbench") assert.deepEqual(packs.map(pack => pack.locale), catalog.value.languages.map(language => language.tag).sort());
    else assert.deepEqual(packs.map(pack => pack.locale), ["en", "zh"], "the shipped discussion packs include its default and its English words");
    assert.deepEqual(inspectLocaleSet(packs, { default: catalog.value.default, directory: row.path }), [], row.id);
  }
});

test("FSS-34 the same Workbench build discovers and serves a language added only in its registered resources", () => {
  const source = path.join(ROOT, "apps/workbench"), scratch = mkdtempSync(path.join(tmpdir(), "workbench-language-catalog-"));
  try {
    for (const item of ["package.json", "dist", "resources"]) cpSync(path.join(source, item), path.join(scratch, item), { recursive: true });
    symlinkSync(path.join(source, "node_modules"), path.join(scratch, "node_modules"));
    const catalogPath = path.join(scratch, "resources/languages.json"), packPath = path.join(scratch, "resources/locales/en-GB.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    const pack = JSON.parse(readFileSync(path.join(scratch, "resources/locales/en.json"), "utf8"));
    const descriptor = { tag: "en-GB", html_lang: "en-GB", intl: "en-GB", direction: "ltr", name: "English (UK)" };
    const probe = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { WEB_LOCALES, createWorkbenchLocale, renderWorkbenchDocument, workbenchLanguageResource, workbenchPlatformText } from "./dist/index.js";
      const web = createWorkbenchLocale(() => "en-GB");
      const href = renderWorkbenchDocument({ lang: "en-GB", title: "probe", body_html: "" }).match(/data-ui-language-resource[^>]*src="([^"]+)/)?.[1];
      const asset = href && workbenchLanguageResource(href);
      process.stdout.write(JSON.stringify({ languages: WEB_LOCALES, system: web.resolveWebLocaleChoice(undefined, "en-GB,en;q=0.8").tag,
        cookie: web.resolveWebLocaleChoice("molis_work_locale=en-GB", "zh").tag, rejected: web.resolveWebLocaleChoice("molis_work_locale=fr", "en").tag,
        href, served: asset?.href === href, word: workbenchPlatformText.pack("en-GB")?.messages["workbench.language.retry"], html: web.htmlLang(),
        intl: web.dateTimeLocale() }));
    `], { cwd: scratch, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    const text = "Try that again";
    writeFileSync(catalogPath, JSON.stringify({ ...catalog, languages: [...catalog.languages, descriptor] }));
    assert.throws(probe, /en-GB\.json/, "a declared platform language with no pack stops startup");
    writeFileSync(packPath, JSON.stringify({ ...pack, locale: descriptor.tag, messages: { ...pack.messages, "workbench.language.retry": text } }));
    const first = probe();
    assert.deepEqual(first, { languages: ["zh", "en", "en-GB"], system: "en-GB", cookie: "en-GB", rejected: "en", href: first.href,
      served: true, word: text, html: "en-GB", intl: "en-GB" });
    assert.match(first.href, /^\/assets\/locale\/workbench\.en-GB\.[a-f0-9]{24}\.js$/u);
    writeFileSync(catalogPath, JSON.stringify({ ...catalog, languages: [...catalog.languages, { ...descriptor, name: "British English" }] }));
    assert.notEqual(probe().href, first.href, "a description-only change invalidates the exact asset");
    writeFileSync(packPath, JSON.stringify({ ...pack, locale: descriptor.tag, messages: { ...pack.messages, "workbench.language.retry": "Retry the request" } }));
    const replaced = probe();
    assert.equal(replaced.word, "Retry the request");
    assert.notEqual(replaced.href, first.href, "the same binary serves edited words after reopening");
    const hostSource = path.join(ROOT, "apps/local-host"), host = path.join(scratch, "host");
    for (const item of ["package.json", "dist", "prompts", "node_modules"]) cpSync(path.join(hostSource, item), path.join(host, item), { recursive: true });
    const workbench = path.join(host, "node_modules/@molis-ai/molis-work-app-workbench");
    rmSync(workbench); symlinkSync(scratch, workbench);
    const authority = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { replyLanguagePrompt } from "./host/dist/reply-language.js";
      process.stdout.write(JSON.stringify(replyLanguagePrompt("en-GB")));
    `], { cwd: scratch, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    assert.throws(authority, /reply-language\/en-GB\.md/, "the platform cannot choose a reply language with no fixed instruction for it");
    const rule = "Reply to the person in British English unless they explicitly ask for another language this round.";
    writeFileSync(path.join(host, "prompts/reply-language/en-GB.md"), rule + "\n");
    assert.deepEqual(authority(), { prompt_id: "reply-language", version: 1, body: rule });
    const imSource = path.join(ROOT, "packages/im-ui"), im = path.join(scratch, "im");
    for (const item of ["package.json", "dist", "resources", "node_modules"]) cpSync(path.join(imSource, item), path.join(im, item), { recursive: true });
    const imLink = path.join(host, "node_modules/@molis-ai/molis-work-im-ui");
    rmSync(imLink); symlinkSync(im, imLink);
    const discussion = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", String.raw`
      import http from "node:http";
      import { createLocalImServer } from "./host/dist/im-server.js";
      import { resolveWebLocaleChoice, runWithLocale } from "./host/dist/web-locale.js";
      const im = createLocalImServer(process.cwd() + "/discussion-home");
      let origin = "";
      const server = http.createServer((request, response) => {
        const { tag, source } = resolveWebLocaleChoice(undefined, request.headers["accept-language"]);
        void runWithLocale(tag, () => im.handle(request, response, new URL(request.url, origin), origin), source);
      });
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      origin = "http://127.0.0.1:" + server.address().port;
      try {
        const response = await fetch(origin + "/im?embedded=1", { headers: { "accept-language": "en-GB" } });
        const html = await response.text();
        const projection = JSON.parse(html.match(/id="im-locale-pack">([^<]+)</)[1]);
        process.stdout.write(JSON.stringify({ status: response.status, language: projection.language, packs: projection.packs.map(pack => pack.locale),
          title: html.match(/<title>([^<]+)<\/title>/)[1], placeholder: html.match(/id="im-group-input"[^>]+placeholder="([^"]+)"/)[1] }));
      } finally { im.stop(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); im.close(); }
    `], { cwd: scratch, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    const { name: _name, ...language } = descriptor;
    assert.deepEqual(discussion(), { status: 200, language, packs: ["zh", "en"], title: "Project discussion · Molis Work", placeholder: "Write a message…" });
    const imLocale = path.join(im, "resources/locales/en.json"), imEnglish = JSON.parse(readFileSync(imLocale, "utf8"));
    delete imEnglish.messages["im-ui.message.group-placeholder"];
    writeFileSync(imLocale, JSON.stringify(imEnglish));
    writeFileSync(path.join(im, "resources/locales/en-GB.json"), JSON.stringify({ ...imEnglish, locale: "en-GB", messages: { "im-ui.page.title": "Project conversation · Molis Work" } }));
    const selected = discussion();
    assert.equal(selected.title, "Project conversation · Molis Work");
    assert.equal(selected.placeholder, "发送消息…", "a word missing from the exact and base IM packs uses its owner default");
    assert.deepEqual(selected.language, language);
    assert.equal(selected.packs[0], "zh");
    assert.deepEqual(selected.packs.slice(1).sort(), ["en", "en-GB"]);
    const messages = { ...pack.messages }; delete messages["workbench.language.retry"];
    writeFileSync(packPath, JSON.stringify({ ...pack, locale: descriptor.tag, messages }));
    assert.throws(probe, /workbench\.language\.retry/, "an incomplete selected platform pack is refused");
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("FSS-34 a platform language descriptor refuses malformed or unknown values", () => {
  const row = { tag: "en", html_lang: "en", intl: "en-US", direction: "ltr", name: "English" };
  const catalog = { format_version: 1, default: "en", languages: [row] };
  for (const [source, code] of [
    [JSON.stringify({ ...catalog, format_version: 2 }), "ui.file_format_version"],
    [JSON.stringify({ ...catalog, path: "unregistered" }), "ui.file_unknown_field"],
    [JSON.stringify({ ...catalog, default: "fr" }), "ui.language_default"],
    [JSON.stringify({ ...catalog, languages: [row, row] }), "ui.language_tag"],
    [JSON.stringify({ ...catalog, languages: [{ ...row, tag: "../en" }] }), "ui.language_tag"],
    [JSON.stringify({ ...catalog, languages: [{ ...row, intl: "zz-ZZ" }] }), "ui.language_intl"],
    [JSON.stringify({ ...catalog, languages: [{ ...row, direction: "auto" }] }), "ui.language_direction"],
    [JSON.stringify({ ...catalog, languages: [{ ...row, name: "<English>" }] }), "ui.language_name"],
    [" ".repeat(70_000), "ui.file_too_large"],
  ]) {
    const parsed = parseUiLanguageCatalog(source);
    assert.ok(!parsed.ok && parsed.problems.some(problem => problem.code === code), code);
  }
});
