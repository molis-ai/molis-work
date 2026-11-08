#!/usr/bin/env node
// Golden Homes (specs/upgrade-continuity/golden-replay-design.md §2, §3, UPG2-01, UPG2-02, UPG2-06): a Home that has been used for a while, with
// synthetic contents, as text that can be diffed. Run it on the built workspace (`pnpm build`). Only temporary Homes are ever touched.
//
//   node scripts/golden-home.mjs create --version <version> [--out <directory>]   generate into tests/fixtures/golden-homes/<version>, or --out
//   node scripts/golden-home.mjs check  --version <version> [--dir <directory>]   generate again and compare byte by byte, all but the recorded commit; exit 1 on any difference
//   --without-third-party   skip the installed plugins, and say so in the manifest. The signed sample runs only where the macOS sandbox can start
//                           this Node: not on Linux, and not with a Homebrew Node, whose libraries the sandbox profile does not admit. A golden
//                           that goes into the repository is generated without this flag, on the Node `.nvmrc` locks: its own default destination
//                           refuses any other, and the manifest records which one ran.
//
// A failure says where and which code, never what the data was. `--debug` adds the error's own message on stderr, for the person fixing it locally.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installDeterminism } from "./golden/determinism.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), [command] = args;
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const debug = args.includes("--debug"), withThirdParty = !args.includes("--without-third-party");
const report = (where, code) => { process.stderr.write(`FAIL ${where} ${code}\n`); process.exitCode = 1; };
const headCommit = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

function readableFailure(error) {
  if (debug) process.stderr.write(`${error?.stack ?? error}\n`);
  return { where: error?.where ?? "generation", code: typeof error?.code === "string" ? error.code : "golden.unexpected_error" };
}

const README = version => `# 金样 Home ${version}

由 \`node scripts/golden-home.mjs create --version ${version}\` 生成，在同样的代码上运行同一命令可以逐字节重新得到（设计见 \`specs/upgrade-continuity/golden-replay-design.md\`）。\`check\` 做这项比较，只有清单记下的提交不比。

内容全部是生成脚本写死的合成样例，没有真实的人名、邮箱和密钥。只经各主人的动作和设置入口写入，例外记在清单的 \`imports\`。\`feed/secrets.json\` 用的钥匙只用于金样，写在清单的 \`test_key\`。
`;

