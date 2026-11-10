import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Blueprint } from "@molis-ai/molis-work-contracts/platform/blueprints";
import type { PluginDeclarationProblem, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOME_PAGE_CONTENT_TYPE, HOME_PAGE_DRAFT_SCHEMA, homePageActions } from "@molis-ai/molis-work-contracts/services/home";
import { SandboxPackageStore, homeAgentDefinitions, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { parseContentPackage, parsePluginManifest, parsePluginPackageManifest } from "@molis-ai/molis-work-plugin-sdk";
import { CONTENT_PLUGIN_ID, contentPackageParts, contentPayload, signedContentPackage } from "./fixtures/content-package.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { installedPackageHost } from "./fixtures/signed-package-host.js";

const titleKey = "meeting-skills.pack.title", alternateKey = "meeting-skills.pack.alternate";
const title = { key: titleKey };

function blueprint(language: "zh" | "en" = "zh"): Blueprint {
  const translated = language === "en";
  return {
    title: translated ? { key: alternateKey } : title,
    purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [
      { part_id: "home", required: true, layer: "project", proposal: { kind: "content", type: HOME_PAGE_CONTENT_TYPE, body: translated ? "Outline" : "提纲" } },
      { part_id: "policy", required: true, layer: "project", proposal: { kind: "setting", key: "unknown.settings", value: false } },
      { part_id: "provider", required: false, layer: "project", proposal: { kind: "capability", requires: { capability_id: "future.calendar.read", version: 1, optional: true, reason: "查询空闲" } } },
      { part_id: "writer", required: true, layer: "project", proposal: { kind: "role", template: {
        title, instructions: translated ? "Write an outline." : "起草提纲。", action_tools: null,
      } } },
    ],
    steps: [{ step_id: "begin", title, part_ids: ["writer", "policy", "home"] }, { step_id: "lookup", title, part_ids: ["provider"] }],
    example_task: { title, input: title, step_ids: ["begin"], result: { part_id: "home", location: title } },
  };
}

function fillPack(files: Record<string, string>, manifest: PluginManifest, translated = true): void {
  manifest.blueprint = { locales: translated ? ["en"] : [] };
  manifest.ui.locales = { default: "zh", available: translated ? ["zh", "en"] : ["zh"] };
  files["blueprint.json"] = JSON.stringify(blueprint());
  files["locales/zh.json"] = JSON.stringify({ format_version: 1, owner: manifest.plugin_id, locale: "zh",
    messages: { [titleKey]: "写作 {file} <草稿>", [alternateKey]: "步骤" } });
  if (translated) {
    files["blueprint.en.json"] = JSON.stringify(blueprint("en"));
    files["locales/en.json"] = JSON.stringify({ format_version: 1, owner: manifest.plugin_id, locale: "en", messages: { [titleKey]: "Write {file} <draft>" } });
  }
}

function readProblems(run: () => unknown): readonly PluginDeclarationProblem[] {
  try { run(); } catch (error) {
    assert.ok(error instanceof ActionError);
    assert.equal(error.code, "plugin.declaration_invalid");
    const details = error.details as { problems: readonly PluginDeclarationProblem[] };
    assert.ok(details.problems.length);
    return details.problems;
  }
  return assert.fail("expected package declaration refusal");
}

function fixture({ skills = false, translated = true } = {}) {
  const { manifest, files } = contentPackageParts("example-publisher", skills ? {} : { skills: [] });
  if (!skills) delete manifest.methods;
  fillPack(files, manifest, translated);
  return { manifest, files, parse: () => parseContentPackage(contentPayload(manifest, files)) };
}

test("SPC-C04/SPC-C05: the content reader accepts a pure Blueprint, a methods pack and a mixed pack", () => {
  const pure = fixture();
  assert.deepEqual(pure.parse(), { manifest: pure.manifest, skills: [], blueprint: { default: blueprint(), others: [{ locale: "en", blueprint: blueprint("en") }] } });
  assert.deepEqual(fixture({ translated: false }).parse().blueprint, { default: blueprint(), others: [] });
  const mixed = fixture({ skills: true }).parse();
  assert.equal(mixed.skills.length, 1);
  assert.deepEqual(mixed.blueprint?.default, blueprint());
  const methods = contentPackageParts("example-publisher");
  const read = parseContentPackage(contentPayload(methods.manifest, methods.files));
  assert.equal(read.blueprint, undefined);
  assert.equal(read.skills.length, 1);
  const empty = contentPackageParts("example-publisher", { skills: [] });
  assert.match(readProblems(() => parseContentPackage(contentPayload(empty.manifest, empty.files)))[0]!.reason, /methods.*blueprint/);
});

test("SPC-C04: content Manifest limits Blueprint locales to non-default declared languages and rejects executable declarations", () => {
  const { manifest } = fixture();
  const variants: Array<[string, Partial<PluginManifest>]> = [
    ["blueprint.locales", { blueprint: { locales: ["zh"] } }],
    ["blueprint.locales", { blueprint: { locales: ["de"] } }],
    ["blueprint.locales", { blueprint: { locales: ["en", "en"] } }],
    ["blueprint", { blueprint: { locales: [], file: "blueprint.json" } as PluginManifest["blueprint"] }],
    ["blueprint", { ui: { contributions: [] } }],
    ["blueprint", { kind: "app", entrypoints: [{ deployment: "local", entrypoint: "app.js" }] }],
  ];
  for (const [prefix, change] of variants) {
    assert.ok(readProblems(() => parsePluginManifest({ ...manifest, ...change })).some(problem => problem.path?.startsWith(prefix)), prefix);
  }
  for (const field of ["agent", "actions", "settings_entries", "adopts", "databases"]) {
    assert.match(readProblems(() => parsePluginManifest({ ...manifest, [field]: [] }))[0]!.reason, new RegExp(field));
  }
  assert.match(readProblems(() => parsePluginManifest({ ...manifest, permissions: [{ permission: "store:write", reason: "x", required: true }] }))[0]!.reason, /permissions/);
});

test("SPC-C04/SPC-C05: missing and extra files, UTF-8, translation drift and locale diagnostics refuse the whole pack", () => {
  for (const file of ["blueprint.json", "blueprint.en.json", "locales/zh.json", "locales/en.json"]) {
    const broken = fixture();
    delete broken.files[file];
    assert.ok(readProblems(broken.parse).some(problem => problem.path?.startsWith(file)), file);
  }
  const extra = fixture();
  extra.files["blueprint.zh.json"] = extra.files["blueprint.json"]!;
  assert.equal(readProblems(extra.parse)[0]?.path, "blueprint.zh.json");

  const { manifest, files } = fixture();
  const payload = contentPayload(manifest, files);
  payload.files.find(file => file.path === "blueprint.json")!.content_base64 = Buffer.from([0x7b, 0xff, 0x7d]).toString("base64");
  assert.equal(readProblems(() => parseContentPackage(payload))[0]?.path, "blueprint.json");

  for (const [field, change] of [
    ["steps[0].title", (value: Blueprint) => { value.steps[0]!.title = { literal: "raw text" }; }],
    ["steps[1].step_id", (value: Blueprint) => { value.steps[1]!.step_id = "other"; }],
    ["parts[2].proposal.requires.version", (value: Blueprint) => {
      const proposal = value.parts[2]!.proposal;
      assert.equal(proposal.kind, "capability");
      proposal.requires.version = 2;
    }],
    ["parts[1].proposal.value", (value: Blueprint) => {
      const proposal = value.parts[1]!.proposal;
      assert.equal(proposal.kind, "setting");
      proposal.value = true;
    }],
  ] as const) {
    const broken = fixture(), edited = blueprint("en");
    change(edited);
    broken.files["blueprint.en.json"] = JSON.stringify(edited);
    assert.ok(readProblems(broken.parse).some(problem => problem.path === `blueprint.en.json:$.${field}`), field);
  }

  for (const message of ["{foo bar}", "{pr-number}", "{n|one|more}", "Changed {other}"]) {
    const broken = fixture();
    broken.files["locales/en.json"] = JSON.stringify({ format_version: 1, owner: broken.manifest.plugin_id, locale: "en", messages: { [titleKey]: message } });
    assert.ok(readProblems(broken.parse).some(problem => problem.path?.startsWith("locales/en.json")
      && (problem.path.includes(titleKey) || problem.reason.includes(titleKey))), message);
  }
  const wrongOwner = fixture();
  wrongOwner.files["locales/en.json"] = JSON.stringify({ format_version: 1, owner: "another.plugin", locale: "zh", messages: {} });
  assert.equal(readProblems(wrongOwner.parse)[0]?.path, "locales/en.json");
});

test("SPC-C07: public Manifest parsing validates the content adopter's exact local action schemas", () => {
  const { manifest } = contentPackageParts("example-publisher");
  manifest.kind = "app";
  delete manifest.methods;
  manifest.entrypoints = [{ deployment: "local", entrypoint: "app.js" }];
  const { saveDraft, read } = homePageActions;
  const ref = ({ capability_id, version }: ActionDefinition) => ({ capability_id, version });
  manifest.actions = [saveDraft, read];
  manifest.permissions = ["home:read", "home:write"].map(permission => ({ permission, reason: "首页内容", required: true }));
  manifest.adopts = [{ type: HOME_PAGE_CONTENT_TYPE, title: { key: "common.home" }, schema: HOME_PAGE_DRAFT_SCHEMA, adopt: ref(saveDraft), read: ref(read) }];
  assert.equal(parsePluginManifest(manifest), manifest);
  assert.equal(readProblems(() => parsePluginPackageManifest(manifest))[0]?.path, "adopts");
  const [adopter] = manifest.adopts;
  const wrongAction = { ...manifest, adopts: [{ ...adopter!, adopt: { ...adopter!.adopt, version: 2 } }] };
  assert.ok(readProblems(() => parsePluginManifest(wrongAction)).some(problem => problem.path === "adopts[0].adopt"));
  const missingCas = { ...saveDraft, action: { ...saveDraft.action, input_schema: { type: "object" } } };
  assert.ok(readProblems(() => parsePluginManifest({ ...manifest, actions: [missingCas, read] })).some(problem => problem.path === "adopts[0].adopt"));
});

test("SPC-C04/SPC-C05: a real signed Blueprint-only package installs with unavailable proposals, while a signed bad translation writes nothing", { timeout: 90_000 }, async t => {
  const h = await installedPackageHost();
  t.after(() => h.close());
  const publisher = newPublisher();
  const options = { skills: [] };
  const bad = signedContentPackage(publisher, options, (files, manifest) => {
    fillPack(files, manifest);
    files["blueprint.en.json"] = JSON.stringify({ ...blueprint("en"), steps: [] });
  });
  const invokePreview = (bundle: typeof bad) => h.client.invoke(h.person, ref(pluginInstallActions.preview), { bundle });
  const records = () => h.host.withProject(h.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).list().filter(record => record.plugin_id === CONTENT_PLUGIN_ID));
  function ref({ capability_id, version }: ActionDefinition) { return { capability_id, version }; }
  await assert.rejects(invokePreview(bad), { code: "plugin.declaration_invalid" });
  assert.equal(existsSync(join(h.home, "plugin-packages")), false);
  assert.deepEqual(await records(), []);

  const good = signedContentPackage(publisher, options, (files, manifest) => { delete manifest.methods; fillPack(files, manifest); });
  const preview = await invokePreview(good) as { preview_id: string; skills?: unknown; requires?: unknown };
  assert.equal(preview.skills, undefined);
  assert.equal(preview.requires, undefined, "proposal dependencies are not package requirements");
  await h.client.invoke(h.person, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Blueprint fixture" });
  const [installed] = await records();
  assert.deepEqual([installed?.state, installed?.selected_entrypoint, installed?.publisher_trust, installed?.grants], ["running", "", "pinned", []]);
  assert.deepEqual(homeAgentDefinitions(h.home).methods().filter(method => method.owner_id === CONTENT_PLUGIN_ID), []);
  const { packaged } = new SandboxPackageStore(h.home).load(CONTENT_PLUGIN_ID, publisher.identity, "1.0.0");
  assert.deepEqual(packaged?.blueprint, { default: blueprint(), others: [{ locale: "en", blueprint: blueprint("en") }] });
});
