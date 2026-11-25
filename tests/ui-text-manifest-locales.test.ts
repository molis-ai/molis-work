import assert from "node:assert/strict";
import test from "node:test";

import { PLUGIN_LOCALE_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionPermissionDeclarations, defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { TEXT_REF_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";
import { assertContract } from "@molis-ai/molis-work-plugin-sandbox";
import { inspectActionDeclarations, parsePluginManifest, sandboxLocaleProblems, sandboxPluginManifest, sandboxProjectedPermissions } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";
import { packageContract } from "./fixtures/sandbox-package.js";

// What a Manifest may say about its languages (FSS-52, specs/font-and-skin-system/spec.md §11). Reading the language files is slice T7's.

const withLocales = (locales: unknown, ui: Record<string, unknown> = {}, parts: Record<string, unknown> = {}) =>
  declarationManifest({ ui: { contributions: [], locales, ...ui }, ...parts });
const LOCALES = { default: "zh", available: ["zh"] };
const TAG_PROBLEM = "不是语言标记（如 zh、en、zh-Hant、pt-BR，大小写和连字符照这样写）";

test("FSS-52 a Manifest declares its languages and the parsed Manifest keeps them as written", () => {
  for (const locales of [
    LOCALES,
    { default: "en", available: ["zh", "en"] },
    { default: "zh-Hant", available: ["zh-Hant", "zh-Hans", "pt-BR", "fil", "sr-Latn-RS"] },
  ]) {
    assert.deepEqual(parsePluginManifest(withLocales(locales)).ui.locales, locales);
  }
});

test("FSS-52 a Manifest may omit ui.locales, but neither removed field is accepted, each named on its own", () => {
  assert.equal(parsePluginManifest(declarationManifest()).ui.locales, undefined);
  // Each removed field is refused by its own name: a Manifest that writes one is told exactly which item to delete,
  // not that "messages or translations" is unwelcome (`packages/plugin-sdk/src/manifest.ts`).
  for (const field of ["messages", "translations"] as const) {
    for (const locales of [undefined, LOCALES]) {
      const problem = manifestProblems(declarationManifest({ ui: { contributions: [], ...(locales ? { locales } : {}), [field]: {} } }));
      assert.match(problem, new RegExp(`ui\\.${field} 已取消：界面文字请放在 locales/<语言>\\.json 并声明 ui\\.locales，请删掉这一项`, "u"), `${field} is named, not merged with the other removed field`);
    }
  }
});

test("FSS-52 a language tag of the wrong shape is refused, in the list and as the default", () => {
  // `../en` and `en/zh` matter beyond tidiness: a tag becomes the file name `locales/<tag>.json`.
  for (const tag of ["", "e", "english", "ZH", "zh_CN", "zh-cn", "en-us", "zh-hans", "zh-CN-Hans", "../en", "en/zh", "en.json", "en\n", " en", 7, null]) {
    assert.equal(manifestProblems(withLocales({ default: "zh", available: ["zh", tag] })), `ui.locales.available[1] ${TAG_PROBLEM}`, `listed ${JSON.stringify(tag)}`);
    assert.equal(manifestProblems(withLocales({ default: tag, available: ["zh"] })), `ui.locales.default ${TAG_PROBLEM}`, `default ${JSON.stringify(tag)}`);
  }
});

test("FSS-52 ui.locales of the wrong shape is refused", () => {
  for (const locales of [null, "zh", ["zh"], 1]) {
    assert.equal(manifestProblems(withLocales(locales)), "ui.locales 必须为对象", JSON.stringify(locales));
  }
  for (const available of [undefined, null, "zh", { zh: true }]) {
    assert.equal(manifestProblems(withLocales({ default: "zh", available })), "ui.locales.available 必须为数组", JSON.stringify(available));
  }
});

test("FSS-52 a missing default is named as missing", () => {
  assert.equal(manifestProblems(withLocales({ available: ["zh"] })), "缺少 ui.locales.default");
});

test("FSS-52 a field ui.locales does not have is refused rather than ignored", () => {
  assert.equal(manifestProblems(withLocales({ ...LOCALES, fallback: "en" })), "ui.locales 只能写 default、available，不认识 fallback");
  // A long key is cut, so the message stays bounded.
  assert.equal(manifestProblems(withLocales({ ...LOCALES, ["k".repeat(500)]: 1 })), `ui.locales 只能写 default、available，不认识 ${"k".repeat(40)}`);
});

test("FSS-52 a default outside available is refused", () => {
  assert.equal(manifestProblems(withLocales({ default: "en", available: ["zh"] })), "ui.locales.default en 必须列在 ui.locales.available 里");
  assert.equal(manifestProblems(withLocales({ default: "zh", available: [] })), "ui.locales.default zh 必须列在 ui.locales.available 里");
  assert.equal(manifestProblems(withLocales({ default: "zh-Hans", available: ["zh"] })), "ui.locales.default zh-Hans 必须列在 ui.locales.available 里");
});

test("FSS-52 a language listed twice is refused by name", () => {
  assert.equal(manifestProblems(withLocales({ default: "zh", available: ["zh", "en", "zh"] })), "ui.locales.available 里有重复的语言：zh");
  assert.equal(manifestProblems(withLocales({ default: "zh", available: ["zh", "en", "zh", "en", "zh"] })), "ui.locales.available 里有重复的语言：zh、en");
});

test("FSS-52 the list of languages has a limit, and going over it is one message however bad the list is", () => {
  assert.equal(PLUGIN_LOCALE_LIMITS.available, 32);
  const tags = Array.from({ length: 33 }, (_, index) => `a${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`);
  assert.equal(manifestProblems(withLocales({ default: tags[0], available: tags.slice(0, 32) })), "");
  assert.equal(manifestProblems(withLocales({ default: tags[0], available: tags })), "ui.locales.available 最多 32 种语言");
  assert.equal(manifestProblems(withLocales({ default: "zh", available: ["zh", ...Array.from({ length: 5000 }, () => "BAD")] })), "ui.locales.available 最多 32 种语言");
});

test("FSS-52 with ui.locales, a plugin_id whose last segment cannot start a key is refused, and says why", () => {
  const cannotOwnKeys = (plugin_id: string) => {
    const last = plugin_id.slice(plugin_id.lastIndexOf(".") + 1);
    return last === "common"
      ? `ui.locales 写不了键：plugin_id ${plugin_id} 最后一段是 common，键会以 common 开头，而 common 留给通用词；把最后一段换一个名字`
      : `ui.locales 写不了键：主人 ${plugin_id} 的最后一段 ${last} 不能当键的第一段：要以小写字母或数字开头，只含小写字母、数字和连字符`;
  };
  // A last segment that starts with a hyphen, or is empty, is not a plugin id at all (PLUGIN_ID_PATTERN), so only "common" is left for this rule.
  for (const plugin_id of ["com.acme.-x", "com.acme."]) assert.notEqual(manifestProblems(declarationManifest({ plugin_id })), "", plugin_id);
  for (const plugin_id of ["com.common", "com.acme.common"]) {
    assert.equal(manifestProblems(withLocales(LOCALES, {}, { plugin_id })), cannotOwnKeys(plugin_id), plugin_id);
    // The same id is fine for a plugin that does not declare languages: this rule comes with `ui.locales`, not with the id.
    assert.equal(manifestProblems(declarationManifest({ plugin_id })), "", plugin_id);
  }
  for (const plugin_id of ["com.acme.3d-tool", "com.acme.7", "com.acme.tool-3d", "com.commons", "com.common.notes", "com.acme.a"]) {
    const parsed = parsePluginManifest(withLocales(LOCALES, {}, { plugin_id }));
    assert.deepEqual([parsed.plugin_id, parsed.ui.locales], [plugin_id, LOCALES]);
  }
});

test("FSS-52 a plugin_id longer than a text reference's owner is refused by its own message", () => {
  const prefix = "com.example.";
  const longest = prefix + "a".repeat(TEXT_REF_LIMITS.owner - prefix.length);
  assert.equal(longest.length, 200);
  assert.equal(parsePluginManifest(declarationManifest({ plugin_id: longest })).plugin_id, longest);
  assert.equal(manifestProblems(declarationManifest({ plugin_id: `${longest}a` })), "plugin_id 最长 200 个字符");
});

test("FSS-35 FSS-38 a produced Artifact type may name one short word from its own declared locales", () => {
  const reference = { key: "declaration-rules.artifacts.type-title" };
  const action = defineArtifactPreviewAction("declaration-rules.artifacts.preview", 1, "Preview", []);
  const type = { artifact_type_id: "io.example.note", schema_version: 1, title: "Original label",
    preview: { capability_id: action.capability_id, version: action.version } };
  const withTitle = (title_text: unknown, title: unknown = type.title) =>
    ({ actions: [action], artifacts: { produces: [{ ...type, title, title_text }], consumes: [] } });
  assert.deepEqual(parsePluginManifest(withLocales(LOCALES, {}, withTitle(reference))).artifacts.produces,
    [{ ...type, title_text: reference }]);
  assert.deepEqual(parsePluginManifest(declarationManifest({ actions: [action], artifacts: { produces: [type], consumes: [] } })).artifacts.produces, [type]);
  const refusal = /artifacts\.produces\[0\]\.title_text 只能写本插件在 ui\.locales 声明的无参 \{ key \}/u;
  assert.match(manifestProblems(declarationManifest(withTitle(reference))), refusal);
  assert.equal(manifestProblems(withLocales(LOCALES, {}, withTitle(reference, " "))), "成果类型 io.example.note@1 缺少显示名（title）");
  for (const invalid of [
    { key: "notes.artifacts.type-title" }, { key: "common.control.retry" }, { literal: "Original" },
    { ...reference, owner: "com.example.declaration-rules" }, { ...reference, args: [] }, { ...reference, fallback: "Original" }, null,
  ]) assert.match(manifestProblems(withLocales(LOCALES, {}, withTitle(invalid))), refusal, JSON.stringify(invalid));
  const inheritedKey = Object.assign(Object.create(reference), { args: undefined });
  assert.match(manifestProblems(withLocales(LOCALES, {}, withTitle(inheritedKey))), refusal);
  const wrongSlot = /title_text 只用于 artifacts\.produces/u;
  const tagged = { ...type, title_text: reference };
  assert.match(manifestProblems(withLocales(LOCALES, {}, { artifacts: { produces: [], consumes: [tagged] } })), wrongSlot);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { process_items: { produces: [tagged], consumes: [] } })), wrongSlot);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { process_items: { produces: [], consumes: [tagged] } })), wrongSlot);
});

