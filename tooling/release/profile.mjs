import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { releaseApplication, releaseMacOS, releaseProfile, releaseRuntime } from "../../apps/local-host/src/release-profile.ts";

const root = new URL("../../", import.meta.url);
const read = file => readFileSync(new URL(file, root), "utf8");
const configurationFile = "apps/local-host/src/release-profiles.json";
const tauriFile = "apps/desktop/src-tauri/tauri.conf.json";
const tauriMacOSFile = "apps/desktop/src-tauri/tauri.macos.conf.json";

export function nodeVersion(environment = process.env) {
  const version = environment.MOLIS_WORK_NODE_VERSION || read(releaseRuntime.nodeVersionFile).trim();
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error("Invalid bundled Node version");
  return version;
}

export function tauriSettings(profile) {
  const { minimumSystemVersion, ...application } = releaseApplication;
  return {
    ...application,
    bundle: { macOS: {
      minimumSystemVersion,
      ...(profile.signingIdentity ? { signingIdentity: profile.signingIdentity } : {}),
      ...(profile.entitlements ? { entitlements: profile.entitlements } : {}),
    } },
  };
}

export function missingProfileValues(name, profile = releaseProfile(name)) {
  const required = {
    accountEnvironment: profile.accountEnvironment,
    signingIdentity: profile.signingIdentity,
    notarization: profile.notarization,
    publisherKeyRef: profile.publisherKeyRef,
    ...(name === "release" ? {
      entitlements: profile.entitlements,
      "connectors.brokerOrigin": profile.connectors.brokerOrigin,
      "connectors.applicationRefs": Object.keys(profile.connectors.applicationRefs).length,
      "connectors.applications": profile.connectors.applications,
      "connectors.applicationSecretPrefix": profile.connectors.applicationSecretPrefix,
      updateChannel: profile.updateChannel,
      symbolUploadTarget: profile.symbolUploadTarget,
    } : {}),
  };
  return Object.keys(required).filter(field => !required[field]);
}

export function carrierIssues(name, rootRead = read) {
  const json = file => JSON.parse(rootRead(file));
  const tauri = json(tauriFile), macos = json(tauriMacOSFile);
  const expected = tauriSettings(releaseProfile("dev"));
  const { identifier, productName, bundle: { macOS } } = expected;
  const carried = [
    [tauriFile, "identifier", tauri.identifier, identifier],
    [tauriFile, "productName", tauri.productName, productName],
    [tauriFile, "bundle.macOS.minimumSystemVersion", tauri.bundle.macOS.minimumSystemVersion, macOS.minimumSystemVersion],
    [tauriMacOSFile, "bundle.macOS.signingIdentity", macos.bundle.macOS.signingIdentity, macOS.signingIdentity],
  ];
  return carried.filter(([, , actual, value]) => actual !== value)
    .map(([file, field]) => `${file} ${field} differs from the developer profile (checking ${name})`);
}

function misplacedValues() {
  const configuration = JSON.parse(read(configurationFile));
  const accounts = Object.values(configuration.accountEnvironments);
  const values = new Set([
    ...accounts.flatMap(account => [account.authOrigin, account.applicationId, account.clientId]),
    ...Object.values(configuration.profiles).flatMap(profile => [
      profile.connectors.brokerOrigin, profile.publisherKeyRef, profile.entitlements, profile.symbolUploadTarget,
      ...Object.values(profile.connectors.applicationRefs),
    ]),
  ].filter(Boolean));
  const references = Object.values(configuration.macOS.secretRefs);
  const search = spawnSync("git", [
    "grep", "-n", "-F", "--untracked", ...[...values].flatMap(value => ["-e", value]),
    "-e", `"${releaseApplication.identifier}"`, "-e", `'${releaseApplication.identifier}'`,
    ...references.flatMap(value => ["-e", `secrets.${value}`, "-e", `secrets['${value}']`]),
    "--", "apps/local-host", "apps/desktop", "scripts", "tooling", ".github/workflows/release-macos.yml",
    `:(exclude)${configurationFile}`, `:(exclude)${tauriFile}`, `:(exclude)${tauriMacOSFile}`,
    ":(exclude)**/*.md", ":(exclude)**/*.test.*", ":(exclude)**/test/**", ":(exclude)**/test.mjs",
  ], { cwd: fileURLToPath(root), encoding: "utf8" });
  if (search.status !== 0 && search.status !== 1) throw new Error("Unable to check release configuration literals");
  return search.stdout.trim().split("\n").filter(Boolean).map(line => {
    const match = /^([^:]+:\d+):/u.exec(line);
    return `${match?.[1] ?? "Unknown source"} contains a release configuration value`;
  });
}

function run(args) {
  const [flag, name, command, ...rest] = args;
  if (flag !== "--profile" || !name || !command || rest.length !== 0) {
    throw new Error("Usage: node tooling/release/profile.mjs --profile dev|test|release --check|--tauri|--node|--app-name|--signing-identity|--mach-o|--ci-outputs");
  }
  const profile = releaseProfile(name);
  switch (command) {
    case "--check":
      for (const field of missingProfileValues(name, profile)) process.stdout.write(`${name}: missing ${field}\n`);
      for (const issue of [...carrierIssues(name), ...misplacedValues()]) process.stdout.write(`${issue}\n`);
      return;
    case "--tauri": process.stdout.write(JSON.stringify(tauriSettings(profile))); return;
    case "--node": process.stdout.write(nodeVersion()); return;
    case "--app-name": process.stdout.write(releaseApplication.productName); return;
    case "--signing-identity": process.stdout.write(profile.signingIdentity ?? ""); return;
    case "--mach-o": process.stdout.write(releaseMacOS.machO.join("\n") + "\n"); return;
    case "--ci-outputs": {
      const outputs = { ...releaseMacOS.secretRefs, profile: name, notarization: profile.notarization ?? "", publisherKey: profile.publisherKeyRef ?? "" };
      for (const [key, value] of Object.entries(outputs)) {
        if (value && !/^[A-Za-z][A-Za-z0-9_-]*$/u.test(value)) throw new Error(`Invalid CI reference for ${key}`);
        process.stdout.write(`${key}=${value}\n`);
      }
      return;
    }
    default: throw new Error(`Unknown release profile option: ${command}`);
  }
}

export function publisherKeyReference(name) {
  return releaseProfile(name).publisherKeyRef;
}

export { releaseMacOS };

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) run(process.argv.slice(2));
