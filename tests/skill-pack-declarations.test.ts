// Skill pack declarations (specs/skill-packs/contract-design.md §3, §4, C-1): a plugin with only declarations (`kind: "content"`), the
// Skill declaration's new fields, the content package and SKILL.md frontmatter. Every refusal here is asserted as a refusal: the
// error is `plugin.declaration_invalid`, and `details.problems` points at the key, Skill and file that caused it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONTENT_PACKAGE_FILES, type PluginDeclarationProblem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MAX_SKILL_BODY_CHARS, SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { inspectContentPlugin, parseContentPackage, parsePluginManifest, skillDeclarationFromFrontmatter } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest } from "./fixtures/declaration-manifest.js";

type Json = Record<string, unknown>;

const SKILL = "meeting-notes";
const BODY_PATH = `skills/${SKILL}/SKILL.md`;
const TEMPLATE_PATH = `skills/${SKILL}/references/template.md`;
const BODY = "# 会议纪要\n\n先读 references/template.md，再按它整理。\n";
const TEMPLATE = "## 纪要模板\n- 结论\n- 待办\n";
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

function skill(over: Json = {}): Json {
  return {
    skill_id: SKILL, version: 1, name: "会议纪要", summary: "把一次会议整理成纪要", tools: ["find-capabilities", "ask-user"],
    description: "用户要整理会议、写纪要或列会后待办时使用。", when_to_use: "会后整理", applies_to: "both", user_invocable: true,
    argument_hint: "<会议名称>", body: BODY_PATH, connector_categories: ["calendar"],
    resources: [{ path: TEMPLATE_PATH, role: "reference", media_type: "text/markdown", bytes: Buffer.byteLength(TEMPLATE), sha256: sha256(TEMPLATE) }],
    ...over,
  };
}

/** The smallest plugin with only declarations that parses, with `over` laid over its top-level keys. */
function contentManifest(over: Json = {}): Json {
  return {
    schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.meeting-skills", version: "1.0.0", name: "会议技能", kind: "content",
    publisher: { publisher_id: "example", signature: "example-signature" },
    entrypoints: [], permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    methods: [skill()],
    ...over,
  };
}

const file = (path: string, content: string | Buffer) => ({ path, content_base64: Buffer.from(content).toString("base64") });

/** A content package whose files are exactly what `manifest` declares, before `files` replaces them. */
function contentPackage(manifest: Json = contentManifest(), files?: Array<{ path: string; content_base64: string }>): Json {
  return {
    schema_version: 1, manifest,
    files: files ?? [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(manifest)), file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE)],
  };
}

/** The refusal's problems; anything but `plugin.declaration_invalid` fails the test. */
function refused(run: () => unknown): PluginDeclarationProblem[] {
  try { run(); } catch (error) {
    assert.ok(error instanceof ActionError, String(error));
    assert.equal(error.code, "plugin.declaration_invalid", error.message);
    const problems = error.details?.problems as PluginDeclarationProblem[] | undefined;
    assert.ok(Array.isArray(problems) && problems.length > 0, "the refusal lists its problems");
    assert.equal(error.message.length > 0, true);
    return problems;
  }
  return assert.fail("expected plugin.declaration_invalid");
}

const reasons = (problems: readonly PluginDeclarationProblem[]) => problems.map(problem => problem.reason);

// ---- SKC-01: the content plugin's whitelist -----------------------------------------------------------------------------------

