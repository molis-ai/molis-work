/**
 * Records the preview's facts from a real Prologue SDK build.
 *
 *   node --import tsx scripts/input-receipts-slice/record.mts --sdk <prologue>/packages/sdk [--out scripts/input-receipts-slice/recorded]
 *
 * Run by hand when the SDK changes; it is not part of CI and the product never depends on it. The SDK must be built
 * (`dist/`). Each recording carries the Prologue commit it came from, and the preview shows it.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FLAVORS } from "./record-content.mts";
import { loadSdk, openLab } from "./record-lab.mts";
import { restartScene } from "./record-restart.mts";
import { mainScene, questionScene, stoppedScene } from "./record-scenes.mts";
import type { Recording, Scene } from "./facts.ts";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (name: string): string | undefined => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : undefined; };
const sdkDir = resolve(arg("--sdk") ?? "");
if (arg("--sdk") === undefined) throw new Error("Usage: record.mts --sdk <prologue>/packages/sdk [--out <dir>]");
const out = resolve(arg("--out") ?? join(here, "recorded"));

const git = (...args: string[]): string => execFileSync("git", ["-C", sdkDir, ...args], { encoding: "utf8" }).trim();
const source = { prologue: git("rev-parse", "HEAD"), dirty: git("status", "--porcelain", "--", ".").length > 0,
  recordedAt: new Date().toISOString(), script: "scripts/input-receipts-slice/record.mts" };

mkdirSync(out, { recursive: true });
const { sdk } = await loadSdk(sdkDir);
for (const flavor of FLAVORS) {
  const scenes: Scene[] = [];
  // A fresh Runtime and clock for every scene: each scene's times start from its own seconds.
  const scene = async (make: (lab: Awaited<ReturnType<typeof openLab>>) => Promise<Scene>): Promise<void> => {
    const lab = await openLab(sdkDir);
    try { scenes.push(await make(lab)); } finally { await lab.close(); }
  };
  await scene(lab => mainScene(lab, flavor));
  await scene(lab => stoppedScene(lab, flavor, "carry"));
  await scene(lab => stoppedScene(lab, flavor, "withdraw"));
  await scene(lab => questionScene(lab, flavor));
  scenes.push(await restartScene(sdk, sdkDir, flavor));
  const recording: Recording = { source, flavor: flavor.id, scenes };
  writeFileSync(join(out, `${flavor.id}.json`), `${JSON.stringify(recording, null, 1)}\n`);
  process.stdout.write(`recorded ${flavor.id}: ${scenes.map(one => one.id).join(", ")}\n`);
}
