import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SANDBOX_PACKAGE_FILES, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { BUILTIN_PLUGIN_CATALOG, HOST_FRAMED_SURFACES } from "@molis-ai/molis-work-app-workbench";
import { PLUGIN_INSTALL_PERMISSIONS, pluginInstallActions, readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import { packPluginProject, packSandboxProject, runPluginCli, validatePluginManifestFile } from "@molis-ai/molis-work-plugin-cli";
import { assertPluginLocales, inspectPluginLocales, loadDevelopmentLocalePacks, parsePluginPackage, pluginLocaleFilePaths, pluginLocaleReader, signPluginPackage, verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { assertPluginLocales as validateAuthorLocales, createTextReader, inspectLocaleSet, parseLocalePack, tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import { scanTree } from "../scripts/gates/translations.mjs";
import { declarationManifest } from "./fixtures/declaration-manifest.js";
import { newPublisher, packageFiles, payloadOf, signedPackage, type PackageFiles } from "./fixtures/sandbox-package.js";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// A plugin's language files: one reading function for every source (specs/font-and-skin-system/a-section-contract.md §6.2). `T7` in §10.

const PLUGIN_ID = "com.example.notes";
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

test("FSS-35 FSS-38 Artifact title words require a default short line and use the default when another language lacks it", () => {
  const key = "notes.artifacts.type-title";
  const action = defineArtifactPreviewAction("notes.artifacts.preview", 1, "Preview", []);
  const manifest = parsePluginManifest(manifestOf({ actions: [action], artifacts: { produces: [
    { artifact_type_id: "io.example.note", schema_version: 1, title: "Original note", title_text: { key }, preview: { capability_id: action.capability_id, version: action.version } },
  ], consumes: [] } }));
  assert.throws(() => validateAuthorLocales(manifest, reader(GOOD)), {
    code: "plugin.package_invalid", message: /locales\/en\.json notes\.artifacts\.type-title.*默认语言不能缺词/u,
  });
  const withTitle = (value: unknown) => ({ ...GOOD, "locales/en.json": packText("en", { "notes.main.saved": "Saved {count}", [key]: value }) });
  for (const invalid of ["{count} notes", { plural_arg: "count", forms: { one: "One note", other: "Several notes" } }, "x".repeat(81), "Two\nlines"]) {
    assert.throws(() => validateAuthorLocales(manifest, reader(withTitle(invalid))), {
      code: "plugin.package_invalid", message: /notes\.artifacts\.type-title/u,
    });
  }
  const files = withTitle("Saved note");
  assert.deepEqual(validateAuthorLocales(manifest, reader(files)).map(({ code, key, blocking }) => [code, key, blocking]),
    [["ui.locale_missing_key", key, false]]);
  const owner = pluginLocaleReader(manifest, reader(files))!;
  const title = createTextReader({ locale: "zh", packs: [owner.pack("en")!, owner.pack("zh")!] });
  assert.equal(title.text({ owner: PLUGIN_ID, key }), "Saved note");
});

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
  files["locales/en.json"] = packText("en", { "notes.main.saved": "Saved {count}", "notes.main.title": "Notes" });
  files["locales/zh.json"] = packText("zh", { "notes.main.saved": "已保存 {count}", "notes.main.title": "笔记" });
  mkdirSync(path.join(directory, "locales"));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(directory, name), body!);
  const packOptions = { name: manifest.name, version: manifest.version, publisherId: manifest.publisher.publisher_id, publisherKeyId: publisher.identity };
  await assert.rejects(packSandboxProject(directory, path.join(directory, "wrong-name.json"), { ...packOptions, nameText: { key: "notes.main.saved" } }), /无参短句/u);
  const bundle = await packSandboxProject(directory, path.join(directory, "unsigned.json"), { ...packOptions, nameText: { key: "notes.main.title" } });
  const signed = signPluginPackage(bundle, publisher.signer);
  const read = readSandboxPackage(verifyPluginPackageSignature(signed).bundle.payload);
  assert.deepEqual(read.manifest.name_text, { key: "notes.main.title" });
  assert.equal(read.localePacks?.pack("en")?.messages["notes.main.saved"], "Saved {count}");
  assert.equal(read.localePacks?.pack("zh")?.messages["notes.main.saved"], "已保存 {count}");
  const tampered = structuredClone(signed);
  tampered.payload.files.find(item => item.path === "locales/zh.json")!.content_base64 = Buffer.from("changed").toString("base64");
  assert.throws(() => verifyPluginPackageSignature(tampered), { code: "plugin.signature_invalid" });
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "locales/zh.json": undefined })), /locales\/zh\.json/u);
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "locales/zh.json": packText("zh", { "todo.main.saved": "x" }, { owner: "io.molis.work.todo" }) })), /owner/u);
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "locales/en.json": packText("en", { "notes.main.saved": "R&D" }) })), /不许有/u);
  assert.throws(() => readSandboxPackage(payloadOf(manifest, { ...files, "../zh.json": "{}" })), {
    code: "plugin.declaration_invalid", message: '"../zh.json"：沙箱包的格式里没有这个文件',
  });
  assert.throws(() => readSandboxPackage(payloadOf({ ...manifest, ui: { ...manifest.ui, locales: { ...LOCALES, default: "zh" } } }, files)), /清单不是沙箱插件/u);
  const artifactPreview = defineArtifactPreviewAction("notes.artifacts.preview", 1, "Preview", []);
  const altered = { ...manifest, actions: [...manifest.actions ?? [], artifactPreview], artifacts: { consumes: [], produces: [{
    artifact_type_id: "io.example.note", schema_version: 1, title: "Original note", title_text: { key: "notes.main.title" },
    preview: { capability_id: artifactPreview.capability_id, version: artifactPreview.version },
  }] } };
  const issued = signPluginPackage({ ...bundle, payload: payloadOf(altered, files) }, publisher.signer);
  assert.throws(() => readSandboxPackage(verifyPluginPackageSignature(issued).bundle.payload), /清单不是沙箱插件/u);
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
          const foreign = sdk.say.text({ owner: 'com.example.other', key: 'other.stage.title', fallback: 'Other owner unavailable' });
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

