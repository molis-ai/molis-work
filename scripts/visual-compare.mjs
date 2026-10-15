#!/usr/bin/env node
// Visual comparison of a branch against main (W4-12): the key surfaces of tests/visual-surfaces.e2e.test.ts at 1440, 1024
// and 390 wide, light and dark, captured in Chrome on this Mac for both trees and diffed pixel by pixel.
//
//   node scripts/visual-compare.mjs [--base <ref>] [--base-tree <dir>] [--out <dir>] [--tolerance <0-255>] [--max-ratio <0-1>]
//   node scripts/visual-compare.mjs --compare <base pictures> <head pictures> [--out <dir>]
//
// The head is this checkout, built (`pnpm build`). The base is a detached worktree at the merge-base of HEAD and --base
// (default origin/main), made, installed offline and built here once, and kept for the next run (the path is printed);
// --base-tree uses a tree you built yourself. Both trees run this checkout's capture test, so the same surfaces are taken
// the same way; each tree's own product code and fixtures draw them. Browser runs wait for the machine's browser slot,
// the base build for its build slot (scripts/machine-slot.mjs).
//
// Out (default .impeccable/qa/review/visual/compare, ignored): base/ and head/ pictures, diff/ for each changed one,
// report.html side by side, report.json. A pixel counts as changed when a channel moves by more than --tolerance, and a
// picture when more than --max-ratio of its pixels do, its size changed, or it is missing on one side. Both default to 0:
// two captures of the same tree come out identical to the pixel (the capture test pins the clock and waits for a still
// page), so any difference is the branch's. Exit 1 when any picture changed, 2 on misuse.

import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { decodePng, diffImages, encodePng } from "./visual/png.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const CAPTURE = "tests/visual-surfaces.e2e.test.ts";

function parse(argv) {
  const options = { base: "origin/main", baseTree: null, out: join(ROOT, ".impeccable/qa/review/visual/compare"), tolerance: 0, maxRatio: 0, compare: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = () => { const next = argv[++i]; if (next === undefined) usage(`${flag} needs a value`); return next; };
    if (flag === "--base") options.base = value();
    else if (flag === "--base-tree") options.baseTree = resolve(value());
    else if (flag === "--out") options.out = resolve(value());
    else if (flag === "--tolerance") options.tolerance = number(value(), 0, 255, flag);
    else if (flag === "--max-ratio") options.maxRatio = number(value(), 0, 1, flag);
    else if (flag === "--compare") options.compare = [resolve(value()), resolve(value())];
    else usage(`unknown argument ${flag}`);
  }
  return options;
}

function number(text, min, max, flag) {
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) usage(`${flag} takes a number from ${min} to ${max}`);
  return value;
}

