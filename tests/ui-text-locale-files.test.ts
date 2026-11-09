import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SANDBOX_PACKAGE_FILES, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { PLUGIN_INSTALL_PERMISSIONS, pluginInstallActions, readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import { packPluginProject, packSandboxProject, runPluginCli, validatePluginManifestFile } from "@molis-ai/molis-work-plugin-cli";
import { assertPluginLocales, inspectPluginLocales, loadDevelopmentLocalePacks, parsePluginPackage, pluginLocaleFilePaths, pluginLocaleReader, signPluginPackage, verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { createTextReader, tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import { declarationManifest } from "./fixtures/declaration-manifest.js";
import { newPublisher, packageFiles, payloadOf, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// A plugin's language files: one reading function for every source (specs/font-and-skin-system/a-section-contract.md §6.2). `T7` in §10.

const PLUGIN_ID = "io.molis.work.notes";
const LOCALES = { default: "en", available: ["en", "zh"] };

const manifestOf = (parts: Record<string, unknown> = {}, locales: unknown = LOCALES) =>
  declarationManifest({ plugin_id: PLUGIN_ID, ui: { contributions: [], locales }, ...parts }) as PluginManifest;
const packText = (locale: string, messages: Record<string, unknown>, parts: Record<string, unknown> = {}) =>
  JSON.stringify({ format_version: 1, owner: PLUGIN_ID, locale, messages, ...parts });
const GOOD: Record<string, string> = {
  "locales/en.json": packText("en", { "notes.main.saved": "Saved {count}" }),
  "locales/zh.json": packText("zh", { "notes.main.saved": "已保存 {count}" }),
};
const reader = (files: Record<string, string>) => (name: string) => files[name] ?? null;
const codes = (manifest: PluginManifest, files: Record<string, string>) => inspectPluginLocales(manifest, reader(files)).map((problem) => problem.code);

test("FSS-53 a good set of files has nothing to say, and a Manifest without ui.locales reads nothing", () => {
  assert.deepEqual(inspectPluginLocales(manifestOf(), reader(GOOD)), []);
  const read = () => assert.fail("nothing is declared, so nothing is read");
  assert.deepEqual(inspectPluginLocales(declarationManifest({ plugin_id: PLUGIN_ID }) as PluginManifest, read), []);
  assert.equal(pluginLocaleReader(declarationManifest({ plugin_id: PLUGIN_ID }) as PluginManifest, read), null);
  assert.deepEqual(pluginLocaleFilePaths(manifestOf()), ["locales/en.json", "locales/zh.json"]);
});

test("FSS-53 a declared language without its file is refused, and says which", () => {
  const [problem] = inspectPluginLocales(manifestOf(), reader({ "locales/en.json": GOOD["locales/en.json"]! }));
  assert.equal(problem!.code, "ui.locale_file_missing");
  assert.equal(problem!.file, "locales/zh.json");
  assert.equal(problem!.blocking, true);
  assert.throws(() => assertPluginLocales(manifestOf(), reader({ "locales/en.json": GOOD["locales/en.json"]! })), { code: "plugin.package_invalid", message: /locales\/zh\.json/u });
});

test("FSS-53 pack.owner and pack.locale have to match the declaration: a file says nothing of its own", () => {
  assert.deepEqual(codes(manifestOf(), { ...GOOD, "locales/zh.json": packText("zh", { "todo.main.saved": "x" }, { owner: "io.molis.work.todo" }) }), ["ui.locale_owner"]);
  assert.deepEqual(codes(manifestOf(), { ...GOOD, "locales/zh.json": packText("en", { "notes.main.saved": "x {count}" }) }), ["ui.locale_file_mismatch"]);
});

test("FSS-53 the languages are compared with each other: the default short of a key and differing arguments block, a language short of one only tells", () => {
  assert.deepEqual(codes(manifestOf(), { ...GOOD, "locales/zh.json": packText("zh", { "notes.main.saved": "已保存 {total}" }) }), ["ui.locale_args"]);
  assert.deepEqual(codes(manifestOf(), { ...GOOD, "locales/zh.json": packText("zh", { "notes.main.saved": "已保存 {count}", "notes.main.extra": "多" }) }), ["ui.locale_extra_key"]);
  const short = inspectPluginLocales(manifestOf(), reader({ "locales/en.json": packText("en", { "notes.main.saved": "Saved {count}", "notes.main.more": "More" }), "locales/zh.json": GOOD["locales/zh.json"]! }));
  assert.deepEqual(short.map(({ code, blocking }) => [code, blocking]), [["ui.locale_missing_key", false]]);
});

test("FSS-53 a language nobody asks for is not read, and one that was read is not read again", () => {
  const reads: string[] = [];
  const locales = pluginLocaleReader(manifestOf(), (name) => { reads.push(name); return GOOD[name] ?? null; })!;
  assert.equal(locales.owner, PLUGIN_ID);
  assert.equal(locales.default, "en");
  assert.deepEqual(reads, [], "making the reader reads nothing");
  assert.equal(locales.pack("en")!.messages["notes.main.saved"], "Saved {count}");
  assert.equal(locales.pack("en")!.locale, "en");
  assert.deepEqual(reads, ["locales/en.json"]);
  assert.equal(locales.pack("fr"), null, "not declared, so not looked for");
  assert.deepEqual(reads, ["locales/en.json"]);
});

test("FSS-53 reading a bad file while running does not throw: no pack, and the problem is there to see", () => {
  const locales = pluginLocaleReader(manifestOf(), reader({ ...GOOD, "locales/zh.json": "{" }))!;
  assert.equal(locales.pack("zh"), null);
  assert.equal(locales.pack("zh"), null, "and it is not read twice");
  assert.deepEqual(locales.problems().map((problem) => problem.code), ["ui.json_syntax"]);
  assert.ok(locales.pack("en"));
});

test("FSS-70 a plugin's words are strict unless its parsed Manifest is a content pack: the language file has no say, and neither does a caller", () => {
  const withMarkup = { ...GOOD, "locales/en.json": packText("en", { "notes.main.saved": "R&D {count}" }) };
  for (const kind of ["app", "integration", "native"]) assert.deepEqual(codes(manifestOf({ kind }), withMarkup), ["ui.locale_markup"], kind);
  const marked = { ...GOOD, "locales/en.json": packText("en", { "notes.main.saved": "R&D {count}" }, { contentPack: true }) };
  assert.deepEqual(codes(manifestOf(), marked), ["ui.file_unknown_field", "ui.locale_markup"], "a language file cannot claim to be one, and its words are still looked at");
  assert.deepEqual(codes(manifestOf({ kind: "content" }), withMarkup), [], "the manifest of a content pack");
  assert.equal(pluginLocaleReader(manifestOf(), reader(withMarkup))!.pack("en"), null, "the running side has the same rule");
  assert.ok(pluginLocaleReader(manifestOf({ kind: "content" }), reader(withMarkup))!.pack("en"));
});

test("FSS-70 a content pack's word goes through createTextReader escaped once, and .text gives it as written", () => {
  const files = { ...GOOD, "locales/en.json": packText("en", { "notes.main.saved": "R&D {count}", "notes.main.pic": "<img onerror=x>" }), "locales/zh.json": packText("zh", { "notes.main.saved": "研发 {count}", "notes.main.pic": "图" }) };
  const pack = pluginLocaleReader(manifestOf({ kind: "content" }), reader(files))!.pack("en")!;
  const say = createTextReader({ packs: [pack], locale: "en" });
  const picture = tryOwnedTextRef({ key: "notes.main.pic" }, PLUGIN_ID)!;
  assert.equal(say(picture), "&lt;img onerror=x&gt;");
  assert.equal(say.text(picture), "<img onerror=x>");
});

test("FSS-70 a package with a placeholder that is no name is refused for a content pack too", () => {
  assert.deepEqual(codes(manifestOf({ kind: "content" }), { ...GOOD, "locales/zh.json": packText("zh", { "notes.main.saved": "{foo bar}" }) }), ["ui.locale_placeholder"]);
});

// Everything below reads a real project directory.
function withProject(run: (directory: string) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "molis-locale-files-"));
    try { await run(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
  };
}

function writeProject(directory: string, manifest: PluginManifest, files: Record<string, string> = GOOD): void {
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "notes", files: ["manifest.json", "entry.mjs"] }));
  writeFileSync(path.join(directory, "entry.mjs"), "export default {};\n");
  mkdirSync(path.join(directory, "locales"), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(directory, name), text);
}