test("FSS-53 built-in registrations use the same declared language files as a plugin project", () => {
  // The platform's framed surfaces (the studio, 47-1 C; Shelf, 44B) declare their files the same way, each in its own package.
  const SURFACE_PACKAGES: Record<string, string> = { "plugin-builder": "horizontal/plugin-studio", shelf: "modules/shelf" };
  const entries = [...BUILTIN_PLUGIN_CATALOG.map(entry => ({ entry, directory: path.join("plugins/native", entry.project_plugin_id) })),
    ...HOST_FRAMED_SURFACES.map(entry => ({ entry, directory: SURFACE_PACKAGES[entry.project_plugin_id]! }))];
  assert.ok(entries.length > 1);
  assert.deepEqual(HOST_FRAMED_SURFACES.map(entry => entry.project_plugin_id).sort(), Object.keys(SURFACE_PACKAGES).sort(), "a new platform surface names its package here");
  for (const { entry, directory } of entries) {
    assert.ok(entry.manifest.ui.locales, entry.manifest.plugin_id);
    const available = new Set(entry.manifest.ui.locales.available);
    assert.ok(available.has("zh") && available.has("en"), entry.manifest.plugin_id);
    for (const tag of available) assert.ok(["zh", "en", "ja"].includes(tag), `${entry.manifest.plugin_id}: ${tag}`);
    assert.deepEqual(inspectPluginLocales(entry.manifest, file => readFileSync(path.join(directory, file), "utf8")), [], entry.manifest.plugin_id);
  }
});

test("FSS-53 a package with no ui.locales is what it always was: no language file is asked for", withProject(async (directory) => {
  const manifest = declarationManifest({ plugin_id: PLUGIN_ID }) as PluginManifest;
  writeProject(directory, manifest, {});
  const bundle = await packPluginProject(directory, path.join(directory, "out.json"));
  assert.deepEqual(bundle.payload.files.map((one) => one.path).sort(), ["entry.mjs", "manifest.json", "package.json"]);
  assert.equal(readFileSync(path.join(directory, "out.json"), "utf8").includes("locales/"), false);
}));