test("localized declaration TextRefs on permissions, read_groups and actions parse and refuse malformed shapes", () => {
  const query = {
    capability_id: "declaration-rules.items.list",
    version: 1,
    operation: "query" as const,
    action: {
      title: "列出条目",
      title_text: { key: "declaration-rules.action.list.title" },
      description: "读取项目里的条目",
      description_text: { key: "declaration-rules.action.list.description" },
      kind: "query" as const,
      scope: "project" as const,
      permissions: ["items:read"],
      subject_kinds: [],
      audiences: ["user", "agent"] as const,
      input_schema: { type: "object" },
    },
  };
  const permission = { permission: "items:read", required: true, reason: "读取条目", reason_text: { key: "declaration-rules.permission.read" } };
  const readGroup = {
    group_id: "items",
    title: "条目",
    title_text: { key: "declaration-rules.read-group.items.title" },
    description: "项目条目列表",
    description_text: { key: "declaration-rules.read-group.items.description" },
    actions: [query.capability_id],
  };
  const parsed = parsePluginManifest(withLocales(LOCALES, {}, { permissions: [permission], actions: [query], read_groups: [readGroup] }));
  assert.deepEqual(parsed.permissions, [permission]);
  assert.deepEqual(parsed.read_groups, [readGroup]);
  assert.deepEqual(parsed.actions?.[0]?.action.title_text, { key: "declaration-rules.action.list.title" });
  assert.deepEqual(parsed.actions?.[0]?.action.description_text, { key: "declaration-rules.action.list.description" });

  // actionPermissionDeclarations attaches optional reason_text cleanly.
  assert.deepEqual(actionPermissionDeclarations([query], "读取条目", undefined, { key: "declaration-rules.permission.read" }), [
    { permission: "items:read", required: false, reason: "读取条目", reason_text: { key: "declaration-rules.permission.read" } },
  ]);

  // Own keys require ui.locales; common.* keys and bounded single-line literals are allowed without ui.locales.
  const rawPermission = { permission: "items:read", required: true, reason: "读取条目" };
  assert.match(manifestProblems(declarationManifest({ permissions: [permission] })), /ui\.locales/u);
  assert.match(manifestProblems(declarationManifest({ permissions: [rawPermission], actions: [query] })), /ui\.locales/u);
  assert.match(manifestProblems(declarationManifest({ permissions: [rawPermission], actions: [{ ...query, action: { ...query.action, title_text: undefined, description_text: undefined } }], read_groups: [readGroup] })), /ui\.locales/u);
  assert.equal(manifestProblems(declarationManifest({
    permissions: [{ ...permission, reason_text: { literal: "Read items" } }],
    actions: [{ ...query, action: { ...query.action, title_text: { literal: "List items" }, description_text: { key: "common.control.confirm" } } }],
    read_groups: [{ ...readGroup, title_text: { literal: "Items" }, description_text: { literal: "Project items" } }],
  })), "");

  // Reject args, fallback, owner, multiline, foreign prefix, and char-limit overflows.
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [{ ...permission, reason_text: { key: "declaration-rules.p", args: [] } }] })), /不接收参数/u);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [{ ...permission, reason_text: { key: "other.p" } }] })), /本插件的键/u);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [{ ...permission, reason_text: { literal: "a".repeat(201) } }] })), /200/u);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [{ ...permission, reason_text: { literal: "a\nb" } }] })), /一行/u);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [rawPermission], actions: [{ ...query, action: { ...query.action, title_text: { literal: "t".repeat(81) } } }] })), /80/u);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [rawPermission], actions: [{ ...query, action: { ...query.action, description_text: { literal: "d".repeat(401) } } }] })), /400/u);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [rawPermission], actions: [query], read_groups: [{ ...readGroup, title_text: { literal: "g".repeat(81) } }] })), /80/u);
  assert.match(manifestProblems(withLocales(LOCALES, {}, { permissions: [rawPermission], actions: [query], read_groups: [{ ...readGroup, description_text: { literal: "g".repeat(201) } }] })), /200/u);

  // Standalone inspectActionDeclarations also refuses malformed action title_text / description_text.
  assert.ok(inspectActionDeclarations([{ ...query, action: { ...query.action, title_text: { literal: "a\nb" } } }], undefined).some(line => line.includes("title_text")));
  assert.ok(inspectActionDeclarations([{ ...query, action: { ...query.action, description_text: { key: "x.y", fallback: "nope" } } }], undefined).some(line => line.includes("description_text")));
});

