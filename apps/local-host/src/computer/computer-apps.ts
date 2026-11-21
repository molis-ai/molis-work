import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { tierOf, type AppIdentity } from "./app-tiers.js";

const execFileAsync = promisify(execFile);

/** One verifiable local application discovered for the Computer Use forbidden-app picker (PF-A15). */
export interface DiscoveredComputerApp {
  readonly bundle_id: string;
  readonly name: string;
  readonly tier: "forbidden" | "look-and-click" | "ask";
  readonly reason: string;
  readonly built_in: boolean;
  readonly user_forbidden: boolean;
}

const DEFAULT_APP_DIRS = () => [
  "/Applications",
  "/System/Applications",
  "/System/Applications/Utilities",
  path.join(os.homedir(), "Applications"),
];

const CACHE_TTL_MS = 30_000;
let cached: { readonly at: number; readonly apps: readonly AppIdentity[] } | null = null;

function xmlPlistString(xml: string, key: string): string | null {
  const pattern = new RegExp(`<key>${key}</key>\\s*<string>([^<]{1,240})</string>`, "u");
  const match = pattern.exec(xml);
  if (!match?.[1]) return null;
  return match[1].replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").trim() || null;
}

async function readAppBundle(appPath: string): Promise<AppIdentity | null> {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(plistPath)) return null;
  const fallbackName = path.basename(appPath, ".app");
  try {
    const head = fs.readFileSync(plistPath);
    if (head.subarray(0, 6).toString("ascii") !== "bplist") {
      const xml = head.toString("utf8");
      const bundleId = xmlPlistString(xml, "CFBundleIdentifier");
      if (!bundleId) return null;
      const name = xmlPlistString(xml, "CFBundleDisplayName") ?? xmlPlistString(xml, "CFBundleName") ?? fallbackName;
      return { bundle_id: bundleId, name };
    }
    if (process.platform !== "darwin") return null;
    const { stdout } = await execFileAsync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath], { timeout: 1500, maxBuffer: 512_000 });
    const parsed = JSON.parse(stdout) as { CFBundleIdentifier?: unknown; CFBundleDisplayName?: unknown; CFBundleName?: unknown };
    const bundleId = typeof parsed.CFBundleIdentifier === "string" ? parsed.CFBundleIdentifier.trim() : "";
    if (!bundleId) return null;
    const name = (typeof parsed.CFBundleDisplayName === "string" && parsed.CFBundleDisplayName.trim())
      || (typeof parsed.CFBundleName === "string" && parsed.CFBundleName.trim())
      || fallbackName;
    return { bundle_id: bundleId, name };
  } catch {
    return null;
  }
}

const SCAN_CONCURRENCY = 8;

async function readAppBatch(paths: readonly string[]): Promise<Array<AppIdentity | null>> {
  const results = new Array<AppIdentity | null>(paths.length).fill(null);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(SCAN_CONCURRENCY, paths.length) }, async () => {
    while (cursor < paths.length) {
      const index = cursor++;
      results[index] = await readAppBundle(paths[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

async function scanDirectories(directories: readonly string[], maxApps: number): Promise<AppIdentity[]> {
  const seen = new Map<string, AppIdentity>();
  for (const dir of directories) {
    if (seen.size >= maxApps) break;
    if (!fs.existsSync(dir)) continue;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    const candidates = entries
      .filter(entry => entry.name.endsWith(".app") && (entry.isDirectory() || entry.isSymbolicLink()))
      .map(entry => path.join(dir, entry.name));
    const remaining = maxApps - seen.size;
    const results = await readAppBatch(candidates.slice(0, Math.max(remaining * 2, remaining)));
    for (const app of results) {
      if (!app || seen.has(app.bundle_id)) continue;
      seen.set(app.bundle_id, app);
      if (seen.size >= maxApps) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

/**
 * Lists verifiable local apps with their authoritative `app-tiers.ts` classification (PF-A15).
 * Read-only `.app/Contents/Info.plist` inspection; requires zero macOS accessibility/screen permissions.
 */
export async function listVerifiableComputerApps(
  userForbidden: ReadonlyArray<{ readonly bundle_id: string; readonly name: string }>,
  options: { readonly directories?: readonly string[]; readonly maxApps?: number; readonly useCache?: boolean } = {},
): Promise<DiscoveredComputerApp[]> {
  const useCache = options.useCache !== false && !options.directories;
  let discovered: readonly AppIdentity[];
  if (useCache && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    discovered = cached.apps;
  } else {
    discovered = await scanDirectories(options.directories ?? DEFAULT_APP_DIRS(), options.maxApps ?? 200);
    if (useCache) cached = { at: Date.now(), apps: discovered };
  }
  const byId = new Map<string, AppIdentity>();
  for (const app of discovered) byId.set(app.bundle_id, app);
  for (const entry of userForbidden) {
    if (!byId.has(entry.bundle_id)) byId.set(entry.bundle_id, { bundle_id: entry.bundle_id, name: entry.name });
  }
  const forbiddenIds = userForbidden.map(item => item.bundle_id);
  const userSet = new Set(forbiddenIds);
  return [...byId.values()]
    .map((app): DiscoveredComputerApp => {
      const verdict = tierOf(app, forbiddenIds);
      return {
        bundle_id: app.bundle_id,
        name: app.name,
        tier: verdict.tier,
        reason: verdict.reason,
        built_in: verdict.built_in,
        user_forbidden: userSet.has(app.bundle_id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN", { sensitivity: "base" }));
}