test("SKC-01: a plugin with only declarations parses, without entrypoints, and the package reads back its body", () => {
  const manifest = parsePluginManifest(contentManifest());
  assert.equal(manifest.kind, "content");
  assert.deepEqual(manifest.entrypoints, []);
  assert.deepEqual(inspectContentPlugin(contentManifest()), []);
  // Identity, words in both languages, the Home scope and upgrade sources are all on the list.
  parsePluginManifest(contentManifest({ name_text: { literal: "Meeting skills" }, summary: "会议用的技能", developer: true, runtime: { scope: "home" },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"] }, ui: { contributions: [], locales: { default: "zh", available: ["zh", "en"] } } }));
  const read = parseContentPackage(contentPackage());
  assert.deepEqual(read.skills, [{ skill_id: SKILL, version: 1, body: BODY }]);
  assert.equal(read.manifest.plugin_id, "io.molis.work.meeting-skills");
});

test("FSS-53 SKC-03 content language files must match the signed package declarations exactly", () => {
  const manifest = contentManifest({ ui: { contributions: [], locales: { default: "zh", available: ["zh", "en"] } } });
  const entries = [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(manifest)), file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE)];
  const pathOf = (locale: string) => "locales/" + locale + ".json";
  const words = (locale: string, title: string, owner = String(manifest.plugin_id)) => JSON.stringify({ format_version: 1, owner, locale, messages: { "meeting-skills.title": title } });
  const zh = words("zh", "会议 <名称>"), en = words("en", "Don't invent R&D <names>");
  const files = [...entries, file(pathOf("zh"), zh), file(pathOf("en"), en)];
  const read = parseContentPackage(contentPackage(manifest, files));
  assert.deepEqual(read.locale_files, { [pathOf("zh")]: zh, [pathOf("en")]: en });
  assert.deepEqual(read.skills, [{ skill_id: SKILL, version: 1, body: BODY }]);
  assert.ok(refused(() => parseContentPackage(contentPackage(manifest, files.slice(0, -1)))).some(problem => problem.path === pathOf("en")));
  assert.ok(refused(() => parseContentPackage(contentPackage(manifest, [...files, file(pathOf("de"), words("de", "Meeting"))]))).some(problem => problem.path === pathOf("de")));
  assert.ok(refused(() => parseContentPackage(contentPackage(manifest, [...files.slice(0, -1), file(pathOf("en"), words("en", "Meeting", "io.other.meeting-skills"))]))).some(problem => problem.path === pathOf("en")));
  for (const name of ["messages", "translations"]) assert.ok(reasons(refused(() => parsePluginManifest(contentManifest({ ui: { contributions: [], [name]: {} } })))).some(reason => reason.includes(name)));
});

test("SKC-01: a key outside the content plugin's list is refused by name, whatever else is right", () => {
  for (const [key, value] of [["actions", []], ["routes", []], ["agent", { roles: [], prompts: [] }], ["databases", {}], ["always_on", true], ["sync", {}], ["read_groups", []]] as const) {
    const problems = refused(() => parsePluginManifest(contentManifest({ [key]: value })));
    assert.deepEqual(reasons(problems), [`只有声明的插件不能写 "${key}"`], key);
  }
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ ui: { contributions: [], views: [] } })))), ["只有声明的插件不能写 ui 下的 \"views\""]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ artifacts: { produces: [], consumes: [], links: [] } })))), ["只有声明的插件不能写 artifacts 下的 \"links\""]);
});

test("SKC-01: a key the author wrote is quoted and cut short in the reason, and a long list ends with how many more there are", () => {
  // A control character reads as written, and a key past 200 units is cut, so the preview never shows unbounded outside text.
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ "a\nb": 1 })))), ["只有声明的插件不能写 \"a\\nb\""]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ ["k".repeat(300)]: 1 })))), [`只有声明的插件不能写 "${"k".repeat(200)}…"`]);
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`extra_${index}`, 1]));
  const problems = refused(() => parsePluginManifest(contentManifest(many)));
  assert.equal(problems.length, 31);
  assert.deepEqual(problems[0], { reason: "只有声明的插件不能写 \"extra_0\"" });
  assert.deepEqual(problems[30], { reason: "另有 10 项" });
});

