import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { SHELF_ACTION_PERMISSIONS, SHELF_OWNER_FILES, SHELF_PLUGIN_ID, shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { shelfTestAi, shelfTestReceipt } from "./shelf-test-ai.js";
import { openTestShelfFiles, openTestShelfStore } from "./shelf-direct-actions.js";

/**
 * PG-026 (specs/repository-anti-corruption/privileges.md): Shelf keeps its files through the owner-files client, over the entries it declares.
 * What that client and its port refuse (outside the declared entries, links, an asynchronous or expired writer) and how they replace a
 * whole file is the platform's, tested on the Runtime: SHF-IO-S02 to S06 (tests/security-invariants-plugin-owner-files*.test.ts).
 * S1-6 concurrent appends keep every line because the write callback is synchronous; SHF-IO-S02 to S06 do not test concurrent appends.
 * The stores below are opened over plain test files (tests/shelf-direct-actions.ts); the Host's own copy of that client went in Shelf S4.
 */

async function withHome<T>(run: (home: string, root: string) => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "shelf-owner-files-"));
  try { return await run(home, join(home, SHELF_OWNER_FILES.store_name)); }
  finally { rmSync(home, { recursive: true, force: true }); }
}

const linesOf = (bytes: string | Buffer): string[] => String(bytes).split("\n").filter(Boolean).map(line => (JSON.parse(line) as { message: string }).message);

test("PG-026-S1-1 Shelf declares its catalog, copies and jobs, and nothing else", () => {
  assert.equal(SHELF_OWNER_FILES.store_name, "shelf");
  assert.deepEqual(SHELF_OWNER_FILES.entries, [
    { name: "catalog.json", kind: "file" }, { name: "files", kind: "directory" }, { name: "jobs", kind: "directory" },
  ]);
});

test("PG-026-S1-7 a real job writes its events through the client, and the catalog keeps every row of work started together", async () => {
  await withHome(async (home, root) => {
    const store = openTestShelfStore(home, { disabled: true }, {}, shelfTestAi());
    const [one, two] = await Promise.all([
      store.admit({ filename: "one.md", bytes: Buffer.from("# 一\n第一份材料"), mime: "text/markdown" }),
      store.admit({ filename: "two.md", bytes: Buffer.from("# 二\n第二份材料"), mime: "text/markdown" }),
    ]);
    await Promise.all([store.addClipboard("clip one"), store.addClipboard("clip two")]);
    const [first, second] = await Promise.all([
      store.runJob({ recipe: "summarize", item_id: one.item_id }),
      store.runJob({ recipe: "summarize", item_id: two.item_id }),
    ]);
    const snapshot = await store.snapshot();
    assert.deepEqual(snapshot.materials.map(item => item.name).sort(), ["one.md", "two.md"]);
    assert.equal(snapshot.clipboard.length, 2, "two clipboard rows added together are both kept");
    assert.equal(snapshot.results.length, 2, "two jobs finished together leave two results");
    assert.equal(snapshot.running_jobs.length, 0);
    for (const outcome of [first, second]) {
      const events = linesOf(readFileSync(join(root, "jobs", outcome.job.job_id, "events.jsonl"), "utf8"));
      assert.deepEqual(events, ["复制到只读 input/", "写入 output/"]);
    }
  });
});

test("PG-026-S1-8 a missing catalog reads as an empty shelf, and the first write creates it", async () => {
  await withHome(async (home, root) => {
    const store = openTestShelfStore(home, { disabled: true });
    assert.doesNotThrow(() => store.settings(), "a missing catalog still gives the default settings");
    const first = await store.snapshot();
    assert.deepEqual([first.materials, first.results, first.clipboard, first.running_jobs], [[], [], [], []]);
    assert.equal(existsSync(join(root, "catalog.json")), false, "reading creates no catalog, and lays no sample down");
    await store.addClipboard("first clip");
    assert.equal((await store.snapshot()).clipboard.length, 1);
    assert.equal(existsSync(join(root, "catalog.json")), true);
  });
});

test("PG-026-S2-1 the Home instance lays the sample down once: one the person deleted stays gone after a new grant and a restart", async () => {
  await withHome(async (home, root) => {
    const as = (host: MolisWorkLocalHost) => bindActionClient(host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS }));
    const names = async (host: MolisWorkLocalHost) => (await as(host).invoke(shelfActions.snapshot, {})).materials.map(item => item.name);
    let host = new MolisWorkLocalHost({ homeDirectory: home });
    try {
      const first = await as(host).invoke(shelfActions.snapshot, {});
      assert.deepEqual(first.materials.map(item => item.name), ["试用示例.pdf"], "the first start writes the sample before any action reads");
      const catalog = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8")) as { items: Array<{ relative_path: string }> };
      assert.equal(existsSync(join(root, catalog.items[0]!.relative_path)), true, "the sample copy was written under files/ by the start-up writer");
      await as(host).invoke(shelfActions.delete, { item_id: first.materials[0]!.item_id });
      const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(SHELF_PLUGIN_ID)!;
      await platform.runtime.stop(install.install_id);
      platform.runtime.grant(install.install_id, []);
      platform.runtime.grant(install.install_id, install.grants);
      await platform.runtime.start(install.install_id);
      assert.deepEqual(await names(host), [], "a new grant starts the instance again without the sample");
      await host.close();
      host = new MolisWorkLocalHost({ homeDirectory: home });
      assert.deepEqual(await names(host), [], "a restarted Host does not bring it back either");
      assert.equal((JSON.parse(readFileSync(join(root, "catalog.json"), "utf8")) as { seeded_sample: boolean }).seeded_sample, true);
    } finally { await host.close(); }
  });
});

