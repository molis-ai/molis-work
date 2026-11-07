// SQLD-06 (specs/sqlite-driver-switch §2.1, §11): the SQLite that comes with the Host's Node decides whether plugin statements are
// accepted once project libraries run on it, so the Node is locked to one exact patch version and the Host says at start when its
// SQLite is not the reviewed one. The refusal itself (`pluginStatementGuard`) and the launcher's start lines are asserted in
// security-invariants-plugin-project-database.test.ts and security-invariants-local-entry.test.ts; this file holds the sentence, its log
// entry and the pin: `.nvmrc`, the workflows and `engines` name one version, and the sentence names the same one.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { captureHostLog, reportSqliteVersion, sqliteVersionNotice, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { PLUGIN_STATEMENT_SQLITE_VERSION } from "@molis-ai/molis-work-plugin-runtime";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const LOCKED = read(".nvmrc").trim();

function logged<T>(run: () => T): { result: T; entries: HostLogEntry[] } {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try { return { result: run(), entries }; } finally { restore(); }
}

test("SQLD-06 a Host on the reviewed SQLite says nothing, in the sentence and in the log", () => {
  const { result, entries } = logged(() => reportSqliteVersion(PLUGIN_STATEMENT_SQLITE_VERSION, `v${LOCKED}`));
  assert.equal(result, null);
  assert.deepEqual(entries, []);
  assert.equal(sqliteVersionNotice(PLUGIN_STATEMENT_SQLITE_VERSION), null);
});

test("SQLD-06 a Host on another SQLite says so once: both versions, what follows, which Node to use; and writes one warn entry of keys", () => {
  for (const running of ["3.51.2", "3.53.4", "3.54.1"]) {
    const { result, entries } = logged(() => reportSqliteVersion(running, "v24.22.2"));
    assert.ok(result, `SQLite ${running}`);
    assert.ok(result.includes("v24.22.2"), "names the Node it is running on");
    assert.ok(result.includes(running), "names the SQLite it has");
    assert.ok(result.includes(PLUGIN_STATEMENT_SQLITE_VERSION), "names the reviewed SQLite");
    assert.match(result, /拒绝项目库里的全部插件语句/, "says what would follow");
    assert.match(result, /项目库现在仍用随包的 SQLite/, "says what is true of this build today");
    assert.ok(result.includes(`Node ${LOCKED}`), "says which Node to use");
    assert.doesNotMatch(result, /[!！]|错误|失败|警告/, "calm: a note, not an alarm");
    assert.equal(entries.length, 1);
    assert.deepEqual({ ...entries[0], at: undefined }, { at: undefined, level: "warn", area: "host", event: "sqlite_version_unreviewed",
      fields: { sqlite: running, reviewed: PLUGIN_STATEMENT_SQLITE_VERSION, node: "v24.22.2" } });
  }
});

test("SQLD-06 .nvmrc, every workflow's setup-node and engines.node name one Node patch version, the one the sentence tells people to use", () => {
  assert.match(LOCKED, /^24\.\d+\.\d+$/);
  // Every workflow in the directory, so a new one cannot bring a floating Node unseen. One that sets up no Node is not the question.
  const workflows = readdirSync(new URL("../.github/workflows/", import.meta.url)).filter(name => /\.ya?ml$/.test(name)).map(name => `.github/workflows/${name}`);
  assert.ok(workflows.includes(".github/workflows/ci.yml") && workflows.includes(".github/workflows/release-macos.yml"));
  for (const file of workflows) {
    const text = read(file);
    const setups = text.match(/uses: actions\/setup-node@/g)?.length ?? 0;
    if (setups === 0) continue;
    const pins = [...text.matchAll(/^\s+node-version: (\S+)\s*$/gm)].map(match => match[1]);
    assert.equal(pins.length, setups, `${file}: every setup-node step names a version`);
    assert.deepEqual([...new Set(pins)], [LOCKED], `${file}: the exact patch version, not a range or a floating major`);
  }
  const [major, minor] = LOCKED.split(".");
  const engines = (JSON.parse(read("package.json")) as { engines: { node: string } }).engines.node;
  assert.equal(engines, `>=${LOCKED} <${major}.${Number(minor) + 1}.0`, "the root engines only turns away a different minor line");
  assert.ok(sqliteVersionNotice("0.0.0")!.includes(`Node ${LOCKED}`));
});

test("SQLD-06 on the locked Node the SQLite is the reviewed one (a machine on another Node has nothing to compare, and says which)", t => {
  if (process.version !== `v${LOCKED}`) { t.diagnostic(`this Node is ${process.version}, not the locked ${LOCKED}: its SQLite ${process.versions.sqlite} is not compared here`); return; }
  assert.equal(process.versions.sqlite, PLUGIN_STATEMENT_SQLITE_VERSION,
    "a new patch of Node can bring another SQLite: read the step list against it (project-database-statements.ts) before the pin moves");
});