test("SKC-01: what a content plugin must leave empty is refused when it is not", () => {
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }] })))),
    ["只有声明的插件的 entrypoints 必须是空列表"]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ permissions: [{ permission: "storage:private", required: true, reason: "x" }] })))),
    ["只有声明的插件的 permissions 必须是空列表"]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ capabilities: { provides: ["example.read"], consumes: [] } })))),
    ["只有声明的插件的 capabilities.provides 必须是空列表"]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ ui: { contributions: ["io.molis.work.meeting-skills.main"] } })))),
    ["只有声明的插件的 ui.contributions 必须是空列表"]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ methods: [] })))), ["只有声明的插件至少要声明一个方法（methods）或场景包（blueprint）"]);
  const problems = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ body: undefined })] })));
  assert.deepEqual(problems, [{ skill_id: SKILL, reason: `方法 ${SKILL} 要写 body：只有声明的插件的正文随包发布` }]);
});

test("SKC-01: a content plugin's requires need not be in capabilities.consumes; every other plugin's still must", () => {
  const requires = [{ capability_id: "todo.items.list", version: 1, reason: "列出会后待办", optional: true }];
  const manifest = parsePluginManifest(contentManifest({ requires }));
  assert.deepEqual(manifest.requires, requires);
  assert.deepEqual(manifest.capabilities.consumes, []);
  // The other checks of requires still hold for it.
  assert.deepEqual(reasons(refused(() => parsePluginManifest(contentManifest({ requires: [{ capability_id: "todo.items.list", version: 0, reason: "x" }] })))),
    ["依赖 todo.items.list 的版本无效"]);
  // Any other kind keeps the rule: a requirement outside consumes is refused.
  assert.deepEqual(reasons(refused(() => parsePluginManifest(declarationManifest({ requires })))), ["依赖 todo.items.list@1 未列入 capabilities.consumes"]);
});

test("SKC-01: every other kind still needs an entrypoint", () => {
  assert.throws(() => parsePluginManifest(declarationManifest({ entrypoints: [] })), (error: unknown) => error instanceof ActionError && error.code === "plugin.entrypoint_missing");
});

// ---- SKC-03: a bad Skill declaration or package is refused whole --------------------------------------------------------------

test("SKC-03: a Skill id declared twice is refused", () => {
  const problems = refused(() => parsePluginManifest(contentManifest({ methods: [skill(), skill()] })));
  assert.ok(problems.some(problem => problem.skill_id === SKILL && problem.reason === `方法重复：${SKILL}`), JSON.stringify(problems));
});

test("SKC-03: applies_to outside assistant, coding and both is refused", () => {
  const problems = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ applies_to: "everyone" })] })));
  assert.deepEqual(problems, [{ skill_id: SKILL, reason: `方法 ${SKILL} 的 applies_to 只能是 assistant、coding、both` }]);
});

test("SKC-03: a tool outside SKILL_TOOLS is refused; the declaration grants nothing either way", () => {
  const problems = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ tools: ["find-capabilities", "write"] })] })));
  assert.equal(problems.length, 1);
  assert.equal(problems[0]!.skill_id, SKILL);
  assert.match(problems[0]!.reason, /^方法 meeting-notes 只能使用业务工具：find-capabilities、/u);
});

test("SKC-03: a body or resource path that escapes the package, or a body outside its Skill's folder, is refused", () => {
  const escaping = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ resources: [{ path: `skills/${SKILL}/references/../../../etc/passwd`, role: "reference", media_type: "text/plain", bytes: 1, sha256: "0".repeat(64) }] })] })));
  assert.deepEqual(escaping, [{ skill_id: SKILL, path: `skills/${SKILL}/references/../../../etc/passwd`, reason: `方法 ${SKILL} 的资源路径不能含 ..、. 或空段，不能逃出包根` }]);
  const absolute = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ resources: [{ path: "/etc/passwd", role: "reference", media_type: "text/plain", bytes: 1, sha256: "0".repeat(64) }] })] })));
  assert.deepEqual(reasons(absolute), [`方法 ${SKILL} 的资源路径必须相对包根，不能是绝对路径`]);
  const body = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ body: "../SKILL.md" })] })));
  assert.deepEqual(body, [{ skill_id: SKILL, path: "../SKILL.md", reason: `方法 ${SKILL} 的正文必须在 ${BODY_PATH}` }]);
  const package_ = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())),
    file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE), file("../outside.md", "x")])));
  assert.ok(package_.some(problem => problem.path === "../outside.md" && /逃出包根/u.test(problem.reason)), JSON.stringify(package_));
});