async function generate(version, out) {
  const clock = installDeterminism(`golden-home:${version}`);
  const { assertGoldenVersionName, assertNoHomePath, captureHome, createTemporaryHome, GOLDEN_MANIFEST_VERSION, GOLDEN_TEST_KEY, writeManifest } = await import("./golden/layout.mjs");
  assertGoldenVersionName(version);
  const { refuseNetwork, refusedNetwork, enterHome, scriptModel } = await import("./golden/session.mjs");
  const { populateHome, thirdPartySample } = await import("./golden/populate.mjs");
  const { homeLibrarySample } = await import("./golden/home-library-sample.mjs");
  const local = await import("@molis-ai/molis-work-app-local-host");
  const storage = await import("@molis-ai/molis-work-storage");
  refuseNetwork();
  scriptModel();

  const generated = createTemporaryHome("golden-home-"), { home } = generated;
  const local_space = { spaceId: "space_golden_root_home", kind: "local", ownerUserId: null, teamId: null, issuer: null, applicationId: null };
  const account_space = storage.personalStorageSpace("https://golden.invalid", "io.molis.work.golden", "golden-person");
  const accountHome = path.join(home, "spaces", account_space.spaceId);
  try {
    enterHome(home);
    storage.ensureStorageSpace(home, local_space);
    const rootProjects = await populateHome(home, { step: clock.step, label: "root", withThirdParty, account: false });
    mkdirSync(accountHome, { recursive: true, mode: 0o700 });
    enterHome(accountHome);
    storage.ensureStorageSpace(accountHome, account_space);
    const accountProjects = await populateHome(accountHome, { step: clock.step, label: "account", withThirdParty: false, account: true });
    if (refusedNetwork().length) throw Object.assign(new Error("network"), { code: "golden.network_refused", where: "generation" });

    await clock.step("capture");
    enterHome(home);
    const tree = { directories: [{ path: "spaces", mode: 0o700 }], stores: [], files: [], excluded: [], formats: [], payloads: { sources: new Map(), manifests: new Map() } };
    mkdirSync(out, { recursive: true });
    await captureHome(local, storage, home, "", out, tree);
    enterHome(accountHome);
    await captureHome(local, storage, accountHome, `spaces/${account_space.spaceId}`, out, tree);
    assertNoHomePath(out, tree, home);
    writeManifest(out, {
      schema_version: GOLDEN_MANIFEST_VERSION, golden_version: version, commit: headCommit(), node: process.version, third_party: withThirdParty ? thirdPartySample().id : null, home_library: withThirdParty ? homeLibrarySample().id : null, synthetic: true, test_key: { name: "MOLIS_WORK_ENCRYPTION_KEY", value: GOLDEN_TEST_KEY, label: "测试" },
      homes: [{ path: "", space: local_space, projects: rootProjects }, { path: `spaces/${account_space.spaceId}`, space: account_space, projects: accountProjects }],
      imports: [{ path: "projects/goalboard-v1-demo/molis-work.db", reason: "历史 Goal 事件没有写入动作，取自 tests/fixtures/goal-event-history" },
        { path: `spaces/${account_space.spaceId}/sync/sync.db`, reason: "同步库没有写入动作，用主人的现行结构建空库" },
        { path: "knowledge/knowledge.db", reason: "卡片的编号取决于后台定时器的先后，生成结束时删库，由主人按目录逐项目重建；两个 Home 都如此" },
        { path: "plugin-directories/plugin-directories.db", reason: "授权目录的行记本机的真实路径、设备号和 inode，只有桌面选择器能写；用主人的现行结构建空库" },
        { path: "plugin-originals/plugin-originals.db", reason: "原始文件的行记本机的真实路径，只有桌面入口带来的路径能写；用主人的现行结构建空库" },
        { path: withThirdParty ? `spaces/${account_space.spaceId}/plugin-libraries/plugin-libraries.db` : "plugin-libraries/plugin-libraries.db", reason: "台账的行要一个声明 Home 库的已签名沙箱包，这个 Home 没装；用主人的现行结构建空库" },
        { path: "alchemist/projects/<project>/search.sqlite", reason: "行来自联网搜索，金样不联网；由主人的搜索入口建空库" }],
      ...tree,
    });
    writeFileSync(path.join(out, "README.md"), README(version));
  } finally { generated.remove(); }
}

async function check(version, directory) {
  const { compareGoldens, directoryBytes, readManifest } = await import("./golden/layout.mjs");
  const recorded = readManifest(directory);
  const scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-check-")));
  try {
    const again = path.join(scratch, "again");
    const run = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", process.argv[1], "create", "--version", version, "--out", again, ...(debug ? ["--debug"] : []), ...(recorded.third_party ? [] : ["--without-third-party"])], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
    if (run.status !== 0) return report(version, "golden.regenerate_failed");
    const differences = compareGoldens(directory, again);
    for (const item of differences) report(`${version}/${item.path}${item.line ? `:${item.line}` : ""}${item.table ? ` (${item.table})` : ""}`, `golden.${item.reason}`);
    if (!differences.length) process.stdout.write(`ok ${version}: identical, ${directoryBytes(directory)} bytes\n`);
    // A difference is a finding about this tree only: other code may rightly write other bytes. So `check` belongs beside a generation, not in CI.
    else process.stderr.write(`recorded on ${recorded.commit}, regenerated on ${headCommit()}\n`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  return undefined;
}

const version = option("--version");
try {
  if (command === "create") {
    const out = path.resolve(option("--out") ?? path.join(root, "tests/fixtures/golden-homes", String(version)));
    if (existsSync(out)) { report(String(version), "golden.destination_exists"); process.exit(1); }
    if (!option("--out") && process.version !== `v${readFileSync(path.join(root, ".nvmrc"), "utf8").trim()}`) { report(String(version), "golden.node_not_locked"); process.exit(1); }
    await generate(version, out);
    process.stdout.write(`created ${version}\n`);
  } else if (command === "check") {
    await check(version, path.resolve(option("--dir") ?? path.join(root, "tests/fixtures/golden-homes", String(version))));
  } else { report("arguments", "golden.command_unknown"); }
} catch (error) {
  const failure = readableFailure(error);
  report(failure.where, failure.code);
}
// The Host's background work has no reason to outlive a finished generation.
process.exit(process.exitCode ?? 0);