const outputOf = () => { const lines: string[] = []; return { lines, stdout: (line: string) => lines.push(line), stderr: (line: string) => lines.push(line) }; };

test("FSS-53 pack brings the declared language files without the author listing them, and parsePluginPackage holds it to them", withProject(async (directory) => {
  writeProject(directory, manifestOf());
  const bundle = await packPluginProject(directory, path.join(directory, "out.json"));
  const packed = bundle.payload.files.map((file) => file.path);
  assert.ok(packed.includes("locales/en.json") && packed.includes("locales/zh.json"), packed.join());
  const withoutOne = { ...bundle.payload, files: bundle.payload.files.filter((file) => file.path !== "locales/zh.json") };
  assert.throws(() => parsePluginPackage({ payload: withoutOne, signature: null, publisher_key: null }), { code: "plugin.package_invalid", message: /locales\/zh\.json/u });
}));

test("FSS-53 pack listing a language file in files as well packs it once", withProject(async (directory) => {
  writeProject(directory, manifestOf());
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "notes", files: ["manifest.json", "entry.mjs", "locales/en.json"] }));
  const bundle = await packPluginProject(directory, path.join(directory, "out.json"));
  assert.equal(bundle.payload.files.filter((file) => file.path === "locales/en.json").length, 1);
}));