/** Every other way a path can leave the package, with the reason `packagePathProblem` gives. */
const BAD_PATHS: ReadonlyArray<readonly [string, string]> = [
  [`skills/${SKILL}/references/a\\b.md`, "路径不能含反斜杠或空字符"],
  [`skills/${SKILL}/references/a\0b.md`, "路径不能含反斜杠或空字符"],
  ["C:/x.md", "路径必须相对包根，不能是绝对路径"],
  [`skills/${SKILL}/references//x.md`, "路径不能含 ..、. 或空段，不能逃出包根"],
  ["./x.md", "路径不能含 ..、. 或空段，不能逃出包根"],
  [`skills/${SKILL}/references/./x.md`, "路径不能含 ..、. 或空段，不能逃出包根"],
];

test("SKC-03: a backslash, NUL, drive, `.` or empty segment in a resource path or a package file path is refused", () => {
  for (const [path, reason] of BAD_PATHS) {
    const resource = { path, role: "reference", media_type: "text/plain", bytes: 1, sha256: "0".repeat(64) };
    assert.deepEqual(refused(() => parsePluginManifest(contentManifest({ methods: [skill({ resources: [resource] })] }))),
      [{ skill_id: SKILL, path, reason: `方法 ${SKILL} 的资源${reason}` }], JSON.stringify(path));
    const files = [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE), file(path, "x")];
    assert.deepEqual(refused(() => parseContentPackage(contentPackage(contentManifest(), files))), [{ path, reason }], JSON.stringify(path));
  }
});

test("SKC-03: a package file listed twice, or content that is not base64, is refused", () => {
  const twice = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())),
    file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE), file(TEMPLATE_PATH, TEMPLATE)])));
  assert.deepEqual(twice, [{ path: TEMPLATE_PATH, reason: "文件重复" }]);
  // Both checks: a length that cannot be base64, and characters outside its alphabet.
  for (const content_base64 of ["abc", "@@@@"]) {
    const problems = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())),
      file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE), { path: "notes.md", content_base64 }])));
    assert.deepEqual(problems, [{ path: "notes.md", reason: "内容不是有效的 base64" }], content_base64);
  }
});

test("SKC-03: a package path is quoted in the message and cut short in details.problems", () => {
  const long = `${"d".repeat(300)}/../x.md`;
  try {
    parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())),
      file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE), file(long, "x")]));
    assert.fail("expected plugin.declaration_invalid");
  } catch (error) {
    assert.ok(error instanceof ActionError && error.code === "plugin.declaration_invalid", String(error));
    const cut = `${"d".repeat(200)}…`;
    assert.deepEqual(error.details?.problems, [{ path: cut, reason: "路径不能含 ..、. 或空段，不能逃出包根" }]);
    assert.equal(error.message, `${JSON.stringify(cut)}：路径不能含 ..、. 或空段，不能逃出包根`);
  }
});

// ---- SKC-03: the package and declaration limits ----------------------------------------------------------------------------------

test("SKC-03: a package with more files than filesPerPackage is refused before any file is read", () => {
  const rows = Array.from({ length: SKILL_LIMITS.filesPerPackage + 1 }, (_, index) => file(`extra/${index}.md`, "x"));
  assert.deepEqual(refused(() => parseContentPackage(contentPackage(contentManifest(), rows))), [{ reason: `内容包至多 ${SKILL_LIMITS.filesPerPackage} 个文件` }]);
});

