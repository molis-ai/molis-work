import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";

test("N4 stored digests, request hashes and IM receipts do not follow the host language", () => {
  const fixture = fileURLToPath(new URL("./fixtures/locale-request-digests.ts", import.meta.url));
  for (const locales of [["en_US.UTF-8", "zh_CN.UTF-8"], ["zh_CN.UTF-8", "en_US.UTF-8"]]) {
    const home = mkdtempSync(join(tmpdir(), "molis-locale-digests-"));
    try {
      const [first, second] = locales.map((locale, index) => {
        const result = spawnSync(process.execPath, ["--import", "tsx", fixture, home, index === 0 ? "create" : "replay"], { encoding: "utf8",
          timeout: 60_000, env: { ...process.env, MOLIS_WORK_HOME: home, LANG: locale, LC_ALL: locale } });
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout) as Record<string, unknown>;
      }) as [Record<string, unknown>, Record<string, unknown>];
      assert.deepEqual([first.locale, second.locale], locales.map(locale => locale === "en_US.UTF-8" ? "en-US" : "zh-CN"));
      assert.notDeepEqual(first.localeOrder, second.localeOrder, "the two languages order these keys differently, so equal digests prove something");
      const { locale: _firstLocale, localeOrder: _firstOrder, ...firstDigests } = first;
      const { locale: _secondLocale, localeOrder: _secondOrder, ...secondDigests } = second;
      assert.deepEqual(firstDigests, secondDigests);
      const object = Object.fromEntries(["é", "é", "e", "中", "阿", "😀", "", "2", "10", "Z", "a"].map(key => [key, `value ${key}`]));
      assert.equal(first.artifactText, canonicalJsonText({ nested: object, ...object }), "artifact bytes are the SDK's raw UTF-16 order");
      assert.ok((first.artifactText as string).startsWith('{"10":"value 10","2":"value 2",'), "integer-shaped keys sort as text, not as array indexes");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
});

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
