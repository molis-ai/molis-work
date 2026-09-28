import fs from "node:fs";
import path from "node:path";

/**
 * Every workspace package README carries a `## 开发要求` section (docs/system/DEVELOPMENT-REQUIREMENTS.md): what it
 * owns and does not, its public entry, its dependencies, the invariants a change must keep, the tests to run and the
 * handbooks to read. The check keeps that section true: dependencies match package.json, every listed test and link
 * exists. Wording stays with the people who own the package.
 */
export const DEV_REQUIREMENTS_HEADING = "## 开发要求";
const LABELS = ["负责", "不负责", "公开入口", "依赖", "不变量", "改动后必跑", "相关手册"];
const WORKSPACE_NAME = /@molis-ai\/molis-work-[a-z0-9-]+/gu;
const TEST_PATH = /tests\/[^\s`，、；）)]+\.test\.(?:ts|mjs)/gu;
const LINK = /\]\(([^)\s]+)\)/gu;

export function devRequirementsSection(readme) {
  const start = readme.indexOf(`\n${DEV_REQUIREMENTS_HEADING}\n`);
  if (start < 0) return undefined;
  const body = readme.slice(start + DEV_REQUIREMENTS_HEADING.length + 2);
  const next = body.search(/^## /mu);
  return next < 0 ? body : body.slice(0, next);
}

/** The dependency line a package's section must carry, derived from its package.json. */
export function expectedDependencyNames(manifest) {
  return Object.keys(manifest.dependencies ?? {}).filter(name => name.startsWith("@molis-ai/molis-work-")).sort();
}

export function checkDevRequirements(repositoryRoot, item, readme, manifest) {
  const errors = [];
  const where = `${item.path}/README.md`;
  const section = devRequirementsSection(readme);
  if (section === undefined) return [`${where}: missing "${DEV_REQUIREMENTS_HEADING}" section`];
  const line = label => section.split("\n").find(text => text.startsWith(`- ${label}：`));
  for (const label of LABELS) if (!line(label)) errors.push(`${where}: 开发要求 missing "- ${label}："`);
  const lines = section.split("\n"), at = lines.findIndex(text => text.startsWith("- 不变量："));
  let invariants = 0;
  while (at >= 0 && lines[at + 1 + invariants]?.startsWith("  - ")) invariants++;
  if (at >= 0 && invariants === 0) errors.push(`${where}: 开发要求 lists no invariant under "- 不变量："`);
  if (line("公开入口") && !line("公开入口").includes(`\`${item.name}\``)) errors.push(`${where}: 公开入口 must name \`${item.name}\``);

  const dependencies = line("依赖");
  if (dependencies) {
    const named = [...new Set(dependencies.match(WORKSPACE_NAME) ?? [])].sort();
    const actual = expectedDependencyNames(manifest);
    const stale = named.filter(name => !actual.includes(name));
    const missing = dependencies.includes("组合根") ? [] : actual.filter(name => !named.includes(name));
    if (stale.length) errors.push(`${where}: 依赖 names packages not in package.json: ${stale.join(", ")}`);
    if (missing.length) errors.push(`${where}: 依赖 is missing ${missing.join(", ")}`);
  }

  const run = line("改动后必跑");
  if (run && !(run.match(TEST_PATH)?.length)) errors.push(`${where}: 改动后必跑 lists no test file`);
  for (const test of new Set(section.match(TEST_PATH) ?? [])) {
    if (!fs.existsSync(path.join(repositoryRoot, test))) errors.push(`${where}: 开发要求 names missing test ${test}`);
  }
  for (const [, target] of section.matchAll(LINK)) {
    if (/^[a-z]+:/u.test(target)) continue;
    const file = decodeURI(target.split("#")[0]);
    if (file && !fs.existsSync(path.resolve(repositoryRoot, item.path, file))) errors.push(`${where}: 开发要求 links missing ${target}`);
  }
  return errors;
}