test("SKC-03: a file over fileBytes is refused by its encoded size; one at the limit is read", () => {
  const base = [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE)];
  const over = refused(() => parseContentPackage(contentPackage(contentManifest(), [...base, file("big.bin", Buffer.alloc(SKILL_LIMITS.fileBytes + 1))])));
  assert.deepEqual(over, [{ path: "big.bin", reason: `超过 ${SKILL_LIMITS.fileBytes} 字节` }]);
  // At the limit the size passes, and the file is refused only for not being declared.
  const at = refused(() => parseContentPackage(contentPackage(contentManifest(), [...base, file("big.bin", Buffer.alloc(SKILL_LIMITS.fileBytes))])));
  assert.deepEqual(at, [{ path: "big.bin", reason: "声明里没有这个文件" }]);
});

test("SKC-03: a package past packageBytes in total is refused as soon as the total is past it", () => {
  const big = Buffer.alloc(SKILL_LIMITS.fileBytes).toString("base64");
  const count = SKILL_LIMITS.packageBytes / SKILL_LIMITS.fileBytes;
  const rows = [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE),
    ...Array.from({ length: count }, (_, index) => ({ path: `extra/${index}.bin`, content_base64: big }))];
  assert.deepEqual(refused(() => parseContentPackage(contentPackage(contentManifest(), rows))), [{ reason: `内容包合计超过 ${SKILL_LIMITS.packageBytes} 字节` }]);
});

test("SKC-03: a Skill with more than resourcesPerSkill resources, or a plugin with more than skillsPerPackage methods, is refused", () => {
  const resources = Array.from({ length: SKILL_LIMITS.resourcesPerSkill + 1 }, (_, index) => ({
    path: `skills/${SKILL}/references/${index}.md`, role: "reference", media_type: "text/markdown", bytes: 1, sha256: "0".repeat(64),
  }));
  assert.deepEqual(refused(() => parsePluginManifest(contentManifest({ methods: [skill({ resources })] }))),
    [{ skill_id: SKILL, reason: `方法 ${SKILL} 至多带 ${SKILL_LIMITS.resourcesPerSkill} 个资源` }]);
  const methods = Array.from({ length: SKILL_LIMITS.skillsPerPackage + 1 }, (_, index) =>
    skill({ skill_id: `skill-${index}`, body: `skills/skill-${index}/SKILL.md`, resources: undefined }));
  assert.deepEqual(refused(() => parsePluginManifest(contentManifest({ methods }))), [{ reason: `一个插件至多声明 ${SKILL_LIMITS.skillsPerPackage} 个方法` }]);
  // At the limits both parse.
  parsePluginManifest(contentManifest({ methods: [skill({ resources: resources.slice(0, SKILL_LIMITS.resourcesPerSkill) })] }));
  parsePluginManifest(contentManifest({ methods: methods.slice(0, SKILL_LIMITS.skillsPerPackage) }));
});

test("SKC-03: a body missing from the package is refused, pointing at the Skill and the file", () => {
  const problems = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(TEMPLATE_PATH, TEMPLATE)])));
  assert.deepEqual(problems, [{ skill_id: SKILL, path: BODY_PATH, reason: "包里找不到" }]);
});

test("SKC-03: a body over the line or character limit is refused", () => {
  const lines = "行\n".repeat(SKILL_LIMITS.bodyLines + 1), chars = "字".repeat(MAX_SKILL_BODY_CHARS + 1);
  for (const [body, reason] of [[lines, `正文超过 ${SKILL_LIMITS.bodyLines} 行`], [chars, `正文超过 ${MAX_SKILL_BODY_CHARS} 字`], ["  \n", "正文是空的"]] as const) {
    const problems = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, body), file(TEMPLATE_PATH, TEMPLATE)])));
    assert.deepEqual(problems, [{ skill_id: SKILL, path: BODY_PATH, reason }]);
  }
  // Exactly at the limits it passes.
  parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, "行\n".repeat(SKILL_LIMITS.bodyLines)), file(TEMPLATE_PATH, TEMPLATE)]));
});

