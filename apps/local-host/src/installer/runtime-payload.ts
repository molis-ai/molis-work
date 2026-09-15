import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MolisWorkHomeInstallError } from "./home-contract.js";
import { pathState } from "./home-files.js";
import { inspectSource } from "./home-source.js";
import { createRelease } from "./home-release.js";
import { digestPaths } from "./fingerprint.js";

export interface MolisWorkRuntimePayloadOptions {
  sourceDirectory: string;
  /** A new output directory. Existing outputs are never replaced by this API. */
  destinationDirectory: string;
  /** Desktop tooling verifies download integrity and architecture before calling. */
  nodeExecutablePath: string;
}

/** Packages the same self-contained release used by Home installation, without installing or starting it. */
export async function createMolisWorkRuntimePayload(options: MolisWorkRuntimePayloadOptions): Promise<{ directory: string; version: string }> {
  const destination = path.resolve(options.destinationDirectory);
  if (await pathState(destination)) throw new MolisWorkHomeInstallError("source.invalid", `Runtime payload 输出已存在，不会覆盖: ${destination}`);
  const nodeExecutable = path.resolve(options.nodeExecutablePath);
  if (!(await pathState(nodeExecutable))?.isFile()) throw new MolisWorkHomeInstallError("source.invalid", `Runtime Node 不是文件: ${nodeExecutable}`);
  const source = await inspectSource(path.resolve(options.sourceDirectory), undefined);
  source.bundledNodePath = nodeExecutable;
  source.contentDigest = createHash("sha256").update(JSON.stringify({
    source: source.contentDigest,
    node: await digestPaths(path.dirname(nodeExecutable), [path.basename(nodeExecutable)]),
  })).digest("hex");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(path.dirname(destination), ".molis-work-payload-"));
  try {
    const staged = path.join(temporary, "payload");
    await createRelease(staged, source, source.version);
    await fs.rename(staged, destination);
    return { directory: destination, version: source.version };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
