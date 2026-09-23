import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { openCharacters, CharacterError } from "@molis-ai/molis-work-module-characters";
import { CHARACTER_IMPORT_LIMITS, parseCharacterImportSnapshot, parseCharacterContent, type CharacterImportSnapshot } from "@molis-ai/molis-work-contracts/modules/characters";
import { createCharacterDiscovery } from "../apps/local-host/src/character-import-discovery.js";
const put = (path: string, body: string | Buffer) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body); };
function fixture(t: { after(callback: () => void): void }) {
  const home = mkdtempSync(join(tmpdir(), "molis-character-import-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  return { home, discover: createCharacterDiscovery({ userHome: home, env: { PATH: "" }, now: () => "2026-09-23T00:00:00Z" }) };
}
const all = (snapshot: CharacterImportSnapshot) => ({ rule_paths: snapshot.rules.map(rule => rule.path), skill_ids: snapshot.skills.map(skill => skill.id) });
const errorCode = (code: string) => (error: unknown) => error instanceof CharacterError && error.code === code;

test("discovery snapshots preserve original rules, resource paths and binary contents without executing files", t => {
  const { home, discover } = fixture(t), root = join(home, ".codex"), skill = join(root, "skills/check");
  const rule = "原文与范围。\n" + "证据".repeat(12_000);
  put(join(root, "AGENTS.md"), rule);
  put(join(skill, "SKILL.md"), "---\nname: check\ndescription: 核对附件\n---\nRead references/rules.md.\n");
  put(join(skill, "references/rules.md"), "保留换行\n第二行\n");
  put(join(skill, "assets/sample.bin"), Buffer.from([0, 255, 2]));
  put(join(skill, "assets/large.bin"), Buffer.alloc(2 * 1024 * 1024));
  put(join(skill, "scripts/run.sh"), `touch '${join(home, "must-not-exist")}'`);
  const candidate = discover.discover({ runtime_id: "codex" })[0]!;
  assert.equal(candidate.snapshot.rules[0]!.content, rule);
  assert.equal(candidate.executable, null);
  assert.equal(candidate.snapshot.skills[0]!.compatibility, "native-only");
  assert.deepEqual(candidate.snapshot.skills[0]!.files.find(file => file.path === "assets/sample.bin"), { path: "assets/sample.bin", encoding: "base64", content: "AP8C" });
  assert.equal(candidate.snapshot.skills[0]!.files.find(file => file.path === "references/rules.md")!.content, "保留换行\n第二行\n");
  assert.throws(() => readFileSync(join(home, "must-not-exist")));
  put(join(root, "AGENTS.md"), "Changed after preview");
  candidate.snapshot.rules[0]!.content = "browser mutation";
  assert.equal(discover.get(candidate.candidate_id)!.rules[0]!.content, rule);
  assert.equal(discover.get("unknown"), null);
});

test("selected imported contents persist, publish immutably and refresh only on an explicit confirmed revision", t => {
  const { home, discover } = fixture(t);
  put(join(home, ".codex/AGENTS.md"), "exact rule\n" + "x".repeat(22_000));
  put(join(home, ".codex/skills/check/SKILL.md"), "---\nname: check\n---\nRead guide.md.");
  put(join(home, ".codex/skills/check/guide.md"), "附件原文");
  put(join(home, ".codex/skills/check/sample.bin"), Buffer.from([255, 1, 0]));
  const snapshot = discover.discover({ runtime_id: "codex" })[0]!.snapshot;
  const db = openCharacters(join(home, "store"), "actor"), service = db.service;
  const imported = service.import(snapshot, all(snapshot));
  assert.equal(imported.replayed, false);
  const edited = service.update(imported.draft.character_id, 1, { title: "我的角色", instructions: "我的手动补充", host_tools: [] });
  assert.deepEqual(edited.import_snapshot, snapshot);
  const frozen = service.publish(edited.character_id, edited.revision, content => content);
  assert.deepEqual(frozen.import_snapshot, snapshot);
  assert.deepEqual(parseCharacterContent(frozen), frozen);
  db.close();
  const reopened = openCharacters(join(home, "store"), "actor"); t.after(() => reopened.close());
  assert.deepEqual(reopened.service.get(edited.character_id), edited);
  const changed = { ...snapshot, captured_at: "2026-09-23T01:00:00Z", rules: [{ ...snapshot.rules[0]!, content: "新规则" }] };
  const replay = reopened.service.import(changed, all(changed));
  assert.equal(replay.replayed, true); assert.deepEqual(replay.draft, edited); assert.equal(reopened.service.list().length, 1);
  assert.throws(() => reopened.service.import(changed, all(changed), { character_id: edited.character_id, expected_revision: 1 }), errorCode("character.conflict"));
  const refreshed = reopened.service.import(changed, all(changed), { character_id: edited.character_id, expected_revision: 2 }).draft;
  assert.equal(refreshed.revision, 3); assert.equal(refreshed.instructions, "我的手动补充"); assert.equal(refreshed.title, "我的角色");
  assert.equal(refreshed.import_snapshot!.rules[0]!.content, "新规则");
  assert.equal(frozen.import_snapshot!.rules[0]!.content, snapshot.rules[0]!.content);
  assert.throws(() => reopened.service.import({ ...changed, config_root: "/different" }, all(changed), { character_id: edited.character_id, expected_revision: 3 }), errorCode("character.invalid"));
});

test("all five runtimes retain project scope and conditional rules, and shared Skills keep real source identity", t => {
  const { home, discover } = fixture(t), project = join(home, "project");
  mkdirSync(project);
  put(join(home, ".codex/AGENTS.md"), "codex"); put(join(home, ".claude/CLAUDE.md"), "claude");
  put(join(home, ".cursor/AGENTS.md"), "cursor"); put(join(home, ".config/opencode/AGENTS.md"), "open");
  put(join(home, ".grok/GROK.md"), "grok");
  put(join(home, ".agents/skills/shared/SKILL.md"), "shared");
  put(join(project, "AGENTS.md"), "project agent"); put(join(project, "CLAUDE.md"), "project claude");
  put(join(project, ".cursor/rules/types.mdc"), "---\nglobs: '*.ts'\nalwaysApply: false\n---\nTypeScript 原文");
  put(join(project, ".claude/rules/api.md"), "---\npaths:\n  - api/**\n---\nAPI 原文");
  const candidates = discover.discover({ project_root: project });
  assert.equal(candidates.length, 5);
  for (const candidate of candidates) assert.ok(candidate.snapshot.rules.some(rule => rule.scope === "project"));
  assert.match(candidates.find(candidate => candidate.snapshot.runtime_id === "cursor")!.snapshot.rules.find(rule => rule.path.endsWith("types.mdc"))!.condition!, /globs/);
  assert.match(candidates.find(candidate => candidate.snapshot.runtime_id === "claude-code")!.snapshot.rules.find(rule => rule.path.endsWith("api.md"))!.condition!, /paths/);
  for (const runtime of ["codex", "cursor", "opencode"]) assert.ok(candidates.find(candidate => candidate.snapshot.runtime_id === runtime)!.snapshot.skills.some(skill => skill.path.endsWith(".agents/skills/shared")));
});

test("manual directories, credentials, traversal, symlink escapes and oversize files cannot silently enter the snapshot", t => {
  const { home, discover } = fixture(t), root = join(home, "custom"), skill = join(root, "skills/safe");
  put(join(root, "AGENTS.md"), "safe"); put(join(skill, "SKILL.md"), "Read references.");
  put(join(skill, ".env"), "PRIVATE"); put(join(skill, "node_modules/pkg/file.md"), "DEPENDENCY");
  put(join(home, "outside.txt"), "OUTSIDE"); symlinkSync(join(home, "outside.txt"), join(skill, "leak.txt"));
  put(join(skill, "too-big.txt"), "x".repeat(CHARACTER_IMPORT_LIMITS.fileBytes + 1));
  const candidate = discover.discover({ runtime_id: "codex", config_root: root })[0]!;
  assert.deepEqual(candidate.snapshot.skills[0]!.files.map(file => file.path), ["SKILL.md"]);
  assert.equal(candidate.snapshot.skills[0]!.compatibility, "native-only");
  assert.ok(candidate.warnings.some(warning => warning.includes(".env"))); assert.ok(candidate.warnings.some(warning => warning.includes("leak.txt")));
  assert.ok(candidate.warnings.some(warning => warning.includes("too-big")));
  assert.throws(() => discover.discover({ config_root: root })); assert.throws(() => discover.discover({ runtime_id: "codex", config_root: "relative" }));
  const snapshot = candidate.snapshot;
  for (const path of ["../outside", "/absolute", "foo/../../outside", "C:\\secret", "foo//bar"]) {
    assert.throws(() => parseCharacterImportSnapshot({ ...snapshot, skills: [{ ...snapshot.skills[0], files: [{ path, encoding: "utf8", content: "malicious" }] }] }));
  }
});

test("an agent symlink to Grok never becomes a Cursor executable, while discovery never executes it", t => {
  const { home, discover } = fixture(t), binary = join(home, ".grok/bin/grok");
  put(binary, "#!/bin/sh\nexit 123\n"); chmodSync(binary, 0o755);
  mkdirSync(join(home, ".local/bin"), { recursive: true }); symlinkSync(binary, join(home, ".local/bin/agent"));
  assert.equal(discover.executable("grok-build"), realpathSync(binary));
  assert.equal(discover.executable("cursor"), null);
});

test("Codex plugin installation metadata selects only unambiguous installed versions and Claude uses exact index paths", t => {
  const { home, discover } = fixture(t), root = join(home, ".codex");
  put(join(root, "config.toml"), '[plugins."active@personal"]\nenabled = true\n[plugins."disabled@personal"]\nenabled = false\n');
  for (const [name, version] of [["active", "1"], ["orphan", "1"], ["disabled", "1"]]) {
    const plugin = join(root, "plugins/cache/personal", name!, version!);
    put(join(plugin, ".codex-plugin/plugin.json"), JSON.stringify({ skills: "./skills" }));
    put(join(plugin, "skills/review/SKILL.md"), name!);
  }
  const remote = join(root, "plugins/cache/remote/remote-skill");
  put(join(remote, ".codex-remote-plugin-install.json"), JSON.stringify({ schema_version: 1, remote_plugin_id: "installed" }));
  put(join(remote, "2/.codex-plugin/plugin.json"), JSON.stringify({ skills: "./skills" })); put(join(remote, "2/skills/review/SKILL.md"), "remote");
  const codex = discover.discover({ runtime_id: "codex" })[0]!;
  assert.deepEqual(codex.snapshot.skills.map(skill => skill.files[0]!.content).sort(), ["active", "remote"]);
  put(join(root, "plugins/cache/personal/active/2/.codex-plugin/plugin.json"), JSON.stringify({ skills: "./skills" }));
  put(join(root, "plugins/cache/personal/active/2/skills/review/SKILL.md"), "ambiguous");
  const ambiguous = discover.discover({ runtime_id: "codex" })[0]!;
  assert.equal(ambiguous.snapshot.skills.length, 1); assert.ok(ambiguous.warnings.some(warning => warning.includes("未唯一确定")));
  const claude = join(home, ".claude"), plugin = join(claude, "plugins/cache/market/plugin/3");
  put(join(claude, "settings.json"), JSON.stringify({ enabledPlugins: { "plugin@market": true } }));
  put(join(claude, "plugins/installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "plugin@market": [{ scope: "user", installPath: plugin }] } }));
  put(join(plugin, ".claude-plugin/plugin.json"), JSON.stringify({ skills: ["./methods"] })); put(join(plugin, "methods/check/SKILL.md"), "claude plugin");
  assert.equal(discover.discover({ runtime_id: "claude-code" })[0]!.snapshot.skills[0]!.files[0]!.content, "claude plugin");
});


test("installed Skill root symlinks preserve packages while resource links cannot leave the package", t => {
  const { home, discover } = fixture(t), source = join(home, "source/method"), skills = join(home, ".codex/skills");
  put(join(source, "SKILL.md"), "Use references/tokens.md."); put(join(source, "references/tokens.md"), "Design token documentation.");
  put(join(home, "unrelated.txt"), "Not in this package");
  symlinkSync(join(home, "unrelated.txt"), join(source, "leak.txt"));
  mkdirSync(skills, { recursive: true }); symlinkSync(source, join(skills, "method"));
  mkdirSync(join(home, ".agents/skills"), { recursive: true }); symlinkSync(source, join(home, ".agents/skills/method"));
  const candidate = discover.discover({ runtime_id: "codex" })[0]!;
  assert.equal(candidate.snapshot.skills.length, 1);
  assert.deepEqual(candidate.snapshot.skills[0]!.files.map(file => file.path), ["SKILL.md", "references/tokens.md"]);
  assert.ok(candidate.warnings.some(warning => warning.includes("leak.txt")));
});

test("Claude plugin defaults and custom Skill paths respect effective enabled state", t => {
  const { home, discover } = fixture(t), root = join(home, ".claude"), plugin = join(root, "plugins/cache/market/default/1");
  put(join(root, "plugins/installed_plugins.json"), JSON.stringify({ plugins: { "default@market": [{ scope: "user", installPath: plugin }] } }));
  put(join(plugin, ".claude-plugin/plugin.json"), JSON.stringify({ skills: "./custom" }));
  put(join(plugin, "skills/normal/SKILL.md"), "default"); put(join(plugin, "custom/extra/SKILL.md"), "extra");
  assert.equal(discover.discover({ runtime_id: "claude-code" })[0]!.snapshot.skills.length, 2);
  put(join(root, "settings.json"), JSON.stringify({ enabledPlugins: { "default@market": false } }));
  assert.equal(discover.discover({ runtime_id: "claude-code" })[0]!.snapshot.skills.length, 0);
  put(join(root, "settings.json"), "{}");
  const marketplace = join(root, "plugins/marketplaces/market");
  put(join(root, "plugins/known_marketplaces.json"), JSON.stringify({ market: { installLocation: marketplace } }));
  put(join(marketplace, ".claude-plugin/marketplace.json"), JSON.stringify({ plugins: [{ name: "default", defaultEnabled: false }] }));
  assert.equal(discover.discover({ runtime_id: "claude-code" })[0]!.snapshot.skills.length, 0);
});

test("large imported resources publish through the real Artifact store and survive reopening", async t => {
  const { home } = fixture(t);
  const { default: Database } = await import("better-sqlite3");
  const { ArtifactsModule, createArtifactsSchema } = await import("@molis-ai/molis-work-module-artifacts");
  const filename = join(home, "artifacts.sqlite"), db = new Database(filename);
  db.exec("CREATE TABLE boards (board_id TEXT PRIMARY KEY); INSERT INTO boards VALUES ('board'); CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, board_id TEXT);");
  createArtifactsSchema(db);
  const artifacts = new ArtifactsModule({ db, now: () => "2026-09-23T00:00:00Z", appendEvent: event => Number(db.prepare("INSERT INTO events (board_id) VALUES (?)").run(event.boardId).lastInsertRowid) });
  const characterDb = openCharacters(join(home, "personal"), "actor");
  const binary = Buffer.alloc(7 * 1024 * 1024, 0xff).toString("base64");
  const snapshot: CharacterImportSnapshot = { runtime_id: "codex", config_root: "/fixture/codex", captured_at: "2026-09-23T00:00:00Z", rules: [],
    skills: [{ id: "large", name: "large", path: "/fixture/codex/skills/large", description: "Large complete resource package", compatibility: "native-only",
      files: [{ path: "SKILL.md", encoding: "utf8", content: "Use the six bundled fixtures." }, ...Array.from({ length: 6 }, (_, index) => ({ path: `assets/${index}.bin`, encoding: "base64" as const, content: binary }))] }] };
  try {
    const { draft } = characterDb.service.import(snapshot, all(snapshot));
    const result = characterDb.service.publish(draft.character_id, draft.revision, content => artifacts.commands.registerVersion({
      board_id: "board", artifact_id: "large-character", version: 1, actor_id: "actor", artifact_type_id: "character.definition.v1", schema_version: 1,
      producer: { plugin_id: "io.molis.work.characters", plugin_version: "1", binding_signature: "official-characters-binding" },
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(content)) },
    }));
    assert.ok(result.artifact.size_bytes > 56_800_000);
  } finally { characterDb.close(); db.close(); }
  const reopened = new Database(filename);
  try {
    const records = new ArtifactsModule({ db: reopened, appendEvent: () => { throw new Error("read only"); } });
    const stored = records.query.getArtifactVersion("board", { artifact_id: "large-character", version: 1 });
    assert.ok(stored);
    const content = parseCharacterContent(stored.payload);
    assert.equal(content.import_snapshot!.skills[0]!.files.length, 7);
    for (const file of content.import_snapshot!.skills[0]!.files.slice(1)) assert.equal(file.content, binary);
  } finally { reopened.close(); }
});


test("Skill metadata reads folded and literal YAML scalars instead of exposing block indicators", t => {
  const { home, discover } = fixture(t), root = join(home, ".codex/skills");
  const examples = [
    { id: "social-content-strategy", name: "social-content-strategy", source: "name: social-content-strategy\ndescription: >-\n  Choose how Chinese, English, or bilingual social pieces should win\n  before drafting by routing among entertaining, utility, product,\n  opinion, story, and case-led strategies.\n", description: "Choose how Chinese, English, or bilingual social pieces should win before drafting by routing among entertaining, utility, product, opinion, story, and case-led strategies." },
    { id: "optimize-text-mesh-pro", name: "optimize-text-mesh-pro", source: "name: optimize-text-mesh-pro\ndescription: >\n  Covers TextMeshPro font stacks, dynamic fallback atlases, padding and\n  sampling ratios, SDF16, AutoSize discipline, worldspace vs UGUI, and Memory\n  Profiler font-data capture.\n", description: "Covers TextMeshPro font stacks, dynamic fallback atlases, padding and sampling ratios, SDF16, AutoSize discipline, worldspace vs UGUI, and Memory Profiler font-data capture.\n" },
    { id: "literal", name: "Literal\nname", source: "name: |-\n  Literal\n  name\ndescription: |\n  Keep the first line.\n  Keep the second line.\n\n  A separate paragraph.\nallowed-tools: Read\n", description: "Keep the first line.\nKeep the second line.\n\nA separate paragraph.\n" },
    { id: "folded-paragraphs", name: "Folded name", source: "name: >-\n  Folded\n  name\ndescription: >-\n  First line\n  continues.\n\n  Second paragraph.\n    Preserve indentation.\n  Last line.\n", description: "First line continues.\nSecond paragraph.\n  Preserve indentation.\nLast line." },
    { id: "explicit-indent", name: "Explicit", source: "name: Explicit\ndescription: |2+ # preserve trailing blank line\n  First line.\n  Second line.\n\n", description: "First line.\nSecond line.\n\n" },
  ];
  for (const example of examples) put(join(root, example.id, "SKILL.md"), `---\n${example.source}---\nFull original Skill body.\n`);
  const skills = discover.discover({ runtime_id: "codex" })[0]!.snapshot.skills;
  for (const example of examples) {
    const skill = skills.find(skill => skill.path.endsWith(`/${example.id}`))!;
    assert.equal(skill.name, example.name, example.id);
    assert.equal(skill.description, example.description, example.id);
    assert.equal(skill.files.find(file => file.path === "SKILL.md")!.content, `---\n${example.source}---\nFull original Skill body.\n`);
  }
});
