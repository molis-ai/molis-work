import assert from "node:assert/strict";
import test from "node:test";
import { contentVersionChanges } from "../scripts/gates/content-versions.mjs";

// The content-version gate covers the methods of built-in plugins and the Skills of content packs, in every language.
const key = "method.planning-methods.work-design-plan";
const file = "packages/system-skills/planning-methods/skills/work-design-plan/SKILL.md";
const english = "packages/system-skills/planning-methods/skills/work-design-plan/SKILL.en.md";
const body = "---\nname: work-design-plan\nversion: 1\n---\n\n# 设计与规划\n";
const englishBody = "# Design and planning\n";
const table = (version: number) => JSON.stringify({ versions: { [key]: version } });
const run = (currentBody: string, currentEnglish: string, version: number, files = [file]) => {
  const before = new Map([["tooling/versions.json", table(1)], [file, body], [english, englishBody]]);
  const after = new Map([["tooling/versions.json", table(version)], [file, currentBody], [english, currentEnglish]]);
  return contentVersionChanges({ files, read: path => after.get(path) }, path => before.get(path));
};

test("content versions: a content pack Skill body that changes must advance its version, in either language", () => {
  assert.deepEqual(run(body, englishBody, 1), [], "unchanged body at the same version passes");
  assert.match(run(body.replace("设计与规划", "设计和规划"), englishBody, 1)[0] ?? "", /changed content without advancing its version/u);
  assert.deepEqual(run(body.replace("设计与规划", "设计和规划"), englishBody, 2), [], "a changed default body at the next version passes");
  assert.match(run(body, englishBody.replace("Design", "Designing"), 1, [english])[0] ?? "", /changed content without advancing its version/u);
  assert.deepEqual(run(body, englishBody.replace("Design", "Designing"), 2, [english]), [], "a changed translation is the same Skill and needs the same version");
  assert.match(run(body, englishBody, 2)[0] ?? "", /advanced without changing its content/u);
  assert.deepEqual(run(body, englishBody, 1, [english]), [], "the translation alone maps to the Skill's key");
  // 44B moves the system packs to packages/system-skills: an unchanged Skill that moved keeps its version, a changed one still advances.
  const moved = (currentBody: string, version: number) => {
    const before = new Map([["tooling/versions.json", table(1)], [file.replace("packages/system-skills/", "plugins/content/"), body]]);
    const after = new Map([["tooling/versions.json", table(version)], [file, currentBody]]);
    const old = file.replace("packages/system-skills/", "plugins/content/");
    return contentVersionChanges({ files: [old, file], read: (path: string) => after.get(path) }, (path: string) => before.get(path));
  };
  assert.deepEqual(moved(body, 1), [], "a moved Skill is compared with where it was");
  assert.match(moved(body.replace("设计与规划", "设计和规划"), 1)[0] ?? "", /changed content without advancing its version/u);
  // Only the old path of a moved Skill is let go: deleting one language of a Skill in place is still a change.
  const en = file.replace(/SKILL\.md$/u, "SKILL.en.md");
  const deleted = contentVersionChanges({ files: [file, en], read: (path: string) => (path === file ? body : path === "tooling/versions.json" ? table(1) : undefined) },
    (path: string) => (path === "tooling/versions.json" ? table(1) : path === file || path === en ? body : undefined));
  assert.match(deleted[0] ?? "", /changed content without advancing its version/u, "a deleted translation needs a new version");
});

