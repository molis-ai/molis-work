import assert from "node:assert/strict";
import test from "node:test";
import { contentVersionChanges } from "../scripts/gates/content-versions.mjs";

// The content-version gate covers the methods of built-in plugins and the Skills of content packs, in every language.
const key = "method.planning-methods.work-design-plan";
const file = "plugins/content/planning-methods/skills/work-design-plan/SKILL.md";
const english = "plugins/content/planning-methods/skills/work-design-plan/SKILL.en.md";
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
    return contentVersionChanges({ files: changedPaths, read: path => after.get(path) }, path => before.get(path));
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
});
