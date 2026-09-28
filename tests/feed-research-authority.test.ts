import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { DEMO_BOARD_ID, seedDemoBoard, LocalProjectDatabase, createLocalFeedSourceService } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";

const exec = promisify(execFile), hash = (value: string) => createHash("sha256").update(value).digest("hex");

for (const mode of ["revoked", "reconfigured", "cancelled"] as const) {
  test(`research repository ${mode}: real Git fetch and verified package read cannot commit after authority changes; retry preserves original material identity`, { timeout: 20_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "feed-research-authority-")), repository = join(home, "remote"), bin = join(home, "bin");
    const realGit = (await exec("which", ["git"])).stdout.trim(), oldPath = process.env.PATH;
    const research = JSON.stringify({ source_records: [{ id: "source-1", title: "Original evidence", url: "https://example.com/one", summary: "A bounded observation" }], findings: [{ id: "finding-1", claim: "One verifiable finding", source_ids: ["source-1"] }] });
    const report = "# Original report\nOne verifiable finding", packagePath = "packages/observations/daily-v1";
    const manifest = JSON.stringify({ id: "daily-v1", source_id: "observations", files: [{ path: "research.json", sha256: hash(research) }, { path: "report.md", sha256: hash(report) }] });
    const files = new Map([
      ["sources.json", JSON.stringify({ sources: [{ id: "observations", name: "Observations", publication_state: "ENABLED" }] })],
      ["catalog.json", JSON.stringify({ packages: [{ id: "daily-v1", source_id: "observations", path: packagePath, published_at: "2026-09-22T00:00:00Z", manifest_sha256: hash(manifest) }] })],
      [`${packagePath}/manifest.json`, manifest], [`${packagePath}/research.json`, research], [`${packagePath}/report.md`, report],
    ]);
    for (const [name, contents] of files) { await mkdir(dirname(join(repository, name)), { recursive: true }); await writeFile(join(repository, name), contents); }
    await exec(realGit, ["-C", repository, "init", "-b", "main"]);
    await exec(realGit, ["-C", repository, "add", "."]);
    await exec(realGit, ["-C", repository, "-c", "user.name=Feed Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Publish research fixture"]);
    await mkdir(bin);
    // Only the external Git boundary is controlled; production clone/cache, validation and original SQLite commits remain real.
    const marker = join(home, "fetch-entered"), release = join(home, "fetch-release");
    await writeFile(join(bin, "git"), `#!/usr/bin/env node
const fs = require('node:fs'), cp = require('node:child_process');
(async () => {
  if (process.argv.includes('fetch')) {
    fs.writeFileSync(${JSON.stringify(marker)}, '');
    const start = Date.now();
    while (!fs.existsSync(${JSON.stringify(release)})) {
      if (Date.now() - start > 15000) process.exit(91);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  try { process.stdout.write(cp.execFileSync(${JSON.stringify(realGit)}, ['-c', ${JSON.stringify(`url.${pathToFileURL(repository).href}.insteadOf=https://github.com/fixture/research.git`)}, ...process.argv.slice(2)], { encoding: 'utf8' })); }
  catch (error) { process.exit(error.status || 1); }
})();
`, { mode: 0o755 });
    const entered = Promise.withResolvers<void>(), watcher = watch(home, (_, name) => { if (name === "fetch-entered") entered.resolve(); });
    process.env.PATH = `${bin}:${oldPath}`;
    const database = join(home, "project.sqlite"); seedDemoBoard(database);
    const store = new LocalProjectDatabase(database), sources = createLocalFeedSourceService(store.db, DEMO_BOARD_ID, undefined, undefined, home);
    const host = new MolisWorkLocalHost({ homeDirectory: home }), controller = new AbortController();
    let allowed = true;
    const context: ActionCallContext = { actor_id: "owner", audience: "user", project_id: DEMO_BOARD_ID, permissions: ["feed:read", "feed:write"], validate_authority: () => {
      if (!allowed) throw new ActionError("actions.revoked", "Revoked");
    } };
    const reference = molisWorkHostProjectReference({ databasePath: database, boardId: DEMO_BOARD_ID, projectId: DEMO_BOARD_ID });
    const abort = () => { controller.abort(); void writeFile(release, "").catch(() => undefined); };
    t.signal.addEventListener("abort", abort, { once: true });
    try {
      const source = sources.register({ kind: "research_library", repository: "fixture/research", research_source: "observations" }).source;
      const client = host.actionClient(reference), input = { source_id: source.source_id, idempotency_key: "research-authority-1" };
      const pending = client.invoke({ ...context, signal: controller.signal }, feedSourceActions.sync, input);
      const rejected = assert.rejects(pending, mode === "cancelled" ? { name: "AbortError" } : { code: mode === "revoked" ? "actions.revoked" : "feed_source_configuration_changed" });
      await Promise.race([entered.promise, pending.then(() => { throw new Error("Research sync did not reach Git fetch"); })]);
      if (mode === "revoked") allowed = false;
      if (mode === "reconfigured") sources.update(source.source_id, { scope: "Reconfigured during fetch" });
      if (mode === "cancelled") controller.abort();
      const before = sources.feed.snapshot(DEMO_BOARD_ID);
      await writeFile(release, ""); await rejected;
      assert.deepEqual(sources.feed.snapshot(DEMO_BOARD_ID), before, "no research material, cursor, run failure or source error may be written after refusal");
      allowed = true;
      const recovered = await client.invoke(context, feedSourceActions.sync, input);
      assert.equal(recovered.run.outcome, "completed");
      const material = sources.feed.snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === source.source_id);
      assert.equal(material.length, 1);
      assert.match(material[0]!.body!, /One verifiable finding/);
      assert.equal(material[0]!.materials[0]!.provenance.manifest_sha256, hash(manifest));
      assert.equal((await client.invoke(context, feedSourceActions.sync, input)).replayed, true);
      assert.deepEqual(sources.feed.snapshot(DEMO_BOARD_ID).feed_items.filter(item => item.source_id === source.source_id), material);
    } finally {
      t.signal.removeEventListener("abort", abort);
      await writeFile(release, ""); await host.close(); store.close(); watcher.close();
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
      await rm(home, { recursive: true, force: true });
    }
  });
}