test("content versions: Shelf's prompts moved to its Module (44B) are versioned there and compared with where they were", () => {
  const now = "modules/shelf/prompts/shelf.translate.md", was = "plugins/native/shelf/prompts/shelf.translate.md", prompt = "version: 1\n把下面的文字翻译成中文。\n";
  const versions = (version: number) => JSON.stringify({ versions: { "prompt.shelf.translate": version } });
  const check = (current: string, version: number) => contentVersionChanges({ files: [was, now],
    read: (path: string) => (path === now ? current : path === "tooling/versions.json" ? versions(version) : undefined) },
    (path: string) => (path === was ? prompt : path === "tooling/versions.json" ? versions(1) : undefined));
  assert.deepEqual(check(prompt, 1), [], "an unchanged moved prompt keeps its version");
  assert.match(check(prompt.replace("中文", "英文"), 1)[0] ?? "", /changed content without advancing its version/u);
  assert.deepEqual(check(prompt.replace("中文", "英文"), 2), []);
});

test("content versions: covers horizontal prompts, modules prompts (including language-suffixed ids), and packages/system-skills", () => {
  const runCase = (
    versionsBefore: Record<string, number>,
    versionsAfter: Record<string, number>,
    beforeFiles: Record<string, string>,
    afterFiles: Record<string, string>,
    changedPaths: string[],
  ) => {
    const before = new Map<string, string>([["tooling/versions.json", JSON.stringify({ versions: versionsBefore })], ...Object.entries(beforeFiles)]);
    const after = new Map<string, string>([["tooling/versions.json", JSON.stringify({ versions: versionsAfter })], ...Object.entries(afterFiles)]);
    return contentVersionChanges({ files: changedPaths, read: (path: string) => after.get(path) }, (path: string) => before.get(path));
  };

  // horizontal/plugin-studio/prompts/*.md & *.en.md
  const studioPrompt = "horizontal/plugin-studio/prompts/plugin-builder.designer.md";
  const studioPromptEn = "horizontal/plugin-studio/prompts/plugin-builder.designer.en.md";
  assert.match(
    runCase(
      { "prompt.plugin-builder.designer": 4 },
      { "prompt.plugin-builder.designer": 4 },
      { [studioPrompt]: "旧正文\n", [studioPromptEn]: "Old body\n" },
      { [studioPrompt]: "新正文\n", [studioPromptEn]: "Old body\n" },
      [studioPrompt],
    )[0] ?? "",
    /prompt\.plugin-builder\.designer changed content without advancing its version/u,
  );
  assert.deepEqual(
    runCase(
      { "prompt.plugin-builder.designer": 4 },
      { "prompt.plugin-builder.designer": 5 },
      { [studioPrompt]: "旧正文\n", [studioPromptEn]: "Old body\n" },
      { [studioPrompt]: "旧正文\n", [studioPromptEn]: "New English body\n" },
      [studioPromptEn],
    ),
    [],
    "horizontal/plugin-studio English prompt maps to prompt.plugin-builder.designer",
  );

  // modules/*/prompts/*.md (both regular prompts and language-suffixed ids like shelf.translate.en)
  const shelfPrompt = "modules/shelf/prompts/shelf.brief.md";
  const shelfPromptEn = "modules/shelf/prompts/shelf.brief.en.md";
  assert.match(
    runCase(
      { "prompt.shelf.brief": 2 },
      { "prompt.shelf.brief": 2 },
      { [shelfPrompt]: "摘要\n", [shelfPromptEn]: "Brief\n" },
      { [shelfPrompt]: "摘要\n", [shelfPromptEn]: "Updated brief\n" },
      [shelfPromptEn],
    )[0] ?? "",
    /prompt\.shelf\.brief changed content without advancing its version/u,
  );
  const shelfTranslateEn = "modules/shelf/prompts/shelf.translate.en.md";
  const shelfTranslateEnLocalized = "modules/shelf/prompts/shelf.translate.en.en.md";
  assert.match(
    runCase(
      { "prompt.shelf.translate.en": 2 },
      { "prompt.shelf.translate.en": 2 },
      { [shelfTranslateEn]: "译成英文\n", [shelfTranslateEnLocalized]: "Translate to English\n" },
      { [shelfTranslateEn]: "译成更自然的英文\n", [shelfTranslateEnLocalized]: "Translate to English\n" },
      [shelfTranslateEn],
    )[0] ?? "",
    /prompt\.shelf\.translate\.en changed content without advancing its version/u,
  );
  assert.deepEqual(
    runCase(
      { "prompt.shelf.translate.en": 2 },
      { "prompt.shelf.translate.en": 3 },
      { [shelfTranslateEn]: "译成英文\n", [shelfTranslateEnLocalized]: "Translate to English\n" },
      { [shelfTranslateEn]: "译成英文\n", [shelfTranslateEnLocalized]: "Translate clearly into English\n" },
      [shelfTranslateEnLocalized],
    ),
    [],
    "modules/shelf language-suffixed prompt id resolves cleanly for its .en.md translation",
  );

  // packages/system-skills/*/skills/*/SKILL*.md
  const systemSkill = "packages/system-skills/planning-methods/skills/work-design-plan/SKILL.md";
  const systemSkillEn = "packages/system-skills/planning-methods/skills/work-design-plan/SKILL.en.md";
  assert.match(
    runCase(
      { "method.planning-methods.work-design-plan": 1 },
      { "method.planning-methods.work-design-plan": 1 },
      { [systemSkill]: body, [systemSkillEn]: englishBody },
      { [systemSkill]: body, [systemSkillEn]: "# Updated design\n" },
      [systemSkillEn],
    )[0] ?? "",
    /method\.planning-methods\.work-design-plan changed content without advancing its version/u,
  );
  assert.deepEqual(
    runCase(
      { "method.planning-methods.work-design-plan": 1 },
      { "method.planning-methods.work-design-plan": 2 },
      { [systemSkill]: body, [systemSkillEn]: englishBody },
      { [systemSkill]: body.replace("设计与规划", "设计和规划"), [systemSkillEn]: englishBody },
      [systemSkill],
    ),
    [],
    "packages/system-skills Skill bump passes when version advances",
  );

  // Nested reply-language prompts map to prompt.reply-language
  const replyEn = "apps/local-host/prompts/reply-language/en.md";
  assert.match(
    runCase(
      { "prompt.reply-language": 2 },
      { "prompt.reply-language": 2 },
      { [replyEn]: "Reply in English.\n" },
      { [replyEn]: "Always reply in English.\n" },
      [replyEn],
    )[0] ?? "",
    /prompt\.reply-language changed content without advancing its version/u,
  );
  assert.deepEqual(
    runCase(
      { "prompt.reply-language": 2 },
      { "prompt.reply-language": 3 },
      { [replyEn]: "Reply in English.\n" },
      { [replyEn]: "Always reply in English.\n" },
      [replyEn],
    ),
    [],
  );

  // Skill references/*.md map to their owning Skill's version key
  const skillRefEn = "plugins/content/design-accessibility/skills/accessibility-review/references/checklist.en.md";
  assert.match(
    runCase(
      { "method.design-accessibility.accessibility-review": 2 },
      { "method.design-accessibility.accessibility-review": 2 },
      { [skillRefEn]: "# Checklist\n" },
      { [skillRefEn]: "# Updated Checklist\n" },
      [skillRefEn],
    )[0] ?? "",
    /method\.design-accessibility\.accessibility-review changed content without advancing its version/u,
  );

  // Composed todo.organize.basic also tracks dependent prompt.todo.organize.organizer
  const todoBasic = "plugins/native/todo/prompts/todo.organize.basic.md";
  const todoErrors = runCase(
    { "prompt.todo.organize.basic": 2, "prompt.todo.organize.organizer": 3 },
    { "prompt.todo.organize.basic": 3, "prompt.todo.organize.organizer": 3 },
    { [todoBasic]: "旧基础整理\n" },
    { [todoBasic]: "新基础整理\n" },
    [todoBasic],
  );
  assert.match(todoErrors[0] ?? "", /prompt\.todo\.organize\.organizer changed content without advancing its version/u);
});