test("plugin validate and assertPluginLocales enforce default-locale single-line limits for permission, read-group and action *_text", withProject(async (directory) => {
  const query = {
    capability_id: "notes.items.list",
    version: 1,
    operation: "query" as const,
    action: {
      title: "列出笔记",
      title_text: { key: "notes.action.list.title" },
      description: "读取项目笔记",
      description_text: { key: "notes.action.list.description" },
      kind: "query" as const,
      scope: "project" as const,
      permissions: ["notes:read"],
      subject_kinds: [],
      audiences: ["user", "agent"] as const,
      input_schema: { type: "object" },
    },
  };
  const manifest = parsePluginManifest(manifestOf({
    permissions: [{ permission: "notes:read", required: true, reason: "读取笔记", reason_text: { key: "notes.perm.read" } }],
    actions: [query],
    read_groups: [{
      group_id: "notes",
      title: "笔记",
      title_text: { key: "notes.rg.title" },
      description: "项目里的笔记",
      description_text: { key: "notes.rg.desc" },
      actions: ["notes.items.list"],
    }],
  }));
  const fullEn = {
    "notes.main.saved": "Saved {count}",
    "notes.perm.read": "Read notes in this project",
    "notes.rg.title": "Notes",
    "notes.rg.desc": "Notes in this project",
    "notes.action.list.title": "List notes",
    "notes.action.list.description": "Read notes stored in this project",
  };
  const file = path.join(directory, "manifest.json");

  // Missing default-locale keys block CLI validation.
  writeProject(directory, manifest, GOOD);
  let out = outputOf();
  assert.equal(await runPluginCli(["validate", file], out), 1);
  assert.match(JSON.parse(out.lines[0]!).message, /notes\.perm\.read/u);

  // Default locale complete while zh misses keys: non-blocking notes only.
  writeProject(directory, manifest, { ...GOOD, "locales/en.json": packText("en", fullEn) });
  out = outputOf();
  assert.equal(await runPluginCli(["validate", file], out), 0, out.lines.join());
  const notes = JSON.parse(out.lines[0]!).locale_notes as Array<{ code: string; key: string }>;
  assert.equal(notes.filter(item => item.code === "ui.locale_missing_key").length, 5);

  // Args, plural, multiline, or over-limit strings in any locale block validation.
  for (const [badKey, badVal] of [
    ["notes.perm.read", "Read {count} notes"],
    ["notes.perm.read", "x".repeat(201)],
    ["notes.rg.title", "Two\nlines"],
    ["notes.rg.desc", { plural_arg: "count", forms: { one: "One", other: "{count} notes" } }],
    ["notes.action.list.title", "a".repeat(81)],
    ["notes.action.list.description", "d".repeat(401)],
  ] as const) {
    assert.throws(() => validateAuthorLocales(manifest, reader({
      ...GOOD,
      "locales/en.json": packText("en", { ...fullEn, [badKey]: badVal }),
    })), { code: "plugin.package_invalid" }, `${badKey}: ${JSON.stringify(badVal)}`);
  }
}));