test("FSS-53 pack refuses a missing file, a wrong owner and a wrong language, and writes nothing", withProject(async (directory) => {
  const output = path.join(directory, "out.json");
  writeProject(directory, manifestOf(), { "locales/en.json": GOOD["locales/en.json"]! });
  await assert.rejects(packPluginProject(directory, output), { code: "plugin.package_invalid", message: /locales\/zh\.json/u });
  writeProject(directory, manifestOf(), { ...GOOD, "locales/zh.json": packText("zh", { "todo.a": "x" }, { owner: "io.molis.work.todo" }) });
  await assert.rejects(packPluginProject(directory, output), { message: /owner 是 io\.molis\.work\.todo/u });
  writeProject(directory, manifestOf(), { ...GOOD, "locales/zh.json": packText("en", { "notes.main.saved": "x {count}" }) });
  await assert.rejects(packPluginProject(directory, output), { message: /文件里写的 locale 是 en/u });
  assert.throws(() => lstatSync(output), { code: "ENOENT" });
}));

test("FSS-53 pack does not follow a symbolic link out of the project", withProject(async (directory) => {
  const outside = path.join(directory, "outside");
  const project = path.join(directory, "project");
  mkdirSync(outside);
  mkdirSync(project);
  writeProject(project, manifestOf());
  rmSync(path.join(project, "locales/zh.json"));
  writeFileSync(path.join(outside, "secret.json"), GOOD["locales/zh.json"]!);
  symlinkSync(path.join(outside, "secret.json"), path.join(project, "locales/zh.json"));
  await assert.rejects(packPluginProject(project, path.join(directory, "out.json")), { code: "plugin.package_invalid", message: /symlink/u });
}));

test("FSS-53 the CLI's validate reads the language files beside the Manifest: a bad placeholder fails it, a language short of a word only tells", withProject(async (directory) => {
  const file = path.join(directory, "manifest.json");
  writeProject(directory, manifestOf());
  let output = outputOf();
  assert.equal(await runPluginCli(["validate", file], output), 0, output.lines.join());
  assert.equal(JSON.parse(output.lines[0]!).valid, true);
  writeFileSync(path.join(directory, "locales/zh.json"), packText("zh", { "notes.main.saved": "已保存 {标题}" }));
  output = outputOf();
  assert.equal(await runPluginCli(["validate", file], output), 1);
  const refused = JSON.parse(output.lines[0]!);
  assert.equal(refused.valid, false);
  assert.match(refused.message, /locales\/zh\.json/u);
  assert.match(refused.message, /\{标题\}/u);
  writeFileSync(path.join(directory, "locales/en.json"), packText("en", { "notes.main.saved": "Saved {count}", "notes.main.more": "More" }));
  writeFileSync(path.join(directory, "locales/zh.json"), GOOD["locales/zh.json"]!);
  output = outputOf();
  assert.equal(await runPluginCli(["validate", file], output), 0, output.lines.join());
  assert.deepEqual(JSON.parse(output.lines[0]!).locale_notes.map((note: { code: string; locale: string }) => [note.code, note.locale]), [["ui.locale_missing_key", "zh"]]);
  // Validation only reads data.
  assert.equal((await validatePluginManifestFile(file)).plugin_id, PLUGIN_ID);
}));

