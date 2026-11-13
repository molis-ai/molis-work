#!/usr/bin/env node
// Read-only index for specs/backlog. This is not a merge gate: it only prints
// the records that scripts/gates/backlog-rows.mjs already parses, with the
// grouping and filters a person needs when the backlog is large.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "specs/backlog");
const ROW = /^\|\s*(BL-(?:\d+|[a-z][a-z0-9-]*))\s*\|/;

function cells(line) {
  return line.split(/(?<!\\)\|/).slice(1, -1).map((cell) => cell.trim());
}

function readRecords() {
  const records = [];
  for (const file of readdirSync(DIR).filter((name) => /^BL-.*\.md$/.test(name)).sort()) {
    const text = readFileSync(path.join(DIR, file), "utf8");
    const line = text.split("\n").find((entry) => ROW.test(entry));
    if (!line) continue;
    const group = (text.match(/^分组：(.+)$/m) ?? [])[1] ?? "";
    const [id, title, source, type, why, dependency, priority, owner] = cells(line);
    records.push({ id, group, title, source, type, why, dependency, priority, owner, file });
  }
  return records;
}

function count(records, key) {
  const counts = new Map();
  for (const record of records) counts.set(record[key] || "(空)", (counts.get(record[key] || "(空)") ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function has(name) {
  return process.argv.includes(name);
}

const records = readRecords();
const group = option("--group");
const type = option("--type");
const priority = option("--priority");
const owner = option("--owner");
const filtered = records.filter((record) =>
  (group === undefined || record.group === group || (record.group ?? "").startsWith(group)) &&
  (type === undefined || record.type === type) &&
  (priority === undefined || record.priority === priority) &&
  (owner === undefined || (record.owner ?? "").includes(owner)));

if (has("--json")) {
  console.log(JSON.stringify(filtered, null, 2));
} else {
  console.log(`# backlog index\n`);
  console.log(`总计 ${records.length} 条；筛选后 ${filtered.length} 条。\n`);
  if (has("--list") || group !== undefined || type !== undefined || priority !== undefined || owner !== undefined) {
    for (const record of filtered) {
      console.log(`${record.id}\t${record.group}\t${record.type}\t${record.priority}\t${record.owner}\t${record.title}`);
    }
    console.log("");
  }
  for (const [label, key] of [["分组", "group"], ["类型", "type"], ["优先级", "priority"]]) {
    console.log(`${label}: ${count(records, key).map(([value, amount]) => `${value}=${amount}`).join("；")}\n`);
  }
  if (!has("--quiet")) {
    console.log("用法: node scripts/backlog-index.mjs [--group <前缀>] [--type <类型>] [--priority <高|中|低>] [--owner <片段>] [--list] [--json]");
  }
}
