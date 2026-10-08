import assert from "node:assert/strict";
import { existsSync, lstatSync, readdirSync, readlinkSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// specs/repository-anti-corruption §4.14 (W1-12): .cursor/skills linked molis-plugin-dev and molis-prologue-ai but not
// goal-advance, so Cursor never saw the Skill the product installs for every Runtime. Every Skill under skills/ is linked.
const root = fileURLToPath(new URL("..", import.meta.url));

test("every Skill under skills/ is linked from .cursor/skills, and every link points at one", () => {
  const skills = readdirSync(path.join(root, "skills"), { withFileTypes: true }).filter(item => item.isDirectory() && existsSync(path.join(root, "skills", item.name, "SKILL.md"))).map(item => item.name).sort();
  const links = readdirSync(path.join(root, ".cursor/skills")).sort();
  assert.deepEqual(links, skills, "a Skill without a link, or a link without a Skill");
  for (const name of skills) {
    const link = path.join(root, ".cursor/skills", name);
    assert.ok(lstatSync(link).isSymbolicLink(), `.cursor/skills/${name} is a symbolic link`);
    assert.equal(readlinkSync(link), `../../skills/${name}`);
    assert.ok(existsSync(path.join(link, "SKILL.md")), `.cursor/skills/${name} resolves to a Skill`);
  }
});
