import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";
import { parseAccountEnvironment } from "@molis-ai/molis-work-service-account";
import { installerErrors } from "./errors.js";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { pathState } from "./home-files.js";
import { inspectSource } from "./home-source.js";
import { createRelease } from "./home-release.js";
import { digestPaths } from "./fingerprint.js";
import { releaseProfile } from "../release-profile.js";

export interface MolisWorkRuntimePayloadOptions {
  sourceDirectory: string;
  /** A new output directory. Existing outputs are never replaced by this API. */
  destinationDirectory: string;
  /** Desktop tooling verifies download integrity and architecture before calling. */
  nodeExecutablePath: string;
  /** Build outputs only. The signer and its private key never enter the payload. */
  desktopDistribution?: { readonly profile: string; readonly signedPackages?: string; readonly account?: unknown; readonly syncOrigin?: string };
}

function validateDistributionSyncOrigin(syncOrigin: string | undefined, expected: string, authOrigin: string): string | undefined {
  if (syncOrigin === undefined || syncOrigin === "") return undefined;
  if (typeof syncOrigin !== "string") {
    throw new Error("Release sync origin is invalid");
  }
  let parsed: URL;
  try {
    parsed = new URL(syncOrigin);
  } catch {
    throw new Error("Release sync origin is invalid");
  }
  const testDomain = parsed.hostname === "test.molis.ai" || parsed.hostname.endsWith(".test.molis.ai");
  if (
    parsed.origin !== syncOrigin
    || parsed.protocol !== "https:"
    || parsed.origin === authOrigin
    || isLoopbackHostname(parsed.hostname)
    || parsed.hostname.endsWith(".localhost")
    || testDomain !== (expected === "test")
  ) {
    throw new Error("Release sync origin does not match its profile");
  }
  return syncOrigin;
}

/** Packages the same self-contained release used by Home installation, without installing or starting it. */
export async function createMolisWorkRuntimePayload(options: MolisWorkRuntimePayloadOptions): Promise<{ directory: string; version: string }> {
  const destination = path.resolve(options.destinationDirectory);
  if (await pathState(destination)) throw installerErrors["installer.source.invalid"](`Runtime payload 输出已存在，不会覆盖: ${destination}`);
  const nodeExecutable = path.resolve(options.nodeExecutablePath);
  if (!(await pathState(nodeExecutable))?.isFile()) throw installerErrors["installer.source.invalid"](`Runtime Node 不是文件: ${nodeExecutable}`);
  const distribution = options.desktopDistribution;
  let account: ReturnType<typeof parseAccountEnvironment> | undefined;
  let syncOrigin: string | undefined;
  if (distribution) {
    const expected = releaseProfile(distribution.profile).accountEnvironment;
    if (expected) {
      account = parseAccountEnvironment(distribution.account);
      const kind = expected === 'prod' ? 'PRODUCTION' : 'TEST';
      if (account.environmentKind !== kind || account.deliveryMode !== 'LIVE' || account.providerMode !== 'LIVE')
        throw new Error("Release account configuration does not match its profile");
      syncOrigin = validateDistributionSyncOrigin(distribution.syncOrigin, expected, account.authOrigin);
    } else if (distribution.account !== undefined || (distribution.syncOrigin !== undefined && distribution.syncOrigin !== "")) {
      throw new Error("This release profile has no packaged account configuration");
    }
  }
  const source = await inspectSource(path.resolve(options.sourceDirectory), undefined);
  source.bundledNodePath = nodeExecutable;
  source.contentDigest = createHash("sha256").update(JSON.stringify({
    source: source.contentDigest,
    node: await digestPaths(path.dirname(nodeExecutable), [path.basename(nodeExecutable)]),
    ...(distribution && {
      profile: distribution.profile,
      account,
      syncOrigin,
      signedPackages: distribution.signedPackages
        ? await digestPaths(path.dirname(distribution.signedPackages), [path.basename(distribution.signedPackages)])
        : null,
    }),
  })).digest("hex");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(path.dirname(destination), ".molis-work-payload-"));
  try {
    const staged = path.join(temporary, "payload");
    await createRelease(staged, source, source.version);
    if (distribution) {
      const host = path.join(staged, "node_modules", "@molis-ai", "molis-work-app-local-host", "dist");
      await fs.writeFile(path.join(host, "selected-release-profile"), distribution.profile + "\n", { flag: "wx" });
      if (account) {
        await fs.writeFile(path.join(host, "selected-account-config.json"), JSON.stringify({ account, syncOrigin }), { flag: "wx" });
      }
      if (distribution.signedPackages) {
        // The build already put the unsigned drafts (`<plugin_id>.draft.json`, batch 41) in this folder: each signed package goes in beside
        // them, and still never over a file that is there. The Host refuses a draft whose package also lies here signed.
        const bundled = path.join(host, "bundled-plugins");
        await fs.mkdir(bundled, { recursive: true });
        for (const name of (await fs.readdir(distribution.signedPackages)).sort()) {
          await fs.cp(path.join(distribution.signedPackages, name), path.join(bundled, name), { recursive: true, force: false, errorOnExist: true });
        }
      }
    }
    await fs.rename(staged, destination);
    return { directory: destination, version: source.version };
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