test("readSandboxPackage validates contract.permission_reasons for projected permissions against default locale pack", withProject(async (directory) => {
  const publisher = newPublisher();
  const { files, manifest } = packageFiles(publisher.identity, (pkgFiles, pkgManifest) => {
    const contract = JSON.parse(pkgFiles[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const nextContract: SandboxPluginContract = {
      ...contract,
      ui: { locales: LOCALES },
      permission_reasons: {
        "storage:private": { key: "notes.perm.storage" },
        "network:request": { key: "notes.perm.network" },
      },
      operations: contract.operations.map(op => op.id === "notes.list"
        ? { ...op, effects: { storage: ["read"], networkDomains: ["api.example.com"] } }
        : op),
    };
    pkgFiles[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(nextContract);
    pkgFiles["locales/en.json"] = packText("en", { "notes.main.saved": "Saved {count}", "notes.perm.storage": "Save notes", "notes.perm.network": "Reach api.example.com" });
    pkgFiles["locales/zh.json"] = packText("zh", { "notes.main.saved": "已保存 {count}", "notes.perm.storage": "保存笔记", "notes.perm.network": "访问 api.example.com" });
    return {
      ...pkgManifest,
      permissions: pkgManifest.permissions.map(row => row.permission === "storage:private" ? { ...row, reason_text: { key: "notes.perm.storage" } } : row),
      ui: { ...pkgManifest.ui, locales: LOCALES },
    };
  }, { pluginId: PLUGIN_ID });
  mkdirSync(path.join(directory, "locales"));
  for (const [name, body] of Object.entries(files)) writeFileSync(path.join(directory, name), body!);
  const packOptions = { name: manifest.name, version: manifest.version, publisherId: manifest.publisher.publisher_id, publisherKeyId: publisher.identity };
  const bundle = await packSandboxProject(directory, path.join(directory, "localized-sandbox.json"), packOptions);
  const signed = signPluginPackage(bundle, publisher.signer);
  const loaded = readSandboxPackage(verifyPluginPackageSignature(signed).bundle.payload);
  assert.deepEqual(loaded.manifest.permissions[0]?.reason_text, { key: "notes.perm.storage" });
  // Dropping the projected permission key from default locale is refused by readSandboxPackage.
  const missingProjected = { ...files, "locales/en.json": packText("en", { "notes.main.saved": "Saved {count}", "notes.perm.storage": "Save notes" }) };
  assert.throws(() => readSandboxPackage(payloadOf(loaded.manifest, missingProjected)), /notes\.perm\.network/u);
}));

test("FSS-53 ja parseLocalePack and inspectLocaleSet validate trilingual packs, plural forms, placeholders and markup", () => {
  const trilingualManifest = manifestOf({}, { default: "zh", available: ["zh", "en", "ja"] });
  const zhRaw = packText("zh", {
    "notes.main.saved": { plural_arg: "count", forms: { other: "已保存 {count} 条" } },
    "notes.main.title": "笔记",
  });
  const enRaw = packText("en", {
    "notes.main.saved": { plural_arg: "count", forms: { one: "Saved {count} note", other: "Saved {count} notes" } },
    "notes.main.title": "Notes",
  });
  const jaRaw = packText("ja", {
    "notes.main.saved": { plural_arg: "count", forms: { other: "{count} 件保存しました" } },
    "notes.main.title": "ノート",
  });

  const zhPack = parseLocalePack(zhRaw, { file: "locales/zh.json" });
  const enPack = parseLocalePack(enRaw, { file: "locales/en.json" });
  const jaPack = parseLocalePack(jaRaw, { file: "locales/ja.json" });
  assert.equal(zhPack.ok, true);
  assert.equal(enPack.ok, true);
  assert.equal(jaPack.ok, true);
  if (zhPack.ok && enPack.ok && jaPack.ok) {
    assert.deepEqual(inspectLocaleSet([zhPack.value, enPack.value, jaPack.value], { default: "zh" }), []);
  }
  assert.deepEqual(inspectPluginLocales(trilingualManifest, reader({
    "locales/zh.json": zhRaw,
    "locales/en.json": enRaw,
    "locales/ja.json": jaRaw,
  })), []);

  // Raw markup in ja is refused by parseLocalePack.
  const jaMarkup = parseLocalePack(packText("ja", { "notes.main.title": "ノート <raw>" }), { file: "locales/ja.json" });
  assert.equal(jaMarkup.ok, false);
  if (!jaMarkup.ok) {
    assert.equal(jaMarkup.problems[0]?.code, "ui.locale_markup");
  }

  // Placeholder mismatch in ja blocks inspectLocaleSet; missing key reports ui.locale_missing_key for ja.
  const jaBadArgs = parseLocalePack(packText("ja", {
    "notes.main.saved": { plural_arg: "total", forms: { other: "{total} 件保存しました" } },
    "notes.main.title": "ノート",
  }), { file: "locales/ja.json" });
  assert.equal(jaBadArgs.ok, true);
  if (zhPack.ok && enPack.ok && jaBadArgs.ok) {
    const problems = inspectLocaleSet([zhPack.value, enPack.value, jaBadArgs.value], { default: "zh" });
    assert.ok(problems.some(issue => issue.locale === "ja" && issue.code === "ui.locale_args" && issue.blocking));
  }
  const jaMissingKey = parseLocalePack(packText("ja", {
    "notes.main.saved": { plural_arg: "count", forms: { other: "{count} 件保存しました" } },
  }), { file: "locales/ja.json" });
  assert.equal(jaMissingKey.ok, true);
  if (zhPack.ok && enPack.ok && jaMissingKey.ok) {
    const problems = inspectLocaleSet([zhPack.value, enPack.value, jaMissingKey.value], { default: "zh" });
    assert.ok(problems.some(issue => issue.locale === "ja" && issue.code === "ui.locale_missing_key" && issue.key === "notes.main.title"));
  }
});

test("FSS-53 translations.mjs enforces 0 missing keys and arg parity across all declared languages and nested workbench sub-packs", () => {
  const pack = (owner: string, locale: string, messages: Record<string, string>) =>
    JSON.stringify({ format_version: 1, owner, locale, messages });
  const registry = "packages/design-system/resources/registry.json";
  const baseFiles: Record<string, string> = {
    [registry]: JSON.stringify({ resources: [{ kind: "locale", owner: "workbench", package: "@molis/wb", path: "resources/locales" }] }),
    "apps/workbench/package.json": JSON.stringify({ name: "@molis/wb" }),
    "apps/workbench/resources/languages.json": JSON.stringify({
      format_version: 1,
      default: "zh",
      languages: [
        { tag: "zh", html_lang: "zh-CN", intl: "zh-CN", direction: "ltr", name: "简体中文" },
        { tag: "en", html_lang: "en", intl: "en-US", direction: "ltr", name: "English" },
        { tag: "ja", html_lang: "ja", intl: "ja-JP", direction: "ltr", name: "日本語" },
      ],
    }),
    "apps/workbench/resources/locales/zh.json": pack("workbench", "zh", { "workbench.shell.ok": "好" }),
    "apps/workbench/resources/locales/en.json": pack("workbench", "en", { "workbench.shell.ok": "OK" }),
    "apps/workbench/resources/locales/ja.json": pack("workbench", "ja", { "workbench.shell.ok": "OK" }),
    "apps/workbench/resources/locales/scene/zh.json": pack("workbench", "zh", { "workbench.scene.wait": "等待" }),
    "apps/workbench/resources/locales/scene/en.json": pack("workbench", "en", { "workbench.scene.wait": "Waiting" }),
    "apps/workbench/resources/locales/scene/ja.json": pack("workbench", "ja", { "workbench.scene.wait": "待機中" }),
    "apps/workbench/resources/locales/catalog/zh.json": pack("workbench", "zh", { "workbench.catalog-board.title": "标题 {n}" }),
    "apps/workbench/resources/locales/catalog/en.json": pack("workbench", "en", { "workbench.catalog-board.title": "Title {n}" }),
    "apps/workbench/resources/locales/catalog/ja.json": pack("workbench", "ja", { "workbench.catalog-board.title": "タイトル {n}" }),
    "plugins/native/tri/src/manifest.ts": 'export const manifest = { plugin_id: "io.example.tri", ui: { contributions: [], locales: { default: "zh", available: ["zh", "en", "ja"] } } };',
    "plugins/native/tri/locales/zh.json": pack("io.example.tri", "zh", { "tri.main.hello": "你好 {name}", "tri.main.done": "完成" }),
    "plugins/native/tri/locales/en.json": pack("io.example.tri", "en", { "tri.main.hello": "Hello {name}", "tri.main.done": "Done" }),
    "plugins/native/tri/locales/ja.json": pack("io.example.tri", "ja", { "tri.main.hello": "こんにちは {name}", "tri.main.done": "完了" }),
    "plugins/native/bi/src/manifest.ts": 'export const manifest = { plugin_id: "io.example.bi", ui: { contributions: [], locales: { default: "zh", available: ["zh", "en"] } } };',
    "plugins/native/bi/locales/zh.json": pack("io.example.bi", "zh", { "bi.main.ok": "好" }),
    "plugins/native/bi/locales/en.json": pack("io.example.bi", "en", { "bi.main.ok": "OK" }),
  };
  const scan = (files: Record<string, string>) => scanTree({ files: Object.keys(files), read: file => files[file] ?? null });

  // Clean trilingual + bilingual (shelf-like) + nested scene/catalog sub-packs pass with 0 problems.
  assert.deepEqual(scan(baseFiles).problems, []);

  // Missing key in plugin ja.json fails.
  const missingJaKey = scan({
    ...baseFiles,
    "plugins/native/tri/locales/ja.json": pack("io.example.tri", "ja", { "tri.main.hello": "こんにちは {name}" }),
  });
  assert.ok(missingJaKey.problems.some(item => item.includes("plugins/native/tri/locales/ja.json") && item.includes("ui.locale_missing_key tri.main.done")));

  // Arg mismatch in plugin ja.json fails.
  const badJaArgs = scan({
    ...baseFiles,
    "plugins/native/tri/locales/ja.json": pack("io.example.tri", "ja", { "tri.main.hello": "こんにちは {user}", "tri.main.done": "完了" }),
  });
  assert.ok(badJaArgs.problems.some(item => item.includes("plugins/native/tri/locales/ja.json") && item.includes("ui.locale_args tri.main.hello")));

  // Missing ja.json in nested catalog sub-pack fails.
  const withoutCatalogJa = { ...baseFiles };
  delete withoutCatalogJa["apps/workbench/resources/locales/catalog/ja.json"];
  assert.ok(scan(withoutCatalogJa).problems.some(item => item.includes("apps/workbench/resources/locales/catalog/ja.json: declared file missing")));

  // Duplicate key between main workbench pack and nested catalog sub-pack fails.
  const dupCatalogKey = scan({
    ...baseFiles,
    "apps/workbench/resources/locales/catalog/zh.json": pack("workbench", "zh", { "workbench.shell.ok": "重复" }),
    "apps/workbench/resources/locales/catalog/en.json": pack("workbench", "en", { "workbench.shell.ok": "Dup" }),
    "apps/workbench/resources/locales/catalog/ja.json": pack("workbench", "ja", { "workbench.shell.ok": "重複" }),
  });
  assert.ok(dupCatalogKey.problems.some(item => item.includes("duplicate owner of workbench.shell.ok")));

  // Undeclared nested sub-pack file fails.
  const rogueNested = scan({
    ...baseFiles,
    "apps/workbench/resources/locales/rogue/zh.json": pack("workbench", "zh", { "workbench.rogue.x": "好" }),
  });
  assert.ok(rogueNested.problems.some(item => item.includes("apps/workbench/resources/locales/rogue/zh.json: no locale declaration reaches this file")));
});

test("audit-ui-copy.mjs enforces tightened zh rules, cross-language en/ja leak checks, and source multi-locale hygiene", async t => {
  type AuditFinding = { file: string; key: string; rule: string; label: string; text: string };
  const auditModule = (await import(new URL("../scripts/audit-ui-copy.mjs", import.meta.url).href)) as {
    auditRepositoryCopy: (root: string) => AuditFinding[];
    auditLocaleText: (input: { file: string; locale: string; key: string; text: string; categoryFilter?: string | null }) => AuditFinding[];
    auditSourceText: (file: string, source: string, options?: { category?: string | null }) => AuditFinding[];
  };
  const localeRules = (file: string, locale: string, key: string, text: string) =>
    auditModule.auditLocaleText({ file, locale, key, text }).map((item) => item.rule);

  // D-1: both deployed Workbench packs are scanned, even if a product label refers to a specimen.
  const root = mkdtempSync(path.join(tmpdir(), "molis-copy-packs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const locales = path.join(root, "apps/workbench/resources/locales");
  mkdirSync(path.join(locales, "catalog"), { recursive: true });
  const sharedKey = "workbench.appearance-picker.in-the-specimen", boardKey = "workbench.catalog-board.example";
  writeFileSync(path.join(locales, "zh.json"), packText("zh", { [sharedKey]: "数据已落盘" }));
  writeFileSync(path.join(locales, "catalog/zh.json"), packText("zh", { [boardKey]: "数据已落盘" }));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["add", "apps"], { cwd: root });
  assert.deepEqual(auditModule.auditRepositoryCopy(root).filter(finding => finding.rule === "zh.arch-jargon")
    .map(finding => finding.key).sort(), [sharedKey, boardKey]);

  // Tightened Chinese rules.
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.a", "数据已写入并落盘").includes("zh.arch-jargon"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.b", "刷新游标位置").includes("zh.arch-jargon"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.c", "通过门禁 G1 后继续").includes("zh.arch-jargon"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.d", "检查父子 Contract").includes("zh.arch-jargon"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.e", "查看 Runtime payload").includes("zh.arch-jargon"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.f", "打开能力板").includes("zh.retired-term"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.g", "由提供方决定").includes("zh.beginner-jargon"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.h", "选择一个 Character").includes("zh.retired-term"));
  assert.deepEqual(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.mcp-access.provider", "提供方"), []);
  assert.ok(localeRules("packages/im-ui/resources/locales/zh.json", "zh", "im-ui.demo.thread", "新建 Thread").includes("zh.im-thread-term"));
  assert.ok(localeRules("apps/workbench/resources/locales/zh.json", "zh", "workbench.demo.i", "未能完成操作，已被拒绝，不予予以处理").includes("zh.bureaucratic-tone"));

  // English CJK leak rule + narrow allowlist.
  assert.ok(localeRules("apps/workbench/resources/locales/en.json", "en", "workbench.demo.leak", "Save 笔记").includes("en.cjk-leak"));
  assert.deepEqual(localeRules("modules/shelf/locales/en.json", "en", "shelf.recipe.translate.choice.ja", "日本語"), []);
  assert.deepEqual(localeRules("apps/workbench/resources/locales/en.json", "en", "workbench.catalog-appearance.on-4-november-2026-1-284-notes", "Longer passages read more easily, and 中\u2060文 mixed with English should sit on one baseline."), []);

  // Japanese Simplified-Chinese leak, markup, and quote rules.
  assert.ok(localeRules("apps/workbench/resources/locales/ja.json", "ja", "workbench.demo.sc1", "请重试").includes("ja.simplified-chinese-leak"));
  assert.ok(localeRules("apps/workbench/resources/locales/ja.json", "ja", "workbench.demo.sc2", "这里没找到对应的结果吗").includes("ja.simplified-chinese-leak"));
  assert.ok(localeRules("apps/workbench/resources/locales/ja.json", "ja", "workbench.demo.sc3", "您的保存记录").includes("ja.simplified-chinese-leak"));
  assert.ok(localeRules("apps/workbench/resources/locales/ja.json", "ja", "workbench.demo.markup", "保存 & 終了").includes("ja.raw-markup"));
  assert.ok(localeRules("apps/workbench/resources/locales/ja.json", "ja", "workbench.demo.quotes", "“保存”しました").includes("ja.bent-quotes"));
  assert.deepEqual(localeRules("apps/workbench/resources/locales/ja.json", "ja", "workbench.demo.good", "具体的な目的を自動的に日没前に確認します。「保存」完了です。"), []);

  // Production source multi-locale hygiene rules.
  const srcRules = (file: string, code: string) => auditModule.auditSourceText(file, code).map((item) => item.rule);
  assert.deepEqual(srcRules("apps/desktop/adapters/tauri/src/tray.rs", "static ENGLISH: AtomicBool = AtomicBool::new(false);"), ["src.binary-locale-flag"]);
  assert.deepEqual(srcRules("apps/desktop/adapters/tauri/src/tray.rs", "// static ENGLISH: AtomicBool = AtomicBool::new(false);"), []);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const x = locale === "en" ? "Save" : "保存";'), ["src.binary-locale-switch"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const x = lang.startsWith("en") ? "Save" : "保存";'), ["src.binary-locale-switch"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const useEn = (locale: string) => !locale.toLowerCase().startsWith("zh");'), ["src.binary-locale-switch"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const x = !locale.toLowerCase().startsWith("zh") ? "Save" : "保存";'), ["src.binary-locale-switch"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const en = document.documentElement.lang === "en";'), ["src.binary-locale-switch"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const x = locale === "en" ? "Save" : locale === "ja" ? "保存" : "保存";'), []);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'new Intl.DateTimeFormat("zh-CN").format(now);'), ["src.hardcoded-intl-zh"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'new Intl.DateTimeFormat("en-US").format(now);'), ["src.hardcoded-intl-zh"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'new Intl.NumberFormat("ja-JP").format(count);'), ["src.hardcoded-intl-zh"]);
  assert.deepEqual(srcRules("packages/plugin-sdk/src/action-cards.ts", 'new Intl.DateTimeFormat("en-CA").format(now);'), []);
  assert.deepEqual(srcRules("modules/shelf/src/ocr.ts", 'const langs = ["zh-Hans", "en-US"];'), []);
  assert.deepEqual(srcRules("apps/workbench/src/page.ts", 'const doc = `<!doctype html><html lang="zh-CN"><body></body></html>`;'), ["src.hardcoded-html-lang-zh"]);
  assert.deepEqual(srcRules("apps/workbench/src/page.ts", 'const doc = `<!doctype html><html lang="en-US"><body></body></html>`;'), ["src.hardcoded-html-lang-zh"]);
  assert.deepEqual(srcRules("apps/workbench/src/page.ts", '// <html lang="zh-CN">\nconst doc = `<html lang="${htmlLang()}">`;'), []);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const label = count.toLocaleString("en-US");'), ["src.bare-to-locale-string"]);
  assert.deepEqual(srcRules("apps/workbench/src/sample.ts", 'const label = count.toLocaleString(activeLocale);'), []);
});
