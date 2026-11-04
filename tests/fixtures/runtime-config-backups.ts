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
  const release = join(home, "releases", "molis-work-test");
  const secret = randomBytes(32).toString("hex"), contents = 'model = "original"\n[credentials]\nopaque = ' + JSON.stringify(secret) + '\n';
  const config = join(userHome, ".codex", "config.toml"), launcher = join(home, "bin", "molis-work-mcp");
  await Promise.all([mkdir(join(home, "config"), { recursive: true }), mkdir(join(home, "bin"), { recursive: true }),
    mkdir(join(release, "skills", "goal-advance"), { recursive: true }), mkdir(join(userHome, ".codex", "skills"), { recursive: true })]);
  await Promise.all([writeFile(launcher, "#!/bin/sh\nexit 0\n", { mode: 0o755 }), writeFile(config, contents, { mode: 0o640 }),
    writeFile(join(home, "config", "installation.json"), JSON.stringify({ schema_version: 1,
      installer: "molis-work-home-install-v1", version: "test", release_path: "releases/molis-work-test",
      content_digest: "a".repeat(64), updated_at: "2026-01-01T00:00:00.000Z" })),
    writeFile(join(release, "release.json"), JSON.stringify({ schema_version: 1,
      installer: "molis-work-home-install-v1", version: "test", dependencies: "embedded", content_digest: "a".repeat(64),
      created_at: "2026-01-01T00:00:00.000Z" }))]);
  const service = () => new RuntimeIntegrationService({ homeDirectory: home, userHomeDirectory: userHome,
    runtimeExecutables: { codex: launcher }, validateConnection: () => true });
  return { home, userHome, directory, secret, contents, config, service };
}
