import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createMolisWorkNpmPackageDirectory } from "@molis-ai/molis-work-app-local-host";

const exec = promisify(execFile);

test("npm staging packs workspace assets without host binaries or modifying the source manifest", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "molis-work-npm-package-test-"));
  const source = process.cwd();
  const manifestBefore = await readFile(path.join(source, "package.json"));
  try {
    const output = path.join(temporary, "package");
    await createMolisWorkNpmPackageDirectory({ sourceDirectory: source, destinationDirectory: output });
    assert.deepEqual(await readFile(path.join(source, "package.json")), manifestBefore);
    const published = await readFile(path.join(output, "package.json"));
    // The Feishu/Lark connector's package travels as a registry dependency at the exact version Local Host pins. The workspace's
    // `overrides` and `allowBuilds` (pnpm-workspace.yaml) do not: the archive has no `overrides` field, and npm would ignore one
    // in an installed dependency, which docs/installation.md and dependencies-and-sdk-plan.md section 3.5 say in words.
    const manifest = JSON.parse(published.toString("utf8")) as { license: string; dependencies: Record<string, string>; bundledDependencies?: string[] };
    assert.equal(manifest.license, "SEE LICENSE IN LICENSE"); // CSL-03
    const pinned = (JSON.parse(await readFile(path.join(source, "apps/local-host/package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies["@larksuiteoapi/lark-mcp"];
    assert.match(pinned ?? "", /^\d+\.\d+\.\d+$/);
    assert.equal(manifest.dependencies["@larksuiteoapi/lark-mcp"], pinned);
    assert.equal("overrides" in manifest, false);
    // User decision 2026-10-10: the connector's dependency tree is accepted as npm installs it, not bundled into the archive.
    assert.equal((manifest.bundledDependencies ?? []).includes("@larksuiteoapi/lark-mcp"), false);
    // The archive's bundledDependencies is not empty today: it is the workspace packages. The plan's re-ask condition is about the connector
    // joining them, not about the field existing, so the plan can only say that while this stays true.
    assert.ok((manifest.bundledDependencies ?? []).includes("@prologue/sdk"));
    await assert.rejects(createMolisWorkNpmPackageDirectory({ sourceDirectory: source, destinationDirectory: output }), /输出已存在/);
    assert.deepEqual(await readFile(path.join(output, "package.json")), published);
    const { stdout } = await exec("npm", ["pack", "--ignore-scripts", "--json", "--cache", path.join(temporary, "cache")], { cwd: output, maxBuffer: 8 * 1024 * 1024 });
    const [packed] = JSON.parse(stdout);
    const license = await readFile(path.join(source, "LICENSE"), "utf8");
    const packedLicense = async (prefix: string) => (await exec("tar", ["-xOf", path.join(output, packed.filename), `package/${prefix}LICENSE`])).stdout;
    assert.equal(await packedLicense(""), license); // CSL-03: read the actual npm archive, not only staging.
    const files = new Set<string>(packed.files.map((file: { path: string }) => file.path));
    assert.ok(files.has("node_modules/@molis-ai/molis-work-plugin-goals/methods/industries/industry-developer-tools.md"));
    assert.ok(files.has("node_modules/@molis-ai/molis-work-plugin-cli/bin/molis-work-plugin.mjs"));
    assert.ok(files.has("dist/cli/main.js"));
    assert.ok(files.has("skills/goal-advance/SKILL.md"));
    assert.ok(files.has("skills/molis-plugin-dev/SKILL.md"));
    assert.ok(files.has("skills/molis-plugin-dev/elements.md"));
    assert.ok(files.has("skills/molis-plugin-dev/ui.md"));
    assert.ok(files.has("skills/molis-plugin-dev/examples.md"));
    assert.ok(files.has("skills/molis-plugin-dev/host.md"));
    assert.ok(files.has("skills/molis-plugin-dev/authoring.md"));
    assert.ok(files.has("skills/molis-plugin-dev/integrations.md"));
    assert.ok(files.has("vendor/search-evidence-layer/sbom.cdx.json"));
    assert.ok(files.has("vendor/prologue-sdk/README.md"));
    assert.ok(files.has("node_modules/@prologue/sdk/package.json"));
    assert.ok(packed.bundled.includes("@prologue/sdk"));
    assert.equal(packed.bundled.includes("@larksuiteoapi/lark-mcp"), false);
    assert.equal([...files].some(file => file.startsWith("node_modules/@larksuiteoapi/")), false);
    assert.equal([...files].some(file => file.startsWith("vendor/prologue-sdk/") && file.endsWith(".tgz")), false);
    const desktopPrefix = "node_modules/@molis-ai/molis-work-app-desktop/";
    assert.ok(files.has(`${desktopPrefix}dist/index.js`));
    for (const file of files) {
      assert.doesNotMatch(file, /\.node$|spawn-helper$|node_modules\/(?:better-sqlite3|node-pty)\//);
      if (file === desktopPrefix.slice(0, -1) || file.startsWith(desktopPrefix)) {
        assert.ok(
          file === `${desktopPrefix}package.json`
            || file === `${desktopPrefix}README.md`
            || file === `${desktopPrefix}LICENSE`
            || file.startsWith(`${desktopPrefix}dist/`),
          file,
        );
      }
    }
    assert.ok(packed.bundled.includes("@molis-ai/molis-work-plugin-goals"));
    for (const name of packed.bundled) {
      const metadata = JSON.parse(await readFile(path.join(output, "node_modules", name, "package.json"), "utf8"));
      if (name.startsWith("@molis-ai/molis-work-")) {
        assert.equal(metadata.license, "SEE LICENSE IN LICENSE", name);
        assert.equal(await packedLicense(`node_modules/${name}/`), license, name);
      }
      for (const spec of Object.values({ ...metadata.dependencies, ...metadata.optionalDependencies })) {
        assert.doesNotMatch(String(spec), /^(workspace|file):/);
      }
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

// User decision 2026-10-10 (specs/repository-anti-corruption/spec.md section 1): the npm archive keeps the Feishu/Lark connector as a
// registry dependency, and the two things that brings are accepted as long as they are written down where a consumer and a release
// manager read them. This test does not install the archive (that needs the registry and native prebuilds, which no run can repeat);
// it keeps the words, and the pinned version they were written for, from drifting away from the archive.
test("the accepted npm-archive facts of the Feishu/Lark connector stay written in the install notes, the checklist and the decision records", async () => {
  const text = (file: string) => readFile(path.join(process.cwd(), file), "utf8");
  const pinned = (JSON.parse(await text("apps/local-host/package.json")) as { dependencies: Record<string, string> }).dependencies["@larksuiteoapi/lark-mcp"];
  assert.match(pinned ?? "", /^\d+\.\d+\.\d+$/);
  for (const file of ["docs/installation.md", "docs/installation.en.md"]) {
    const notes = await text(file);
    for (const fact of [
      pinned!, // a new connector version has to be re-read against the notes before the pin moves
      "GHSA-c475-qrg2-pj4r", "basic-ftp", "pac+ftp://", // the advisory and the only configuration that reaches it
      "keytar", "encryption-key", "lark-mcp-nodejs", "MOLIS_WORK_HOME", // the keychain item and the data directory outside the Home
      "overrides", "bundledDependencies", // what the archive deliberately does not carry
    ]) assert.ok(notes.includes(fact), `${file} must mention ${fact}`);
  }
  for (const file of ["docs/installation.md", "docs/installation.en.md"]) {
    const notes = await text(file);
    // The connector subsection closes the install-boundaries section: the general paragraphs about `molis-work install`, `pnpm install:local`
    // and the immutable project_id belong to that section, so they come before the subsection and none of them sits under its heading.
    const heading = notes.search(/^### .*(?:飞书\/Lark 连接器|Feishu\/Lark connector)/m);
    assert.ok(heading > 0, `${file} needs the connector subsection`);
    const after = notes.slice(heading);
    const nextSection = after.search(/\n## /);
    assert.ok(nextSection > 0, `${file}: the connector subsection must be followed by the next section`);
    const subsection = after.slice(0, nextSection);
    const general = file.endsWith(".en.md")
      ? ["only maintains `~/.molis-work`", "`pnpm install:local`", "immutable `project_id`"]
      : ["只维护 `~/.molis-work`", "`pnpm install:local`", "不可变的 `project_id`"];
    for (const phrase of general) {
      assert.ok(notes.slice(0, heading).includes(phrase), `${file}: ${phrase} belongs to the install boundaries, before the connector subsection`);
      assert.ok(!subsection.includes(phrase), `${file}: ${phrase} must not sit under the connector heading`);
    }
    // The package's own log directory is outside the Home on every install path; the notes say so beside the two decided things.
    for (const fact of ["Logs/lark-mcp-nodejs", "HOME-DATA.md"]) assert.ok(subsection.includes(fact), `${file}: the connector subsection must mention ${fact}`);
  }
  const homeData = await text("docs/system/HOME-DATA.md");
  const outsideHome = homeData.slice(homeData.indexOf("## 8. Home 之外的状态"), homeData.indexOf("## 9. 卸载覆盖"));
  for (const fact of ["`lark-mcp`", "`encryption-key`", "Application Support/lark-mcp-nodejs", "Logs/lark-mcp-nodejs"]) {
    assert.ok(outsideHome.includes(fact), `HOME-DATA.md section 8 must list ${fact}`);
  }
  const afterUninstall = homeData.slice(homeData.indexOf("purge 之后仍留下的"), homeData.indexOf("## 10. "));
  assert.ok(afterUninstall.includes("`lark-mcp` 一项") && afterUninstall.includes("lark-mcp-nodejs"), "HOME-DATA.md section 9 must say uninstall leaves the connector's state");
  const releaseLine = (await text("docs/releases/CHECKLIST.md")).split("\n").find(line => line.includes("GHSA-c475-qrg2-pj4r"));
  assert.ok(releaseLine?.startsWith("- [ ] "), "the release checklist needs one open line for the npm archive");
  for (const fact of ["basic-ftp", "keytar", "lark-mcp-nodejs", "overrides", "bundledDependencies", "npm view @larksuiteoapi/lark-mcp version"]) {
    assert.ok(releaseLine!.includes(fact), `the release checklist line must mention ${fact}`);
  }
  const plan = await text("specs/repository-anti-corruption/dependencies-and-sdk-plan.md");
  const section = plan.slice(plan.indexOf("### 3.5 "), plan.indexOf("\n## 4. "));
  assert.match(section, /结论（2026-10-10，用户答复：选（a）接受/);
  assert.match(section, /重新问用户的条件/);
  // `bundledDependencies` already holds the workspace packages, so "the archive starts carrying bundledDependencies" can never be the
  // trigger; the plan has to name the connector's tree.
  assert.doesNotMatch(section, /归档开始带 `overrides` 或 `bundledDependencies`/);
  assert.match(section, /`@larksuiteoapi\/lark-mcp` 及其依赖树（`basic-ftp`、`keytar` 等）进了 `bundledDependencies`（工作区包本来就在里面，不算）/);
  assert.match(plan, /^8\. ~~npm 归档上飞书\/Lark 连接器/m);
  const decision = (await text("specs/repository-anti-corruption/spec.md")).split("\n")
    .find(line => line.startsWith("| 2026-10-10 |") && line.includes("GHSA-c475-qrg2-pj4r"));
  assert.ok(decision?.includes("keytar") && decision.includes("接受"), "spec.md section 1 needs the decision row");
});