function usage(message) {
  process.stderr.write(`visual-compare: ${message}\n`);
  process.exit(2);
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed in ${cwd} (exit ${result.status})`);
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();

/** The merge-base tree, installed and built once; kept at a path named for its commit. */
function baseTree(ref) {
  const commit = git("merge-base", "HEAD", ref);
  const tree = join(tmpdir(), `molis-work-visual-base-${commit.slice(0, 12)}`);
  if (existsSync(join(tree, ".visual-base-ready"))) return tree;
  if (existsSync(tree)) git("worktree", "remove", "--force", tree);
  git("worktree", "add", "--detach", tree, commit);
  run("pnpm", ["install", "--frozen-lockfile", "--offline"], tree);
  run(process.execPath, [join(ROOT, "scripts/machine-slot.mjs"), "run", "build", "--label", "visual-base", "--", "pnpm", "build"], tree);
  writeFileSync(join(tree, ".visual-base-ready"), commit + "\n");
  return tree;
}

function capture(tree, out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  if (tree !== ROOT) copyFileSync(join(ROOT, CAPTURE), join(tree, CAPTURE));
  run(process.execPath, ["scripts/run-tests.mjs", CAPTURE], tree, { MOLIS_WORK_VISUAL_OUT: out });
}

const pictures = directory => {
  const file = join(directory, "manifest.json");
  if (!existsSync(file)) usage(`no manifest.json in ${directory}: not a finished capture`);
  return JSON.parse(readFileSync(file, "utf8")).pictures;
};

function compare(baseDirectory, headDirectory, options) {
  const names = [...new Set([...pictures(baseDirectory), ...pictures(headDirectory)])];
  const diffDirectory = join(options.out, "diff");
  rmSync(diffDirectory, { recursive: true, force: true });
  mkdirSync(diffDirectory, { recursive: true });
  const rows = names.map(name => {
    const basePath = join(baseDirectory, `${name}.png`), headPath = join(headDirectory, `${name}.png`);
    if (!existsSync(basePath) || !existsSync(headPath)) return { name, changed: true, ratio: 1, note: existsSync(basePath) ? "missing on the branch" : "new on the branch" };
    const result = diffImages(decodePng(readFileSync(basePath)), decodePng(readFileSync(headPath)), options.tolerance);
    const ratio = result.changed / result.total;
    const changed = result.sizeChanged || ratio > options.maxRatio;
    if (result.changed) writeFileSync(join(diffDirectory, `${name}.png`), encodePng(result.image));
    return { name, changed, ratio, pixels: result.changed, note: result.sizeChanged ? "size changed" : "" };
  }).sort((a, b) => b.ratio - a.ratio || a.name.localeCompare(b.name));
  writeFileSync(join(options.out, "report.json"), JSON.stringify({ tolerance: options.tolerance, max_ratio: options.maxRatio, pictures: rows }, null, 2) + "\n");
  writeFileSync(join(options.out, "report.html"), report(rows, baseDirectory, headDirectory, options.out));
  return rows;
}

const escape = text => String(text).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function report(rows, baseDirectory, headDirectory, out) {
  const image = (directory, name) => existsSync(join(directory, `${name}.png`)) ? `<img src="${escape(relative(out, join(directory, `${name}.png`)))}" alt="">` : "<p>—</p>";
  const sections = rows.map(row => `<section class="${row.changed ? "changed" : "same"}"><h2>${escape(row.name)} · ${(row.ratio * 100).toFixed(3)}%${row.note ? " · " + escape(row.note) : ""}</h2>
<div class="row"><figure><figcaption>main</figcaption>${image(baseDirectory, row.name)}</figure><figure><figcaption>branch</figcaption>${image(headDirectory, row.name)}</figure><figure><figcaption>diff</figcaption>${image(join(out, "diff"), row.name)}</figure></div></section>`).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Visual comparison</title>
<style>body{font:14px system-ui;margin:16px;background:#fff;color:#111}h2{font-size:14px;margin:24px 0 8px}.same h2{color:#666}.changed h2{color:#b00}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}figure{margin:0}img{width:100%;border:1px solid #ddd}figcaption{color:#666;font-size:12px}</style>
<h1>Visual comparison: ${rows.filter(row => row.changed).length} of ${rows.length} pictures changed</h1>
${sections}\n`;
}

const options = parse(process.argv.slice(2));
mkdirSync(options.out, { recursive: true });
let baseDirectory, headDirectory;
if (options.compare) [baseDirectory, headDirectory] = options.compare;
else {
  baseDirectory = join(options.out, "base");
  headDirectory = join(options.out, "head");
  const tree = options.baseTree ?? baseTree(options.base);
  process.stdout.write(`visual-compare: base tree ${tree}${options.baseTree ? "" : " (kept for the next run; git worktree remove it when done)"}\n`);
  capture(tree, baseDirectory);
  capture(ROOT, headDirectory);
}
const rows = compare(baseDirectory, headDirectory, options);
const changed = rows.filter(row => row.changed);
for (const row of changed) process.stdout.write(`changed  ${row.name}  ${(row.ratio * 100).toFixed(3)}%${row.note ? "  " + row.note : ""}\n`);
process.stdout.write(`visual-compare: ${changed.length} of ${rows.length} pictures changed; report ${join(options.out, "report.html")}\n`);
process.exit(changed.length ? 1 : 0);
