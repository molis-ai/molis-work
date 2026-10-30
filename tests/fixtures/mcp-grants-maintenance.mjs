#!/usr/bin/env node
// ACA005 explicit offline v2 -> v3; the runtime never reads v2. No grant, permission or enablement is changed.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { publishMaintenanceJson } from "./publish-maintenance-json.mjs";

const fields = ["client_id", "project_id", "capability_id", "version", "provider_id", "permissions", "enabled"];
const id = value => typeof value === "string" && value.trim().length > 0;
const inside = (file, root) => file === root || file.startsWith(root + path.sep);
export function inspectMcp(file) {
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).nlink !== 1) throw new Error("MCP preference must be an ordinary unlinked file");
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("invalid MCP preference JSON"); }
  if (!value || typeof value !== "object" || Object.keys(value).length !== 2 || ![2, 3].includes(value.version)
    || !Array.isArray(value.action_grants)) throw new Error("MCP preference version/shape mismatch");
  const keys = new Set();
  for (const row of value.action_grants) {
    const expected = value.version === 2 ? fields : [...fields, "generation"];
    if (!row || typeof row !== "object" || Object.keys(row).length !== expected.length || Object.keys(row).some(key => !expected.includes(key))
      || !id(row.client_id) || !(row.project_id === null || id(row.project_id)) || !id(row.capability_id) || !id(row.provider_id)
      || !Number.isSafeInteger(row.version) || row.version <= 0 || typeof row.enabled !== "boolean"
      || !Array.isArray(row.permissions) || !row.permissions.every(id) || (value.version === 3 && !id(row.generation))) throw new Error("MCP grant shape mismatch");
    const key = JSON.stringify([row.client_id, row.project_id, row.capability_id, row.version, row.provider_id]);
    if (keys.has(key)) throw new Error("duplicate MCP grant; no deduplication or write");
    keys.add(key);
  }
  return value;
}
const report = value => ({ version: value.version, grants: value.action_grants.length, enabled: value.action_grants.filter(row => row.enabled).length,
  clients: new Set(value.action_grants.map(row => row.client_id)).size });

export async function maintainMcp(file, backup, apply = false) {
  const before = inspectMcp(file);
  if (!apply || before.version === 3) return { ...report(before), changed: false };
  const home = fs.realpathSync(path.dirname(path.dirname(file)));
  const next = { version: 3, action_grants: before.action_grants.map(row => ({ ...row, generation: randomUUID() })) };
  publishMaintenanceJson(file, backup, next);
  const actual = await readMcpToolPreference(home);
  if (JSON.stringify(actual) !== JSON.stringify(next)) throw new Error("published preference readback mismatch; stop and use the external backup");
  return { ...report(actual), changed: true, backup };
}

async function main(args) {
  const command = args.shift(), take = name => { const at = args.indexOf(name); return at < 0 ? undefined : args.splice(at, 2)[1]; };
  const given = take("--database"), backup = take("--backup"), window = args.includes("--maintenance-window");
  if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !given || args.length) throw new Error("list|apply --database <copy>/config/mcp-tools.json [--backup <external new file>] [--maintenance-window]");
  const file = fs.realpathSync(given);
  if (path.basename(file) !== "mcp-tools.json" || path.basename(path.dirname(file)) !== "config") throw new Error("expected config/mcp-tools.json");
  if (inside(file, path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs its approved maintenance window");
  if (command === "apply" && !inside(file, fs.realpathSync(tmpdir())) && !window) throw new Error("apply outside a temporary Home needs --maintenance-window");
  process.stdout.write(JSON.stringify(await maintainMcp(file, backup && path.resolve(backup), command === "apply")) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
}