test("FSS-53 a development project's languages read from its directory, a language not used is not read even when it is broken", withProject(async (directory) => {
  writeProject(directory, manifestOf(), { ...GOOD, "locales/zh.json": "{ not read" });
  const locales = await loadDevelopmentLocalePacks(directory, manifestOf());
  assert.equal(locales!.pack("en")!.messages["notes.main.saved"], "Saved {count}");
  assert.deepEqual(locales!.problems(), []);
  assert.equal(await loadDevelopmentLocalePacks(directory, declarationManifest({ plugin_id: PLUGIN_ID }) as PluginManifest), null);
}));

test("FSS-53 a development project's language file that is a symbolic link out of the project is refused, and one that is not there says so", withProject(async (directory) => {
  const outside = path.join(directory, "outside");
  const project = path.join(directory, "project");
  mkdirSync(outside);
  mkdirSync(project);
  writeProject(project, manifestOf());
  writeFileSync(path.join(outside, "zh.json"), GOOD["locales/zh.json"]!);
  rmSync(path.join(project, "locales/zh.json"));
  await assert.rejects(loadDevelopmentLocalePacks(project, manifestOf()), { code: "plugin.package_invalid", message: /locales\/zh\.json/u });
  symlinkSync(path.join(outside, "zh.json"), path.join(project, "locales/zh.json"));
  await assert.rejects(loadDevelopmentLocalePacks(project, manifestOf()), { code: "plugin.package_invalid", message: /逃逸/u });
  // A link inside the project is the author's own layout.
  rmSync(path.join(project, "locales/zh.json"));
  writeFileSync(path.join(project, "zh-source.json"), GOOD["locales/zh.json"]!);
  symlinkSync(path.join(project, "zh-source.json"), path.join(project, "locales/zh.json"));
  assert.ok((await loadDevelopmentLocalePacks(project, manifestOf()))!.pack("zh"));
}));

function bilingualPackage(files: PackageFiles, manifest: PluginManifest): void {
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify({ ...contract, ui: { locales: LOCALES } });
  manifest.ui = { ...manifest.ui, locales: LOCALES };
  Object.assign(files, GOOD);
}

test("FSS-53 FSS-70 pack-sandbox signs the declared words and the Host refuses mismatched, missing or out-of-package words", withProject(async directory => {
  const publisher = newPublisher();
  const { files, manifest } = packageFiles(publisher.identity, bilingualPackage, { pluginId: PLUGIN_ID });
  mkdirSync(path.join(directory, "locales"));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(directory, name), body!);
  const bundle = await packSandboxProject(directory, path.join(directory, "unsigned.json"), { name: manifest.name, version: manifest.version, publisherId: manifest.publisher.publisher_id, publisherKeyId: publisher.identity });
  const signed = signPluginPackage(bundle, publisher.signer);
  const read = readSandboxPackage(verifyPluginPackageSignature(signed).bundle.payload);
  assert.equal(read.localePacks?.pack("en")?.messages["notes.main.saved"], "Saved {count}");
  assert.equal(read.localePacks?.pack("zh")?.messages["notes.main.saved"], "已保存 {count}");
  const tampered = structuredClone(signed);
  tampered.payload.files.find(item => item.path === "locales/zh.json")!.content_base64 = Buffer.from("changed").toString("base64");
  assert.throws(() => verifyPluginPackageSignature(tampered), { code: "plugin.signature_invalid" });
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "locales/zh.json": undefined })), /locales\/zh\.json/u);
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "locales/zh.json": packText("zh", { "todo.main.saved": "x" }, { owner: "io.molis.work.todo" }) })), /owner/u);
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "locales/en.json": packText("en", { "notes.main.saved": "R&D" }) })), /不许有/u);
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "../zh.json": "{}" })), /格式之外/u);
  assert.throws(() => readSandboxPackage(payloadOf({ ...manifest, ui: { ...manifest.ui, locales: { ...LOCALES, default: "zh" } } }, files)), /清单不是沙箱插件/u);
}));