test("SKC-03: a declared description over 1024 characters is refused", () => {
  const problems = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ description: "说".repeat(SKILL_LIMITS.descriptionChars + 1) })] })));
  assert.deepEqual(reasons(problems), [`方法 ${SKILL} 的 description 限 1～${SKILL_LIMITS.descriptionChars} 字`]);
});

test("SKC-03: a missing resource, or one whose size or digest differs from its declaration, is refused", () => {
  const missing = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, BODY)])));
  assert.deepEqual(missing, [{ skill_id: SKILL, path: TEMPLATE_PATH, reason: "包里找不到" }]);
  const tampered = TEMPLATE.replace("结论", "决定");
  const digest = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, BODY), file(TEMPLATE_PATH, tampered)])));
  assert.deepEqual(digest, [{ skill_id: SKILL, path: TEMPLATE_PATH, reason: "摘要与声明不符" }]);
  const size = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(BODY_PATH, BODY), file(TEMPLATE_PATH, `${TEMPLATE}更多`)])));
  assert.deepEqual(size, [{ skill_id: SKILL, path: TEMPLATE_PATH, reason: "大小与声明不符" }]);
});

test("SKC-03: a file the Manifest does not declare, or a manifest.json that differs, is refused; nothing is half-read", () => {
  const extra = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())),
    file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE), file("plugin.mjs", "export default {}")])));
  assert.deepEqual(extra, [{ path: "plugin.mjs", reason: "声明里没有这个文件" }]);
  const differs = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest({ version: "1.0.1" }))),
    file(BODY_PATH, BODY), file(TEMPLATE_PATH, TEMPLATE)])));
  assert.deepEqual(differs, [{ path: CONTENT_PACKAGE_FILES.manifest, reason: "与包的 Manifest 不一致" }]);
  // A whole list, not the first problem: a missing body and a bad digest in one package are both named.
  const both = refused(() => parseContentPackage(contentPackage(contentManifest(), [file(CONTENT_PACKAGE_FILES.manifest, JSON.stringify(contentManifest())), file(TEMPLATE_PATH, "x")])));
  assert.deepEqual(both.map(problem => [problem.path, problem.reason]), [[BODY_PATH, "包里找不到"], [TEMPLATE_PATH, "大小与声明不符"]]);
});

test("SKC-03: a resource outside its role's folder, or with a bad digest declaration, is refused", () => {
  const problems = refused(() => parsePluginManifest(contentManifest({ methods: [skill({ resources: [{ path: `skills/${SKILL}/assets/run.py`, role: "script", media_type: "text/x-python", bytes: 1, sha256: "XYZ" }] })] })));
  assert.deepEqual(reasons(problems), [`方法 ${SKILL} 的 script 资源必须在 skills/${SKILL}/scripts/ 下`, `方法 ${SKILL} 的资源摘要必须是小写十六进制的 SHA-256`]);
});

test("SKC-03: a sandbox or other package is not read as a content package", () => {
  const problems = refused(() => parseContentPackage(contentPackage(declarationManifest() as Json)));
  assert.deepEqual(problems, [{ reason: "内容包只装只有声明的插件（kind: \"content\"）" }]);
});

// ---- methods and agent.skills differ only in what they may write ---------------------------------------------------------------

