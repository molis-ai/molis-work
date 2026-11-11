import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fullSuiteWorkflow } from "./fixtures/ci-workflow.js";

const block = fullSuiteWorkflow.split("      - name: CJK font for the browser files\n")[1]?.split("\n      #")[0];
assert.ok(block);
const script = block.slice(block.indexOf("        run: |\n") + "        run: |\n".length).split("\n").map(line => line.slice(10)).join("\n");

for (const scenario of ["default", "update-fails", "install-fails", "archive-update-fails", "archive-install-fails"]) {
  test(`CI font installation preserves signed installation and failure: ${scenario}`, () => {
    const dir = mkdtempSync(join(tmpdir(), "molis-font-test-"));
    try {
      writeFileSync(join(dir, "os-release"), "VERSION_CODENAME=resolute\n");
      assert.match(script, /\. \/etc\/os-release/);
      const fixture = script.replace(". /etc/os-release", '. "$RUNNER_TEMP/os-release"');
      const mocks = `
sudo() {
  printf '%s\\n' "$*" >> "$RUNNER_TEMP/calls"
  case "$*" in
    *Dir::Etc::sourcelist*)
      if [[ "$SCENARIO" == archive-update-fails && "$*" == *update* ]]; then return 41; fi
      if [[ "$SCENARIO" == archive-install-fails && "$*" == *install* ]]; then return 42; fi ;;
    *update*) if [[ "$SCENARIO" == update-fails ]]; then return 43; fi ;;
    *install*) if [[ "$SCENARIO" != default && "$SCENARIO" != update-fails ]]; then return 44; fi ;;
  esac
  return 0
}
fc-list() { printf '%s\\n' font-list >> "$RUNNER_TEMP/calls"; printf 'WenQuanYi Zen Hei\\n'; }
`;
      const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", mocks + fixture], { encoding: "utf8", env: { ...process.env, RUNNER_TEMP: dir, SCENARIO: scenario } });
      const calls = readFileSync(join(dir, "calls"), "utf8");
      const failed = scenario.startsWith("archive-");
      assert.equal(result.status === 0, !failed, result.stderr);
      assert.equal(calls.includes("font-list"), !failed, "a failed signed install must stop before verification/test steps");
      if (scenario === "default") assert.ok(!calls.includes("Dir::Etc::sourcelist"));
      else {
        const sources = readFileSync(join(dir, "molis-font-apt", "sources.list"), "utf8");
        assert.equal(sources.trim().split("\n").length, 3);
        for (const line of sources.trim().split("\n")) assert.match(line, /^deb \[signed-by=\/usr\/share\/keyrings\/ubuntu-archive-keyring.gpg\] https:\/\/mirrors.edge.kernel.org\/ubuntu resolute(?:-updates|-security)? universe$/);
        assert.match(calls, /Dir::Etc::sourceparts=-/);
        assert.match(calls, /Dir::State::lists=.*molis-font-apt\/lists/);
        assert.ok(!/allow-unauthenticated|trusted=yes|AllowInsecure/.test(calls + sources));
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
