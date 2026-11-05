import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("N4 real Host report receipts survive en-US/zh-CN restarts and changed requests remain refused", () => {
  const fixture = fileURLToPath(new URL("./fixtures/locale-request-host.ts", import.meta.url));
  for (const locales of [["en_US.UTF-8", "zh_CN.UTF-8"], ["zh_CN.UTF-8", "en_US.UTF-8"]]) {
    const home = mkdtempSync(join(tmpdir(), "molis-locale-replay-"));
    try {
      const results = locales.map((locale, index) => {
        const result = spawnSync(process.execPath, ["--import", "tsx", fixture, home, index === 0 ? "create" : "replay"], { encoding: "utf8",
          timeout: 60_000, env: { ...process.env, MOLIS_WORK_HOME: home, LANG: locale, LC_ALL: locale } });
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout) as { locale: string; event_id: string; cursor: number; replayed: boolean };
      });
      assert.deepEqual(results.map(result => result.locale), locales.map(locale => locale === "en_US.UTF-8" ? "en-US" : "zh-CN"));
      assert.deepEqual(results.map(result => result.replayed), [false, true]);
      assert.equal(results[0]!.event_id, results[1]!.event_id);
      assert.equal(results[0]!.cursor, results[1]!.cursor);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
});
