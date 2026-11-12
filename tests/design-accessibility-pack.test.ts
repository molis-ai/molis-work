import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { parseContentPackage } from "@molis-ai/molis-work-plugin-sdk";
import { BUNDLED_PACK_OPTIONS_FILE, packBundledContent } from "@molis-ai/molis-work-plugin-cli";
import { newPublisher } from "./fixtures/sandbox-package.js";

// The design and accessibility pack (BL-165, batch 08 slice 08-10): five Skills in a plugin with only declarations, shipped with the
// installer uninstalled. Its source is `plugins/content/design-accessibility/` (`skills/` plus the publishing choices in
// `pack-content.json`); `pack-bundled` packs it as `pack-content` packs any Skills folder and signs it in the same step. The official
// key is batch 26's (26-1): these tests sign with a publisher key made here, and the step without a key packs nothing.

const root = fileURLToPath(new URL("..", import.meta.url));
const PACK = join(root, "plugins/content/design-accessibility");
const PLUGIN_ID = "io.molis.work.content.design-accessibility";
/** Who each Skill is for: the review and copy Skills serve the assistant and Coding; keeping a design system is code work. */
const APPLIES_TO = { "accessibility-review": "both", "design-critique": "both", "design-handoff": "both", "design-system": "coding", "ux-copy": "both" };

const temporary = () => mkdtemp(join(tmpdir(), "molis-work-bundled-pack-"));

test("08-10 BL-165 SKP-01 the design and accessibility pack builds with a test publisher key into a signed content package the Host's own reading takes", async () => {
  const out = await temporary();
  try {
    const publisher = newPublisher();
    const { file } = await packBundledContent(PACK, out, publisher.signer);
    assert.equal(file, join(out, `${PLUGIN_ID}.json`), "named by its plugin id, as the Host's bundled folder wants");
    const { bundle, key_id } = verifyPluginPackageSignature(JSON.parse(await readFile(file, "utf8")));
    assert.equal(key_id, publisher.identity, "signed by the key the step was given, and named in the Manifest");
    const { manifest, skills } = parseContentPackage(bundle.payload);
    assert.deepEqual([manifest.kind, manifest.runtime?.scope, manifest.publisher.publisher_id, manifest.name, manifest.name_text],
      ["content", "home", "molis-work", "设计与无障碍", { key: "design-accessibility.directory.name" }]);
    assert.deepEqual([manifest.entrypoints, manifest.permissions, manifest.capabilities, manifest.ui.contributions],
      [[], [], { provides: [], consumes: [] }, []], "nothing to start, grant, provide or place");
    const methods = manifest.methods ?? [];
    assert.deepEqual(Object.fromEntries(methods.map(method => [method.skill_id, method.applies_to])), APPLIES_TO);
    for (const method of methods) {
      assert.equal(method.name, method.skill_id, "a SKILL.md's name is the Skill's id and its name");
      assert.ok(method.description && method.when_to_use && method.when_not_to_use && method.argument_hint, `${method.skill_id}: says when to use it and when not`);
      assert.deepEqual(method.tools, [], `${method.skill_id}: declares no tool`);
      assert.equal(method.user_invocable, undefined, `${method.skill_id}: can be named by the person`);
    }
    assert.deepEqual(Object.fromEntries(methods.map(method => [method.skill_id, (method.resources ?? []).map(resource => [resource.path, resource.role])])), {
      "accessibility-review": [["skills/accessibility-review/references/wcag-21-aa-checklist.md", "reference"]],
      "design-critique": [],
      "design-handoff": [["skills/design-handoff/references/handoff-template.md", "reference"]],
      "design-system": [["skills/design-system/references/audit-checklist.md", "reference"]],
      "ux-copy": [["skills/ux-copy/references/zh-en-style.md", "reference"]],
    }, "each resource is a reference the body points to; none runs");
    for (const { skill_id, body } of skills) {
      assert.ok(body.split("\n").length <= SKILL_LIMITS.bodyLines && body.length <= SKILL_LIMITS.bodyChars, `${skill_id}: within the body limits`);
      for (const resource of methods.find(method => method.skill_id === skill_id)?.resources ?? []) {
        assert.ok(body.includes(resource.path.slice(`skills/${skill_id}/`.length)), `${skill_id}: the body says when to read ${resource.path}`);
      }
    }
  } finally { await rm(out, { recursive: true, force: true }); }
});

test("08-10 BL-165 the signed pack carries only its own matching Chinese and English display words", async () => {
  const out = await temporary();
  try {
    const { bundle } = await packBundledContent(PACK, out, newPublisher().signer);
    const { manifest, locale_files: files } = parseContentPackage(bundle.payload);
    assert.deepEqual(Object.keys(files ?? {}).sort(), ["locales/en.json", "locales/zh.json"]);
    const expected = new Map([["design-accessibility.directory.name", manifest.name], ["design-accessibility.directory.summary", manifest.summary]]);
    for (const method of manifest.methods ?? []) for (const field of ["description", "when_to_use", "when_not_to_use"] as const) {
      expected.set(`design-accessibility.skill.${method.skill_id}.${field.replaceAll("_", "-")}`, method[field]);
    }
    for (const locale of ["zh", "en"]) {
      const result = parseLocalePack(files![`locales/${locale}.json`]!, { contentPack: true });
      assert.ok(result.ok, locale);
      assert.equal(result.value.owner, PLUGIN_ID);
      assert.deepEqual(Object.keys(result.value.messages).sort(), [...expected.keys()].sort());
      for (const [key, original] of expected) {
        const text: unknown = result.value.messages[key];
        assert.equal(typeof text, "string", key);
        if (locale === "zh") assert.equal(text, original, key);
        else assert.doesNotMatch(String(text), /\p{Script=Han}/u, key);
      }
    }
  } finally { await rm(out, { recursive: true, force: true }); }
});

test("08-10 pack-content.json is read strictly: a key it does not take refuses the pack by name, and nothing is written", async () => {
  const out = await temporary();
  try {
    const copy = join(out, "pack");
    await cp(PACK, copy, { recursive: true });
    const options = JSON.parse(await readFile(join(copy, BUNDLED_PACK_OPTIONS_FILE), "utf8")) as Record<string, unknown>;
    await writeFile(join(copy, BUNDLED_PACK_OPTIONS_FILE), JSON.stringify({ ...options, trust: "host" }));
    await assert.rejects(packBundledContent(copy, join(out, "bundled"), newPublisher().signer), (error: unknown) => error instanceof ActionError && error.code === "plugin.package_invalid" && /trust/u.test(error.message));
    assert.equal(existsSync(join(out, "bundled")), false);
  } finally { await rm(out, { recursive: true, force: true }); }
});
