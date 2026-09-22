import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Test processes, including spawned web servers, inherit an isolated credential
// home. Production's Keychain selection and existing ciphertext stay untouched.
const home = await mkdtemp(join(tmpdir(), "molis-test-home-"));
try {
  const targets = process.argv.slice(2);
  if (!targets.length) targets.push(...(await readdir("tests")).filter(name => name.endsWith(".test.ts")).sort().map(name => `tests/${name}`));
  const environment = { ...process.env };
  // This is a new test coordinator, including when a test verifies the runner.
  delete environment.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...targets], {
    stdio: "inherit",
    env: { ...environment, NODE_ENV: "test", MOLIS_WORK_HOME: home,
      MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" },
  });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 143)));
    });
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
} finally {
  await rm(home, { recursive: true, force: true });
}