test("FSS-53 FSS-60 a real signed installation binds words to its authorized page and operation", { skip: process.platform !== "darwin", timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Signed bilingual package");
  const prefix = `/projects/${project.project_id}`;
  const bundle = signedPackage(newPublisher(), (files, manifest) => {
    bilingualPackage(files, manifest);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = `
      let finish, old;
      export const operations = {
        'notes.list': async (_input, sdk) => {
          const title = sdk.t.text('notes.main.saved', { count: 2 });
          const common = sdk.t.text('common.text.unavailable');
          const foreign = sdk.say.text({ owner: 'io.molis.work.example.other', key: 'other.stage.title', fallback: 'Other owner unavailable' });
          if (!old) {
            const wait = new Promise(resolve => { finish = resolve; });
            old = wait.then(() => sdk.t.text('notes.main.saved', { count: 3 }));
            return [{ id: 'title', text: title }, { id: 'common', text: common }, { id: 'foreign', text: foreign }];
          }
          finish();
          return [{ id: 'title', text: title }, { id: 'common', text: common }, { id: 'late', text: await old }];
        },
        'notes.add': async () => true,
      };
    `;
  }, { pluginId: PLUGIN_ID });
  const client = f.host.actionClient(project.reference);
  const caller = { ...person(PLUGIN_INSTALL_PERMISSIONS, project.project_id), user_action: { source: "management" as const, conversation_ref: "locale:install", message_ref: "locale:confirm" } };
  const preview = await client.invoke(caller, pluginInstallActions.preview, { bundle }) as { preview_id: string };
  await client.invoke(caller, pluginInstallActions.confirm, { preview_id: preview.preview_id, consent: true, pin_label: "Locale test" });
  const shell = await fetch(f.origin + prefix + "/");
  const cookie = shell.headers.getSetCookie().find(value => value.startsWith("molis-work-web-"))?.split(";")[0];
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/u.exec(await shell.text())?.[1];
  assert.ok(cookie && proof);
  const headers = { cookie, "x-molis-work-page-session": proof };
  const mount = await f.request(prefix + "/api/host/plugin-pages", { authorized: false, headers, method: "POST", body: { plugin_id: PLUGIN_ID } });
  assert.equal(mount.status, 200, await mount.clone().text());
  const { page_id } = await mount.json() as { page_id: string };
  for (const [locale, text] of [["en", "Saved {count}"], ["zh", "已保存 {count}"]]) {
    const pack = await f.request(prefix + "/api/ui/locales?" + new URLSearchParams({ locale: locale!, page: page_id }), { authorized: false, headers });
    assert.equal(pack.status, 200, await pack.clone().text());
    const response = await pack.json();
    assert.equal(response.owners[0].owner, PLUGIN_ID);
    assert.equal(response.owners[0].packs.find((item: { locale: string }) => item.locale === locale).messages["notes.main.saved"], text);
  }
  const operation = (await client.discover(caller)).find(item => item.provider.plugin_id === PLUGIN_ID && item.action.local_id === "notes.list");
  assert.ok(operation);
  const reference = { capability_id: operation.capability_id, version: operation.version, provider_id: operation.provider.provider_id };
  assert.deepEqual(await client.invoke({ ...caller, locale: "en" }, reference, {}), [
    { id: "title", text: "Saved 2" }, { id: "common", text: "This text cannot be shown right now" }, { id: "foreign", text: "Other owner unavailable" },
  ]);
  assert.deepEqual(await client.invoke({ ...caller, locale: "zh" }, reference, {}), [
    { id: "title", text: "已保存 2" }, { id: "common", text: "这句话暂时显示不了" }, { id: "late", text: "…" },
  ], "a promise left behind by the English call cannot borrow the later Chinese scope");
});

test("FSS-53 the built-in Issue registration uses the same declared language files as a plugin project", () => {
  const entry = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === "io.molis.work.issues");
  assert.ok(entry?.manifest.ui.locales);
  assert.deepEqual(inspectPluginLocales(entry.manifest, file => readFileSync(path.join("plugins/native/issues", file), "utf8")), []);
});

test("FSS-53 a package with no ui.locales is what it always was: no language file is asked for", withProject(async (directory) => {
  const manifest = declarationManifest({ plugin_id: PLUGIN_ID }) as PluginManifest;
  writeProject(directory, manifest, {});
  const bundle = await packPluginProject(directory, path.join(directory, "out.json"));
  assert.deepEqual(bundle.payload.files.map((one) => one.path).sort(), ["entry.mjs", "manifest.json", "package.json"]);
  assert.equal(readFileSync(path.join(directory, "out.json"), "utf8").includes("locales/"), false);
}));
