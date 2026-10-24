import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { RuntimeIntegrationService } from "@molis-ai/molis-work-app-local-host";

/** The actual Runtime integration owner, with a throwaway user configuration and local launcher. */
export async function runtimeBackupFixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-sealed-runtime-backup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home"), userHome = join(directory, "user");
  const secret = randomBytes(32).toString("hex"), contents = 'model = "original"\n[credentials]\nopaque = ' + JSON.stringify(secret) + '\n';
  const config = join(userHome, ".codex", "config.toml"), launcher = join(home, "bin", "molis-work-mcp");
  await Promise.all([mkdir(join(home, "config"), { recursive: true }), mkdir(join(home, "bin"), { recursive: true }),
    mkdir(join(home, "releases", "test", "skills", "goal-advance"), { recursive: true }), mkdir(join(userHome, ".codex", "skills"), { recursive: true })]);
  await Promise.all([writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 }), writeFile(config, contents, { mode: 0o640 }),
    writeFile(join(home, "config", "installation.json"), JSON.stringify({ schema_version: 2, installer: "molis-work-home-install-v1", release_path: "releases/test" }))]);
  const service = () => new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: userHome,
    runtimeExecutables: { codex: launcher }, validateConnection: () => true });
  return { home, userHome, directory, secret, contents, config, service };
}