test("a plugin's own Agent may not write applies_to, user_invocable or argument_hint", () => {
  const agent = { roles: [{ role_id: "writer", version: 1, name: "Writer", workspace: "none" }], prompts: [{ prompt_id: "writer", version: 1 }],
    skills: [{ skill_id: "draft", version: 1, name: "Draft", summary: "Draft it", tools: ["read"], applies_to: "coding", user_invocable: false, argument_hint: "x" }] };
  const problems = refused(() => parsePluginManifest(declarationManifest({ agent })));
  // Each problem points at the Skill, as a method's does (contract-design §4.2), not only its words.
  assert.deepEqual(problems, ["applies_to", "user_invocable", "argument_hint"].map(key => ({ skill_id: "draft", reason: `Agent 方法 draft 不能写 ${key}：只有给别的 Agent 的方法（methods）才写` })));
  const bare = { skill_id: "draft", version: 1, name: "Draft", summary: "Draft it", tools: [] };
  const twice = refused(() => parsePluginManifest(declarationManifest({ agent: { ...agent, skills: [bare, bare] } })));
  assert.deepEqual(twice, [
    { skill_id: "draft", reason: "Agent 方法 draft 必须声明可用工具" },
    { skill_id: "draft", reason: "Agent 方法重复：draft" },
    { skill_id: "draft", reason: "Agent 方法 draft 必须声明可用工具" },
  ]);
  // SKC-03 with C-3: in `agent.skills` the new fields stay optional; a plugin's own Agent writes none of them and parses.
  parsePluginManifest(declarationManifest({ agent: { ...agent, skills: [{ skill_id: "draft", version: 1, name: "Draft", summary: "Draft it", tools: ["read"] }] } }));
});

test("SKC-03 SKC-06: a plugin's own Agent Skill and a method it offers other Agents may not share one id (capability-pack contract-design §2.2)", () => {
  // A plugin's own round reads its own Skills without the catalog's three states: under a shared id it would read, as its own, a method
  // the person keeps off or manual in the catalog. So the Manifest is refused, pointing at that id.
  const agent = { roles: [{ role_id: "writer", version: 1, name: "Writer", workspace: "none" }], prompts: [{ prompt_id: "writer", version: 1 }],
    skills: [{ skill_id: "draft", version: 1, name: "Draft", summary: "Draft it", tools: ["read"] }] };
  const method = { skill_id: "draft", version: 1, name: "Draft", summary: "Draft it", tools: [], description: "要起草时用。", applies_to: "both" };
  const problems = refused(() => parsePluginManifest(declarationManifest({ agent, methods: [method] })));
  assert.deepEqual(problems, [{ skill_id: "draft", reason: "Agent 方法 draft 与 methods 里的方法同名：自己的方法和给别的 Agent 的方法不能用同一个 skill_id" }]);
  // Named once however often it repeats, and only the shared id: the other method is fine.
  const again = refused(() => parsePluginManifest(declarationManifest({ agent, methods: [method, { ...method, skill_id: "outline" }] })));
  assert.deepEqual(again.map(problem => problem.skill_id), ["draft"]);
  parsePluginManifest(declarationManifest({ agent, methods: [{ ...method, skill_id: "outline" }] }));
});

test("SKP-08 SKC-03: a method in Manifest methods must say when to pick it and which built-in Agent may", () => {
  const plain = { skill_id: "plain", version: 1, name: "Plain", summary: "Plain method", tools: [] };
  const problems = refused(() => parsePluginManifest(declarationManifest({ methods: [plain] })));
  assert.deepEqual(problems, [
    { skill_id: "plain", reason: "方法 plain 要写 description：什么时候用它" },
    { skill_id: "plain", reason: "方法 plain 要写 applies_to：assistant、coding、both" },
  ]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(declarationManifest({ methods: [{ ...plain, applies_to: "assistant" }] })))), ["方法 plain 要写 description：什么时候用它"]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(declarationManifest({ methods: [{ ...plain, description: "要整理时用。" }] })))), ["方法 plain 要写 applies_to：assistant、coding、both"]);
  // A key outside the declaration is named, and an id too long to be a folder name is refused.
  assert.deepEqual(reasons(refused(() => parsePluginManifest(declarationManifest({ methods: [{ ...plain, description: "要整理时用。", applies_to: "both", purpose: "旧写法" }] })))), ["方法 plain 不能写 \"purpose\""]);
  // The key is the author's text: quoted, and cut to 200 units, as every outside key in a refusal (C-1 `quoted`).
  const long = "k".repeat(300);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(declarationManifest({ methods: [{ ...plain, description: "要整理时用。", applies_to: "both", [long]: 1 }] })))), [`方法 plain 不能写 ${JSON.stringify(`${"k".repeat(200)}…`)}`]);
  assert.deepEqual(reasons(refused(() => parsePluginManifest(declarationManifest({ methods: [{ ...plain, skill_id: "a".repeat(SKILL_LIMITS.skillIdChars + 1), description: "d", applies_to: "both" }] })))), ["方法声明不合法"]);
  parsePluginManifest(declarationManifest({ methods: [{ ...plain, skill_id: "a".repeat(SKILL_LIMITS.skillIdChars), description: "要整理时用。", applies_to: "both" }] }));
});