test("sandbox contracts project localized permission_reasons, operation title_text/description_text and read_groups with validation", () => {
  const base = packageContract("com.example.notes");
  const localized = {
    ...base,
    ui: { locales: { default: "en", available: ["en", "zh", "ja"] } },
    permission_reasons: {
      "storage:private": { key: "notes.perm.storage" },
      "network:request": { key: "notes.perm.network" },
    },
    operations: base.operations.map(op => op.id === "notes.list"
      ? { ...op, effects: { storage: ["read"], networkDomains: ["api.example.com"] }, title_text: { key: "notes.op.list.title" }, description_text: { key: "notes.op.list.desc" } }
      : op),
    read_groups: [{
      group_id: "notes",
      title: "笔记",
      title_text: { key: "notes.rg.title" },
      description: "笔记列表",
      description_text: { key: "notes.rg.desc" },
      operations: ["notes.list"],
    }],
  };
  assertContract(localized);
  const manifest = sandboxPluginManifest({
    pluginId: localized.pluginId,
    version: "1.0.0",
    name: "Example notes",
    publisher: { publisher_id: "example", signature: "ed25519:sha256:aa" },
    presentation: false,
    contract: localized,
  });
  assert.deepEqual(manifest.permissions[0]?.reason_text, { key: "notes.perm.storage" });
  const projected = sandboxProjectedPermissions(manifest, { networkDomains: ["api.example.com"] }, localized.permission_reasons);
  assert.deepEqual(projected.map(row => [row.permission, row.reason_text]), [["network:request", { key: "notes.perm.network" }]]);
  const listAction = manifest.actions?.find(item => item.action.local_id === "notes.list");
  assert.ok(listAction);
  assert.deepEqual(listAction.action.title_text, { key: "notes.op.list.title" });
  assert.deepEqual(listAction.action.description_text, { key: "notes.op.list.desc" });
  assert.deepEqual(manifest.read_groups, [{
    group_id: "notes",
    title: "笔记",
    title_text: { key: "notes.rg.title" },
    description: "笔记列表",
    description_text: { key: "notes.rg.desc" },
    actions: [listAction.capability_id],
  }]);
  assert.equal(manifestProblems(manifest), "");

  // Invalid sandbox localized fields are rejected by sandboxLocaleProblems and assertContract.
  assert.ok(sandboxLocaleProblems({ ...localized, ui: undefined }).some(msg => msg.includes("ui.locales")));
  assert.ok(sandboxLocaleProblems({ ...localized, read_groups: [{ ...localized.read_groups[0]!, operations: ["notes.missing"] }] }).some(msg => msg.includes("operations")));
  assert.throws(() => assertContract({ ...localized, permission_reasons: { "storage:private": { key: "foreign.perm" } } }), { code: "sandbox.invalid_contract" });
});