test("PG-026-S1-9 a cancel decides on the run's row as its write finds it: a run that finished meanwhile keeps its record", async () => {
  await withHome(async (home, root) => {
    // The catalog while a real run is going, and after it finished.
    const source = mkdtempSync(join(tmpdir(), "shelf-owner-files-source-"));
    let running: Buffer, finished: Buffer, jobId: string;
    try {
      let enter!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
      const real = openTestShelfStore(source, { disabled: true }, {}, shelfTestAi(async () => { enter(); await held; return { text: "摘要", execution: shelfTestReceipt }; }));
      const item = await real.admit({ filename: "材料.md", bytes: Buffer.from("原材料"), mime: "text/markdown" });
      const pending = real.runJob({ recipe: "summarize", item_id: item.item_id });
      await started;
      running = readFileSync(join(source, SHELF_OWNER_FILES.store_name, "catalog.json"));
      release();
      jobId = (await pending).job.job_id;
      finished = readFileSync(join(source, SHELF_OWNER_FILES.store_name, "catalog.json"));
    } finally { rmSync(source, { recursive: true, force: true }); }
    // A client whose writes wait their turn, as one across a process boundary would (S2's services.ownerFiles).
    const host = openTestShelfFiles(home);
    let open!: () => void;
    const turn = new Promise<void>(resolve => { open = resolve; });
    const files: PluginOwnerFilesClient = { rootPath: () => host.rootPath(), stat: relative => host.stat(relative), read: relative => host.read(relative), list: relative => host.list(relative),
      write: <Result>(run: (writer: PluginOwnerFilesWriter) => Result) => turn.then(() => host.write(run)) };
    await host.write(writer => writer.replaceFileAtomic("catalog.json", running));
    const cancelling = openShelfStore(root, files, { disabled: true }).cancelJob(jobId);
    // The run finishes after the cancel read its row and before the cancel's write lands.
    await host.write(writer => writer.replaceFileAtomic("catalog.json", finished));
    open();
    assert.equal((await cancelling).status, "succeeded", "the cancel answers with the record the run left");
    const catalog = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8")) as { jobs: Array<{ job_id: string; status: string; result_item_id: string | null }> };
    const row = catalog.jobs.find(job => job.job_id === jobId);
    assert.equal(row?.status, "succeeded", "a finished run is not rewritten as cancelled");
    assert.ok(row?.result_item_id, "the finished run still points at its result");
  });
});

const LOCAL_PAGE = `<html><head><title>本机页面</title></head><body><article><p>${"这是一个只在本机提供的页面，正文足够长，用来检查读取。".repeat(6)}</p></article></body></html>`;

test("PG-026-S2-2 the Home instance captures a page on this machine through the local-page reader; the local network, https to this machine and the Host's own port keep the link alone", { timeout: 60_000 }, async t => {
  const hits: string[] = [];
  const page = createServer((request, response) => {
    hits.push(request.url ?? ""); response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(LOCAL_PAGE);
  });
  await new Promise<void>(resolve => page.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => { page.closeAllConnections(); page.close(() => resolve()); }));
  const port = (page.address() as AddressInfo).port, { home, host, origin } = await serveHomeRuntime(t);
  const actions = bindActionClient(host.homeActionClient(), () => ({ actor_id: "owner", project_id: null, audience: "user", permissions: SHELF_ACTION_PERMISSIONS }));
  const shelve = async (url: string) => {
    const { item } = await actions.invoke(shelfActions.capture, { url });
    return openTestShelfStore(home).readFile(item.item_id).bytes.toString();
  };
  for (const url of [`http://127.0.0.1:${port}/page`, `http://localhost:${port}/page`]) assert.match(await shelve(url), /只在本机提供/, url);
  assert.deepEqual(hits, ["/page", "/page"], "plain http to this machine is read once each");
  // Any other address goes to the public reader, which refuses the local network; the local-page reader refuses the Host's own port.
  for (const url of ["http://192.168.1.10/", "http://10.0.0.5/", "http://169.254.169.254/latest/meta-data/", `https://127.0.0.1:${port}/page`,
    `https://localhost:${port}/page`, `${origin}/api/settings/models`]) {
    const copy = await shelve(url);
    assert.ok(copy.includes(url), `${url} keeps its link`);
    assert.match(copy, /没有抓到正文/, `${url} has no body`);
  }
  assert.equal(hits.length, 2, "none of them reached the page server");
});