// ---- SKILL.md frontmatter -------------------------------------------------------------------------------------------------------

test("skillDeclarationFromFrontmatter turns a SKILL.md into the declaration the Manifest carries", () => {
  const markdown = [
    "---", "name: weekly-review", "version: 2", "description: 写周度复盘；当用户要周报时使用。", "when_to_use: 一周结束时",
    "tools: [find-capabilities, ask-user]        # 声明，不授予", "applies_to: both", "user_invocable: true", "argument_hint: \"<周期，可选>\"",
    "connector_categories: [project-tracker]", "license: MIT", "---", "", "# 周度复盘", "",
  ].join("\n");
  const resources = [{ path: "skills/weekly-review/references/a.md", role: "reference" as const, media_type: "text/markdown", bytes: 1, sha256: "a".repeat(64) }];
  assert.deepEqual(skillDeclarationFromFrontmatter(markdown, { resources }), {
    skill_id: "weekly-review", version: 2, name: "weekly-review", summary: "写周度复盘；当用户要周报时使用。", tools: ["find-capabilities", "ask-user"],
    description: "写周度复盘；当用户要周报时使用。", when_to_use: "一周结束时", applies_to: "both", user_invocable: true, argument_hint: "<周期，可选>",
    body: "skills/weekly-review/SKILL.md", resources, connector_categories: ["project-tracker"],
  });
  assert.equal(skillDeclarationFromFrontmatter(markdown, { version: 5 }).version, 5);
});

test("skillDeclarationFromFrontmatter refuses what the Manifest check refuses, and values it cannot read", () => {
  const head = (lines: string[]) => ["---", ...lines, "---", "正文"].join("\n");
  assert.deepEqual(refused(() => skillDeclarationFromFrontmatter(head(["name: bad", "description: d", "applies_to: all"]))),
    [{ skill_id: "bad", path: "skills/bad/SKILL.md", reason: "方法 bad 的 applies_to 只能是 assistant、coding、both" }]);
  assert.deepEqual(reasons(refused(() => skillDeclarationFromFrontmatter(head(["description: d"])))), ["SKILL.md 的 frontmatter 要有 name（Skill 的标识）"]);
  assert.deepEqual(reasons(refused(() => skillDeclarationFromFrontmatter(head(["name: multi", "description: |", "  two lines"])))),
    ["SKILL.md 的 frontmatter 第 3 行要写成一行的 key: value（不支持嵌套和多行值）"]);
  assert.deepEqual(reasons(refused(() => skillDeclarationFromFrontmatter("# 没有 frontmatter"))), ["SKILL.md 要以 --- 包起的 frontmatter 开头"]);
});

test("SKC-03: signed local-only reasons are bounded declarations and survive content parsing", () => {
  const reason = "Requires local files and tools";
  const manifest = parsePluginManifest(contentManifest({ methods: [skill({ native_only_reason: reason })] }));
  assert.equal(manifest.methods?.[0]?.native_only_reason, reason);
  for (const value of ["", "x".repeat(513), false]) assert.ok(refused(() => parsePluginManifest(contentManifest({ methods: [skill({ native_only_reason: value })] }))).some(item => item.reason.includes("native_only_reason")));
});
