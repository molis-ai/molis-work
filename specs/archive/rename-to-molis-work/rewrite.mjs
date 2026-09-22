#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "target", "vendor", "coverage", "release",
  ".pnpm-store", ".goalboard", ".molis-work",
]);
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".mts", ".json", ".md", ".html", ".css",
  ".toml", ".rs", ".sh", ".yml", ".yaml", ".txt", ".sql", ".svg", ".lock",
  ".xml", ".plist", ".gitignore", ".npmrc", ".editorconfig",
]);
const SKIP_FILES = new Set([
  "specs/archive/rename-to-molis-work/spec.md",
  "specs/archive/rename-to-molis-work/rewrite.mjs",
]);

function walk(directory, files = []) {
  for (const name of fs.readdirSync(directory)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(directory, name);
    const rel = path.relative(root, full);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full, files);
    else files.push(rel);
  }
  return files;
}

function rewrite(source) {
  const demo = "\u0000DEMO_BOARD_ID\u0000";
  let s = source.replaceAll("goalboard-v1-demo", demo);

  s = s.replaceAll("@adeptify/goalboard", "@molis-ai/molis-work");
  s = s.replaceAll("github.com/adeptify/goalboard", "github.com/molis-ai/molis-work");
  s = s.replaceAll("github.com/adeptify/GoalBoard", "github.com/molis-ai/molis-work");
  s = s.replaceAll("github.com/molis-ai/GoalBoard", "github.com/molis-ai/molis-work");
  s = s.replaceAll("github.com/adeptify/Molis Work", "github.com/molis-ai/molis-work");
  s = s.replaceAll("com.adeptify.goalboard", "com.molis.work");
  s = s.replaceAll("io\\.goalboard", "io\\.molis\\.work");
  s = s.replaceAll("io.goalboard", "io.molis.work");
  s = s.replaceAll("GOALBOARD_", "MOLIS_WORK_");
  s = s.replaceAll("GOALBOARD", "MOLIS_WORK");
  s = s.replaceAll("goalboard_v1_", "molis_work_v1_");
  s = s.replaceAll("goalboard_", "molis_work_");
  s = s.replaceAll("_goalboard", "_molis_work");
  s = s.replace(/goalboard([A-Z])/g, "molisWork$1");
  s = s.replaceAll("mcp_servers.goalboard", "mcp_servers.molis-work");
  s = s.replaceAll('".goalboard"', '".molis-work"');
  s = s.replaceAll("'.goalboard'", "'.molis-work'");
  s = s.replaceAll("~/.goalboard", "~/.molis-work");
  s = s.replaceAll("/.goalboard", "/.molis-work");
  s = s.replaceAll("goalboard.db", "molis-work.db");
  s = s.replaceAll(".goalboard-build.json", ".molis-work-build.json");
  s = s.replaceAll("x-goalboard-", "x-molis-work-");
  s = s.replaceAll("name=\"goalboard-control-token\"", "name=\"molis-work-control-token\"");
  s = s.replaceAll("name='goalboard-control-token'", "name='molis-work-control-token'");
  s = s.replace(/(\w|\])\.goalboard\b/g, '$1["molis-work"]');
  s = s.replaceAll("GoalBoard", "MolisWork");
  s = s.replaceAll("goalboard", "molis-work");
  s = s.replace(/\bMolisWork\b/g, "Molis Work");
  return s.replaceAll(demo, "goalboard-v1-demo");
}

const files = walk(root).filter((rel) => {
  if (SKIP_FILES.has(rel)) return false;
  const ext = path.extname(rel).toLowerCase();
  if (rel === "pnpm-lock.yaml" || rel.endsWith("Cargo.lock")) return true;
  if (rel === "pnpm-workspace.yaml") return true;
  if (!ext && path.basename(rel) === "Dockerfile") return true;
  return TEXT_EXT.has(ext);
});

let changed = 0;
for (const rel of files) {
  const full = path.join(root, rel);
  const original = fs.readFileSync(full, "utf8");
  const next = rewrite(original);
  if (next !== original) {
    fs.writeFileSync(full, next);
    changed += 1;
  }
}

const pluginBin = path.join(root, "tooling/plugin-cli/bin/goalboard-plugin.mjs");
if (fs.existsSync(pluginBin)) {
  fs.renameSync(pluginBin, path.join(root, "tooling/plugin-cli/bin/molis-work-plugin.mjs"));
}

console.log(JSON.stringify({ scanned: files.length, changed }, null, 2));
